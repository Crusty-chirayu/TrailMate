import { afterEach, describe, it, expect, vi } from 'vitest'
import { MemoryDbAdapter } from './storage'
import { TrackingStore } from './persistence'
import { TrackingSync, type SyncUploader, type UploadResult } from './sync'
import type { TrackPoint } from '@/types/tracking'

let counter = 0
function makePoint(sessionId: string, timestamp: number): TrackPoint {
  counter += 1
  return {
    id: `src-${counter}`,
    userId: 'user-a',
    tripId: 't1',
    sessionId,
    latitude: 51.505,
    longitude: -0.09,
    timestamp,
    synced: false,
  }
}

type UploadFn = (points: TrackPoint[]) => Promise<UploadResult>

async function setup(uploader: SyncUploader, isOnline = () => true, maxBatch?: number) {
  const store = new TrackingStore(new MemoryDbAdapter(), 'user-a')
  const sync = new TrackingSync({ store, uploader, isOnline, maxBatch, drainPauseMs: 1 })
  return { store, sync }
}

async function drainUntilDone(sync: TrackingSync, maxSteps = 200): Promise<void> {
  for (let i = 0; i < maxSteps; i++) {
    const state = sync.getState()
    if (state === 'synced' || state === 'failed' || state === 'retrying') return
    await new Promise(r => setTimeout(r, 5))
  }
  throw new Error('queue did not drain')
}

