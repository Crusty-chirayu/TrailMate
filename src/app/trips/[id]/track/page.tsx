import { redirect } from 'next/navigation'
import { TripService } from '@/lib/domain/trips/service'
import TrackingDashboard from '@/components/tracking/TrackingDashboard'

export default async function TripTrackPage({
  params,
}: {
  params: { id: string }
}) {
  let trip
  try {
    trip = await TripService.getTripById(params.id)
  } catch {
    redirect('/trips')
  }

  if (!trip) redirect('/trips')

  return <TrackingDashboard tripId={trip.id} tripTitle={trip.title} />
}