// Client-side cleanup of locally cached tracking records.
//
// Called after a trip is deleted server-side so a stale local queue cannot keep
// trying to upload points whose trip no longer exists. Best-effort: cleanup
// failures must never block the surrounding UI flow.

import { IndexedDbAdapter } from './storage'
import { TrackingStore } from './persistence'

export async function clearLocalTripData(tripId: string, userId: string): Promise<void> {
  if (!tripId || !userId) return
  try {
    const store = new TrackingStore(new IndexedDbAdapter(), userId)
    await store.deletePointsByTrip(tripId)
  } catch {
    // Local cleanup is a best-effort durability improvement; remote deletion
    // is already authoritative. The sync engine additionally quarantines any
    // point that is later rejected for a missing trip.
  }
}
