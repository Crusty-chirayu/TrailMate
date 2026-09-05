// Route statistics. All time values derive from recorded timestamps (never
// from counters that can drift), and distance uses geodesic (Haversine)
// segments. Elevation is only ever computed from reported altitude.

import { haversineDistance, isFiniteNumber } from './geo'
import type { TrackPoint, TrackingStatistics } from '@/types/tracking'
import { DEFAULT_TRACK_FILTER } from '@/types/tracking'

export function emptyStatistics(): TrackingStatistics {
  return {
    distance: 0,
    movingTime: 0,
    elapsedTime: 0,
    averageSpeed: 0,
    currentSpeed: 0,
    elevationGain: 0,
    elevationLoss: 0,
    highestElevation: null,
    lowestElevation: null,
    hasElevation: false,
    pointCount: 0,
  }
}

function hasAltitude(p: TrackPoint): boolean {
  return isFiniteNumber(p.altitude)
}

function elevationBounds(
  stats: TrackingStatistics,
  prevAlt: number | undefined,
  currAlt: number | undefined,
): { highest: number | null; lowest: number | null; has: boolean } {
  const values = [prevAlt, currAlt].filter((v): v is number => isFiniteNumber(v))
  if (values.length === 0) {
    return { highest: stats.highestElevation, lowest: stats.lowestElevation, has: stats.hasElevation }
  }
  return {
    highest: stats.highestElevation === null ? Math.max(...values) : Math.max(stats.highestElevation, ...values),
    lowest: stats.lowestElevation === null ? Math.min(...values) : Math.min(stats.lowestElevation, ...values),
    has: true,
  }
}

/**
 * Applies a single segment (previous point -> current point) to a statistics
 * snapshot and returns a new snapshot. Pure; used by the full recompute and by
 * the incremental updates in the session reducer.
 */
export function applySegment(
  current: TrackingStatistics,
  prev: TrackPoint,
  curr: TrackPoint,
  movingSpeedMps: number = DEFAULT_TRACK_FILTER.movingSpeedMps!,
): TrackingStatistics {
  const distance = haversineDistance(prev.latitude, prev.longitude, curr.latitude, curr.longitude)

  const next: TrackingStatistics = {
    ...current,
    distance: current.distance + distance,
    pointCount: current.pointCount + 1,
  }

  const dtMs = curr.timestamp - prev.timestamp
  // A segment counts as "moving" only when the implied speed exceeds the
  // configured threshold, so stops/camps do not inflate moving time.
  if (dtMs > 0) {
    const speed = distance / (dtMs / 1000)
    if (distance > 0 && speed >= movingSpeedMps) {
      next.movingTime = current.movingTime + dtMs / 1000
      next.currentSpeed = speed
    }
  }

  if (hasAltitude(prev) && hasAltitude(curr)) {
    const delta = curr.altitude! - prev.altitude!
    if (delta > 0) next.elevationGain += delta
    else next.elevationLoss += Math.abs(delta)

    const bounds = elevationBounds(current, prev.altitude, curr.altitude)
    next.highestElevation = bounds.highest
    next.lowestElevation = bounds.lowest
    next.hasElevation = true
  }

  next.averageSpeed = next.movingTime > 0 ? next.distance / next.movingTime : 0
  return next
}

/**
 * Computes the full statistical breakdown for a route from its points.
 * This is the canonical implementation used for recovery, verification, and tests.
 */
export function calculateStatistics(
  points: TrackPoint[],
  movingSpeedMps?: number,
): TrackingStatistics {
  if (points.length === 0) return emptyStatistics()

  const altitudes = points.map(p => p.altitude).filter((v): v is number => isFiniteNumber(v))
  const elapsedMs = Math.max(0, points[points.length - 1].timestamp - points[0].timestamp)

  const base: TrackingStatistics = {
    ...emptyStatistics(),
    elapsedTime: elapsedMs / 1000,
    pointCount: 1,
    hasElevation: altitudes.length > 0,
    highestElevation: altitudes.length ? Math.max(...altitudes) : null,
    lowestElevation: altitudes.length ? Math.min(...altitudes) : null,
  }

  if (base.hasElevation) {
    // Elevation gain/loss is accumulated segment-by-segment below via
    // applySegment, so we must not precompute it here (would double count).
    base.elevationGain = 0
    base.elevationLoss = 0
  } else {
    base.elevationGain = 0
    base.elevationLoss = 0
  }

  let stats = base
  for (let i = 1; i < points.length; i++) {
    stats = applySegment(stats, points[i - 1], points[i], movingSpeedMps)
  }
  stats.elapsedTime = elapsedMs / 1000
  return stats
}