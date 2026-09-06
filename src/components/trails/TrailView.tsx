// Shared/public trail presentation.
//
// Renders only fields that are intentionally public or share-approved:
// trip profile (title, activity, difficulty, dates, estimates) and route
// geometry. Never renders account info, gear, notes, or private data.
// Missing/private trips are handled by the calling pages (notFound).

import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { ArrowLeft, Mountain, Activity } from 'lucide-react'
import RouteHistoryMap from '@/components/tracking/RouteHistoryMap'
import ElevationProfileChart from '@/components/tracking/ElevationProfileChart'
import GpxExportButton from '@/components/tracking/GpxExportButton'
import { computeRouteStats, type RouteHistoryPoint } from '@/lib/domain/tracking/routeStats'
import { buildElevationProfile } from '@/lib/domain/tracking/elevation'
import { formatDistance, formatElevation, formatTime } from '@/lib/tracking/format'

export interface SharedTrailProfile {
  id: string
  title: string
  description: string | null
  activityType: string
  difficulty: string | null
  status: string
  plannedDate: string | null
  startDate: string | null
  endDate: string | null
  estimatedDistance: number | null
  estimatedElevationGain: number | null
  estimatedDuration: number | null
}

interface TrailViewProps {
  profile: SharedTrailProfile
  route: RouteHistoryPoint[]
  backHref: string
  backLabel: string
  /** e.g. "Public trail" or "Shared with you" */
  channelLabel: string
}

function formatDate(value: string | null): string | null {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString()
}

export default function TrailView({ profile, route, backHref, backLabel, channelLabel }: TrailViewProps) {
  const stats = computeRouteStats(route)
  const profilePoints = route.map(p => ({ lat: p.lat, lng: p.lng, elevation: p.elevation, recordedAt: p.recordedAt }))
  const elevation = buildElevationProfile(profilePoints)

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="container mx-auto px-4 py-6 max-w-5xl">
        <Button href={backHref} variant="ghost" className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          {backLabel}
        </Button>

        <header className="mb-6">
          <Badge variant="secondary" className="mb-2">{channelLabel}</Badge>
          <h1 className="text-3xl font-bold mb-2">{profile.title}</h1>
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Activity className="h-4 w-4" aria-hidden />
              {profile.activityType}
            </span>
            {profile.difficulty && (
              <span className="inline-flex items-center gap-1.5">
                <Mountain className="h-4 w-4" aria-hidden />
                {profile.difficulty}
              </span>
            )}
            <Badge variant={profile.status === 'completed' ? 'success' : 'default'}>{profile.status}</Badge>
          </div>
          {profile.description && (
            <p className="mt-3 text-sm text-muted-foreground max-w-2xl">{profile.description}</p>
          )}
        </header>

        <dl className="grid grid-cols-2 md:grid-cols-4 gap-px mb-6 rounded-md border border-border bg-border overflow-hidden">
          {profile.estimatedDistance !== null && (
            <div className="bg-card px-4 py-3">
              <dt className="text-xs uppercase tracking-widest text-muted-foreground">Est. distance</dt>
              <dd className="text-lg font-semibold tabular-nums">{formatDistance(profile.estimatedDistance)}</dd>
            </div>
          )}
          {profile.estimatedDuration !== null && (
            <div className="bg-card px-4 py-3">
              <dt className="text-xs uppercase tracking-widest text-muted-foreground">Est. duration</dt>
              <dd className="text-lg font-semibold tabular-nums">{formatTime(profile.estimatedDuration * 60)}</dd>
            </div>
          )}
          {profile.estimatedElevationGain !== null && (
            <div className="bg-card px-4 py-3">
              <dt className="text-xs uppercase tracking-widest text-muted-foreground">Est. gain</dt>
              <dd className="text-lg font-semibold tabular-nums">{formatElevation(profile.estimatedElevationGain)}</dd>
            </div>
          )}
          {(profile.plannedDate || profile.startDate) && (
            <div className="bg-card px-4 py-3 col-span-2 md:col-span-1">
              <dt className="text-xs uppercase tracking-widest text-muted-foreground">Dates</dt>
              <dd className="text-lg font-semibold tabular-nums">
                {formatDate(profile.startDate ?? profile.plannedDate) ?? '—'}
              </dd>
            </div>
          )}
        </dl>

        {route.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-12 text-center">
            <p className="font-medium mb-1">No route recorded yet</p>
            <p className="text-sm text-muted-foreground">There is no GPS route to show for this trail.</p>
          </div>
        ) : (
          <>
            <section aria-label="Route map" className="rounded-md overflow-hidden border border-border h-[360px] sm:h-[440px] mb-6">
              <RouteHistoryMap points={route.map(p => ({ latitude: p.lat, longitude: p.lng }))} />
            </section>

            <dl className="grid grid-cols-2 md:grid-cols-4 gap-px mb-6 rounded-md border border-border bg-border overflow-hidden">
              <div className="bg-card px-4 py-3">
                <dt className="text-xs uppercase tracking-widest text-muted-foreground">Distance</dt>
                <dd className="text-lg font-semibold tabular-nums">{formatDistance(stats.totalDistance)}</dd>
              </div>
              <div className="bg-card px-4 py-3">
                <dt className="text-xs uppercase tracking-widest text-muted-foreground">Elapsed</dt>
                <dd className="text-lg font-semibold tabular-nums">{formatTime(stats.duration)}</dd>
              </div>
              <div className="bg-card px-4 py-3">
                <dt className="text-xs uppercase tracking-widest text-muted-foreground">Avg speed</dt>
                <dd className="text-lg font-semibold tabular-nums">
                  {stats.averageSpeed !== null ? formatDistance(stats.averageSpeed * 3600) + '/h' : '—'}
                </dd>
              </div>
              <div className="bg-card px-4 py-3">
                <dt className="text-xs uppercase tracking-widest text-muted-foreground">Track points</dt>
                <dd className="text-lg font-semibold tabular-nums">{stats.pointCount}</dd>
              </div>
            </dl>

            {elevation.hasElevation && (
              <section aria-label="Elevation profile" className="rounded-md border border-border p-4 mb-6">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                  Elevation profile
                </h2>
                <ElevationProfileChart
                  samples={elevation.samples}
                  totalDistance={elevation.totalDistance}
                  gain={elevation.gain}
                  loss={elevation.loss}
                  className="text-primary"
                />
              </section>
            )}

            <div className="mb-6">
              <GpxExportButton points={profilePoints} tripTitle={profile.title} formats={['gpx', 'kml']} />
            </div>
          </>
        )}
      </div>
    </main>
  )
}
