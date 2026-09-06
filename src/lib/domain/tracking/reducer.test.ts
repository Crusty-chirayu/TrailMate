import { describe, it, expect } from 'vitest'
import { reduceSession, createSession, type TrackingEvent } from './reducer'
import type { TrackPoint, TrackingSession } from '@/types/tracking'
import { emptyStatistics } from './statistics'

function makePoint(lat: number, lng: number, timestamp: number, sessionId = 's1'): TrackPoint {
  return {
    id: `p-${lat}-${timestamp}`,
    tripId: 't1',
    sessionId,
    latitude: lat,
    longitude: lng,
    timestamp,
    synced: false,
  }
}

function activeSession(): TrackingSession {
  const s = createSession('s1', 't1', 1000, 'Test Trip')
  expect(s.status).toBe('acquiring')
  return s
}

function prefer(event: TrackingEvent, state: TrackingSession | null): TrackingSession {
  const next = reduceSession(state, event)
  if (!next) throw new Error('Expected a session')
  return next
}

function moved(): TrackingSession {
  let s = activeSession()
  s = prefer({ type: 'POSITION', point: makePoint(51.505, -0.09, 2000), now: 2000 }, s)
  return s
}

describe('tracking state machine', () => {
  it('starts an acquiring session', () => {
    const s = prefer({ type: 'START', sessionId: 's1', tripId: 't1', startedAt: 1000 }, null)
    expect(s.status).toBe('acquiring')
    expect(s.pointCount).toBe(0)
    expect(s.statistics).toEqual(emptyStatistics())
  })

  it('guards against a double start on an active session', () => {
    const first = prefer({ type: 'START', sessionId: 's1', tripId: 't1', startedAt: 1000 }, null)
    const second = prefer({ type: 'START', sessionId: 's9', tripId: 't1', startedAt: 5000 }, first)
    expect(second.id).toBe('s1')
    expect(second.startedAt).toBe(1000)
  })

  it('transitions acquiring -> tracking on the first position and seeds stats', () => {
    const s = moved()
    expect(s.status).toBe('tracking')
    expect(s.pointCount).toBe(1)
    expect(s.statistics.pointCount).toBe(1)
    expect(s.lastPosition?.id).toBe('p-51.505-2000')
  })

  it('accumulates distance across positions', () => {
    let s = moved()
    s = prefer({ type: 'POSITION', point: makePoint(51.5051, -0.09, 3000), now: 3000 }, s)
    expect(s.pointCount).toBe(2)
    expect(s.statistics.distance).toBeGreaterThan(0)
  })

  it('ignores positions while paused', () => {
    let s = moved()
    s = prefer({ type: 'PAUSE', pausedAt: 3000 }, s)
    expect(s.status).toBe('paused')
    const duringPause = prefer(
      { type: 'POSITION', point: makePoint(51.505, -0.09, 4000), now: 4000 },
      s,
    )
    expect(duringPause.status).toBe('paused')
    expect(duringPause.pointCount).toBe(1)
  })

  it('pauses only from tracking and resumes only from paused', () => {
    // Cannot pause while still acquiring.
    expect(prefer({ type: 'PAUSE', pausedAt: 1500 }, activeSession()).status).toBe('acquiring')

    const paused = prefer({ type: 'PAUSE', pausedAt: 3000 }, moved())
    expect(paused.status).toBe('paused')

    const resumed = prefer({ type: 'RESUME', resumedAt: 4000 }, paused)
    expect(resumed.status).toBe('tracking')

    // Cannot pause twice while already paused.
    expect(prefer({ type: 'PAUSE', pausedAt: 5000 }, paused).status).toBe('paused')
  })

  it('finishes from active states and completes from stopping; double finish is a no-op', () => {
    const stopping = prefer({ type: 'FINISH', endedAt: 3000 }, moved())
    expect(stopping.status).toBe('stopping')
    expect(stopping.endedAt).toBe(3000)

    const doubled = prefer({ type: 'FINISH', endedAt: 4000 }, stopping)
    expect(doubled.status).toBe('stopping')

    const completed = prefer({ type: 'COMPLETE', at: 5000 }, stopping)
    expect(completed.status).toBe('completed')
    expect(prefer({ type: 'COMPLETE', at: 6000 }, completed).status).toBe('completed')
  })

  it('maps errors to denied/unavailable/error and supports retry', () => {
    const denied = prefer({ type: 'ERROR', code: 'denied', at: 2000 }, activeSession())
    expect(denied.status).toBe('denied')

    expect(prefer({ type: 'RETRY', at: 3000 }, denied).status).toBe('acquiring')

    const unavailable = prefer({ type: 'ERROR', code: 'unavailable', at: 4000 }, denied)
    expect(unavailable.status).toBe('unavailable')

    const generic = prefer({ type: 'ERROR', code: 'generic', at: 5000 }, unavailable)
    expect(generic.status).toBe('error')
  })

  it('is pure: does not mutate the input session', () => {
    const s = moved()
    const before = JSON.stringify(s)
    prefer({ type: 'ERROR', code: 'unavailable', at: 2000 }, s)
    prefer({ type: 'FINISH', endedAt: 5000 }, s)
    expect(JSON.stringify(s)).toBe(before)
  })

  it('records the engine sync state and durability on the session', () => {
    let s = moved()
    s = prefer({ type: 'SET_SYNC', syncState: 'syncing' }, s)
    expect(s.syncState).toBe('syncing')
    s = prefer({ type: 'SET_SYNC', syncState: 'synced' }, s)
    expect(s.syncState).toBe('synced')
    s = prefer({ type: 'SET_PERSISTED' }, s)
    expect(s.persistenceState).toBe('persisted')
    // Sync state survives lifecycle transitions.
    s = prefer({ type: 'FINISH', endedAt: 9000 }, s)
    expect(s.syncState).toBe('synced')
  })

  it('ignores SET_SYNC without a session', () => {
    expect(reduceSession(null, { type: 'SET_SYNC', syncState: 'queued' })).toBeNull()
  })
})