describe('TrackingSync', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('reports synced when there is nothing to upload', async () => {
    const upload = vi.fn<UploadFn>(async () => ({ ok: true, uploadedIds: [] }))
    const { sync } = await setup({ upload })
    expect(await sync.syncNow()).toBe('synced')
  })

  it('uploads unsynced points and marks them synced (oldest first)', async () => {
    const upload = vi.fn<UploadFn>(async points => ({ ok: true, uploadedIds: points.map(p => p.id) }))
    const { store, sync } = await setup({ upload })
    await store.addPoints([makePoint('s1', 2000), makePoint('s1', 1000)])
    expect(await sync.syncNow()).toBe('synced')
    expect(await store.getUnsyncedPoints(5)).toHaveLength(0)
  })

  it('does not re-upload points that were already synced (duplicate protection)', async () => {
    const upload = vi.fn<UploadFn>(async points => ({ ok: true, uploadedIds: points.map(p => p.id) }))
    const { store, sync } = await setup({ upload })
    await store.addPoints([makePoint('s1', 1000)])
    await sync.syncNow()
    await sync.syncNow()
    expect(await store.getUnsyncedPoints(1)).toHaveLength(0)
  })

  it('stays queued when offline and syncs once back online', async () => {
    let online = false
    const uploader: SyncUploader = {
      upload: async (points: TrackPoint[]) => ({ ok: true, uploadedIds: points.map(p => p.id) }),
    }
    const { store, sync } = await setup(uploader, () => online)
    await store.addPoints([makePoint('s1', 1000)])
    expect(await sync.syncNow()).toBe('queued')
    // Points are not lost while offline.
    expect(await store.getUnsyncedPoints(5)).toHaveLength(1)

    online = true
    expect(await sync.syncNow()).toBe('synced')
  })

  it('drains a large queue across multiple batches until empty', async () => {
    const upload = vi.fn<UploadFn>(async points => ({ ok: true, uploadedIds: points.map(p => p.id) }))
    const { store, sync } = await setup({ upload }, () => true, 100)
    const points = Array.from({ length: 450 }, (_, i) => makePoint('s1', 1000 + i))
    await store.addPoints(points)

    const first = await sync.syncNow()
    expect(['syncing', 'queued', 'synced']).toContain(first)
    await drainUntilDone(sync)
    expect(sync.getState()).toBe('synced')
    expect(await store.getUnsyncedPoints(1)).toHaveLength(0)
    // 450 points at 100 per batch => at least 5 upload calls.
    expect(upload.mock.calls.length).toBeGreaterThanOrEqual(5)
  })

  it('schedules a retry after a transient failure and recovers when it fires', async () => {
    vi.useFakeTimers()
    let attempts = 0
    const uploader: SyncUploader = {
      upload: async (points: TrackPoint[]) => {
        attempts += 1
        if (attempts === 1) return { ok: false, uploadedIds: [], error: 'Failed to fetch', kind: 'network' }
        return { ok: true, uploadedIds: points.map(p => p.id) }
      },
    }
    const { store, sync } = await setup(uploader)
    await store.addPoints([makePoint('s1', 1000)])

    await sync.syncNow()
    expect(sync.getState()).toBe('retrying')
    expect(sync.getStatus().nextRetryAt).not.toBeNull()
    expect(await store.getUnsyncedPoints(5)).toHaveLength(1)

    await vi.advanceTimersByTimeAsync(5_000)
    expect(sync.getState()).toBe('synced')
    expect(await store.getUnsyncedPoints(5)).toHaveLength(0)
  })

  it('pauses after the consecutive-failure cap and requires an explicit retry', async () => {
    vi.useFakeTimers()
    const uploader: SyncUploader = {
      upload: async () => ({ ok: false, uploadedIds: [], error: 'Failed to fetch', kind: 'network' }),
    }
    const { store, sync } = await setup(uploader)
    await store.addPoints([makePoint('s1', 1000)])

    for (let i = 0; i < 7; i++) {
      await sync.syncNow()
      expect(sync.getState()).toBe('retrying')
    }
    await sync.syncNow()
    expect(sync.getState()).toBe('failed')
    expect(sync.getStatus().paused).toBe(true)

    // No automatic retry while paused.
    await vi.advanceTimersByTimeAsync(120_000)
    expect(sync.getState()).toBe('failed')

    const uploader2: SyncUploader = {
      upload: async (points: TrackPoint[]) => ({ ok: true, uploadedIds: points.map(p => p.id) }),
    }
    const { store: store2, sync: sync2 } = await setup(uploader2)
    await store2.addPoints([makePoint('s1', 1000)])
    await sync2.retryNow()
    expect(sync2.getState()).toBe('synced')
  })

  it('isolates a failing point and quarantines it without blocking the batch', async () => {
    const uploader: SyncUploader = {
      upload: async (points: TrackPoint[]) => {
        if (points.some(p => p.id === 'src-bad')) {
          return { ok: false, uploadedIds: [], error: 'row-level security violation', kind: 'data' }
        }
        return { ok: true, uploadedIds: points.map(p => p.id) }
      },
    }
    const { store, sync } = await setup(uploader)
    const good = makePoint('s1', 1000)
    const bad = makePoint('s1', 2000)
    const good2 = makePoint('s1', 3000)
    bad.id = 'src-bad'
    await store.addPoints([good, bad, good2])

    await sync.syncNow()
    expect(sync.getState()).toBe('synced')
    expect(await store.getUnsyncedPoints(5)).toHaveLength(0)
    const all = await store.getPointsBySession('s1')
    expect(all).toHaveLength(3)
    expect(all.find(p => p.id === 'src-bad')?.quarantined).toBe(true)
    expect(all.filter(p => p.synced)).toHaveLength(2)
  })

  it('only uploads one batch at a time (re-entrancy guard)', async () => {
    let uploadCalls = 0
    let resolveUpload: (r: UploadResult) => void = () => {}
    const uploader: SyncUploader = {
      upload: async () => {
        uploadCalls += 1
        return new Promise<UploadResult>(res => {
          resolveUpload = res
        })
      },
    }
    const { store, sync } = await setup(uploader)
    await store.addPoints([makePoint('s1', 1000)])
    const pointId = (await store.getUnsyncedPoints(1))[0]?.id ?? ''

    const p1 = sync.syncNow()
    await new Promise(r => setTimeout(r, 10)) // allow the pending fetch to settle
    expect(uploadCalls).toBe(1)
    const p2 = sync.syncNow()
    expect(uploadCalls).toBe(1) // still only one upload in flight
    resolveUpload({ ok: true, uploadedIds: [pointId] })
    await Promise.all([p1, p2])
    expect((await store.getUnsyncedPoints(1)).length).toBe(0)
  })

  it('stop clears pending retry timers', async () => {
    vi.useFakeTimers()
    const uploader: SyncUploader = {
      upload: async () => ({ ok: false, uploadedIds: [], error: 'Failed to fetch', kind: 'network' }),
    }
    const { store, sync } = await setup(uploader)
    await store.addPoints([makePoint('s1', 1000)])
    await sync.syncNow()
    expect(sync.getState()).toBe('retrying')
    sync.stop()
    await vi.advanceTimersByTimeAsync(120_000)
    // stopped engine does not keep retrying
    expect(sync.getState()).toBe('retrying')
    expect(await store.getUnsyncedPoints(5)).toHaveLength(1)
  })
})
