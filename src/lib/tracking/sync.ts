// Background synchronization for recorded track points.
//
// The sync mechanism is intentionally decoupled from the GPS collection loop:
// recording never waits on the network. Unsynced points are uploaded in
// oldest-first order, resuming safely after a refresh, and a single failing
// batch never blocks the rest. Deduplication is guaranteed by the stable client
// point id (matched as `source_id` in the database via an upsert on conflict).
//
// Failure model:
// - transient/network errors schedule a bounded jittered exponential backoff
// - data errors (missing trip, ownership rejection) are isolated down to the
//   individual point and quarantined so one stale record cannot poison the queue
// - after a consecutive-failure cap the engine pauses and requires an explicit
//   retry: no endless hidden retry loop
//
// State observable for UI: local | queued | syncing | synced | retrying | failed

import type { SyncState, TrackPoint, SyncEngineStatus } from '@/types/tracking'
import type { TrackingStore } from './persistence'

export type SyncFailureKind = 'network' | 'auth' | 'data' | 'unknown'

export interface UploadResult {
  ok: boolean
  uploadedIds: string[]
  error?: string
  kind?: SyncFailureKind
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
  /** Pause between drain steps; configurable for deterministic tests. */
  drainPauseMs?: number
}

const INITIAL_BACKOFF_MS = 2_000
const MAX_BACKOFF_MS = 60_000
const MAX_CONSECUTIVE_FAILURES = 8
const DRAIN_BATCH_PAUSE_MS = 250

function classifyError(result: {
  error?: string
  kind?: SyncFailureKind
}): SyncFailureKind {
  if (result.kind) return result.kind
  const message = (result.error ?? '').toLowerCase()
  if (
    message.includes('failed to fetch') ||
    message.includes('network') ||
    message.includes('offline') ||
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('connection')
  ) {
    return 'network'
  }
  if (
    message.includes('not authenticated') ||
    message.includes('jwt') ||
    message.includes('session expired') ||
    message.includes('unauthorized') ||
    message.includes('invalid api key')
  ) {
    return 'auth'
  }
  if (
    message.includes('row-level security') ||
    message.includes('permission denied') ||
    message.includes('foreign key') ||
    message.includes('violates') ||
    message.includes('violation') ||
    message.includes('no rows') ||
    message.includes('owner mismatch')
  ) {
    return 'data'
  }
  return 'unknown'
}

export class TrackingSync {
  private status: SyncState = 'local'
  private running = false
  private retryTimer?: ReturnType<typeof setTimeout>
  private drainTimer?: ReturnType<typeof setTimeout>
  private backoffMs = INITIAL_BACKOFF_MS
  private consecutiveFailures = 0
  private nextRetryAt: number | null = null
  private paused = false
  private cleanup?: () => void
  private drainPauseMs: number

  constructor(private deps: SyncDeps) {
    this.drainPauseMs = deps.drainPauseMs ?? DRAIN_BATCH_PAUSE_MS
  }

  getState(): SyncState {
    return this.status
  }

  /** Machine-readable status snapshot for UI rendering. */
  getStatus(): SyncEngineStatus {
    return {
      state: this.status,
      nextRetryAt: this.nextRetryAt,
      attempts: this.consecutiveFailures,
      paused: this.paused,
    }
  }

  private setState(s: SyncState): void {
    this.status = s
    this.deps.onStateChange?.(s)
  }

  private online(): boolean {
    return this.deps.isOnline ? this.deps.isOnline() : true
  }

