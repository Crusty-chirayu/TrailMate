// @vitest-environment node

import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { IndexedDbAdapter, MemoryDbAdapter } from './storage'
import { TrackingStore } from './persistence'
import { createSession } from '@/lib/domain/tracking/reducer'
import type { TrackingSession, TrackPoint } from '@/types/tracking'

let counter = 0

function makePoint(tripId: string, sessionId: string, timestamp: number, synced = false): TrackPoint {
  counter += 1
  return {
    id: `p-${counter}`,
    tripId,
    sessionId,
    latitude: 51.505,
    longitude: -0.09,
    timestamp,
    synced,
  }
}

describe('TrackingStore (IndexedDB / fake-indexeddb)', () => {
  let store: TrackingStore

  beforeEach(() => {
    counter = 0
    const adapter = new IndexedDbAdapter(`trailmate-test-${Date.now()}-${Math.random()}`, 1)
    store = new TrackingStore(adapter)
  })

  it('persists and reads back a session', async () => {
    const session = createSession('s1', 't1', 1000)
    await store.saveSession(session)
    const loaded = await store.getSession('s1')
    expect(loaded?.id).toBe('s1')
    expect(loaded?.status).toBe('acquiring')
  })

  it('returns only resumable (active) sessions, newest first', async () => {
    const active = { ...createSession('s1', 't1', 1000), status: 'tracking' as const, updatedAt: 9000 }
    const paused = { ...createSession('s2', 't1', 2000), status: 'paused' as const, updatedAt: 8000 }
    const done = { ...createSession('s3', 't1', 3000), status: 'completed' as const, updatedAt: 7000 }
    const cancelled = { ...createSession('s4', 't1', 4000), status: 'idle' as const, updatedAt: 6000 }
    await store.saveSession(active)
    await store.saveSession(paused)
    await store.saveSession(done)
    await store.saveSession(cancelled)
    const resumable = await store.getResumableSessions()
    expect(resumable.map(s => s.id)).toEqual(['s1', 's2'])
  })

  it('orders points by timestamp within a session', async () => {
    await store.addPoints([
      makePoint('t1', 's1', 3000),
      makePoint('t1', 's1', 1000),
    ])
    const points = await store.getPointsBySession('s1')
    expect(points.map(p => p.timestamp)).toEqual([1000, 3000])
  })

  it('returns only oldest-first unsynced points and marks them synced', async () => {
    await store.addPoints([
      makePoint('t1', 's1', 1000, true),
      makePoint('t1', 's1', 2000, false),
      makePoint('t1', 's1', 3000, false),
    ])
    const unsynced = await store.getUnsyncedPoints(5)
    expect(unsynced.map(p => p.timestamp)).toEqual([2000, 3000])
    expect(unsynced.every(p => p.synced === false)).toBe(true)

    await store.markPointsSynced(unsynced.map(p => p.id))
    const remaining = await store.getUnsyncedPoints(5)
    expect(remaining).toHaveLength(0)
  })

  it('deletes a session and its points together', async () => {
    await store.saveSession(createSession('s1', 't1', 1000))
    await store.addPoints([makePoint('t1', 's1', 2000)])
    await store.deleteSession('s1')
    expect(await store.getSession('s1')).toBeUndefined()
    expect(await store.getPointsBySession('s1')).toHaveLength(0)
  })
})

describe('TrackingStore (in-memory adapter)', () => {
  let store: TrackingStore

  beforeEach(() => {
    counter = 0
    store = new TrackingStore(new MemoryDbAdapter())
  })

  it('behaves equivalently to the IndexedDB implementation', async () => {
    await store.addPoints([makePoint('t1', 's1', 1000, false)])
    expect(await store.getUnsyncedPoints(1)).toHaveLength(1)
    await store.markPointsSynced(['p-1'])
    expect(await store.getUnsyncedPoints(1)).toHaveLength(0)
  })
})