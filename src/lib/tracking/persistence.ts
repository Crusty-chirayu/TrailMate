// Persistence for tracking sessions and route points.
//
// Sessions are written to durable storage the moment they begin so a browser
// refresh never loses an active hike. Route points are appended as they are
// accepted by the GPS engine and before background synchronization, so network
// loss cannot destroy recorded data.
//
// Every record is scoped to the owning user (v2 format). Unsynced points are
// derived from the points store's composite [userId, synced] index, so a point
// and its queue membership are stored in one atomic write — there is no
// separate pending-queue write that could be lost between transactions.

import type { TrackingSession, TrackPoint } from '@/types/tracking'
import {
  type DbAdapter,
  STORE_SESSIONS,
  STORE_POINTS,
  STORE_META,
  POINT_INDEX_BY_SESSION,
  POINT_INDEX_BY_TRIP,
  POINT_INDEX_BY_QUEUE,
  SESSION_INDEX_BY_USER,
} from './storage'

/** String queue key helper: booleans are not valid IndexedDB keys. */
function queueKey(userId: string, synced: boolean): string {
  return `${userId}:${synced ? '1' : '0'}`
}

/** Points per readwrite transaction when persisting a batch. */
const POINT_BATCH_SIZE = 500

const RESUMEABLE: readonly string[] = ['acquiring', 'tracking', 'paused']

const META_LEGACY_MIGRATED = 'legacyMigratedFor'

interface MetaRecord {
  id: string
  value: string
}

/** Durable record that a finished session still needs server-side reconciliation. */
export interface CompletionIntent {
  id: string
  userId: string
  tripId: string
  at: number
}

function completionKey(userId: string, tripId: string): string {
  return `completion:${userId}:${tripId}`
}

export class TrackingStore {
  constructor(
    private db: DbAdapter,
    private userId: string,
  ) {}

  get ownerId(): string {
    return this.userId
  }

  async saveSession(session: TrackingSession): Promise<void> {
    await this.db.put(STORE_SESSIONS, { ...session, userId: this.userId })
  }

  async getSession(id: string): Promise<TrackingSession | undefined> {
    const session = await this.db.get<TrackingSession>(STORE_SESSIONS, id)
    return session && session.userId === this.userId ? session : undefined
  }

  async getAllSessions(): Promise<TrackingSession[]> {
    const sessions = await this.db.getAllByIndex<TrackingSession>(
      STORE_SESSIONS,
      SESSION_INDEX_BY_USER,
      this.userId,
    )
    return sessions.sort((a, b) => b.updatedAt - a.updatedAt)
  }

  /** Sessions that were not finished and could be resumed after a refresh. */
  async getResumableSessions(): Promise<TrackingSession[]> {
    const sessions = await this.getAllSessions()
    return sessions
      .filter(s => RESUMEABLE.includes(s.status))
      .sort((a, b) => b.updatedAt - a.updatedAt)
  }

  async savePoint(point: TrackPoint): Promise<void> {
    await this.db.put(STORE_POINTS, {
      ...point,
      userId: this.userId,
      queueKey: queueKey(this.userId, point.synced),
    })
  }

  async addPoints(points: TrackPoint[]): Promise<void> {
    if (points.length === 0) return
    const scoped = points.map(p => ({
      ...p,
      userId: this.userId,
      queueKey: queueKey(this.userId, p.synced),
    }))
    // Chunked transactions keep individual writes atomic without one giant
    // transaction; each point remains durable the moment its chunk commits.
    for (let i = 0; i < scoped.length; i += POINT_BATCH_SIZE) {
      await this.db.putMany(STORE_POINTS, scoped.slice(i, i + POINT_BATCH_SIZE))
    }
  }

  async getPointsBySession(sessionId: string): Promise<TrackPoint[]> {
    const points = await this.db.getAllByIndex<TrackPoint>(
      STORE_POINTS,
      POINT_INDEX_BY_SESSION,
      sessionId,
    )
    return points
      .filter(p => p.userId === this.userId)
      .sort((a, b) => a.timestamp - b.timestamp)
  }

  /** Most recent N points for a session (used for map rendering). */
  async getRecentPointsBySession(sessionId: string, limit: number): Promise<TrackPoint[]> {
    const points = await this.db.getAllByIndex<TrackPoint>(
      STORE_POINTS,
      POINT_INDEX_BY_SESSION,
      sessionId,
      { direction: 'prev', limit },
    )
    return points
      .filter(p => p.userId === this.userId)
      .sort((a, b) => a.timestamp - b.timestamp)
  }

  async getPointsByTrip(tripId: string): Promise<TrackPoint[]> {
    const points = await this.db.getAllByIndex<TrackPoint>(
      STORE_POINTS,
      POINT_INDEX_BY_TRIP,
      tripId,
    )
    return points.filter(p => p.userId === this.userId)
  }

