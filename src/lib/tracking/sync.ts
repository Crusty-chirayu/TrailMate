// Background synchronization for recorded track points.
//
// The sync mechanism is intentionally decoupled from the GPS collection loop:
// recording never waits on the network. Unsynced points are uploaded in
// oldest-first order, resuming safely after a refresh, and a single failing
// batch never blocks the rest. Deduplication is guaranteed by the stable client
// point id (matched as `source_id` in the database via an upsert on conflict).

import type { TrackPoint, SyncState } from '@/types/tracking'
import type { TrackingStore } from './persistence'

export interface UploadResult {
  ok: boolean
  uploadedIds: string[]
  error?: string
}

export interface SyncUploader {
  upload(points: TrackPoint[]): Promise<UploadResult>
}

export interface SyncDeps {
  store: TrackingStore
  uploader: SyncUploader
  maxBatch?: number
  isOnline?: () => boolean
  onStateChange?: (s: SyncState) => void
}

const INITIAL_BACKOFF_MS = 2_000
const MAX_BACKOFF_MS = 60_000

export class TrackingSync {
  private status: SyncState = 'local'
  private running = false
  private retryTimer?: ReturnType<typeof setTimeout>
  private backoffMs = INITIAL_BACKOFF_MS
  private cleanup?: () => void

  constructor(private deps: SyncDeps) {}

  getState(): SyncState {
    return this.status
  }

  private setState(s: SyncState): void {
    this.status = s
    this.deps.onStateChange?.(s)
  }

  /**
   * Uploads the next batch of unsynced points. Safe to call asynchronously and
   * ignores re-entrant invocations so only one upload is in flight at a time.
   */
  async syncNow(): Promise<SyncState> {
    if (this.running) return this.status

    const online = this.deps.isOnline ? this.deps.isOnline() : true
    if (!online) {
      this.setState(this.status === 'failed' ? 'failed' : 'pending')
      return this.status
    }

    const unsynced = await this.deps.store.getUnsyncedPoints(this.deps.maxBatch ?? 200)
    if (unsynced.length === 0) {
      this.setState('synced')
      return this.status
    }

    this.running = true
    this.setState('syncing')
    try {
      const result = await this.deps.uploader.upload(unsynced)
      if (!result.ok) {
        throw new Error(result.error ?? 'Unknown sync error')
      }
      await this.deps.store.markPointsSynced(result.uploadedIds)
      this.backoffMs = INITIAL_BACKOFF_MS

      const remaining = await this.deps.store.getUnsyncedPoints(1)
      this.setState(remaining.length === 0 ? 'synced' : 'pending')
      return this.status
    } catch (error) {
      this.backoffMs = Math.min(this.backoffMs * 2, MAX_BACKOFF_MS)
      this.setState('failed')
      return this.status
    } finally {
      this.running = false
    }
  }

  private scheduleRetry(): void {
    if (this.retryTimer) return
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined
      void this.syncNow()
    }, this.backoffMs)
  }

  /** Starts network-recovery listeners and a retry timer for failed syncs. */
  start(): void {
    if (typeof window === 'undefined') return

    const handle = () => {
      if (this.deps.isOnline && this.deps.isOnline() === false) {
        this.setState('pending')
        return
      }
      void this.syncNow()
    }

    window.addEventListener('online', handle)
    window.addEventListener('focus', handle)
    this.cleanup = () => {
      window.removeEventListener('online', handle)
      window.removeEventListener('focus', handle)
      if (this.retryTimer) {
        clearTimeout(this.retryTimer)
        this.retryTimer = undefined
      }
    }

    if (this.status === 'failed' || this.status === 'pending') {
      this.scheduleRetry()
    }
  }

  stop(): void {
    this.cleanup?.()
    if (this.retryTimer) {
      clearTimeout(this.retryTimer)
      this.retryTimer = undefined
    }
  }
}