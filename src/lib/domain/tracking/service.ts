import { createClient } from '@/lib/supabase/server'
import type { Json } from '@/types/database'
import type { RoutePoint, RoutePointInsert } from '@/types/database'
import type { RoutePoint as DomainRoutePoint, RouteStats } from '@/types/domain'
import { computeRouteStats } from './routeStats'

export class TrackingService {
  private static transformToDomain(dbPoint: RoutePoint): DomainRoutePoint {
    return {
      id: dbPoint.id,
      tripId: dbPoint.trip_id,
      lat: dbPoint.lat,
      lng: dbPoint.lng,
      elevation: dbPoint.elevation || undefined,
      accuracy: dbPoint.accuracy || undefined,
      recordedAt: new Date(dbPoint.recorded_at),
      synced: dbPoint.synced,
      metadata: (dbPoint.metadata as Record<string, unknown>) || undefined,
    }
  }

  private static transformToInsert(domain: {
    tripId: string
    lat: number
    lng: number
    elevation?: number
    accuracy?: number
    metadata?: Record<string, unknown>
  }): RoutePointInsert {
    return {
      trip_id: domain.tripId,
      lat: domain.lat,
      lng: domain.lng,
      elevation: domain.elevation || null,
      accuracy: domain.accuracy || null,
      metadata: (domain.metadata || {}) as Json,
    }
  }

  static async getRoutePointsByTripId(tripId: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      throw new Error('User not authenticated')
    }

    const { data, error } = await supabase
      .from('route_points')
      .select('*')
      .eq('trip_id', tripId)
      .order('recorded_at', { ascending: true })

    if (error) throw error

    return data.map(this.transformToDomain)
  }

  static async createRoutePoint(point: {
    tripId: string
    lat: number
    lng: number
    elevation?: number
    accuracy?: number
    metadata?: Record<string, unknown>
  }) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      throw new Error('User not authenticated')
    }

    const insertData = this.transformToInsert(point)

    const { data, error } = await supabase
      .from('route_points')
      .insert(insertData)
      .select()
      .single()

    if (error) throw error

    return this.transformToDomain(data)
  }

  static async deleteRoutePointsByTripId(tripId: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      throw new Error('User not authenticated')
    }

    const { error } = await supabase
      .from('route_points')
      .delete()
      .eq('trip_id', tripId)

    if (error) throw error

    return true
  }

  static calculateRouteStats(points: DomainRoutePoint[]): RouteStats {
    const stats = computeRouteStats(
      points.map(p => ({
        lat: p.lat,
        lng: p.lng,
        elevation: p.elevation,
        recordedAt: p.recordedAt,
      })),
    )
    return {
      totalDistance: stats.totalDistance,
      totalElevationGain: stats.elevationGain,
      totalElevationLoss: stats.elevationLoss,
      maxElevation: stats.maxElevation ?? 0,
      minElevation: stats.minElevation ?? 0,
      duration: stats.duration,
      averageSpeed: stats.averageSpeed ?? undefined,
      pointCount: stats.pointCount,
    }
  }


  private static haversineDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    const R = 6371e3 // Earth's radius in meters
    const φ1 = (lat1 * Math.PI) / 180
    const φ2 = (lat2 * Math.PI) / 180
    const Δφ = ((lat2 - lat1) * Math.PI) / 180
    const Δλ = ((lon2 - lon1) * Math.PI) / 180

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

    return R * c
  }
}
