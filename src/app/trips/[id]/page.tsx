import { redirect } from 'next/navigation'
import { TripService } from '@/lib/domain/trips/service'
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
        <Card>
          <CardHeader>
            <CardTitle>Gear Checklist</CardTitle>
            <CardDescription>
              Required equipment for this trip
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8 text-muted-foreground">
              <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-sm">Gear integration coming soon</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
