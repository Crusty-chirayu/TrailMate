// Supabase synchronization uploader.
//
// Uploads locally-durable track points into the `route_points` table using the
// browser-side (anon-key) Supabase client, which is protected by RLS via trip
// ownership. Deduplication is achieved by writing each local point id to the
// `source_id` column and upserting `ON CONFLICT (source_id)`.
//
// Failures are classified so the sync engine can retry transient problems,
// pause on auth problems, and isolate permanent data problems:
// - network  : connectivity / timeout issues
// - auth     : missing or invalid session
// - data     : ownership or integrity rejections (e.g. trip deleted)

import { createClient } from '@/lib/supabase/client'
import type { TrackPoint } from '@/types/tracking'
import { type SyncUploader, type UploadResult, type SyncFailureKind } from './sync'

function kindFromError(message: string): SyncFailureKind {
  const m = message.toLowerCase()
  if (
    m.includes('failed to fetch') ||
    m.includes('network') ||
    m.includes('timeout') ||
    m.includes('timed out') ||
    m.includes('connection')
  ) {
    return 'network'
  }
  if (
    m.includes('not authenticated') ||
    m.includes('jwt') ||
    m.includes('session expired') ||
    m.includes('refresh token')
  ) {
    return 'auth'
  }
  if (
    m.includes('row-level security') ||
    m.includes('permission denied') ||
    m.includes('foreign key') ||
    m.includes('violates') ||
    m.includes('violation') ||
    m.includes('no rows')
  ) {
    return 'data'
  }
  return 'unknown'
}

function failure(message: string, kind: SyncFailureKind): UploadResult {
  return { ok: false, uploadedIds: [], error: message, kind }
}

export function createSupabaseSyncUploader(): SyncUploader {
  return {
    async upload(points: TrackPoint[]) {
      let supabase
      try {
        supabase = createClient()
      } catch {
        return failure('Supabase client unavailable', 'unknown')
      }

      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        return failure('User not authenticated', 'auth')
      }

      // Every record in a batch belongs to the same store owner; a mismatch
      // means legacy data was adopted by the wrong account and can never be
      // uploaded, so it is reported as a permanent data failure.
      if (points.some(p => p.userId && p.userId !== user.id)) {
        return failure('Owner mismatch: local records belong to another account', 'data')
      }

      const rows = points.map(p => ({
        source_id: p.id,
        trip_id: p.tripId,
        lat: p.latitude,
        lng: p.longitude,
        elevation: p.altitude ?? null,
        accuracy: p.accuracy ?? null,
        recorded_at: new Date(p.timestamp).toISOString(),
        synced: true,
        metadata: {
          sessionId: p.sessionId,
          heading: p.heading ?? null,
          speed: p.speed ?? null,
          altitudeAccuracy: p.altitudeAccuracy ?? null,
          source: 'browser-tracking',
          ...(p.metadata ?? {}),
        },
      }))

      const { error } = await supabase.from('route_points').upsert(rows, {
        onConflict: 'source_id',
      })
      if (error) {
        return failure(error.message, kindFromError(error.message))
      }
      return { ok: true, uploadedIds: points.map(p => p.id) }
    },
  }
}
