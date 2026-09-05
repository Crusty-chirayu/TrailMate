'use server'

// Server actions for the trip packing checklist.
// Each action verifies authentication (RLS enforces trip ownership at the DB layer).
// revalidatePath is REQUIRED after each mutation: useOptimistic state is
// discarded when a transition completes, so without revalidation the packed
// state would visually revert to stale props.

import { revalidatePath } from 'next/cache'
import { TripPackingService } from '@/lib/domain/gear/tripPacking'

export async function togglePackedAction(tripId: string, itemId: string, packed: boolean): Promise<void> {
  await TripPackingService.setPacked(itemId, packed)
  revalidatePath(`/trips/${tripId}/pack`)
}

export async function removePackingItemAction(tripId: string, itemId: string): Promise<void> {
  await TripPackingService.removePackingItem(itemId)
  revalidatePath(`/trips/${tripId}/pack`)
}

export async function assignTemplateAction(tripId: string, templateId: string): Promise<void> {
  await TripPackingService.assignTemplateToTrip(tripId, templateId)
  revalidatePath(`/trips/${tripId}/pack`)
}

export async function addAdHocItemAction(
  tripId: string,
  input: { itemName: string; category?: string; quantity?: number; weight?: number; notes?: string; required?: boolean },
): Promise<void> {
  await TripPackingService.addPackingItem({ tripId, ...input })
  revalidatePath(`/trips/${tripId}/pack`)
}