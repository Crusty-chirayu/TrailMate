import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { TripService } from '@/lib/domain/trips/service'
import { TripAnalyticsService } from '@/lib/domain/tracking/analyticsService'
import {
  buildTrendSeries,
  computeTripAnalytics,
  emptyTripAnalytics,
  resolveTrendGranularity,
  summarizeByActivity,
  type ActivitySummary,
  type AnalyticsWindow,
  type TripActivityRecord,
  type TripAnalytics,
  type TrendBucket,
} from '@/lib/domain/tracking/analytics'
import ActivityBreakdown from '@/components/analytics/ActivityBreakdown'
import DistanceTrendChart from '@/components/analytics/DistanceTrendChart'
import PersonalRecords, { type PersonalRecordEntry } from '@/components/analytics/PersonalRecords'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import WindowSelector from '@/components/analytics/WindowSelector'
import type { ActivityType, TripStatus } from '@/types/domain'
import { Mountain, MapPin, Calendar, Plus, Backpack, Footprints, Route, Timer, TrendingUp, CheckCheck } from 'lucide-react'
import Link from 'next/link'
import { formatDistance, formatElevation, formatTime } from '@/lib/tracking/format'

const WINDOW_LABELS: Record<string, string> = {
  '7': 'last 7 days',
  '30': 'last 30 days',
  '90': 'last 90 days',
  '365': 'last year',
  all: 'all time',
}

function parseWindowParam(value: string | undefined): AnalyticsWindow {
  switch (value) {
    case '7': return { days: 7 }
    case '90': return { days: 90 }
    case '365': return { days: 365 }
    case 'all': return 'all'
    case '30':
    default: return { days: 30 }
  }
}

