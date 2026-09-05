import { describe, it, expect } from 'vitest'
import {
  haversineDistance,
  isValidCoordinate,
  isFiniteNumber,
  initialBearing,
  normalizeHeading,
} from './geo'

describe('haversineDistance', () => {
  it('returns 0 for identical points', () => {
    expect(haversineDistance(51.5, -0.12, 51.5, -0.12)).toBe(0)
  })

  it('returns a small positive distance for small movements', () => {
    // ~0.001 latitude degree is roughly 111 m.
    const d = haversineDistance(51.5, -0.12, 51.501, -0.12)
    expect(d).toBeGreaterThan(90)
    expect(d).toBeLessThan(130)
  })

  it('returns ~111 km for one degree of latitude', () => {
    const d = haversineDistance(0, 0, 1, 0)
    expect(d).toBeCloseTo(111195, -2)
  })

  it('accumulates correctly across multiple segments', () => {
    const seg1 = haversineDistance(0, 0, 0.5, 0)
    const seg2 = haversineDistance(0.5, 0, 1, 0)
    const total = haversineDistance(0, 0, 1, 0)
    expect(seg1 + seg2).toBeCloseTo(total, -2)
  })

  it('throws for invalid coordinates', () => {
    expect(() => haversineDistance(91, 0, 0, 0)).toThrow()
    expect(() => haversineDistance(0, 0, 0, NaN)).toThrow()
  })
})

describe('isValidCoordinate', () => {
  it('accepts normal coordinates', () => {
    expect(isValidCoordinate(0, 0)).toBe(true)
    expect(isValidCoordinate(-90, -180)).toBe(true)
    expect(isValidCoordinate(90, 180)).toBe(true)
  })

  it('rejects out of range and non-numeric values', () => {
    expect(isValidCoordinate(90.1, 0)).toBe(false)
    expect(isValidCoordinate(0, -181)).toBe(false)
    expect(isValidCoordinate(NaN, 0)).toBe(false)
    expect(isValidCoordinate(1, Number.POSITIVE_INFINITY)).toBe(false)
  })
})

describe('isFiniteNumber', () => {
  it('narrows only finite numbers', () => {
    expect(isFiniteNumber(5)).toBe(true)
    expect(isFiniteNumber(0)).toBe(true)
    expect(isFiniteNumber(undefined)).toBe(false)
    expect(isFiniteNumber(null)).toBe(false)
    expect(isFiniteNumber(NaN)).toBe(false)
    expect(isFiniteNumber(Infinity)).toBe(false)
  })
})

describe('initialBearing', () => {
  it('is 0 degrees due north', () => {
    expect(initialBearing(0, 0, 1, 0)).toBeCloseTo(0, 5)
  })

  it('is 90 degrees due east', () => {
    expect(initialBearing(0, 0, 0, 1)).toBeCloseTo(90, 5)
  })

  it('is bounded in [0, 360)', () => {
    const b = initialBearing(0, 0, 0, -1)
    expect(b).toBeGreaterThanOrEqual(0)
    expect(b).toBeLessThan(360)
  })
})

describe('normalizeHeading', () => {
  it('wraps values within [0, 360)', () => {
    expect(normalizeHeading(-10)).toBe(350)
    expect(normalizeHeading(370)).toBe(10)
    expect(normalizeHeading(0)).toBe(0)
  })
})