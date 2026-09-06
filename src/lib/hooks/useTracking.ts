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
import { finishTripAction } from '@/app/trips/[id]/track/actions'

/** Cap on points held in React state for rendering; storage keeps everything. */
const MAX_LIVE_POINTS = 1500

function mountStore(userId: string): TrackingStore {
  return new TrackingStore(new IndexedDbAdapter(), userId)
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

/** Deterministic content hash for import dedupe (WebCrypto, FNV fallback). */
async function stableHash(input: string): Promise<string> {
  try {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
      return Array.from(new Uint8Array(digest))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')
    }
  } catch {
    // Fall through to the string hash.
  }
  let h = 2166136261
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

export interface UseTrackingOptions {
  /** Owning account id; all local records are scoped to this user. */
  userId: string
  tripTitle?: string
  filterConfig?: Partial<TrackFilterConfig>
}

export function useTracking(tripId: string, options?: UseTrackingOptions) {
  const userId = options?.userId ?? ''
  const [session, setSession] = useState<TrackingSession | null>(null)
  const [points, setPoints] = useState<TrackPoint[]>([])
  const [syncState, setSyncState] = useState<SyncState>('local')
  const [online, setOnline] = useState(isOnline)
  const [serverCompletion, setServerCompletion] = useState<'none' | 'pending' | 'synced' | 'error'>('none')

  const sessionRef = useRef<TrackingSession | null>(null)
  const storeRef = useRef<TrackingStore | null>(null)
  const engineRef = useRef<GeolocationEngine | null>(null)
  const syncRef = useRef<TrackingSync | null>(null)
  const filterRef = useRef<TrackFilterConfig>({ ...DEFAULT_TRACK_FILTER, ...options?.filterConfig })
  const tripTitleRef = useRef(options?.tripTitle)
  const optionsRef = useRef(options)
  const startLockRef = useRef(false)
  const finishLockRef = useRef(false)
  const livePointsRef = useRef<TrackPoint[]>([])
  const handleFixRef = useRef<(fix: IncomingFix) => void>(() => {})

  // Latest dispatch, readable from the sync engine's state callback.
  const dispatchRef = useRef<(event: TrackingEvent) => TrackingSession | null>(() => null)

  /** Mirrors the authoritative session into React state + durable storage. */
  const applySession = useCallback((next: TrackingSession) => {
    sessionRef.current = next
    setSession(next)
    void storeRef.current
      ?.saveSession(next)
      .then(() => {
        // Record durability explicitly once a save succeeds (guarded so the
        // resulting dispatch does not loop).
        if (sessionRef.current?.persistenceState !== 'persisted') {
          dispatchRef.current?.({ type: 'SET_PERSISTED' })
        }
      })
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
  useEffect(() => {
    dispatchRef.current = dispatch
  }, [dispatch])

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
      // Only reducible states accept fixes; matches the reducer's POSITION
      // guard so a point is never persisted without being counted.
      if (!(s.status === 'acquiring' || s.status === 'tracking')) return

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
        userId: s.userId ?? userId,
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
    [applySession, appendPoint, userId],
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
    // Auth safety: never mount user-bound storage or the GPS/sync engines when
    // no account is known (covers logout and account switches in the same tab).
    if (!userId) return
    const store = mountStore(userId)
    storeRef.current = store

    const engine = new GeolocationEngine()
    engineRef.current = engine

    const sync = new TrackingSync({
      store,
      uploader: createSupabaseSyncUploader(),
      isOnline,
      onStateChange: s => {
        setSyncState(s)
        // Keep the persisted session's syncState in lockstep with the engine
        // so recovery UIs never read a stale claim.
        dispatchRef.current?.({ type: 'SET_SYNC', syncState: s })
      },
    })
    syncRef.current = sync

    let cancelled = false

    const init = async () => {
      try {
        // One-time adoption of pre-v2 records under the currently signed-in
        // account. Unattributable records are quarantined by the sync engine
        // on upload rejection rather than blocking the queue.
        await store.migrateLegacyRecords()
        // Offline-finish recovery: if a locally finished session still needs
        // server-side trip completion, reconcile before anything else.
        const pendingCompletion = await store.getCompletionIntent(tripId)
        if (!cancelled && pendingCompletion) {
          const result = await finishTripAction(tripId)
          if (result.ok) {
            await store.removeCompletionIntent(tripId)
            setServerCompletion('synced')
          } else {
            setServerCompletion('pending')
          }
        }
        const resumable = (await store.getResumableSessions()).find(x => x.tripId === tripId)
        if (
          !cancelled &&
          resumable &&
          (resumable.status === 'acquiring' || resumable.status === 'tracking' || resumable.status === 'paused')
        ) {
          const restored: TrackingSession = {
            ...resumable,
            userId: resumable.userId ?? optionsRef.current?.userId,
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
    // userId is intentionally part of the lifecycle: an account switch must
    // tear down the previous user's storage/sync wiring.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId, userId])

  // ---- Public controls -------------------------------------------------------

  /** Restarts the GPS watcher for the same session after a recoverable error. */
  const retrySession = useCallback(() => {
    const current = sessionRef.current
    if (!current || !(current.status === 'error' || current.status === 'denied' || current.status === 'unavailable')) {
      return
    }
    dispatch({ type: 'RETRY', at: Date.now() })
    startEngine()
  }, [dispatch, startEngine])

  /** Kicks the sync engine after a paused failure or to force a manual sync. */
  const retrySync = useCallback(() => {
    syncRef.current?.retryNow()
  }, [])

  /** Queues imported route points locally for the sync engine (offline-safe re-import dedupe). */
  const importRoutePoints = useCallback(
    async (input: {
      format: 'gpx' | 'kml'
      fileName: string
      points: { lat: number; lng: number; elevation?: number; timestamp?: number; accuracy?: number }[]
    }): Promise<{ queued: number; existing: boolean }> => {
      const store = storeRef.current
      if (!store || input.points.length === 0) return { queued: 0, existing: false }

      const hash = await stableHash(input.fileName + '\u0000' + JSON.stringify(input.points))
      const existing = await store.getPointsByTrip(tripId)
      if (existing.some(p => p.metadata?.importHash === hash)) {
        return { queued: 0, existing: true }
      }

      const now = Date.now()
      const records: TrackPoint[] = input.points.map((p, i) => ({
        id: `imp:${hash}:${i}`,
        userId,
        tripId,
        sessionId: `import:${tripId}`,
        timestamp: p.timestamp ?? now,
        latitude: p.lat,
        longitude: p.lng,
        elevation: p.elevation,
        accuracy: p.accuracy,
        synced: false,
        metadata: {
          importHash: hash,
          imported: true,
          source: 'route-import',
          format: input.format,
          fileName: input.fileName,
        },
      }))
      await store.addPoints(records)
      void syncRef.current?.syncNow()
      return { queued: records.length, existing: false }
    },
    [tripId, userId],
  )

  /** Retries server-side trip completion for an offline finish. */
  const retryCompletion = useCallback(async () => {
    const store = storeRef.current
    if (!store) return
    try {
      const result = await finishTripAction(tripId)
      if (result.ok) {
        await store.removeCompletionIntent(tripId)
        setServerCompletion('synced')
      } else {
        setServerCompletion(result.error?.includes('authenticated') ? 'error' : 'pending')
      }
    } catch {
      setServerCompletion('pending')
    }
  }, [tripId])

  const start = useCallback(async () => {
    if (startLockRef.current) return
    const current = sessionRef.current
    if (current && (current.status === 'acquiring' || current.status === 'tracking' || current.status === 'paused')) {
      return
    }
    // A recoverable GPS error must resume the SAME session, never start anew
    // (a new session would orphan the previous one and its queued points).
    if (current && (current.status === 'error' || current.status === 'denied' || current.status === 'unavailable')) {
      retrySession()
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
          userId: resumable.userId ?? optionsRef.current?.userId,
          status: 'acquiring',
          tripTitle: tripTitleRef.current ?? resumable.tripTitle,
          persistenceState: 'persisted',
        }
      } else {
        next = {
          ...(reduceSession(null, {
            type: 'START',
            sessionId: makeId(),
            tripId,
            startedAt: now,
            tripTitle: tripTitleRef.current,
          }) as TrackingSession),
          userId: optionsRef.current?.userId,
        }
      }
      applySession(next)
      startEngine()
      void syncRef.current?.syncNow()
    } finally {
      startLockRef.current = false
    }
  }, [tripId, applySession, startEngine, retrySession])

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
      // Push any pending points before marking complete; the engine keeps
      // draining in the background either way.
      await syncRef.current?.syncNow()
      const done = sessionRef.current ? reduceSession(sessionRef.current, { type: 'COMPLETE', at: Date.now() }) : null
      if (done) applySession(done)
      // Two-phase server completion: persist the intent first so an offline
      // finish is recoverable, then reconcile; remove only on success.
      await storeRef.current?.saveCompletionIntent(tripId)
      try {
        const result = await finishTripAction(tripId)
        if (result.ok) {
          await storeRef.current?.removeCompletionIntent(tripId)
          setServerCompletion('synced')
        } else {
          setServerCompletion(result.error?.includes('authenticated') ? 'error' : 'pending')
        }
      } catch {
        setServerCompletion('pending')
      }
    } finally {
      finishLockRef.current = false
    }
  }, [applySession, tripId])

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
    retrySession,
    retrySync,
    retryCompletion,
    serverCompletion,
    importRoutePoints,
    isRecording: status === 'tracking' || status === 'acquiring',
    isPaused: status === 'paused',
    isIdle: status === 'idle' || status === 'completed',
    canStart: status === 'idle' || status === 'completed',
    canRetry: status === 'error' || status === 'denied' || status === 'unavailable',
    canPause: status === 'tracking',
    canResume: status === 'paused',
    canFinish: status === 'acquiring' || status === 'tracking' || status === 'paused',
  }
}