  /**
   * Uploads the next batch of unsynced points and keeps draining the queue in
   * short steps until it is empty. Safe to call asynchronously; re-entrant
   * invocations share the single in-flight run.
   */
  async syncNow(): Promise<SyncState> {
    if (this.running) return this.status

    if (!this.online()) {
      this.paused = false
      this.setState(this.status === 'failed' ? 'failed' : 'queued')
      this.scheduleRetry()
      return this.status
    }

    const batch = await this.deps.store.getUnsyncedPoints(this.deps.maxBatch ?? 200)
    if (batch.length === 0) {
      this.consecutiveFailures = 0
      this.paused = false
      this.nextRetryAt = null
      this.setState('synced')
      return this.status
    }

    this.running = true
    this.setState('syncing')
    try {
      const result = await this.uploadWithIsolation(batch)
      if (result.failures > 0) {
        throw new Error(result.error ?? 'Sync failed')
      }
      this.consecutiveFailures = 0
      this.backoffMs = INITIAL_BACKOFF_MS
      this.nextRetryAt = null

      const remaining = await this.deps.store.getUnsyncedPoints(1)
      if (remaining.length === 0) {
        this.paused = false
        this.setState('synced')
        return this.status
      }
      // More points remain: schedule the next drain step instead of blocking
      // for the whole backlog, so the UI stays responsive.
      this.setState('queued')
      this.scheduleDrain()
      return this.status
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown sync error'
      const kind = classifyError({ error: message })
      if (kind === 'data') {
        // Data failures are handled per point inside uploadWithIsolation; the
        // only data-classification reaching here means no progress was made.
        this.consecutiveFailures += 1
        this.paused = this.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES
      } else {
        this.consecutiveFailures += 1
        this.paused = this.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES
      }
      this.backoffMs = Math.min(this.backoffMs * 2, MAX_BACKOFF_MS)
      this.setState(this.paused ? 'failed' : 'retrying')
      if (this.paused) {
        // No hidden automatic retry once the cap is reached.
        if (this.retryTimer) {
          clearTimeout(this.retryTimer)
          this.retryTimer = undefined
        }
        this.nextRetryAt = null
      } else {
        this.scheduleRetry()
      }
      return this.status
    } finally {
      this.running = false
    }
  }

  /**
   * Uploads a batch while isolating data-level failures: on a data error the
   * batch is split in half recursively until the failing point(s) are found,
   * then quarantined. Network/auth failures abort immediately.
   */
  private async uploadWithIsolation(
    points: TrackPoint[],
  ): Promise<{ failures: number; error?: string }> {
    if (points.length === 0) return { failures: 0 }
    const result = await this.deps.uploader.upload(points)
    if (result.ok) {
      await this.deps.store.markPointsSynced(result.uploadedIds)
      return { failures: 0 }
    }
    const kind = classifyError(result)
    if (kind === 'network' || kind === 'auth') {
      return { failures: 1, error: result.error }
    }
    if (points.length === 1) {
      await this.deps.store.quarantinePoints(
        points.map(p => p.id),
        result.error ?? 'Rejected by server',
      )
      return { failures: 0 }
    }
    const mid = Math.ceil(points.length / 2)
    const left = await this.uploadWithIsolation(points.slice(0, mid))
    const right = await this.uploadWithIsolation(points.slice(mid))
    const failures = left.failures + right.failures
    return { failures, error: left.error ?? right.error }
  }

  private scheduleRetry(): void {
    if (this.retryTimer || this.paused || this.drainTimer) return
    this.nextRetryAt = Date.now() + this.backoffMs
    const jitter = Math.round(this.backoffMs * (0.8 + Math.random() * 0.4))
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined
      this.nextRetryAt = null
      // A timer that fired after the engine paused must not auto-retry.
      if (this.paused) return
      void this.syncNow()
    }, jitter)
  }

  private scheduleDrain(): void {
    if (this.drainTimer || this.retryTimer || !this.online()) return
    this.drainTimer = setTimeout(() => {
      this.drainTimer = undefined
      void this.syncNow()
    }, this.drainPauseMs)
  }

  /** Kicks the engine after a paused failure (and clears the failure counter). */
  retryNow(): Promise<SyncState> | void {
    this.consecutiveFailures = 0
    this.paused = false
    this.backoffMs = INITIAL_BACKOFF_MS
    if (this.retryTimer) {
      clearTimeout(this.retryTimer)
      this.retryTimer = undefined
    }
    if (this.drainTimer) {
      clearTimeout(this.drainTimer)
      this.drainTimer = undefined
    }
    return this.syncNow()
  }

  /** Starts network-recovery listeners and retry timers. */
  start(): void {
    if (typeof window === 'undefined') return

    const handle = () => {
      if (this.deps.isOnline && this.deps.isOnline() === false) {
        this.setState(this.status === 'failed' ? 'failed' : 'queued')
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
      if (this.drainTimer) {
        clearTimeout(this.drainTimer)
        this.drainTimer = undefined
      }
    }

    if (this.status === 'retrying' || this.status === 'queued') {
      this.scheduleRetry()
    }
  }

  stop(): void {
    this.cleanup?.()
    if (this.retryTimer) {
      clearTimeout(this.retryTimer)
      this.retryTimer = undefined
    }
    if (this.drainTimer) {
      clearTimeout(this.drainTimer)
      this.drainTimer = undefined
    }
  }
}
