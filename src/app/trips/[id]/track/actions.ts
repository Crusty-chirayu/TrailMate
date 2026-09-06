'use server'

// Server actions for tracker completion and route import.
//
// Finishing a trip is a two-phase operation: the tracker finalizes locally
// first (points are already durable), then this action reconciles the trip
// lifecycle server-side. If the call fails the tracker keeps a durable
// completion intent and retries on the next visit.
//
// Route import goes through the same normalized pipeline: canonical points,
// RLS-protected bulk upsert, dedupe by trip-scoped source id.

import { revalidatePath } from 'next/cache'
import { TripService } from '@/lib/domain/trips/service'
import { TrackingService } from '@/lib/domain/tracking/service'
import type { ImportedRoutePoint } from '@/types/import'

export async function finishTripAction(tripId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await TripService.completeTrip(tripId)
  } catch (error) {
    // Reconciliation must be idempotent: a trip that is already completed
    // counts as a success.
    try {
      const trip = await TripService.getTripById(tripId)
      if (trip.status === 'completed') {
        revalidatePath(`/trips/${tripId}`)
        revalidatePath('/trips')
        return { ok: true }
      }
    } catch {
      // Fall through to the original error below.
    }
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Failed to complete trip',
    }
  }
  revalidatePath(`/trips/${tripId}`)
  revalidatePath('/trips')
  return { ok: true }
}

const IMPORT_CHUNK_SIZE = 1000

/** Persists a parsed canonical route for an owned trip (RLS enforced). */
export async function importRouteAction(
  tripId: string,
  format: 'gpx' | 'kml',
  fileName: string,
  points: ImportedRoutePoint[],
): Promise<{ ok: boolean; imported: number; error?: string }> {
  let imported = 0
  try {
    for (let i = 0; i < points.length; i += IMPORT_CHUNK_SIZE) {
      const chunk = points.slice(i, i + IMPORT_CHUNK_SIZE)
      const withSourceIds = chunk.map((p, j) => ({
        ...p,
        sourceId: `imp:${tripId}:${format}:${fileName}:${i + j}`,
      }))
      imported += await TrackingService.addRoutePoints(tripId, withSourceIds)
    }
  } catch (error) {
    return {
      ok: false,
      imported,
      error: error instanceof Error ? error.message : 'Failed to import route',
    }
  }
  revalidatePath(`/trips/${tripId}/route`)
  return { ok: true, imported }
}
