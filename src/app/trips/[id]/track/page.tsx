import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { TripService } from '@/lib/domain/trips/service'
import TrackingDashboard from '@/components/tracking/TrackingDashboard'

export const dynamic = 'force-dynamic'

export default async function TripTrackPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  let trip
  try {
    trip = await TripService.getTripById(id)
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (message === 'User not authenticated') redirect('/login')
    if (message.includes('PGRST116') || message.includes('No rows')) notFound()
    redirect('/trips')
  }

  if (!trip) notFound()

  // Lifecycle agreement: opening the GPS tracker for a planned trip auto-activates it.
  // This ensures the trip is not left as "planned" while recording.
  if (trip.status === 'planned') {
    try {
      trip = await TripService.startTrip(trip.id)
    } catch (error) {
      console.error('Failed to auto-start trip for tracking:', error)
      // Do not block tracker; proceed with original trip
    }
  }

  return <TrackingDashboard tripId={trip.id} tripTitle={trip.title} userId={user.id} />
}
