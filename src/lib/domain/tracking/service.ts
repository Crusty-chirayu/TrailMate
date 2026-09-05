import { createClient } from '@/lib/supabase/server'
import type { Json } from '@/types/database'
import type { RoutePoint, RoutePointInsert } from '@/types/database'
import type { RoutePoint as DomainRoutePoint, RouteStats } from '@/types/domain'

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
    if (points.length === 0) {
      return {
        totalDistance: 0,
        totalElevationGain: 0,
        totalElevationLoss: 0,
        maxElevation: 0,
        minElevation: 0,
        duration: 0,
        pointCount: 0,
      }
    }

    let totalDistance = 0
    let totalElevationGain = 0
    let totalElevationLoss = 0
    let maxElevation = -Infinity
    let minElevation = Infinity

    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1]
      const curr = points[i]

      // Calculate distance using Haversine formula
      const distance = this.haversineDistance(
        prev.lat, prev.lng,
        curr.lat, curr.lng
      )
      totalDistance += distance

      // Calculate elevation change
      if (prev.elevation && curr.elevation) {
        const elevationChange = curr.elevation - prev.elevation
        if (elevationChange > 0) {
          totalElevationGain += elevationChange
        } else {
          totalElevationLoss += Math.abs(elevationChange)
        }

        maxElevation = Math.max(maxElevation, curr.elevation)
        minElevation = Math.min(minElevation, curr.elevation)
      }
    }

    // Handle cases where elevation data is missing
    if (maxElevation === -Infinity) maxElevation = 0
    if (minElevation === Infinity) minElevation = 0

    // Calculate duration
    const duration = points.length > 1
      ? new Date(points[points.length - 1].recordedAt).getTime() -
        new Date(points[0].recordedAt).getTime()
      : 0

    // Calculate average speed (m/s)
    const averageSpeed = duration > 0 ? (totalDistance / duration) * 1000 : undefined

    return {
      totalDistance: Math.round(totalDistance),
      totalElevationGain: Math.round(totalElevationGain),
      totalElevationLoss: Math.round(totalElevationLoss),
      maxElevation: Math.round(maxElevation),
      minElevation: Math.round(minElevation),
      duration: Math.round(duration / 1000), // convert to seconds
      averageSpeed,
      pointCount: points.length,
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
