import { describe, expect, it } from 'vitest'
import { computeRouteStats, emptyRouteHistoryStats } from './routeStats'
import type { RouteHistoryPoint } from './routeStats'

const EPOCH = new Date('2026-01-01T10:00:00Z')

function point(lat: number, lng: number, minutesAfter: number, elevation?: number): RouteHistoryPoint {
  return {
    lat,
    lng,
    elevation,
    recordedAt: new Date(EPOCH.getTime() + minutesAfter * 60_000),
  }
}

describe('computeRouteStats', () => {
  it('returns empty stats for an empty route', () => {
    expect(computeRouteStats([])).toEqual(emptyRouteHistoryStats())
  })

  it('handles a single point (no distance, no duration)', () => {
    const stats = computeRouteStats([point(46.5, 8.0, 0, 1200)])
    expect(stats.totalDistance).toBe(0)
    expect(stats.duration).toBe(0)
    expect(stats.averageSpeed).toBeNull()
    expect(stats.pointCount).toBe(1)
    expect(stats.hasElevation).toBe(true)
    expect(stats.maxElevation).toBe(1200)
    expect(stats.minElevation).toBe(1200)
  })

  it('computes geodesic distance across segments', () => {
    // ~111 m per 0.001 deg latitude near the equator.
    const stats = computeRouteStats([
      point(0, 0, 0),
      point(0.001, 0, 1),
      point(0.002, 0, 2),
    ])
    expect(stats.totalDistance).toBeGreaterThan(200)
    expect(stats.totalDistance).toBeLessThan(240)
    expect(stats.duration).toBe(120)
  })

  it('sums elevation gain and loss separately', () => {
    const stats = computeRouteStats([
      point(0, 0, 0, 1000),
      point(0.001, 0, 5, 1150),
      point(0.002, 0, 10, 1100),
      point(0.003, 0, 15, 1250),
    ])
    expect(stats.elevationGain).toBe(300) // +150 +150
    expect(stats.elevationLoss).toBe(50) // -50
    expect(stats.maxElevation).toBe(1250)
    expect(stats.minElevation).toBe(1000)
  })

  it('treats altitude 0 as valid data, not missing', () => {
    const stats = computeRouteStats([
      point(0, 0, 0, 0),
      point(0.001, 0, 1, 100),
    ])
    expect(stats.hasElevation).toBe(true)
    expect(stats.minElevation).toBe(0)
    expect(stats.elevationGain).toBe(100)
  })

  it('never invents elevation when altitude is absent', () => {
    const stats = computeRouteStats([
      point(0, 0, 0),
      point(0.001, 0, 1),
    ])
    expect(stats.hasElevation).toBe(false)
    expect(stats.maxElevation).toBeNull()
    expect(stats.minElevation).toBeNull()
    expect(stats.elevationGain).toBe(0)
    expect(stats.elevationLoss).toBe(0)
  })

  it('ignores segments where only one endpoint has altitude', () => {
    const stats = computeRouteStats([
      point(0, 0, 0, 100),
      point(0.001, 0, 1),
      point(0.002, 0, 2, 300),
    ])
    // Only the pair (missing, 300) could be considered; neither counts.
    expect(stats.elevationGain).toBe(0)
    expect(stats.elevationLoss).toBe(0)
    // Min/max still reflect reported altitudes honestly.
    expect(stats.minElevation).toBe(100)
    expect(stats.maxElevation).toBe(300)
  })

  it('computes average speed over elapsed time', () => {
    // 0.001 deg lat ~= 111 m in 60 s -> ~1.85 m/s.
    const stats = computeRouteStats([
      point(0, 0, 0),
      point(0.001, 0, 1),
    ])
    expect(stats.averageSpeed).not.toBeNull()
    expect(stats.averageSpeed!).toBeGreaterThan(1.5)
    expect(stats.averageSpeed!).toBeLessThan(2.2)
  })

  it('reports start and end timestamps', () => {
    const stats = computeRouteStats([
      point(0, 0, 0),
      point(0.001, 0, 30),
    ])
    expect(stats.startedAt).toEqual(EPOCH)
    expect(stats.endedAt).toEqual(new Date(EPOCH.getTime() + 30 * 60_000))
  })
})
