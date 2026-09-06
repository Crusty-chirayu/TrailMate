import { redirect } from 'next/navigation'
import { TrackingService } from '@/lib/domain/tracking/service'
import { TripService } from '@/lib/domain/trips/service'
import { computeRouteStats } from '@/lib/domain/tracking/routeStats'
import type { RouteHistoryPoint } from '@/lib/domain/tracking/routeStats'
import { buildElevationProfile } from '@/lib/domain/tracking/elevation'
import RouteHistoryMap from '@/components/tracking/RouteHistoryMap'
import ElevationProfileChart from '@/components/tracking/ElevationProfileChart'
import GpxExportButton from '@/components/tracking/GpxExportButton'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { ArrowLeft } from 'lucide-react'
import { formatDistance, formatSpeed, formatTime, formatElevation } from '@/lib/tracking/format'

export const dynamic = 'force-dynamic'

export default async function TripRoutePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  let tripTitle: string
  let historyPoints: RouteHistoryPoint[]
  try {
    const trip = await TripService.getTripById(id)
    tripTitle = trip.title
    const points = await TrackingService.getRoutePointsByTripId(id)
    historyPoints = points.map(p => ({
      lat: p.lat,
      lng: p.lng,
      elevation: p.elevation,
      recordedAt: p.recordedAt,
    }))
  } catch (error) {
    if (error instanceof Error && error.message === 'User not authenticated') redirect('/login')
    console.error('Failed to load route history:', error)
    redirect(`/trips/${id}`)
  }

  const stats = computeRouteStats(historyPoints)

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="container mx-auto px-4 py-6 max-w-4xl">
        <Button href={`/trips/${id}`} variant="ghost" className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          {tripTitle}
        </Button>
        <h1 className="text-2xl font-bold mb-6">Route History</h1>

        {historyPoints.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-12 text-center">
            <p className="font-medium mb-1">No route recorded yet</p>
            <p className="text-sm text-muted-foreground mb-4">
              Record a GPS track for this trip to see it here.
            </p>
            <Button href={`/trips/${id}/track`} variant="outline" size="sm">
              Open GPS Tracker
            </Button>
          </div>
        ) : (
          <>
            <div className="rounded-md overflow-hidden border border-border h-[360px] sm:h-[440px]">
              <RouteHistoryMap
                points={historyPoints.map(p => ({ latitude: p.lat, longitude: p.lng }))}
              />
            </div>

            <dl className="grid grid-cols-2 sm:grid-cols-3 gap-px mt-6 bg-border rounded-md overflow-hidden border border-border">
              <Stat label="Distance" value={formatDistance(stats.totalDistance)} />
              <Stat label="Elapsed time" value={formatTime(stats.duration)} />
              <Stat
                label="Average speed"
                value={stats.averageSpeed !== null ? formatSpeed(stats.averageSpeed) : '—'}
              />
              <Stat label="Track points" value={String(stats.pointCount)} />
              <Stat
                label="Ascent"
                value={stats.hasElevation ? formatElevation(stats.elevationGain) : '—'}
              />
              <Stat
                label="Descent"
                value={stats.hasElevation ? formatElevation(stats.elevationLoss) : '—'}
              />
              <Stat
                label="Highest point"
                value={stats.hasElevation ? formatElevation(stats.maxElevation) : '—'}
              />
              <Stat
                label="Lowest point"
                value={stats.hasElevation ? formatElevation(stats.minElevation) : '—'}
              />
              <div className="bg-background px-4 py-3 flex flex-col justify-center gap-1">
                <dt className="text-xs text-muted-foreground">Elevation data</dt>
                <dd>
                  {stats.hasElevation ? (
                    <Badge variant="success">Recorded</Badge>
                  ) : (
                    <Badge variant="secondary">Not available</Badge>
                  )}
                </dd>
              </div>
            </dl>

            {stats.startedAt && (
              <p className="mt-4 text-xs text-muted-foreground tabular-nums">
                Recorded {stats.startedAt.toLocaleString()} → {stats.endedAt?.toLocaleString()}
              </p>
            )}

            {/* Elevation profile — rendered only when real altitude data exists */}
            {(() => {
              const profile = buildElevationProfile(historyPoints)
              if (!profile.hasElevation) return null
              return (
                <section aria-label="Elevation profile" className="mt-8 rounded-md border border-border p-4">
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                    Elevation Profile
                  </h2>
                                    <ElevationProfileChart
                    samples={profile.samples}
                    totalDistance={profile.totalDistance}
                    gain={profile.gain}
                    loss={profile.loss}
                    className="text-primary"
                  />
                  <p className="mt-2 text-xs text-muted-foreground tabular-nums">
                    Ascent {formatElevation(Math.round(profile.gain))} · Descent{' '}
                    {formatElevation(Math.round(profile.loss))} (from recorded GPS altitude)
                  </p>
                </section>
              )
            })()}

            {/* Export */}
            <div className="mt-6">
              <GpxExportButton points={historyPoints} tripTitle={tripTitle} formats={['gpx', 'kml']} />
            </div>
          </>
        )}
      </div>
    </main>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-background px-4 py-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums mt-0.5">{value}</dd>
    </div>
  )
}