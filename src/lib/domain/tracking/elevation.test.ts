import { describe, expect, it } from 'vitest'
import { buildElevationProfile } from './elevation'
import type { RouteHistoryPoint } from './routeStats'

function point(lat: number, lng: number, minutes: number, elevation?: number): RouteHistoryPoint {
  return {
    lat,
    lng,
    elevation,
    recordedAt: new Date(Date.UTC(2026, 0, 1, 10, minutes)),
  }
}

// 0.001 deg latitude is roughly 111 m near the equator.
function climb(count: number): RouteHistoryPoint[] {
  return Array.from({ length: count }, (_, i) =>
    point(i * 0.001, 0, i, 1000 + i * 10),
  )
}

describe('buildElevationProfile', () => {
  it('refuses to build a profile without altitude data', () => {
    const profile = buildElevationProfile([point(0, 0, 0), point(0.001, 0, 1)])
    expect(profile.hasElevation).toBe(false)
    expect(profile.samples).toEqual([])
  })

  it('needs at least two altitude fixes', () => {
    const profile = buildElevationProfile([point(0, 0, 0, 500), point(0.001, 0, 1)])
    expect(profile.hasElevation).toBe(false)
  })

  it('samples only real recorded fixes (no interpolation)', () => {
    const profile = buildElevationProfile(climb(10), 5)
    expect(profile.hasElevation).toBe(true)
    expect(profile.samples.length).toBe(5)
    for (const sample of profile.samples) {
      // Every sample altitude is one of the recorded values (multiples of 10 above 1000).
      expect((sample.altitude - 1000) % 10).toBe(0)
    }
  })

  it('computes cumulative distance and monotonic sample order', () => {
    const profile = buildElevationProfile(climb(10), 10)
    expect(profile.samples.length).toBe(10)
    for (let i = 1; i < profile.samples.length; i++) {
      expect(profile.samples[i].distance).toBeGreaterThanOrEqual(profile.samples[i - 1].distance)
    }
    expect(profile.totalDistance).toBeGreaterThan(800) // 9 * ~111 m
  })

  it('computes gain for an ascent', () => {
    const profile = buildElevationProfile(climb(11), 200)
    expect(profile.gain).toBeGreaterThan(90)
    expect(profile.gain).toBeLessThan(110)
    expect(profile.loss).toBe(0)
  })

  it('caps sample count when requested', () => {
    const profile = buildElevationProfile(climb(1000), 50)
    expect(profile.samples.length).toBeLessThanOrEqual(50)
    expect(profile.samples.length).toBeGreaterThanOrEqual(2)
  })

  it('ignores points with missing altitude in between without inventing values', () => {
    const points = [
      point(0, 0, 0, 100),
      point(0.001, 0, 1), // no altitude — skipped
      point(0.002, 0, 2, 200),
    ]
    const profile = buildElevationProfile(points)
    expect(profile.samples.map(s => s.altitude)).toEqual([100, 200])
    expect(profile.gain).toBe(100)
  })
})