  /** Unsynced points for this user, ordered oldest-first for consistent replay. */
  async getUnsyncedPoints(limit = 200): Promise<TrackPoint[]> {
    const points = await this.db.getAllByIndex<TrackPoint>(
      STORE_POINTS,
      POINT_INDEX_BY_QUEUE,
      queueKey(this.userId, false),
    )
    return points
      .filter(p => !p.quarantined)
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(0, limit)
  }

  /** Number of unsynced points for this user (used for honest status labels). */
  async countUnsyncedPoints(): Promise<number> {
    return (await this.db.getAllByIndex<TrackPoint>(
      STORE_POINTS,
      POINT_INDEX_BY_QUEUE,
      queueKey(this.userId, false),
    )).filter(p => !p.quarantined).length
  }

  async markPointsSynced(ids: string[]): Promise<void> {
    if (ids.length === 0) return
    for (const id of ids) {
      const point = await this.db.get<TrackPoint>(STORE_POINTS, id)
      if (point && point.userId === this.userId) {
        await this.db.put(STORE_POINTS, {
          ...point,
          synced: true,
          quarantined: false,
          queueKey: queueKey(this.userId, true),
        })
      }
    }
  }

  /**
   * Retires points that can never be uploaded (for example their trip was
   * deleted server-side) so a single stale record cannot block the queue.
   * Raw coordinates are preserved for history/export; they are excluded from
   * synchronization.
   */
  async quarantinePoints(ids: string[], reason: string): Promise<void> {
    if (ids.length === 0) return
    for (const id of ids) {
      const point = await this.db.get<TrackPoint>(STORE_POINTS, id)
      if (point && point.userId === this.userId) {
        await this.db.put(STORE_POINTS, {
          ...point,
          quarantined: true,
          quarantineReason: reason,
          queueKey: queueKey(this.userId, point.synced),
        })
      }
    }
  }

  async deleteSession(id: string): Promise<void> {
    const session = await this.getSession(id)
    if (!session) return
    await this.db.delete(STORE_SESSIONS, id)
    const points = await this.getPointsBySession(id)
    for (const p of points) {
      await this.db.delete(STORE_POINTS, p.id)
    }
  }

  /** Removes local records for a trip owned by the current user (post-delete cleanup). */
  async deletePointsByTrip(tripId: string): Promise<void> {
    const points = await this.getPointsByTrip(tripId)
    for (const p of points) {
      await this.db.delete(STORE_POINTS, p.id)
    }
    const sessions = await this.getAllSessions()
    for (const s of sessions) {
      if (s.tripId === tripId) {
        await this.db.delete(STORE_SESSIONS, s.id)
      }
    }
  }

  /** Removes all local records for the current user (used on explicit local reset). */
  async clearUserData(): Promise<void> {
    const sessions = await this.getAllSessions()
    for (const s of sessions) {
      await this.deleteSession(s.id)
    }
  }

  /** Records that a locally-finished trip still needs server reconciliation. */
  async saveCompletionIntent(tripId: string): Promise<void> {
    const record: CompletionIntent = {
      id: completionKey(this.userId, tripId),
      userId: this.userId,
      tripId,
      at: Date.now(),
    }
    await this.db.put(STORE_META, record)
  }

  async getCompletionIntent(tripId: string): Promise<CompletionIntent | undefined> {
    const record = await this.db.get<CompletionIntent>(STORE_META, completionKey(this.userId, tripId))
    return record && record.userId === this.userId ? record : undefined
  }

  async removeCompletionIntent(tripId: string): Promise<void> {
    await this.db.delete(STORE_META, completionKey(this.userId, tripId))
  }

  /**
   * One-time adoption of unscoped version-1 records. Legacy records cannot be
   * attributed to an account with certainty, so they are stamped with the user
   * who first opens the upgraded store; any record whose trip is not owned by
   * that user is quarantined by the sync engine instead of poisoning the
   * queue. Runs at most once per browser profile.
   */
  async migrateLegacyRecords(): Promise<boolean> {
    const flag = await this.db.get<MetaRecord>(STORE_META, META_LEGACY_MIGRATED)
    if (flag) return false

    const sessions = await this.db.getAll<TrackingSession>(STORE_SESSIONS)
    for (const s of sessions) {
      if (!s.userId) {
        await this.db.put(STORE_SESSIONS, { ...s, userId: this.userId })
      }
    }
    const points = await this.db.getAll<TrackPoint>(STORE_POINTS)
    for (const p of points) {
      if (!p.userId) {
        await this.db.put(STORE_POINTS, {
          ...p,
          userId: this.userId,
          queueKey: queueKey(this.userId, p.synced),
        })
      }
    }
    await this.db.put<MetaRecord>(STORE_META, { id: META_LEGACY_MIGRATED, value: this.userId })
    return true
  }
}
