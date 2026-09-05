'use client'

// React integration for the tracking system.
//
// Composes the pure session reducer, the browser geolocation engine, durable
// IndexedDB persistence, and the background sync engine into a hook. GPS
// collection never depends on render frequency: the engine calls into stable
// refs, and React state is mirrored only for display.

import { useEffect, useRef, useState, useCallback } from 'react'
import type { TrackingSession, TrackPoint, SyncState, TrackFilterConfig, TrackingStatistics } from '@/types/tracking'
import { DEFAULT_TRACK_FILTER } from '@/types/tracking'
import { reduceSession, type TrackingEvent } from '@/lib/domain/tracking/reducer'
import { evaluatePosition, type IncomingFix } from '@/lib/domain/tracking/filtering'
import { emptyStatistics } from '@/lib/domain/tracking/statistics'
import { GeolocationEngine, type GeolocationErrorCode } from '@/lib/tracking/geolocation'
import { TrackingStore } from '@/lib/tracking/persistence'
import { TrackingSync } from '@/lib/tracking/sync'
import { IndexedDbAdapter } from '@/lib/tracking/storage'
import { createSupabaseSyncUploader } from '@/lib/tracking/supabaseSync'

/** Cap on points held in React state for rendering; storage keeps everything. */
const MAX_LIVE_POINTS = 1500

function mountStore(): TrackingStore {
  return new TrackingStore(new IndexedDbAdapter())
}

function isOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false
}

function makeId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

export interface UseTrackingOptions {
  tripTitle?: string
  filterConfig?: Partial<TrackFilterConfig>
}

