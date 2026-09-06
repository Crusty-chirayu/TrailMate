import { redirect, notFound } from 'next/navigation'
import { TripService } from '@/lib/domain/trips/service'
import { TripPackingService } from '@/lib/domain/gear/tripPacking'
import { formatWeight } from '@/lib/domain/gear/progress'
import { Progress } from '@/components/ui/Progress'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import DeleteTripButton from '@/components/trips/DeleteTripButton'
import { ArrowLeft, MapPin, Calendar, Mountain, Clock, Activity, Edit, Play } from 'lucide-react'
import type { Trip } from '@/types/domain'

export const dynamic = 'force-dynamic'

export default async function TripDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  let trip: Trip | null = null

  try {
    trip = await TripService.getTripById(id)
  } catch (error) {
    // Ownership or auth failure: treat missing as notFound for correct semantics
    const message = error instanceof Error ? error.message : ''
    if (message.includes('not found') || message.includes('No rows') || message.includes('PGRST116')) {
      notFound()
    }
    console.error('Failed to fetch trip:', error)
    // If user is not authenticated, redirect to login (fail-closed)
    if (message === 'User not authenticated') redirect('/login')
    throw error
  }

  if (!trip) {
    notFound()
  }

  async function deleteTripWithForm(formData: FormData) {
    'use server'
    const tripId = String(formData.get('tripId') ?? id)
    try {
      await TripService.deleteTrip(tripId)
    } catch (error) {
      if (error instanceof Error && (error as unknown as { digest?: string }).digest?.startsWith('NEXT_REDIRECT')) throw error
      console.error('Failed to delete trip:', error)
      throw new Error(error instanceof Error ? error.message : 'Failed to delete trip')
    }
    redirect('/trips')
  }

  async function startTripAction() {
    'use server'
    try {
      await TripService.startTrip(id)
    } catch (error) {
      if (error instanceof Error && (error as unknown as { digest?: string }).digest?.startsWith('NEXT_REDIRECT')) throw error
      console.error('Failed to start trip:', error)
      throw new Error(error instanceof Error ? error.message : 'Failed to start trip')
    }
    redirect(`/trips/${id}`)
  }

  async function completeTrip() {
    'use server'
    try {
      await TripService.completeTrip(id)
    } catch (error) {
      if (error instanceof Error && (error as unknown as { digest?: string }).digest?.startsWith('NEXT_REDIRECT')) throw error
      console.error('Failed to complete trip:', error)
      throw new Error(error instanceof Error ? error.message : 'Failed to complete trip')
    }
    redirect(`/trips/${id}`)
  }

  const statusColors = {
    planned: 'warning',
    active: 'success',
    completed: 'default',
    cancelled: 'destructive',
  } as const

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Header */}
        <div className="mb-8">
          <Button href="/trips" variant="ghost" className="mb-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Trips
          </Button>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h1 className="text-3xl font-bold mb-2">{trip.title}</h1>
              <div className="flex items-center gap-3">
                <Badge variant={statusColors[trip.status]}>
                  {trip.status}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  {trip.activityType}
                </span>
              </div>
            </div>
            <div className="flex gap-2">
              {trip.status === 'planned' && (
                <form action={startTripAction}>
                  <Button type="submit" aria-label={`Start trip ${trip.title}`}>
                    <Play className="h-4 w-4 mr-2" />
                    Start Trip
                  </Button>
                </form>
              )}
              {trip.status === 'planned' && (
                <Button href={`/trips/${id}/track`} variant="outline" aria-label={`Open GPS tracker for ${trip.title}`}>
                  <Play className="h-4 w-4 mr-2" />
                  Tracker
                </Button>
              )}
              {trip.status === 'active' && (
                <form action={completeTrip}>
                  <Button type="submit" variant="outline" aria-label={`Complete trip ${trip.title}`}>
                    Complete Trip
                  </Button>
                </form>
              )}
              <Button href={`/trips/${id}/edit`} variant="outline" size="icon" aria-label={`Edit trip ${trip.title}`}>
                <Edit className="h-4 w-4" />
              </Button>
              <DeleteTripButton tripId={id} tripTitle={trip.title} userId={trip.userId} onDelete={deleteTripWithForm} />
            </div>
          </div>
        </div>

        {/* Trip Details */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {/* Overview Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-5 w-5" />
                Trip Overview
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {trip.description && (
                <div>
                  <h3 className="text-sm font-medium mb-1">Description</h3>
                  <p className="text-sm text-muted-foreground">{trip.description}</p>
                </div>
              )}
              {trip.plannedDate && (
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">
                    Planned: {new Date(trip.plannedDate).toLocaleDateString()}
                  </span>
                </div>
              )}
              {trip.estimatedDistance && (
                <div className="flex items-center gap-2">
                  <Mountain className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">
                    Distance: {(trip.estimatedDistance / 1000).toFixed(1)} km
                  </span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Stats Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Statistics
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">
                  Created: {new Date(trip.createdAt).toLocaleDateString()}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">
                  Status: {trip.status}
                </span>
              </div>
              {trip.estimatedDuration && (
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">
                    Estimated Duration: {trip.estimatedDuration} hours
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Route Tracking Card */}
        {trip.status === 'active' && (
          <Card className="mb-6 border-primary/20 bg-primary/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Play className="h-5 w-5 text-primary" />
                Active Tracking
              </CardTitle>
              <CardDescription>
                Your trip is currently being tracked
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground">
                  GPS tracking is active for this trip
                </div>
                <Button href={`/trips/${trip.id}/track`} variant="outline" size="sm">
                  Open GPS Tracker
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Route History Card */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Route History</CardTitle>
            <CardDescription>
              Recorded GPS track and statistics for this trip
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button href={`/trips/${trip.id}/route`} variant="outline" size="sm">
              View recorded route
            </Button>
          </CardContent>
        </Card>

        {/* Gear Card */}
        <GearCard tripId={trip.id} />
      </div>
    </main>
  )
}

async function GearCard({ tripId }: { tripId: string }) {
  let progress: Awaited<ReturnType<typeof TripPackingService.getPackingProgress>> | null = null
  try {
    progress = await TripPackingService.getPackingProgress(tripId)
  } catch (error) {
    console.error('Failed to load packing progress:', error)
  }

  if (!progress) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Gear Checklist</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Unable to load packing status.</p>
        </CardContent>
      </Card>
    )
  }

  if (progress.totalItems === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Gear Checklist</CardTitle>
          <CardDescription>No packing list yet</CardDescription>
        </CardHeader>
        <CardContent>
          <Button href={`/trips/${tripId}/pack`} variant="outline" size="sm">
            Build packing list
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Gear Checklist</CardTitle>
        <CardDescription className="tabular-nums">
          {progress.packedItems} / {progress.totalItems} packed ·{' '}
          {progress.requiredItems - progress.requiredPacked} required remaining
          {progress.totalWeight > 0 && <> · {formatWeight(progress.packedWeight)} packed</>}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Progress value={progress.percentage} className="mb-3" />
        <Button href={`/trips/${tripId}/pack`} size="sm">
          {progress.percentage === 100 ? 'View checklist' : 'Continue packing'}
        </Button>
      </CardContent>
    </Card>
  )
}
