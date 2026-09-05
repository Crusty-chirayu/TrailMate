import { redirect } from 'next/navigation'
import { TripService } from '@/lib/domain/trips/service'
import { TripPackingService } from '@/lib/domain/gear/tripPacking'
import { formatWeight } from '@/lib/domain/gear/progress'
import { Progress } from '@/components/ui/Progress'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { ArrowLeft, MapPin, Calendar, Mountain, Clock, Activity, Edit, Trash2, Play } from 'lucide-react'
import type { Trip, TripStatus } from '@/types/domain'

export default async function TripDetailPage({
  params,
}: {
  params: { id: string }
}) {
  let trip: Trip | null = null

  try {
    trip = await TripService.getTripById(params.id)
  } catch (error) {
    console.error('Failed to fetch trip:', error)
    redirect('/trips')
  }

  if (!trip) {
    redirect('/trips')
  }

  async function deleteTrip() {
    'use server'
    try {
      await TripService.deleteTrip(params.id)
      redirect('/trips')
    } catch (error) {
      console.error('Failed to delete trip:', error)
      throw new Error('Failed to delete trip')
    }
  }

  async function completeTrip() {
    'use server'
    try {
      await TripService.updateTrip(params.id, { status: 'completed' as const })
      redirect(`/trips/${params.id}`)
    } catch (error) {
      console.error('Failed to complete trip:', error)
      throw new Error('Failed to complete trip')
    }
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
                <Button href={`/trips/${params.id}/track`}>
                  <Play className="h-4 w-4 mr-2" />
                  Start Tracking
                </Button>
              )}
              {trip.status === 'active' && (
                <form action={completeTrip}>
                  <Button type="submit" variant="outline">
                    Complete Trip
                  </Button>
                </form>
              )}
              <Button variant="outline" size="icon">
                <Edit className="h-4 w-4" />
              </Button>
              <form action={deleteTrip}>
                <Button type="submit" variant="destructive" size="icon">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </form>
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
