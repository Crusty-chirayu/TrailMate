// Trip sharing service.
//
// `visibility` is the single source of truth:
// - public  : anyone can view the trail page (narrow anon RLS select policy)
// - shared  : authenticated visitors with the owner-issued token can view
//             through SECURITY DEFINER functions with a safe column projection
// - private : owner only (existing RLS)
//
// Tokens are generated server-side, never logged, and revocable by the owner.

import { createClient } from '@/lib/supabase/server'
import { randomBytes, randomUUID } from 'crypto'
import type { TripShare } from '@/types/database'

const TOKEN_BYTES = 32

function generateToken(): string {
  return `${randomUUID().replace(/-/g, '')}${randomBytes(TOKEN_BYTES).toString('hex')}`
}

export interface SharedTripProfile {
  id: string
  title: string
  description: string | null
  activityType: string
  difficulty: string | null
  visibility: string
  plannedDate: string | null
  startDate: string | null
  endDate: string | null
  status: string
  estimatedDistance: number | null
  estimatedElevationGain: number | null
  estimatedDuration: number | null
}

export interface SharedRoutePoint {
  lat: number
  lng: number
  elevation: number | null
  accuracy: number | null
  recordedAt: string
}

export class TripShareService {
  static async createShare(tripId: string): Promise<TripShare> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('User not authenticated')

    const { data, error } = await supabase
      .from('trip_shares')
      .insert({ trip_id: tripId, token: generateToken() })
      .select()
      .single()
    if (error) throw error
    return data
  }

  static async listShares(tripId: string): Promise<TripShare[]> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('User not authenticated')

    const { data, error } = await supabase
      .from('trip_shares')
      .select('*')
      .eq('trip_id', tripId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return data ?? []
  }

  static async revokeShare(shareId: string): Promise<void> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('User not authenticated')

    const { error } = await supabase.from('trip_shares').delete().eq('id', shareId)
    if (error) throw error
  }

  /** Reads a shared trip for an authenticated visitor via the secured RPC. */
  static async getSharedTrip(token: string): Promise<SharedTripProfile | null> {
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('get_shared_trip', { p_token: token })
    if (error) throw error
    if (!data || data.length === 0) return null
    const row = data[0]
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      activityType: row.activity_type,
      difficulty: row.difficulty,
      visibility: row.visibility,
      plannedDate: row.planned_date,
      startDate: row.start_date,
      endDate: row.end_date,
      status: row.status,
      estimatedDistance: row.estimated_distance,
      estimatedElevationGain: row.estimated_elevation_gain,
      estimatedDuration: row.estimated_duration,
    }
  }

  /** Reads the shared route via the secured RPC (safe columns only). */
  static async getSharedRoute(token: string): Promise<SharedRoutePoint[]> {
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('get_shared_route', { p_token: token })
    if (error) throw error
    return (data ?? []).map(r => ({
      lat: r.lat,
      lng: r.lng,
      elevation: r.elevation,
      accuracy: r.accuracy,
      recordedAt: r.recorded_at,
    }))
  }
}
