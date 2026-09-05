// Server-side data access for trip analytics (Phase 11B).
//
// Aggregation strategy:
//   - ONE query for the user's trips (TripService.getAllTrips: RLS + user_id).
//   - ONE bulk query for route points across ALL of those trips
//     (TrackingService.getRoutePointsForTrips) — never an N+1 per trip, and
//     raw points are never shipped to the browser.
//   - Statistics are computed in TypeScript through the canonical 11A
//     adapter (computeRouteStats + calculateStatistics), so exactly one
//     implementation of the route math exists — no SQL re-implementation.
//
// This module is server-only (it uses the Supabase server client). The
// dashboard (a server component) calls getTripActivityRecords() and renders
// the small, precomputed analytics results — not the raw point data.

import { createClient } from '@/lib/supabase/server'
import { TripService } from '@/lib/domain/trips/service'
import { TrackingService } from '@/lib/domain/tracking/service'
import type { RoutePoint as DomainRoutePoint, Trip } from '@/types/domain'
import { tripActivityRecord, type TripActivityRecord } from './analytics'
import type { RouteHistoryPoint } from './routeStats'

/**
 * Groups stored route points by trip. The query feeding this returns points
 * ordered by (trip_id, recorded_at), so per-trip buckets stay chronological;
 * the function itself is order-preserving and robust to any input order.
 */
export function groupRoutePointsByTrip(
  points: readonly DomainRoutePoint[],
): Map<string, RouteHistoryPoint[]> {
  const byTrip = new Map<string, RouteHistoryPoint[]>()
  for (const point of points) {
    let bucket = byTrip.get(point.tripId)
    if (!bucket) {
      bucket = []
      byTrip.set(point.tripId, bucket)
    }
    bucket.push({
      lat: point.lat,
      lng: point.lng,
      elevation: point.elevation,
      recordedAt: point.recordedAt,
    })
  }
  return byTrip
}

/**
 * Builds normalized analytics records for all trips, preserving the given
 * trip order (stable tie-break input for the 11A aggregators).
 */
export function buildActivityRecords(
  trips: readonly Trip[],
  pointsByTrip: ReadonlyMap<string, RouteHistoryPoint[]>,
): TripActivityRecord[] {
  return trips.map(trip => tripActivityRecord(trip, pointsByTrip.get(trip.id) ?? []))
}

export class TripAnalyticsService {
  /**
   * Loads the authenticated user's full analytics input set: every trip,
   * enriched with recorded route statistics as TripActivityRecords.
   *
   * Callers that already hold the user's trip list (e.g. a page that also
   * renders recent trips) should pass it via `trips` to avoid a duplicate
   * database round-trip.
   *
   * Isolation: the server client carries the user's own session; RLS on
   * both `trips` and `route_points` (via trip ownership) is the database-
   * level guarantee, with explicit user_id filters as the service layer.
   * A user can never receive another user's trips or route points.
   */
  static async getTripActivityRecords(trips?: Trip[]): Promise<TripActivityRecord[]> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      throw new Error('User not authenticated')
    }

    const tripList = trips ?? (await TripService.getAllTrips())
    if (tripList.length === 0) return []

    const points = await TrackingService.getRoutePointsForTrips(tripList.map(t => t.id))
    return buildActivityRecords(tripList, groupRoutePointsByTrip(points))
  }
}
