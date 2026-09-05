// Thin wrapper around the browser Geolocation API.
//
// Responsibilities:
//  - maintain exactly one active watch for a recording session
//  - translate native Position / PositionError into domain-friendly shapes
//  - guarantee cleanup on stop/unmount so no watcher or OS resource leaks
//  - never depend on React render frequency (callers drive the loop)

import type { IncomingFix } from '../domain/tracking/filtering'
import { isFiniteNumber } from '../domain/tracking/geo'

export type GeolocationErrorCode = 'denied' | 'unavailable' | 'timeout' | 'generic'

export type GeolocationErrorHandler = (code: GeolocationErrorCode) => void
export type GeolocationPositionHandler = (fix: IncomingFix) => void

export interface GeolocationCallbacks {
  onPosition: GeolocationPositionHandler
  onError: GeolocationErrorHandler
}

export interface GeolocationOptions {
  enableHighAccuracy?: boolean
  timeoutMs?: number
  maximumAgeMs?: number
}

const DEFAULT_OPTIONS: GeolocationOptions = {
  enableHighAccuracy: true,
  timeoutMs: 15_000,
  maximumAgeMs: 0,
}

const PERMISSION_DENIED = 1
const POSITION_UNAVAILABLE = 2
const TIMEOUT = 3

export class GeolocationEngine {
  private watchId: number | null = null
  private active = false
  private options: GeolocationOptions = DEFAULT_OPTIONS

  configure(options: Partial<GeolocationOptions>): void {
    this.options = { ...DEFAULT_OPTIONS, ...options }
  }

  /** Whether a watcher is currently registered. */
  get isActive(): boolean {
    return this.active
  }

  /**
   * Starts watching location. Returns true if a watcher is now registered.
   * Guarantees a single watcher: if one is already active this is a no-op.
   */
  start(callbacks: GeolocationCallbacks): boolean {
    if (this.active) return true
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      callbacks.onError('unavailable')
      return false
    }

    const success = (position: GeolocationPosition): void => {
      if (!this.active) return
      callbacks.onPosition(normalizePosition(position))
    }

    const failure = (error: GeolocationPositionError): void => {
      if (!this.active) return
      let code: GeolocationErrorCode
      switch (error.code) {
        case PERMISSION_DENIED:
          code = 'denied'
          break
        case POSITION_UNAVAILABLE:
          code = 'unavailable'
          break
        case TIMEOUT:
          code = 'timeout'
          break
        default:
          code = 'generic'
      }
      callbacks.onError(code)
    }

    const watchId = navigator.geolocation.watchPosition(
      success,
      failure,
      {
        enableHighAccuracy: this.options.enableHighAccuracy,
        timeout: this.options.timeoutMs,
        maximumAge: this.options.maximumAgeMs,
      },
    )

    this.watchId = watchId
    this.active = true
    return true
  }

  /** Stops the watcher. Safe to call repeatedly. */
  stop(): void {
    if (this.watchId !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.clearWatch(this.watchId)
    }
    this.watchId = null
    this.active = false
  }
}

/**
 * Maps a native GeolocationPosition into the domain IncomingFix shape.
 * Values that the device reports as null/NaN are dropped rather than preserved.
 */
function normalizePosition(position: GeolocationPosition): IncomingFix {
  const coords = position.coords
  const fix: IncomingFix = {
    latitude: coords.latitude,
    longitude: coords.longitude,
    timestamp: position.timestamp,
  }
  if (isFiniteNumber(coords.accuracy)) fix.accuracy = coords.accuracy
  if (isFiniteNumber(coords.altitude)) fix.altitude = coords.altitude
  if (isFiniteNumber(coords.altitudeAccuracy)) fix.altitudeAccuracy = coords.altitudeAccuracy
  if (isFiniteNumber(coords.heading)) fix.heading = coords.heading
  if (isFiniteNumber(coords.speed)) fix.speed = coords.speed
  return fix
}