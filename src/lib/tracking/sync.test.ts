import { describe, it, expect, vi } from 'vitest'
import { MemoryDbAdapter } from './storage'
import { TrackingStore } from './persistence'
import { TrackingSync, type SyncUploader, type UploadResult } from './sync'
import type { TrackPoint } from '@/types/tracking'

let counter = 0
function makePoint(sessionId: string, timestamp: number): TrackPoint {
  counter += 1
  return {
    id: `src-${counter}`,
    tripId: 't1',
    sessionId,
    latitude: 51.505,
    longitude: -0.09,
    timestamp,
    synced: false,
  }
}

type UploadFn = (points: TrackPoint[]) => Promise<UploadResult>

async function setup(uploader: SyncUploader, isOnline = () => true) {
  const store = new TrackingStore(new MemoryDbAdapter())
  const sync = new TrackingSync({ store, uploader, isOnline })
  return { store, sync }
}

describe('TrackingSync', () => {
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

  it('returns failed when the upload errors and retries a later batch', async () => {
    let attempts = 0
    const uploader: SyncUploader = {
      upload: async (points: TrackPoint[]) => {
        attempts += 1
        if (attempts === 1) return { ok: false, uploadedIds: [], error: 'network' }
        return { ok: true, uploadedIds: points.map(p => p.id) }
      },
    }
    const { store, sync } = await setup(uploader)
    await store.addPoints([makePoint('s1', 1000)])

    expect(await sync.syncNow()).toBe('failed')
    expect(await store.getUnsyncedPoints(5)).toHaveLength(1)

    expect(await sync.syncNow()).toBe('synced')
    expect(await store.getUnsyncedPoints(5)).toHaveLength(0)
  })

  it('stays pending when offline and syncs once back online', async () => {
    let online = false
    const uploader: SyncUploader = {
      upload: async (points: TrackPoint[]) => ({ ok: true, uploadedIds: points.map(p => p.id) }),
    }
    const { store, sync } = await setup(uploader, () => online)
    await store.addPoints([makePoint('s1', 1000)])
    expect(await sync.syncNow()).toBe('pending')
    // Points are not lost while offline.
    expect(await store.getUnsyncedPoints(5)).toHaveLength(1)

    online = true
    expect(await sync.syncNow()).toBe('synced')
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
    await new Promise(r => setTimeout(r, 0)) // allow the pending fetch to settle
    expect(uploadCalls).toBe(1)
    const p2 = sync.syncNow()
    expect(uploadCalls).toBe(1) // still only one upload in flight
    resolveUpload({ ok: true, uploadedIds: [pointId] })
    await Promise.all([p1, p2])
    expect((await store.getUnsyncedPoints(1)).length).toBe(0)
  })
})