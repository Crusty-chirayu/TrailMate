// Pure elevation-profile construction over recorded route points.
// Honest by design: when altitude is missing, the profile simply is not built.
// No interpolation is performed — every sampled point is a real recorded fix.

import { haversineDistance, isFiniteNumber } from './geo'
import type { RouteHistoryPoint } from './routeStats'

export interface ElevationSample {
  /** Cumulative geodesic distance from the route start, in meters. */
  distance: number
  /** Recorded altitude in meters. */
  altitude: number
}

export interface ElevationProfile {
  /** Ascending-by-distance samples drawn from real recorded fixes. */
  samples: ElevationSample[]
  /** True only when at least two valid altitude fixes exist. */
  hasElevation: boolean
  totalDistance: number
  gain: number
  loss: number
}

export const DEFAULT_PROFILE_SAMPLE_COUNT = 200

/**
 * Builds an elevation profile from chronologically ordered route points.
 * Downsamples to at most `sampleCount` points by splitting the route into
 * equal-count segments of the recorded fixes and taking the first fix of each
 * segment — never interpolating values that were not recorded.
 */
export function buildElevationProfile(
  points: ReadonlyArray<RouteHistoryPoint>,
  sampleCount: number = DEFAULT_PROFILE_SAMPLE_COUNT,
): ElevationProfile {
  const withAltitude = points.filter(p => isFiniteNumber(p.elevation))
  if (withAltitude.length < 2) {
    return { samples: [], hasElevation: false, totalDistance: 0, gain: 0, loss: 0 }
  }

  // Cumulative distance over ALL points (so sample distances are real), but
  // only altitude-bearing points can become samples.
  let cumulative = 0
  const distances = points.map((point, index) => {
    if (index > 0) {
      cumulative += haversineDistance(
        points[index - 1].lat,
        points[index - 1].lng,
        point.lat,
        point.lng,
      )
    }
    return cumulative
  })
  const totalDistance = cumulative

  const validSamples: ElevationSample[] = []
  for (let i = 0; i < points.length; i++) {
    if (isFiniteNumber(points[i].elevation)) {
      validSamples.push({ distance: distances[i], altitude: points[i].elevation! })
    }
  }

  const capped = Math.max(2, Math.min(sampleCount, validSamples.length))
  const stride = validSamples.length / capped
  const samples: ElevationSample[] = []
  for (let i = 0; i < capped; i++) {
    samples.push(validSamples[Math.min(validSamples.length - 1, Math.floor(i * stride))])
  }

  let gain = 0
  let loss = 0
  for (let i = 1; i < samples.length; i++) {
    const change = samples[i].altitude - samples[i - 1].altitude
    if (change > 0) gain += change
    else loss += Math.abs(change)
  }

  return {
    samples,
    hasElevation: true,
    totalDistance,
    gain,
    loss,
  }
}