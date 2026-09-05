// Pure route-history statistics over recorded points. No I/O — fully testable.
// Distance uses geodesic (Haversine) segments; time values derive from recorded
// timestamps only; elevation is reported only when altitude data exists.

import { haversineDistance, isFiniteNumber } from './geo'

export interface RouteHistoryPoint {
  lat: number
  lng: number
  elevation?: number
  recordedAt: Date
}

export interface RouteHistoryStats {
  totalDistance: number // meters, rounded
  elevationGain: number // meters
  elevationLoss: number // meters
  maxElevation: number | null // null when no altitude was ever reported
  minElevation: number | null
  hasElevation: boolean
  duration: number // seconds between first and last point
  averageSpeed: number | null // m/s over the full elapsed duration
  pointCount: number
  startedAt: Date | null
  endedAt: Date | null
}

export function emptyRouteHistoryStats(): RouteHistoryStats {
  return {
    totalDistance: 0,
    elevationGain: 0,
    elevationLoss: 0,
    maxElevation: null,
    minElevation: null,
    hasElevation: false,
    duration: 0,
    averageSpeed: null,
    pointCount: 0,
    startedAt: null,
    endedAt: null,
  }
}

/**
 * Computes statistics for a recorded route. Points must be in chronological
 * order; the function tolerates a single point (distance/duration 0) and an
 * empty list. Elevation values are only trusted when they are finite numbers —
 * altitude 0 is legitimate and must not be discarded.
 */
export function computeRouteStats(points: ReadonlyArray<RouteHistoryPoint>): RouteHistoryStats {
  if (points.length === 0) return emptyRouteHistoryStats()

  const startedAt = points[0].recordedAt
  const endedAt = points[points.length - 1].recordedAt
  const duration = Math.max(0, (endedAt.getTime() - startedAt.getTime()) / 1000)

  let totalDistance = 0
  let elevationGain = 0
  let elevationLoss = 0
  let maxElevation: number | null = null
  let minElevation: number | null = null

  const noteAltitude = (value: number | undefined) => {
    if (!isFiniteNumber(value)) return
    maxElevation = maxElevation === null ? value : Math.max(maxElevation, value)
    minElevation = minElevation === null ? value : Math.min(minElevation, value)
  }

  // Include every point's altitude, including the first and last.
  for (const point of points) noteAltitude(point.elevation)

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1]
    const curr = points[i]
    totalDistance += haversineDistance(prev.lat, prev.lng, curr.lat, curr.lng)

    // Both endpoints must report altitude for a segment to count toward
    // gain/loss; partial data never invents elevation change.
    if (isFiniteNumber(prev.elevation) && isFiniteNumber(curr.elevation)) {
      const change = curr.elevation! - prev.elevation!
      if (change > 0) elevationGain += change
      else elevationLoss += Math.abs(change)
    }
  }

  const hasElevation = maxElevation !== null
  const averageSpeed = duration > 0 ? totalDistance / duration : null

  return {
    totalDistance: Math.round(totalDistance),
    elevationGain: Math.round(elevationGain),
    elevationLoss: Math.round(elevationLoss),
    maxElevation: maxElevation === null ? null : Math.round(maxElevation),
    minElevation: minElevation === null ? null : Math.round(minElevation),
    hasElevation,
    duration: Math.round(duration),
    averageSpeed: averageSpeed === null ? null : averageSpeed,
    pointCount: points.length,
    startedAt,
    endedAt,
  }
}