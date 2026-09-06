// @vitest-environment node

import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { IndexedDbAdapter, MemoryDbAdapter, DB_VERSION, STORE_META } from './storage'
import { TrackingStore } from './persistence'
import { createSession } from '@/lib/domain/tracking/reducer'
import type { TrackPoint } from '@/types/tracking'

let counter = 0

function makePoint(
  tripId: string,
  sessionId: string,
  timestamp: number,
  synced = false,
  userId?: string,
): TrackPoint {
  counter += 1
  return {
    id: `p-${counter}`,
    userId,
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
    const adapter = new IndexedDbAdapter(`trailmate-test-${Date.now()}-${Math.random()}`, DB_VERSION)
    store = new TrackingStore(adapter, 'user-a')
  })

  it('persists and reads back a session', async () => {
    const session = createSession('s1', 't1', 1000)
    await store.saveSession(session)
    const loaded = await store.getSession('s1')
    expect(loaded?.id).toBe('s1')
    expect(loaded?.status).toBe('acquiring')
    expect(loaded?.userId).toBe('user-a')
  })

  it('isolates records between users', async () => {
    const adapter = new IndexedDbAdapter(`trailmate-iso-${Date.now()}`, DB_VERSION)
    const a = new TrackingStore(adapter, 'user-a')
    const b = new TrackingStore(adapter, 'user-b')

    await a.saveSession(createSession('s-a', 't1', 1000))
    await b.saveSession(createSession('s-b', 't2', 2000))
    await a.addPoints([makePoint('t1', 's-a', 1000, false)])
    await b.addPoints([makePoint('t2', 's-b', 2000, false)])

    expect(await a.getSession('s-b')).toBeUndefined()
    expect(await b.getSession('s-a')).toBeUndefined()
    expect((await a.getAllSessions()).map(s => s.id)).toEqual(['s-a'])
    expect((await b.getUnsyncedPoints(10)).map(p => p.sessionId)).toEqual(['s-b'])
    expect(await a.getPointsBySession('s-b')).toHaveLength(0)
  })

  it('migrates legacy v1 records once and stamps the adopting user', async () => {
    // Build a v1 database by hand: sessions/points without userId, plus a legacy pending store.
    const dbName = `trailmate-legacy-${Date.now()}`
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open(dbName, 1)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains('sessions')) db.createObjectStore('sessions', { keyPath: 'id' })
        if (!db.objectStoreNames.contains('points')) db.createObjectStore('points', { keyPath: 'id' })
        if (!db.objectStoreNames.contains('pending')) db.createObjectStore('pending', { keyPath: 'id' })
      }
      req.onsuccess = () => {
        const db = req.result
        const tx = db.transaction(['sessions', 'points'], 'readwrite')
        tx.objectStore('sessions').put({ id: 's-legacy', tripId: 't1', startedAt: 1000, status: 'acquiring' })
        tx.objectStore('points').put({
          id: 'p-legacy', tripId: 't1', sessionId: 's-legacy', timestamp: 1000,
          latitude: 51.5, longitude: -0.09, synced: false,
        })
        tx.oncomplete = () => {
          db.close()
          resolve()
        }
        tx.onerror = () => reject(tx.error)
      }
      req.onerror = () => reject(req.error)
    })

    const adapter = new IndexedDbAdapter(dbName, DB_VERSION)
    const storeLegacy = new TrackingStore(adapter, 'user-a')
    // Upgrade happens on first adapter use (upgrade to v2 drops the pending store).
    expect(await storeLegacy.migrateLegacyRecords()).toBe(true)
    expect(await storeLegacy.migrateLegacyRecords()).toBe(false)
    const session = await storeLegacy.getSession('s-legacy')
    expect(session?.userId).toBe('user-a')
    const points = await storeLegacy.getPointsBySession('s-legacy')
    expect(points).toHaveLength(1)
    expect(points[0].userId).toBe('user-a')
    // Meta flag recorded; pending store no longer exists.
    const meta = await adapter.get<{ id: string; value: string }>(STORE_META, 'legacyMigratedFor')
    expect(meta?.value).toBe('user-a')
  })

  it('returns only resumable (active) sessions for the owner, newest first', async () => {
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

  it('quarantines points so a stale record cannot block the queue', async () => {
    await store.addPoints([
      makePoint('t1', 's1', 1000, false),
      makePoint('t1', 's1', 2000, false),
    ])
    const points = await store.getUnsyncedPoints(5)
    await store.quarantinePoints([points[0].id], 'trip deleted')
    const remaining = await store.getUnsyncedPoints(5)
    expect(remaining.map(p => p.timestamp)).toEqual([2000])
    // Raw data preserved for history/export.
    const all = await store.getPointsBySession('s1')
    expect(all).toHaveLength(2)
    expect(all[0].quarantined).toBe(true)
  })

  it('handles 5000 points without losing or duplicating records', async () => {
    const points = Array.from({ length: 5000 }, (_, i) =>
      makePoint('t1', 's1', 1000 + i, false),
    )
    await store.addPoints(points)
    expect(await store.getPointsBySession('s1')).toHaveLength(5000)
    expect(await store.countUnsyncedPoints()).toBe(5000)
    const batch = await store.getUnsyncedPoints(200)
    expect(batch).toHaveLength(200)
    expect(batch[0].timestamp).toBe(1000)
  })

  it('deletes a session and its points together, only for the owner', async () => {
    await store.saveSession(createSession('s1', 't1', 1000))
    await store.addPoints([makePoint('t1', 's1', 2000)])
    await store.deleteSession('s1')
    expect(await store.getSession('s1')).toBeUndefined()
    expect(await store.getPointsBySession('s1')).toHaveLength(0)
  })

  it('deletes local records for a trip owned by the user only', async () => {
    const adapter = new IndexedDbAdapter(`trailmate-del-${Date.now()}`, DB_VERSION)
    const a = new TrackingStore(adapter, 'user-a')
    const b = new TrackingStore(adapter, 'user-b')
    await a.saveSession(createSession('s-a', 't1', 1000))
    await b.saveSession(createSession('s-b', 't1', 2000))
    await a.addPoints([makePoint('t1', 's-a', 1000, false)])
    await b.addPoints([makePoint('t1', 's-b', 2000, false)])
    await a.deletePointsByTrip('t1')
    expect(await a.getPointsByTrip('t1')).toHaveLength(0)
    expect(await a.getAllSessions()).toHaveLength(0)
    // Other users' data for the same trip id is untouched.
    expect(await b.getPointsByTrip('t1')).toHaveLength(1)
    expect((await b.getAllSessions()).map(s => s.id)).toEqual(['s-b'])
  })

  it('clears only the current user data', async () => {
    const adapter = new IndexedDbAdapter(`trailmate-clear-${Date.now()}`, DB_VERSION)
    const a = new TrackingStore(adapter, 'user-a')
    const b = new TrackingStore(adapter, 'user-b')
    await a.saveSession(createSession('s-a', 't1', 1000))
    await b.saveSession(createSession('s-b', 't2', 2000))
    await b.addPoints([makePoint('t2', 's-b', 2000, false)])
    await a.clearUserData()
    expect(await a.getAllSessions()).toHaveLength(0)
    expect((await b.getAllSessions()).map(s => s.id)).toEqual(['s-b'])
    expect(await b.countUnsyncedPoints()).toBe(1)
  })
})

describe('TrackingStore (in-memory adapter)', () => {
  let store: TrackingStore

  beforeEach(() => {
    counter = 0
    store = new TrackingStore(new MemoryDbAdapter(), 'user-a')
  })

  it('behaves equivalently to the IndexedDB implementation', async () => {
    await store.addPoints([makePoint('t1', 's1', 1000, false)])
    expect(await store.getUnsyncedPoints(1)).toHaveLength(1)
    await store.markPointsSynced(['p-1'])
    expect(await store.getUnsyncedPoints(1)).toHaveLength(0)
  })

  it('supports composite [userId, synced] lookups across users', async () => {
    const adapter = new MemoryDbAdapter()
    const a = new TrackingStore(adapter, 'user-a')
    const b = new TrackingStore(adapter, 'user-b')
    await a.addPoints([makePoint('t1', 's1', 1000, false), makePoint('t1', 's1', 2000, true)])
    await b.addPoints([makePoint('t2', 's2', 3000, false)])
    expect(await a.countUnsyncedPoints()).toBe(1)
    expect(await b.countUnsyncedPoints()).toBe(1)
    expect((await a.getUnsyncedPoints(10)).map(p => p.timestamp)).toEqual([1000])
  })
})
