import { describe, it, expect } from 'vitest'
import { calculateStatistics, applySegment, emptyStatistics } from './statistics'
import type { TrackPoint } from '@/types/tracking'

let seq = 0
function pt(lat: number, lng: number, timestamp: number, altitude?: number): TrackPoint {
  seq += 1
  return {
    id: `p${seq}`,
    tripId: 't1',
    sessionId: 's1',
    latitude: lat,
    longitude: lng,
    timestamp,
    synced: false,
    ...(altitude !== undefined ? { altitude } : {}),
  }
}

// ~0.000009 latitude degrees is roughly 1 meter.
function oneMeterLeft(meters: number, baseLat: number): number {
  return baseLat + (meters * 0.000009)
}

describe('calculateStatistics', () => {
  it('returns empty stats for no points', () => {
    const s = calculateStatistics([])
    expect(s.distance).toBe(0)
    expect(s.pointCount).toBe(0)
    expect(s.hasElevation).toBe(false)
  })

  it('reports zero distance and elapsed for identical points', () => {
    const s = calculateStatistics([pt(51.5, -0.12, 1000), pt(51.5, -0.12, 2000)])
    expect(s.distance).toBe(0)
    expect(s.elapsedTime).toBe(1)
  })

  it('computes distance across multiple small segments (~haversine)', () => {
    const baseLat = 51.505
    const baseLng = -0.09
    const p0 = pt(baseLat, baseLng, 1000)
    const p1 = pt(oneMeterLeft(100, baseLat), baseLng, 2000)
    const p2 = pt(oneMeterLeft(250, baseLat), baseLng, 3000)
    const s = calculateStatistics([p0, p1, p2])
    // ~100 m + ~150 m, within a tolerance for approximations.
    expect(s.distance).toBeGreaterThan(240)
    expect(s.distance).toBeLessThan(270)
  })

  it('treats sub-threshold segments as not moving', () => {
    // Two fixes ~0.1 m apart, 1 s apart => implied speed 0.1 m/s below threshold.
    const p0 = pt(51.5, -0.12, 1000)
    const p1 = pt(51.5 + 0.0000009, -0.12, 2000)
    const s = calculateStatistics([p0, p1])
    expect(s.movingTime).toBe(0)
  })

  it('counts elapsed and moving time from timestamps only', () => {
    const baseLat = 51.505
    const p0 = pt(baseLat, -0.09, 1000)
    const p1 = pt(oneMeterLeft(10, baseLat), -0.09, 1040)
    const p2 = pt(oneMeterLeft(20, baseLat), -0.09, 1120)
    const s = calculateStatistics([p0, p1, p2])
    expect(s.elapsedTime).toBe(0.12) // 120 ms, converted to seconds
    expect(s.movingTime).toBeGreaterThan(0)
    expect(s.movingTime).toBeLessThanOrEqual(s.elapsedTime)
  })

  it('computes averageSpeed as distance over moving time', () => {
    const baseLat = 51.505
    const p0 = pt(baseLat, -0.09, 1000)
    // 10 m in 10 s => 1 m/s
    const p1 = pt(oneMeterLeft(10, baseLat), -0.09, 11000)
    const s = calculateStatistics([p0, p1])
    expect(s.currentSpeed).toBeGreaterThan(0.9)
    expect(s.currentSpeed).toBeLessThan(1.1)
    expect(s.averageSpeed).toBeCloseTo(s.currentSpeed, 5)
  })

  it('computes elevation gain/loss and min/max honestly', () => {
    const baseLat = 51.505
    const p0 = pt(baseLat, -0.09, 1000, 100)
    const p1 = pt(oneMeterLeft(50, baseLat), -0.09, 2000, 140)
    const p2 = pt(oneMeterLeft(100, baseLat), -0.09, 3000, 120)
    const p3 = pt(oneMeterLeft(150, baseLat), -0.09, 4000, 175)
    const s = calculateStatistics([p0, p1, p2, p3])
    expect(s.hasElevation).toBe(true)
    expect(s.highestElevation).toBe(175)
    expect(s.lowestElevation).toBe(100)
    // gain: 40 + 55 = 95 ; loss: 20
    expect(s.elevationGain).toBeCloseTo(95, 5)
    expect(s.elevationLoss).toBeCloseTo(20, 5)
  })

  it('does not fabricate elevation when altitude is absent', () => {
    const s = calculateStatistics([pt(51.5, -0.12, 1000), pt(51.5001, -0.12, 2000)])
    expect(s.hasElevation).toBe(false)
    expect(s.highestElevation).toBeNull()
    expect(s.lowestElevation).toBeNull()
    expect(s.elevationGain).toBe(0)
  })
})

describe('applySegment', () => {
  it('is incremental and matches the full recompute', () => {
    const p0 = pt(51.505, -0.09, 1000, 100)
    const p1 = pt(oneMeterLeft(50, 51.505), -0.09, 2000, 150)
    const p2 = pt(oneMeterLeft(100, 51.505), -0.09, 3000, 125)

    let acc = { ...emptyStatistics(), elapsedTime: 1 }
    acc = applySegment(acc, p0, p1)
    acc = applySegment(acc, p1, p2)

    const full = calculateStatistics([p0, p1, p2])
    expect(acc.distance).toBeCloseTo(full.distance, 5)
    expect(acc.elevationGain).toBeCloseTo(full.elevationGain, 5)
    expect(acc.elevationLoss).toBeCloseTo(full.elevationLoss, 5)
  })
})