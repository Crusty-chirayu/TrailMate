'use server'

// Server actions for tracker completion.
//
// Finishing a trip is a two-phase operation: the tracker finalizes locally
// first (points are already durable), then this action reconciles the trip
// lifecycle server-side. If the call fails the tracker keeps a durable
// completion intent and retries on the next visit.

import { revalidatePath } from 'next/cache'
import { TripService } from '@/lib/domain/trips/service'

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
