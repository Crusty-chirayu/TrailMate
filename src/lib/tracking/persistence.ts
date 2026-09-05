// Persistence for tracking sessions and route points.
//
// Sessions are written to durable storage the moment they begin so a browser
// refresh never loses an active hike. Route points are appended as they are
// accepted by the GPS engine and before background synchronization, so network
// loss cannot destroy recorded data.

import type { TrackingSession, TrackPoint } from '@/types/tracking'
import {
  type DbAdapter,
  STORE_SESSIONS,
  STORE_POINTS,
  STORE_PENDING,
  POINT_INDEX_BY_SESSION,
  POINT_INDEX_BY_TRIP,
} from './storage'

const RESUMEABLE: readonly string[] = ['acquiring', 'tracking', 'paused']

interface PendingPoint {
  id: string
  timestamp: number
}

export class TrackingStore {
  constructor(private db: DbAdapter) {}

  async saveSession(session: TrackingSession): Promise<void> {
    await this.db.put(STORE_SESSIONS, session)
  }

  async getSession(id: string): Promise<TrackingSession | undefined> {
    return this.db.get<TrackingSession>(STORE_SESSIONS, id)
  }

  async getAllSessions(): Promise<TrackingSession[]> {
    return this.db.getAll<TrackingSession>(STORE_SESSIONS)
  }

  /** Sessions that were not finished and could be resumed after a refresh. */
  async getResumableSessions(): Promise<TrackingSession[]> {
    const sessions = await this.db.getAll<TrackingSession>(STORE_SESSIONS)
    return sessions
      .filter(s => RESUMEABLE.includes(s.status))
      .sort((a, b) => b.updatedAt - a.updatedAt)
  }

  private async savePending(point: TrackPoint): Promise<void> {
    if (!point.synced) {
      await this.db.put<PendingPoint>(STORE_PENDING, { id: point.id, timestamp: point.timestamp })
    }
  }

  async savePoint(point: TrackPoint): Promise<void> {
    await this.db.put(STORE_POINTS, point)
    await this.savePending(point)
  }

  async addPoints(points: TrackPoint[]): Promise<void> {
    if (points.length === 0) return
    await this.db.putMany(STORE_POINTS, points)
    for (const p of points) await this.savePending(p)
  }

  async getPointsBySession(sessionId: string): Promise<TrackPoint[]> {
    const points = await this.db.getAllByIndex<TrackPoint>(STORE_POINTS, POINT_INDEX_BY_SESSION, sessionId)
    return points.sort((a, b) => a.timestamp - b.timestamp)
  }

  /** Most recent N points for a session (used for map rendering). */
  async getRecentPointsBySession(sessionId: string, limit: number): Promise<TrackPoint[]> {
    const points = await this.db.getAllByIndex<TrackPoint>(
      STORE_POINTS,
      POINT_INDEX_BY_SESSION,
      sessionId,
      { direction: 'prev', limit },
    )
    return points.sort((a, b) => a.timestamp - b.timestamp)
  }

  async getPointsByTrip(tripId: string): Promise<TrackPoint[]> {
    return this.db.getAllByIndex<TrackPoint>(STORE_POINTS, POINT_INDEX_BY_TRIP, tripId)
  }

  /** Unsynced points across sessions, ordered oldest-first for consistent replay. */
  async getUnsyncedPoints(limit = 200): Promise<TrackPoint[]> {
    const pending = await this.db.getAll<PendingPoint>(STORE_PENDING)
    pending.sort((a, b) => a.timestamp - b.timestamp)
    const batch = pending.slice(0, limit)
    const points: TrackPoint[] = []
    for (const entry of batch) {
      const point = await this.db.get<TrackPoint>(STORE_POINTS, entry.id)
      if (point && !point.synced) points.push(point)
    }
    return points
  }

  async markPointsSynced(ids: string[]): Promise<void> {
    if (ids.length === 0) return
    const points = await this.db.getAll<TrackPoint>(STORE_POINTS)
    const toUpdate = points.filter(p => ids.includes(p.id))
    for (const p of toUpdate) {
      await this.db.put(STORE_POINTS, { ...p, synced: true })
    }
    for (const id of ids) {
      await this.db.delete(STORE_PENDING, id)
    }
  }

  async deleteSession(id: string): Promise<void> {
    await this.db.delete(STORE_SESSIONS, id)
    const points = await this.getPointsBySession(id)
    for (const p of points) {
      await this.db.delete(STORE_POINTS, p.id)
      await this.db.delete(STORE_PENDING, p.id)
    }
  }

  async clearSessions(): Promise<void> {
    await this.db.clear(STORE_SESSIONS)
    await this.db.clear(STORE_POINTS)
    await this.db.clear(STORE_PENDING)
  }
}