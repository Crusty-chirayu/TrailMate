import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import TrailView from '@/components/trails/TrailView'
import type { RouteHistoryPoint } from '@/lib/domain/tracking/routeStats'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  return { title: `Public trail — TrailMate` , description: `Public trail #${id.slice(0, 8)}` }
}

export default async function PublicTrailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  // Narrow projection: no user_id, no owner info; only public profile fields.
  const { data: trip, error: tripError } = await supabase
    .from('trips')
    .select(
      'id,title,description,activity_type,difficulty,visibility,status,planned_date,start_date,end_date,estimated_distance,estimated_elevation_gain,estimated_duration',
    )
    .eq('id', id)
    .eq('visibility', 'public')
    .single()
  if (tripError || !trip) notFound()

  const { data: rawPoints, error: pointsError } = await supabase
    .from('route_points')
    .select('lat,lng,elevation,accuracy,recorded_at')
    .eq('trip_id', id)
    .order('recorded_at', { ascending: true })
  if (pointsError) notFound()

  const route: RouteHistoryPoint[] = (rawPoints ?? []).map(p => ({
    lat: p.lat,
    lng: p.lng,
    elevation: p.elevation ?? undefined,
    recordedAt: new Date(p.recorded_at),
  }))

  return (
    <TrailView
      profile={{
        id: trip.id,
        title: trip.title,
        description: trip.description,
        activityType: trip.activity_type,
        difficulty: trip.difficulty,
        status: trip.status,
        plannedDate: trip.planned_date,
        startDate: trip.start_date,
        endDate: trip.end_date,
        estimatedDistance: trip.estimated_distance,
        estimatedElevationGain: trip.estimated_elevation_gain,
        estimatedDuration: trip.estimated_duration,
      }}
      route={route}
      backHref="/"
      backLabel="TrailMate"
      channelLabel="Public trail"
    />
  )
}