export default async function Home({ searchParams }: { searchParams: Promise<{ window?: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { window: windowParam } = await searchParams
  const window = parseWindowParam(windowParam)
  const referenceDate = new Date() // explicit anchor: this server render

  let records: TripActivityRecord[] = []
  let analytics: TripAnalytics = emptyTripAnalytics()
  let trips: TripSummaryRow[] = []
  let analyticsAvailable = false

  let allTime = emptyTripAnalytics()
  let trendBuckets: TrendBucket[] = []
  let activitySummaries: ActivitySummary[] = []

  try {
    records = await TripAnalyticsService.getTripActivityRecords()
    analytics = computeTripAnalytics(records, { window, referenceDate })
    // All-time is computed once per render: it feeds the personal records
    // (records are lifetime achievements, not windowed).
    allTime = computeTripAnalytics(records, { window: 'all', referenceDate })
    trendBuckets = buildTrendSeries(records, { window, referenceDate })
    activitySummaries = summarizeByActivity(records, { window, referenceDate })
    analyticsAvailable = true
  } catch (error) {
    if (error instanceof Error && error.message === 'User not authenticated') redirect('/login')
    console.error('Failed to load trip analytics:', error)
  }

  const trendGranularity = resolveTrendGranularity(window, records, referenceDate)
  const windowLabel = WINDOW_LABELS[windowParam ?? '30']
  const recordEntries = buildRecordEntries(allTime, records)

  // Recent adventures (unchanged behavior: falls back gracefully).
  try {
    const allTrips = await TripService.getAllTrips()
    trips = allTrips.slice(0, 3).map(t => ({
      id: t.id,
      title: t.title,
      status: t.status,
      activityType: t.activityType,
      plannedDate: t.plannedDate,
    }))
  } catch (error) {
    if (error instanceof Error && error.message === 'User not authenticated') redirect('/login')
    console.error('Failed to load recent trips:', error)
  }

  const hasAnyData = analytics.totalTrips > 0

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        {/* Header */}
        <header className="mb-8">
          <p className="text-sm text-muted-foreground mb-1">Welcome back</p>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Expedition Log</h1>
          <p className="text-muted-foreground mt-2 max-w-xl">
            Distance, time and elevation — measured only from your recorded routes, never estimated.
          </p>
        </header>

        {analyticsAvailable && !hasAnyData ? (
          <EmptyExpeditionLog />
        ) : (
          <section aria-labelledby="field-log-heading" className="mb-8">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <h2 id="field-log-heading" className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Field log · {windowLabel}
              </h2>
              <Suspense fallback={null}>
                <WindowSelector />
              </Suspense>
            </div>

            {/* Primary metrics — instrument panel, same pattern as the route page */}
            <dl className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border rounded-md overflow-hidden border border-border">
              <Metric
                icon={<Footprints className="h-4 w-4" />}
                label="Total distance"
                value={analytics.tripsWithRoute > 0 ? formatDistance(analytics.totalDistance) : '0 m'}
                detail={analytics.tripsWithRoute > 0
                  ? `${analytics.tripsWithRoute} recorded ${analytics.tripsWithRoute === 1 ? 'route' : 'routes'}`
                  : 'no recorded routes'}
              />
              <Metric
                icon={<CheckCheck className="h-4 w-4" />}
                label="Completed trips"
                value={String(analytics.completedTrips)}
                detail={`of ${analytics.totalTrips} ${analytics.totalTrips === 1 ? 'trip' : 'trips'} in period`}
              />
              <Metric
                icon={<TrendingUp className="h-4 w-4" />}
                label="Elevation gained"
                value={analytics.hasElevation ? `+${formatElevation(analytics.totalElevationGain)}` : '—'}
                detail={analytics.hasElevation
                  ? `with ${formatElevation(analytics.totalElevationLoss)} descent`
                  : 'no altitude data'}
              />
              <Metric
                icon={<Timer className="h-4 w-4" />}
                label="Moving time"
                value={formatTime(analytics.totalMovingTime)}
                detail={`of ${formatTime(analytics.totalElapsedTime)} elapsed`}
              />
            </dl>

            {/* Historical context — every clause backed by real data */}
            {analytics.totalTrips > 0 && (
              <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
                <StatusLine analytics={analytics} />
                {analytics.tripsWithRoute > 0 &&
                  analytics.averageTripDistance !== null &&
                  analytics.averageDuration !== null && (
                    <>
                      {' '}· average recorded trip {formatDistance(analytics.averageTripDistance)} over{' '}
                      {formatTime(analytics.averageDuration)}
                    </>
                  )}
                {analytics.longestTrip && (
                  <>
                    {' '}· longest:{' '}
                    <Link
                      href={`/trips/${analytics.longestTrip.tripId}`}
                      className="text-foreground font-medium underline underline-offset-4 hover:text-primary"
                    >
                      {analytics.longestTrip.title}
                    </Link>{' '}
                    {formatDistance(analytics.longestTrip.distance)}
                  </>
                )}
              </p>
            )}
          </section>
        )}

        {/* Trend + breakdown + records — only when the user has trips */}
        {analyticsAvailable && hasAnyData && (
          <>
            {/* Distance trend for the selected window (11E) */}
            <section aria-labelledby="trend-heading" className="mb-8">
              <h2 id="trend-heading" className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">
                Distance · {windowLabel}
              </h2>
              {analytics.totalDistance > 0 ? (
                <DistanceTrendChart buckets={trendBuckets} granularity={trendGranularity} windowLabel={windowLabel} />
              ) : (
                <p className="text-sm text-muted-foreground border border-dashed border-border rounded-md p-4">
                  No recorded distance in this period yet.
                </p>
              )}
            </section>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
              {/* Activity breakdown for the selected window (11D) */}
              <section aria-labelledby="activity-heading">
                <h2 id="activity-heading" className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">
                  By activity · {windowLabel}
                </h2>
                <ActivityBreakdown summaries={activitySummaries} />
              </section>

              {/* Personal records — all-time (11F) */}
              <section aria-labelledby="records-heading">
                <h2 id="records-heading" className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">
                  Personal records · all time
                </h2>
                {recordEntries.length > 0 ? (
                  <PersonalRecords entries={recordEntries} />
                ) : (
                  <p className="text-sm text-muted-foreground border border-dashed border-border rounded-md p-4">
                    No records yet — complete a trip with a recorded route to
                    set your first personal record.
                  </p>
                )}
              </section>
            </div>
          </>
        )}

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card className="border-primary/20 bg-primary/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Plus className="h-5 w-5" />
                New Trip
              </CardTitle>
              <CardDescription>
                Plan your next outdoor adventure
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/trips/new" className="block">
                <Button className="w-full">Create Trip</Button>
              </Link>
            </CardContent>
          </Card>

          <Card className="border-emerald-500/20 bg-emerald-500/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <MapPin className="h-5 w-5 text-emerald-500" />
                Start Tracking
              </CardTitle>
              <CardDescription>
                Record GPS waypoints in real-time
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link href={analytics.activeTrips > 0 ? `/trips/${activeTripId(records)}` : '#'} className="block">
                <Button variant="outline" className="w-full" disabled={analytics.activeTrips === 0}>
                  {analytics.activeTrips > 0 ? 'Continue Tracking' : 'No Active Trip'}
                </Button>
              </Link>
            </CardContent>
          </Card>

          <Card className="border-purple-500/20 bg-purple-500/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Backpack className="h-5 w-5 text-purple-500" />
                Gear Check
              </CardTitle>
              <CardDescription>
                Manage your equipment and packing lists
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/gear" className="block">
                <Button variant="outline" className="w-full">Manage Gear</Button>
              </Link>
            </CardContent>
          </Card>
        </div>

        {/* Recent Trips */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Recent Adventures</CardTitle>
            <CardDescription>
              Your latest outdoor activities
            </CardDescription>
          </CardHeader>
          <CardContent>
            {trips.length === 0 ? (
              <div className="text-center py-8">
                <Mountain className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">No trips yet</h3>
                <p className="text-muted-foreground mb-4">
                  Start planning your first outdoor adventure
                </p>
                <Link href="/trips/new" className="block">
                  <Button>Create Your First Trip</Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-4">
                {trips.map((trip) => (
                  <div
                    key={trip.id}
                    className="flex items-center justify-between p-4 border border-border rounded-lg hover:bg-accent transition-colors"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-1">
                        <h4 className="font-semibold">{trip.title}</h4>
                        <Badge variant={
                          trip.status === 'active' ? 'success' :
                          trip.status === 'planned' ? 'warning' :
                          trip.status === 'completed' ? 'default' : 'destructive'
                        }>
                          {trip.status}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {trip.activityType}
                        </span>
                        {trip.plannedDate && (
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {new Date(trip.plannedDate).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                    <Link href={`/trips/${trip.id}`} className="block">
                      <Button variant="ghost" size="sm">View</Button>
                    </Link>
                  </div>
                ))}
                <Link href="/trips" className="block">
                  <Button variant="outline" className="w-full">View All Trips</Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  )
}

interface TripSummaryRow {
  id: string
  title: string
  status: TripStatus
  activityType: ActivityType
  plannedDate?: Date
}

function Metric({ icon, label, value, detail }: {
  icon: React.ReactNode
  label: string
  value: string
  detail: string
}) {
  return (
    <div className="bg-background px-4 py-4 flex flex-col justify-between gap-2">
      <dt className="flex items-center gap-1.5 text-xs text-muted-foreground uppercase tracking-wider">
        <span aria-hidden="true" className="text-primary/70">{icon}</span>
        {label}
      </dt>
      <dd>
        <span className="block text-2xl sm:text-3xl font-bold tabular-nums tracking-tight">{value}</span>
        <span className="block text-xs text-muted-foreground mt-1">{detail}</span>
      </dd>
    </div>
  )
}

/** "4 completed · 1 active · 2 planned" — only non-zero statuses, in reading order. */
function StatusLine({ analytics }: { analytics: TripAnalytics }) {
  const parts: string[] = []
  if (analytics.completedTrips > 0) parts.push(`${analytics.completedTrips} completed`)
  if (analytics.activeTrips > 0) parts.push(`${analytics.activeTrips} active`)
  if (analytics.plannedTrips > 0) parts.push(`${analytics.plannedTrips} planned`)
  if (analytics.cancelledTrips > 0) parts.push(`${analytics.cancelledTrips} cancelled`)
  if (parts.length === 0) return null
  return <>{parts.join(' · ')}</>
}

function activeTripId(records: TripActivityRecord[]): string {
  const active = records.find(r => r.status === 'active')
  return active?.tripId ?? ''
}

/**
 * All-time personal records → display entries, each linked to its source
 * trip. Records without qualifying real data (null) are omitted entirely —
 * no invalid or incomplete entries.
 */
function buildRecordEntries(allTime: TripAnalytics, records: TripActivityRecord[]): PersonalRecordEntry[] {
  const dateByTrip = new Map(records.map(r => [r.tripId, r.date]))
  const entries: PersonalRecordEntry[] = []
  const push = (
    key: PersonalRecordEntry['key'],
    label: string,
    value: string,
    ref: { tripId: string; title: string } | null,
  ) => {
    if (!ref) return
    entries.push({
      key,
      label,
      value,
      tripId: ref.tripId,
      tripTitle: ref.title,
      date: dateByTrip.get(ref.tripId) ?? null,
    })
  }
  if (allTime.longestTrip) {
    push('longest-trip', 'Longest distance', formatDistance(allTime.longestTrip.distance), allTime.longestTrip)
  }
  if (allTime.largestAscent) {
    push('largest-ascent', 'Largest ascent', `+${formatElevation(allTime.largestAscent.elevationGain)}`, allTime.largestAscent)
  }
  if (allTime.highestElevation) {
    push('highest-elevation', 'Highest elevation', formatElevation(allTime.highestElevation.elevation), allTime.highestElevation)
  }
  if (allTime.longestMovingTime) {
    push('longest-moving-time', 'Longest moving time', formatTime(allTime.longestMovingTime.movingSeconds), allTime.longestMovingTime)
  }
  return entries
}

function EmptyExpeditionLog() {
  return (
    <section aria-labelledby="empty-log-heading" className="mb-8">
      <div className="rounded-md border border-dashed border-border p-10 sm:p-14 text-center">
        <Mountain className="h-14 w-14 text-muted-foreground mx-auto mb-4" />
        <h2 id="empty-log-heading" className="text-lg font-semibold mb-2">
          No expeditions logged yet
        </h2>
        <p className="text-muted-foreground max-w-md mx-auto mb-6">
          Plan a trip and record a GPS route — your distance, moving time and
          elevation will appear here, measured from real recorded data.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Button href="/trips/new">
            <Plus className="h-4 w-4 mr-2" />
            Plan Your First Trip
          </Button>
          <Button href="/trips" variant="outline">
            <Route className="h-4 w-4 mr-2" />
            Browse Trips
          </Button>
        </div>
      </div>
    </section>
  )
}


