// Pure tracking session reducer.
//
// The reducer is the single source of truth for tracking lifecycle state. It
// intentionally performs no I/O, uses no wall clocks of its own, and never
// mutates its inputs: every event carries the timestamps it needs. This makes
// the entire state machine trivially unit-testable.

import { emptyStatistics, applySegment } from './statistics'
import type { TrackingSession, TrackPoint, TrackingStatus, SyncState } from '@/types/tracking'

export interface StartEvent {
  type: 'START'
  sessionId: string
  tripId: string
  startedAt: number
  tripTitle?: string
}

export interface PositionEvent {
  type: 'POSITION'
  point: TrackPoint
  now: number
}

export interface PauseEvent {
  type: 'PAUSE'
  pausedAt: number
}

export interface ResumeEvent {
  type: 'RESUME'
  resumedAt: number
}

export interface FinishEvent {
  type: 'FINISH'
  endedAt: number
}

export interface CompleteEvent {
  type: 'COMPLETE'
  at: number
}

export interface ErrorEvent {
  type: 'ERROR'
  code: 'generic' | 'denied' | 'unavailable'
  message?: string
  at: number
}

export interface RetryEvent {
  type: 'RETRY'
  at: number
}

export interface SetSyncEvent {
  type: 'SET_SYNC'
  syncState: SyncState
}

export interface SetPersistedEvent {
  type: 'SET_PERSISTED'
}

export type TrackingEvent =
  | StartEvent
  | PositionEvent
  | PauseEvent
  | ResumeEvent
  | FinishEvent
  | CompleteEvent
  | ErrorEvent
  | RetryEvent
  | SetSyncEvent
  | SetPersistedEvent

const ACTIVE: TrackingStatus[] = ['acquiring', 'tracking', 'paused']

/** Creates a brand new blank session state. Pure. */
export function createSession(sessionId: string, tripId: string, startedAt: number, tripTitle?: string): TrackingSession {
  return {
    id: sessionId,
    tripId,
    startedAt,
    status: 'acquiring',
    pointCount: 0,
    statistics: emptyStatistics(),
    syncState: 'local',
    persistenceState: 'none',
    updatedAt: startedAt,
    tripTitle,
  }
}

function isStillActive(session: TrackingSession): boolean {
  return !(session.status === 'stopping' || session.status === 'completed')
}

/**
 * Reduces the current session by an event, returning the next session.
 * Invalid transitions for the current status return the session unchanged.
 */
export function reduceSession(
  session: TrackingSession | null,
  event: TrackingEvent,
  movingSpeedMps?: number,
): TrackingSession | null {
  switch (event.type) {
    case 'START': {
      // Guard against double-start creating a second active session.
      if (session && isStillActive(session) && session.status !== 'error' && session.status !== 'denied' && session.status !== 'unavailable') {
        return session
      }
      return createSession(event.sessionId, event.tripId, event.startedAt, event.tripTitle)
    }

    case 'POSITION': {
      if (!session) return session
      if (!(session.status === 'acquiring' || session.status === 'tracking')) return session
      if (!isStillActive(session)) return session

      const point = event.point
      const next: TrackingSession = {
        ...session,
        status: 'tracking',
        lastPosition: point,
        pointCount: session.pointCount + 1,
        updatedAt: point.timestamp,
      }

      if (!session.lastPosition) {
        // First accepted fix seeds the route.
        next.statistics = {
          ...emptyStatistics(),
          elapsedTime: Math.max(0, (point.timestamp - session.startedAt) / 1000),
          pointCount: 1,
          hasElevation: point.altitude !== undefined && Number.isFinite(point.altitude),
          highestElevation: point.altitude !== undefined && Number.isFinite(point.altitude) ? point.altitude! : null,
          lowestElevation: point.altitude !== undefined && Number.isFinite(point.altitude) ? point.altitude! : null,
        }
      } else {
        next.statistics = applySegment(session.statistics, session.lastPosition, point, movingSpeedMps)
        next.statistics.elapsedTime = Math.max(0, (point.timestamp - session.startedAt) / 1000)
      }

      return next
    }

    case 'PAUSE': {
      if (!session) return session
      if (session.status !== 'tracking') return session
      return { ...session, status: 'paused', pausedAt: event.pausedAt, updatedAt: event.pausedAt }
    }

    case 'RESUME': {
      if (!session) return session
      if (session.status !== 'paused') return session
      return { ...session, status: 'tracking', resumedAt: event.resumedAt, updatedAt: event.resumedAt }
    }

    case 'FINISH': {
      if (!session) return session
      if (!ACTIVE.includes(session.status)) return session
      return {
        ...session,
        status: 'stopping',
        endedAt: event.endedAt,
        updatedAt: event.endedAt,
      }
    }

    case 'COMPLETE': {
      if (!session) return session
      if (session.status !== 'stopping') return session
      return { ...session, status: 'completed', updatedAt: event.at }
    }

    case 'ERROR': {
      if (!session) return session
      const status: TrackingStatus =
        event.code === 'denied' ? 'denied'
        : event.code === 'unavailable' ? 'unavailable'
        : 'error'
      return { ...session, status, updatedAt: event.at }
    }

    case 'RETRY': {
      if (!session) return session
      if (!(session.status === 'error' || session.status === 'denied' || session.status === 'unavailable')) {
        return session
      }
      return { ...session, status: 'acquiring', updatedAt: event.at }
    }

    case 'SET_SYNC': {
      if (!session) return session
      return { ...session, syncState: event.syncState, updatedAt: session.updatedAt }
    }

    case 'SET_PERSISTED': {
      if (!session) return session
      return { ...session, persistenceState: 'persisted', updatedAt: session.updatedAt }
    }

    default: {
      // Exhaustiveness check: this branch is unreachable.
      const exhaustive: never = event
      void exhaustive
      return session
    }
  }
}