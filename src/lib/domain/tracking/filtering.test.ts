import { describe, it, expect } from 'vitest'
import {
  validateFix,
  evaluateAgainstPrevious,
  evaluatePosition,
  type IncomingFix,
} from './filtering'
import { DEFAULT_TRACK_FILTER } from '@/types/tracking'

const NOW = 1_700_000_000_000

function fix(overrides: Partial<IncomingFix> = {}): IncomingFix {
  return {
    latitude: 51.505,
    longitude: -0.09,
    timestamp: NOW,
    accuracy: 10,
    ...overrides,
  }
}

describe('validateFix', () => {
  it('accepts a healthy fix', () => {
    expect(validateFix(fix(), NOW)).toEqual({ accepted: true, reason: 'accepted' })
  })

  it('rejects invalid coordinates', () => {
    expect(validateFix(fix({ latitude: 95 }), NOW).reason).toBe('invalid')
    expect(validateFix(fix({ latitude: NaN }), NOW).reason).toBe('invalid')
  })

  it('rejects stale timestamps', () => {
    const config = { ...DEFAULT_TRACK_FILTER, maxAgeMs: 60_000 }
    expect(validateFix(fix({ timestamp: NOW - 120_000 }), NOW, config).reason).toBe('stale')
  })

  it('rejects poor accuracy', () => {
    expect(validateFix(fix({ accuracy: 999 }), NOW).reason).toBe('poor-accuracy')
  })

  it('rejects implausible speed spikes', () => {
    expect(validateFix(fix({ speed: 500 }), NOW).reason).toBe('speed-spike')
  })

  it('accepts missing optional fields', () => {
    expect(validateFix(fix({ accuracy: undefined, speed: undefined }), NOW).accepted).toBe(true)
  })
})

describe('evaluateAgainstPrevious', () => {
  const prev = { latitude: 51.505, longitude: -0.09, timestamp: NOW }

  it('accepts when there is no previous point', () => {
    expect(evaluateAgainstPrevious(fix(), undefined).accepted).toBe(true)
  })

  it('rejects a duplicate in the same instant', () => {
    const dup = evaluateAgainstPrevious(fix({ latitude: 51.5050001, longitude: -0.09 }), prev)
    expect(dup.accepted).toBe(false)
    expect(dup.reason).toBe('duplicate')
  })

  it('rejects an impossible jump between consecutive points', () => {
    // A 1000 m jump reported within 1 second of the previous fix.
    const jumped = fix({ latitude: 51.514, timestamp: NOW + 1000 })
    const result = evaluateAgainstPrevious(jumped, prev)
    expect(result.accepted).toBe(false)
    expect(result.reason).toBe('jump')
  })

  it('accepts a plausible hiking movement', () => {
    // ~1 m/s between two fixes a second apart.
    const moved = evaluateAgainstPrevious(
      fix({ latitude: 51.505009, timestamp: NOW + 1000 }),
      prev,
    )
    expect(moved.accepted).toBe(true)
  })
})

describe('evaluatePosition (full pipeline)', () => {
  it('accepts a new healthy fix after previous movement', () => {
    const result = evaluatePosition(fix({ timestamp: NOW + 2000 }), NOW + 2000, {
      latitude: 51.505,
      longitude: -0.09,
      timestamp: NOW,
    })
    expect(result.accepted).toBe(true)
  })

  it('short-circuits on structural rejection without crashing on undefined prev', () => {
    const result = evaluatePosition(fix({ latitude: 200 }), NOW, undefined)
    expect(result.accepted).toBe(false)
    expect(result.reason).toBe('invalid')
  })
})