export function useTracking(tripId: string, options?: UseTrackingOptions) {
  const [session, setSession] = useState<TrackingSession | null>(null)
  const [points, setPoints] = useState<TrackPoint[]>([])
  const [syncState, setSyncState] = useState<SyncState>('local')
  const [online, setOnline] = useState(isOnline)

  const sessionRef = useRef<TrackingSession | null>(null)
  const storeRef = useRef<TrackingStore | null>(null)
  const engineRef = useRef<GeolocationEngine | null>(null)
  const syncRef = useRef<TrackingSync | null>(null)
  const filterRef = useRef<TrackFilterConfig>({ ...DEFAULT_TRACK_FILTER, ...options?.filterConfig })
  const tripTitleRef = useRef(options?.tripTitle)
  const startLockRef = useRef(false)
  const finishLockRef = useRef(false)
  const livePointsRef = useRef<TrackPoint[]>([])
  const handleFixRef = useRef<(fix: IncomingFix) => void>(() => {})

  /** Mirrors the authoritative session into React state + durable storage. */
  const applySession = useCallback((next: TrackingSession) => {
    sessionRef.current = next
    setSession(next)
    void storeRef.current
      ?.saveSession(next)
      .catch(() => {
        const err: TrackingSession = { ...next, persistenceState: 'error' }
        sessionRef.current = err
        setSession(err)
      })
  }, [])

  /** Applies a lifecycle event to the current session and persists. */
  const dispatch = useCallback(
    (event: TrackingEvent) => {
      const next = reduceSession(sessionRef.current, event)
      if (next) applySession(next)
      void syncRef.current?.syncNow()
      return next
    },
    [applySession],
  )

  /** Append an accepted point to the live map state (capped in memory). */
  const appendPoint = useCallback((point: TrackPoint) => {
    const list = [...livePointsRef.current, point]
    if (list.length > MAX_LIVE_POINTS) list.splice(0, list.length - MAX_LIVE_POINTS)
    livePointsRef.current = list
    setPoints(list)
  }, [])

  const handleFix = useCallback(
    (fix: IncomingFix) => {
      const s = sessionRef.current
      if (!s) return
      if (!(s.status === 'acquiring' || s.status === 'tracking' || s.status === 'error')) return

      const now = Date.now()
      const previous = s.lastPosition
        ? {
            latitude: s.lastPosition.latitude,
            longitude: s.lastPosition.longitude,
            timestamp: s.lastPosition.timestamp,
          }
        : undefined
      const evaluation = evaluatePosition(fix, now, previous, filterRef.current)
      if (!evaluation.accepted) return

      const point: TrackPoint = {
        id: makeId(),
        tripId: s.tripId,
        sessionId: s.id,
        timestamp: fix.timestamp,
        latitude: fix.latitude,
        longitude: fix.longitude,
        synced: false,
        ...(fix.accuracy !== undefined ? { accuracy: fix.accuracy } : {}),
        ...(fix.altitude !== undefined ? { altitude: fix.altitude } : {}),
        ...(fix.altitudeAccuracy !== undefined ? { altitudeAccuracy: fix.altitudeAccuracy } : {}),
        ...(fix.heading !== undefined ? { heading: fix.heading } : {}),
        ...(fix.speed !== undefined ? { speed: fix.speed } : {}),
      }

      const next = reduceSession(s, { type: 'POSITION', point, now })
      if (!next) return
      applySession(next)
      void storeRef.current?.savePoint(point)
      appendPoint(point)
      void syncRef.current?.syncNow()
    },
    [applySession, appendPoint],
  )
  // Wire the latest fix handler into the stable ref after commit. The engine
  // dispatches through this ref, so callbacks never depend on render identity.
  useEffect(() => {
    handleFixRef.current = handleFix
  }, [handleFix])

  const handleError = useCallback(
    (code: GeolocationErrorCode) => {
      const eventCode = code === 'denied' ? 'denied' : code === 'unavailable' ? 'unavailable' : 'generic'
      dispatch({ type: 'ERROR', code: eventCode, at: Date.now() })
    },
    [dispatch],
  )

  const startEngine = useCallback(() => {
    engineRef.current?.start({
      onPosition: fix => handleFixRef.current(fix),
      onError: handleError,
    })
  }, [handleError])

  // ---- Initialization: load resumable session, wire storage/sync/engine.
  useEffect(() => {
    const store = mountStore()
    storeRef.current = store

    const engine = new GeolocationEngine()
    engineRef.current = engine

    const sync = new TrackingSync({
      store,
      uploader: createSupabaseSyncUploader(),
      isOnline,
      onStateChange: s => setSyncState(s),
    })
    syncRef.current = sync

    let cancelled = false

    const init = async () => {
      try {
        const resumable = (await store.getResumableSessions()).find(x => x.tripId === tripId)
        if (
          !cancelled &&
          resumable &&
          (resumable.status === 'acquiring' || resumable.status === 'tracking' || resumable.status === 'paused')
        ) {
          const restored: TrackingSession = {
            ...resumable,
            tripTitle: tripTitleRef.current ?? resumable.tripTitle,
          }
          sessionRef.current = restored
          if (restored.status === 'paused') {
            setSession(restored)
          } else {
            applySession({ ...restored, status: 'acquiring' })
            startEngine()
          }
          const existing = await store.getPointsBySession(restored.id)
          if (!cancelled) {
            livePointsRef.current = existing.slice(-MAX_LIVE_POINTS)
            setPoints(livePointsRef.current)
          }
        }
        if (!cancelled) sync.start()
        void sync.syncNow()
      } catch {
        // The UI shows an idle state; the user can start a new session.
      }
    }

    const onOnline = () => setOnline(true)
    const onOffline = () => setOnline(false)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)

    void init()

    return () => {
      cancelled = true
      engine.stop()
      sync.stop()
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      sessionRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId])

  // ---- Public controls -------------------------------------------------------

  const start = useCallback(async () => {
    if (startLockRef.current) return
    const current = sessionRef.current
    if (current && (current.status === 'acquiring' || current.status === 'tracking' || current.status === 'paused')) {
      return
    }
    startLockRef.current = true
    try {
      const resumable = (await storeRef.current?.getResumableSessions())?.find(x => x.tripId === tripId)
      const now = Date.now()
      let next: TrackingSession
      if (resumable) {
        next = {
          ...resumable,
          status: 'acquiring',
          tripTitle: tripTitleRef.current ?? resumable.tripTitle,
          persistenceState: 'persisted',
        }
      } else {
        next = reduceSession(null, {
          type: 'START',
          sessionId: makeId(),
          tripId,
          startedAt: now,
          tripTitle: tripTitleRef.current,
        }) as TrackingSession
      }
      applySession(next)
      startEngine()
      void syncRef.current?.syncNow()
    } finally {
      startLockRef.current = false
    }
  }, [tripId, applySession, startEngine])

  const pause = useCallback(() => {
    const current = sessionRef.current
    if (!current || current.status !== 'tracking') return
    engineRef.current?.stop()
    dispatch({ type: 'PAUSE', pausedAt: Date.now() })
  }, [dispatch])

  const resume = useCallback(() => {
    const current = sessionRef.current
    if (!current || current.status !== 'paused') return
    dispatch({ type: 'RESUME', resumedAt: Date.now() })
    startEngine()
    void syncRef.current?.syncNow()
  }, [dispatch, startEngine])

  const finish = useCallback(async () => {
    if (finishLockRef.current) return
    const current = sessionRef.current
    if (!current || !(current.status === 'acquiring' || current.status === 'tracking' || current.status === 'paused')) {
      return
    }
    finishLockRef.current = true
    try {
      engineRef.current?.stop()
      const inFlight = reduceSession(current, { type: 'FINISH', endedAt: Date.now() })
      if (inFlight) applySession(inFlight)
      // Push any pending points before marking complete.
      await syncRef.current?.syncNow()
      const done = sessionRef.current ? reduceSession(sessionRef.current, { type: 'COMPLETE', at: Date.now() }) : null
      if (done) applySession(done)
    } finally {
      finishLockRef.current = false
    }
  }, [applySession])

  const stats: TrackingStatistics = session?.statistics ?? emptyStatistics()
  const status = session?.status ?? 'idle'

  return {
    session,
    points,
    stats,
    status,
    syncState,
    online,
    start,
    pause,
    resume,
    finish,
    isRecording: status === 'tracking' || status === 'acquiring',
    isPaused: status === 'paused',
    isIdle: status === 'idle' || status === 'completed',
    canStart: status === 'idle' || status === 'completed' || status === 'error' || status === 'denied' || status === 'unavailable',
    canPause: status === 'tracking',
    canResume: status === 'paused',
    canFinish: status === 'acquiring' || status === 'tracking' || status === 'paused',
  }
}