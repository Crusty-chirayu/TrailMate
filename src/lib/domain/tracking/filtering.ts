// GPS quality filtering.
//
// The browser can surface noisy, stale, or implausible fixes. Rather than
// accepting every reading blindly we apply conservative rules tuned so they
// reject hardware glitches without dropping legitimate trail movement.
//
// All functions are pure and testable.

import { isValidCoordinate, isFiniteNumber, haversineDistance } from './geo'
import type { TrackPoint, TrackFilterConfig, PositionEvaluation } from '@/types/tracking'
import { DEFAULT_TRACK_FILTER } from '@/types/tracking'

export interface IncomingFix {
  latitude: number
  longitude: number
  timestamp: number
  accuracy?: number
  altitude?: number
  altitudeAccuracy?: number
  heading?: number
  speed?: number
}

/**
 * Structural validation independent of previous points.
 * Returns an evaluation that is "accepted" only for structurally valid fixes.
 */
export function validateFix(
  fix: IncomingFix,
  now: number,
  config: TrackFilterConfig = DEFAULT_TRACK_FILTER,
): PositionEvaluation {
  if (!isValidCoordinate(fix.latitude, fix.longitude)) {
    return { accepted: false, reason: 'invalid' }
  }

  if (!isFiniteNumber(fix.timestamp)) {
    return { accepted: false, reason: 'stale' }
  }

  const maxAgeMs = config.maxAgeMs ?? DEFAULT_TRACK_FILTER.maxAgeMs!
  // An absurdly old fix is never useful; a fix from slightly in the future is
  // tolerated as clock jitter from the device.
  if (now - fix.timestamp > maxAgeMs) {
    return { accepted: false, reason: 'stale' }
  }

  const maxAccuracyM = config.maxAccuracyM ?? DEFAULT_TRACK_FILTER.maxAccuracyM!
  if (isFiniteNumber(fix.accuracy) && fix.accuracy! > maxAccuracyM) {
    return { accepted: false, reason: 'poor-accuracy' }
  }

  const maxSpeedMps = config.maxSpeedMps ?? DEFAULT_TRACK_FILTER.maxSpeedMps!
  if (isFiniteNumber(fix.speed) && fix.speed! > maxSpeedMps) {
    return { accepted: false, reason: 'speed-spike' }
  }

  return { accepted: true, reason: 'accepted' }
}

/**
 * Comparison against the previously accepted point.
 * Rules here reject duplicates and impossible jumps between consecutive fixes.
 */
export function evaluateAgainstPrevious(
  fix: IncomingFix,
  previous: Pick<TrackPoint, 'latitude' | 'longitude' | 'timestamp'> | undefined,
  config: TrackFilterConfig = DEFAULT_TRACK_FILTER,
): PositionEvaluation {
  // No previous point: every structurally valid fix is the seed.
  if (!previous) return { accepted: true, reason: 'accepted' }

  const dt = fix.timestamp - previous.timestamp
  const distance = haversineDistance(
    previous.latitude,
    previous.longitude,
    fix.latitude,
    fix.longitude,
  )

  const minDistanceM = config.minDistanceM ?? DEFAULT_TRACK_FILTER.minDistanceM!
  const duplicateTimeMs = config.duplicateTimeMs ?? DEFAULT_TRACK_FILTER.duplicateTimeMs!
  if (distance < minDistanceM && dt >= 0 && dt < duplicateTimeMs) {
    return { accepted: false, reason: 'duplicate' }
  }

  const jumpDistanceM = config.jumpDistanceM ?? DEFAULT_TRACK_FILTER.jumpDistanceM!
  const maxSpeedMps = config.maxSpeedMps ?? DEFAULT_TRACK_FILTER.maxSpeedMps!
  // If the GPS jumped a large distance in a tiny window, the implied speed is
  // implausible for the configured activity and the fix is dropped.
  if (distance > jumpDistanceM) {
    const impliedSpeed = dt > 0 ? distance / (dt / 1000) : distance
    if (impliedSpeed > maxSpeedMps) {
      return { accepted: false, reason: 'jump' }
    }
  }

  return { accepted: true, reason: 'accepted' }
}

/**
 * Full pipeline: structural validation, then comparison with the previous fix.
 */
export function evaluatePosition(
  fix: IncomingFix,
  now: number,
  previous: Pick<TrackPoint, 'latitude' | 'longitude' | 'timestamp'> | undefined,
  config: TrackFilterConfig = DEFAULT_TRACK_FILTER,
): PositionEvaluation {
  const structural = validateFix(fix, now, config)
  if (!structural.accepted) return structural
  return evaluateAgainstPrevious(fix, previous, config)
}