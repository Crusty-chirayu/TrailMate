import { redirect, notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { TripShareService } from '@/lib/domain/trips/sharing'
import TrailView from '@/components/trails/TrailView'
import type { RouteHistoryPoint } from '@/lib/domain/tracking/routeStats'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params
  return { title: 'Shared trail — TrailMate', description: `Shared trail ${token.slice(0, 8)}` }
}

export default async function SharedTrailPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const trip = await TripShareService.getSharedTrip(token)
  if (!trip) notFound()

  const rawPoints = await TripShareService.getSharedRoute(token)
  const route: RouteHistoryPoint[] = rawPoints.map(p => ({
    lat: p.lat,
    lng: p.lng,
    elevation: p.elevation ?? undefined,
    recordedAt: new Date(p.recordedAt),
  }))

  return (
    <TrailView
      profile={{
        id: trip.id,
        title: trip.title,
        description: trip.description,
        activityType: trip.activityType,
        difficulty: trip.difficulty,
        status: trip.status,
        plannedDate: trip.plannedDate,
        startDate: trip.startDate,
        endDate: trip.endDate,
        estimatedDistance: trip.estimatedDistance,
        estimatedElevationGain: trip.estimatedElevationGain,
        estimatedDuration: trip.estimatedDuration,
      }}
      route={route}
      backHref="/"
      backLabel="TrailMate"
      channelLabel="Shared trail"
    />
  )
}
