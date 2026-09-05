// Supabase synchronization uploader.
//
// Uploads locally-durable track points into the `route_points` table using the
// browser-side (anon-key) Supabase client, which is protected by RLS via trip
// ownership. Deduplication is achieved by writing each local point id to the
// `source_id` column and upserting `ON CONFLICT (source_id)`.

import { createClient } from '@/lib/supabase/client'
import type { TrackPoint } from '@/types/tracking'
import type { SyncUploader } from './sync'

export function createSupabaseSyncUploader(): SyncUploader {
  return {
    async upload(points: TrackPoint[]) {
      let supabase
      try {
        supabase = createClient()
      } catch {
        return { ok: false, uploadedIds: [], error: 'Supabase client unavailable' }
      }

      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        return { ok: false, uploadedIds: [], error: 'User not authenticated' }
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
        return { ok: false, uploadedIds: [], error: error.message }
      }
      return { ok: true, uploadedIds: points.map(p => p.id) }
    },
  }
}