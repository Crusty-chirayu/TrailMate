'use client'

import { useEffect, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { useTracking } from '@/lib/hooks/useTracking'
import { Button } from '@/components/ui/Button'
import StatusIndicator from '@/components/tracking/StatusIndicator'
import MetricReadout from '@/components/tracking/MetricReadout'
import TrackingControls from '@/components/tracking/TrackingControls'
import TrackingMap from '@/components/tracking/TrackingMap'
import RouteImportButton from '@/components/tracking/RouteImportButton'
import { formatDistance, formatSpeed, formatTime, formatElevation } from '@/lib/tracking/format'

interface TrackingDashboardProps {
  tripId: string
  tripTitle: string
  userId: string
}

export default function TrackingDashboard({ tripId, tripTitle, userId }: TrackingDashboardProps) {
  const {
    points,
    session,
    stats,
    status,
    syncState,
    online,
    start,
    pause,
    resume,
    finish,
    retrySession,
    retrySync,
    retryCompletion,
    serverCompletion,
    importRoutePoints,
    canStart,
    canRetry,
    canPause,
    canResume,
    canFinish,
    isRecording,
    isPaused,
  } = useTracking(tripId, { userId, tripTitle })

  // A timestamp captured inside the interval effect (never during render) so
  // the live elapsed clock stays pure with respect to rendering. The first
  // update is deferred to a task so we never call setState synchronously
  // inside the effect body.
  const [nowMs, setNowMs] = useState<number | null>(null)
  useEffect(() => {
    if (!isRecording) {
      const t0 = setTimeout(() => setNowMs(null), 0)
      return () => clearTimeout(t0)
    }
    const update = () => setNowMs(Date.now())
    const t1 = setTimeout(update, 0)
    const id = setInterval(update, 1000)
    return () => {
      clearTimeout(t1)
      clearInterval(id)
    }
  }, [isRecording])

  const current = session?.lastPosition
    ? { latitude: session.lastPosition.latitude, longitude: session.lastPosition.longitude }
    : undefined

  // Live elapsed clock while recording, otherwise frozen at the last fix.
  const liveElapsed =
    isRecording && session?.lastPosition && nowMs !== null && nowMs > session.lastPosition.timestamp
      ? stats.elapsedTime + (nowMs - session.lastPosition.timestamp) / 1000
      : stats.elapsedTime

  const mapPoints = points.map(p => ({ latitude: p.latitude, longitude: p.longitude }))

  return (
    <main className="min-h-screen bg-background text-foreground">
      {/* Live region announces state changes to assistive tech. */}
      <div aria-live="polite" className="sr-only">
        {status === 'tracking' ? 'Recording in progress' : `Status: ${status}`}
      </div>

      <div className="container mx-auto max-w-7xl px-4 py-6">
        {/* Header */}
        <div className="mb-5">
          <Button href={`/trips/${tripId}`} variant="ghost" size="sm" className="-ml-2 mb-3">
            <ArrowLeft className="mr-1 h-4 w-4" aria-hidden />
            Back to trip
          </Button>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold sm:text-3xl">{tripTitle}</h1>
              <StatusIndicator
                status={status}
                syncState={syncState}
                online={online}
                accuracy={session?.lastPosition?.accuracy}
                pointCount={points.length}
                className="mt-2"
              />
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          {/* Map workspace */}
          <section aria-label="Route map" className="order-1 lg:order-none">
            <div className="h-[52vh] overflow-hidden rounded-lg border border-border lg:h-[70vh]">
              <TrackingMap points={mapPoints} current={current} />
            </div>
          </section>

          {/* Instrument panel */}
          <section aria-label="Tracking instruments" className="order-2 space-y-4 lg:order-none">
            {/* Primary metrics */}
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border">
              <MetricReadout label="Distance" value={formatDistance(stats.distance)} className="bg-card" accent />
              <MetricReadout label="Elapsed" value={formatTime(liveElapsed)} className="bg-card" />
              <MetricReadout label="Avg speed" value={formatSpeed(stats.averageSpeed)} className="bg-card" />
              <MetricReadout label="Current" value={formatSpeed(stats.currentSpeed)} className="bg-card" />
            </div>

            {/* Elevation detail */}
            <div className="rounded-lg border border-border bg-card p-4">
              <h2 className="mb-3 text-xs uppercase tracking-widest text-muted-foreground">Elevation</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Gain</div>
                  <div className="font-mono text-lg tabular-nums">{formatElevation(stats.elevationGain)}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Loss</div>
                  <div className="font-mono text-lg tabular-nums">{formatElevation(stats.elevationLoss)}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">High</div>
                  <div className="font-mono text-lg tabular-nums">{formatElevation(stats.highestElevation)}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Low</div>
                  <div className="font-mono text-lg tabular-nums">{formatElevation(stats.lowestElevation)}</div>
                </div>
              </div>
              {!stats.hasElevation && (
                <p className="mt-3 text-xs text-muted-foreground">
                  No altitude reported by your device — elevation is not estimated.
                </p>
              )}
            </div>

            {/* Moving time */}
            <div className="flex items-center justify-between rounded-lg border border-border bg-card p-4">
              <span className="text-xs uppercase tracking-widest text-muted-foreground">Moving time</span>
              <span className="font-mono text-lg tabular-nums">{formatTime(stats.movingTime)}</span>
            </div>

            {/* Route import */}
            <div className="rounded-lg border border-border bg-card p-4">
              <h2 className="mb-3 text-xs uppercase tracking-widest text-muted-foreground">Import route</h2>
              <RouteImportButton tripId={tripId} onQueued={importRoutePoints} />
            </div>

            {/* Controls */}
            <div className="rounded-lg border border-border bg-card p-4">
              <TrackingControls
                canStart={canStart}
                canRetry={canRetry}
                canPause={canPause}
                canResume={canResume}
                canFinish={canFinish}
                isRecording={isRecording}
                onStart={() => void start()}
                onRetry={retrySession}
                onPause={pause}
                onResume={resume}
                onFinish={() => void finish()}
              />
              {isPaused && (
                <p className="mt-3 text-xs text-muted-foreground">
                  Recording paused. Your route and statistics are preserved.
                </p>
              )}
              {serverCompletion === 'pending' && (
                <div className="mt-3 flex items-center justify-between gap-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-3">
                  <p className="text-xs text-amber-300">
                    Trip finished locally. Server completion is pending — points are safe.
                  </p>
                  <Button variant="outline" size="sm" onClick={() => void retryCompletion()}>
                    Retry finish
                  </Button>
                </div>
              )}
              {serverCompletion === 'error' && (
                <p className="mt-3 text-xs text-destructive" role="alert">
                  Sign-in is required to finish this trip on the server. Local data is preserved.
                </p>
              )}
              {syncState === 'failed' && (
                <div className="mt-3 flex items-center justify-between gap-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-3">
                  <p className="text-xs text-amber-300">
                    Sync is paused after repeated failures. Your points are safe locally.
                  </p>
                  <Button variant="outline" size="sm" onClick={retrySync}>
                    Retry sync
                  </Button>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}