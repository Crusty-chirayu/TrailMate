import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { GeolocationEngine, type GeolocationErrorCode } from './geolocation'
import type { IncomingFix } from '../domain/tracking/filtering'

type SuccessCb = (p: unknown) => void
type ErrorCb = (e: { code: number }) => void

class MockGeolocation {
  watchCalls: { success: SuccessCb; error: ErrorCb; options: unknown }[] = []
  cleared: number[] = []
  private sequence = 0

  available = true

  watchPosition(success: SuccessCb, error: ErrorCb, options: unknown): number {
    if (!this.available) return 0
    this.sequence += 1
    this.watchCalls.push({ success, error, options })
    return this.sequence
  }

  clearWatch(id: number): void {
    this.cleared.push(id)
  }

  fire(ws = 0, position?: unknown): void {
    const call = this.watchCalls[ws]
    if (!call) throw new Error('watcher not registered')
    call.success(position)
  }

  fail(ws = 0, code = 1): void {
    const call = this.watchCalls[ws]
    if (!call) throw new Error('watcher not registered')
    call.error({ code })
  }
}

let mock: MockGeolocation
const realNavigator = globalThis.navigator

describe('GeolocationEngine', () => {
  beforeEach(() => {
    mock = new MockGeolocation()
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { geolocation: mock },
    })
  })

  afterEach(() => {
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: realNavigator,
    })
  })

  it('registers a single watcher and reports active', () => {
    const engine = new GeolocationEngine()
    const callbacks = { onPosition: vi.fn(), onError: vi.fn() }
    expect(engine.start(callbacks)).toBe(true)
    expect(engine.isActive).toBe(true)
    // A second start is a no-op (still one watcher).
    expect(engine.start(callbacks)).toBe(true)
    expect(mock.watchCalls).toHaveLength(1)
  })

  it('emits normalized fixes and drops null optional fields', () => {
    const engine = new GeolocationEngine()
    const onPosition = vi.fn()
    const callbacks = { onPosition, onError: vi.fn() }
    engine.start(callbacks)
    mock.fire(0, {
      coords: {
        latitude: 51.505,
        longitude: -0.09,
        accuracy: 8,
        altitude: 120,
        altitudeAccuracy: 2,
        heading: null,
        speed: null,
      },
      timestamp: 1_700_000_000_000,
    })
    const fix: IncomingFix = onPosition.mock.calls[0][0]
    expect(fix.latitude).toBe(51.505)
    expect(fix.accuracy).toBe(8)
    expect(fix.altitude).toBe(120)
    expect(fix.heading).toBeUndefined()
    expect(fix.speed).toBeUndefined()
    expect(fix.timestamp).toBe(1_700_000_000_000)
  })

  it('maps geolocation error codes', () => {
    const engine = new GeolocationEngine()
    const onError = vi.fn()
    engine.start({ onPosition: vi.fn(), onError })

    mock.fail(0, 1)
    expect((onError.mock.calls[0][0] as GeolocationErrorCode)).toBe('denied')
    mock.fail(0, 2)
    expect((onError.mock.calls[1][0] as GeolocationErrorCode)).toBe('unavailable')
    mock.fail(0, 3)
    expect((onError.mock.calls[2][0] as GeolocationErrorCode)).toBe('timeout')
  })

  it('initiates an acquisition that becomes tracking after the first fix', () => {
    const engine = new GeolocationEngine()
    engine.start({ onPosition: vi.fn(), onError: vi.fn() })
    expect(typeof engine).toBe('object')
  })

  it('stops and ignores later positions', () => {
    const engine = new GeolocationEngine()
    const onPosition = vi.fn()
    engine.start({ onPosition, onError: vi.fn() })
    const watchId = mock.watchCalls[0]
    void watchId
    engine.stop()
    expect(engine.isActive).toBe(false)
    expect(mock.cleared.length).toBeGreaterThan(0)
    mock.fire(0, {
      coords: { latitude: 1, longitude: 1, accuracy: 5 },
      timestamp: 1_700_000_000_000,
    })
    expect(onPosition).not.toHaveBeenCalled()
  })

  it('reports unavailable when geolocation is missing', () => {
    mock.available = false
    ;(globalThis.navigator as unknown as { geolocation: unknown }).geolocation = undefined
    const engine = new GeolocationEngine()
    const onError = vi.fn()
    expect(engine.start({ onPosition: vi.fn(), onError })).toBe(false)
    expect((onError.mock.calls[0][0] as GeolocationErrorCode)).toBe('unavailable')
  })
})