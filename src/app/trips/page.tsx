import { redirect } from 'next/navigation'
import { TripService } from '@/lib/domain/trips/service'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Mountain, MapPin, Calendar, Plus, Filter } from 'lucide-react'
import Link from 'next/link'
import type { TripStatus, ActivityType } from '@/types/domain'

export default async function TripsPage({
  searchParams,
}: {
  searchParams: { status?: string, activity?: string, search?: string }
}) {
  const { status, activity, search } = searchParams
  const trips = await TripService.getAllTrips()

  // Filter trips based on search params
  const filteredTrips = trips.filter(trip => {
    if (status && trip.status !== status) return false
    if (activity && trip.activityType !== activity) return false
    if (search && !trip.title.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const statusCounts = {
    total: trips.length,
    planned: trips.filter(t => t.status === 'planned').length,
    active: trips.filter(t => t.status === 'active').length,
    completed: trips.filter(t => t.status === 'completed').length,
    cancelled: trips.filter(t => t.status === 'cancelled').length,
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold mb-2">Your Adventures</h1>
            <p className="text-muted-foreground">
              Manage your outdoor trips and expeditions
            </p>
          </div>
          <Button href="/trips/new">
            <Plus className="h-4 w-4 mr-2" />
            New Trip
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{statusCounts.total}</div>
              <div className="text-sm text-muted-foreground">Total</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-amber-500">{statusCounts.planned}</div>
              <div className="text-sm text-muted-foreground">Planned</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-emerald-500">{statusCounts.active}</div>
              <div className="text-sm text-muted-foreground">Active</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-primary">{statusCounts.completed}</div>
              <div className="text-sm text-muted-foreground">Completed</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-destructive">{statusCounts.cancelled}</div>
              <div className="text-sm text-muted-foreground">Cancelled</div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1">
                <Input
                  placeholder="Search trips..."
                  defaultValue={search}
                  className="max-w-sm"
                />
              </div>
              <div className="flex gap-2">
                <select
                  className="px-4 py-2 rounded-md border border-input bg-background text-sm"
                  defaultValue={status}
                >
                  <option value="">All Status</option>
                  <option value="planned">Planned</option>
                  <option value="active">Active</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
                <select
                  className="px-4 py-2 rounded-md border border-input bg-background text-sm"
                  defaultValue={activity}
                >
                  <option value="">All Activities</option>
                  <option value="trekking">Trekking</option>
                  <option value="cycling">Cycling</option>
                  <option value="camping">Camping</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Trip List */}
        {filteredTrips.length === 0 ? (
          <Card>
            <CardContent className="pt-12 text-center">
              <Mountain className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">No trips found</h3>
              <p className="text-muted-foreground mb-6">
                {trips.length === 0
                  ? "Start planning your first outdoor adventure"
                  : "Try adjusting your filters or search terms"}
              </p>
              {trips.length === 0 && (
                <Button href="/trips/new">
                  <Plus className="h-4 w-4 mr-2" />
                  Create Your First Trip
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {filteredTrips.map((trip) => (
              <Card key={trip.id} className="hover:border-primary/50 transition-colors">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <CardTitle className="text-xl">{trip.title}</CardTitle>
                        <Badge variant={
                          trip.status === 'active' ? 'success' :
                          trip.status === 'planned' ? 'warning' :
                          trip.status === 'completed' ? 'default' : 'destructive'
                        }>
                          {trip.status}
                        </Badge>
                      </div>
                      <CardDescription className="flex items-center gap-4">
                        <span className="flex items-center gap-1">
                          <MapPin className="h-4 w-4" />
                          {trip.activityType}
                        </span>
                        {trip.plannedDate && (
                          <span className="flex items-center gap-1">
                            <Calendar className="h-4 w-4" />
                            {new Date(trip.plannedDate).toLocaleDateString()}
                          </span>
                        )}
                        {trip.estimatedDistance && (
                          <span className="flex items-center gap-1">
                            <Mountain className="h-4 w-4" />
                            {(trip.estimatedDistance / 1000).toFixed(1)} km
                          </span>
                        )}
                      </CardDescription>
                    </div>
                    <div className="flex gap-2">
                      <Button 
                        href={`/trips/${trip.id}`}
                        variant="outline"
                        size="sm"
                      >
                        View Details
                      </Button>
                    </div>
                  </div>
                </CardHeader>
              </Card>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
