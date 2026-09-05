import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { TripService } from '@/lib/domain/trips/service'
import type { Trip } from '@/types/domain'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Mountain, MapPin, Calendar, Plus, Backpack } from 'lucide-react'
import Link from 'next/link'

export default async function Home() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Fetch trip data
  let trips: Trip[] = []
  let tripCount = 0
  let activeTrips = 0
  let plannedTrips = 0
  let completedTrips = 0

  try {
    trips = await TripService.getAllTrips()
    tripCount = trips.length
    activeTrips = trips.filter(t => t.status === 'active').length
    plannedTrips = trips.filter(t => t.status === 'planned').length
    completedTrips = trips.filter(t => t.status === 'completed').length
  } catch (error) {
    // Handle case where Supabase is not configured
    console.log('Supabase not configured, using mock data')
  }

  const recentTrips = trips.slice(0, 3)

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">Welcome back, {user.email}</h1>
          <p className="text-muted-foreground">
            Your outdoor adventure companion for trip planning and GPS tracking.
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Trips</CardTitle>
              <Mountain className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{tripCount}</div>
              <p className="text-xs text-muted-foreground">
                All adventures
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active</CardTitle>
              <MapPin className="h-4 w-4 text-emerald-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{activeTrips}</div>
              <p className="text-xs text-muted-foreground">
                Currently tracking
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Planned</CardTitle>
              <Calendar className="h-4 w-4 text-amber-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{plannedTrips}</div>
              <p className="text-xs text-muted-foreground">
                Upcoming adventures
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Completed</CardTitle>
              <Backpack className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{completedTrips}</div>
              <p className="text-xs text-muted-foreground">
                Finished journeys
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card className="border-primary/20 bg-primary/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
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
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-5 w-5 text-emerald-500" />
                Start Tracking
              </CardTitle>
              <CardDescription>
                Record GPS waypoints in real-time
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link href={activeTrips > 0 ? `/trips/${trips.find(t => t.status === 'active')?.id}` : '#'} className="block">
                <Button variant="outline" className="w-full" disabled={activeTrips === 0}>
                  {activeTrips > 0 ? 'Continue Tracking' : 'No Active Trip'}
                </Button>
              </Link>
            </CardContent>
          </Card>

          <Card className="border-purple-500/20 bg-purple-500/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
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
            <CardTitle>Recent Adventures</CardTitle>
            <CardDescription>
              Your latest outdoor activities
            </CardDescription>
          </CardHeader>
          <CardContent>
            {recentTrips.length === 0 ? (
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
                {recentTrips.map((trip) => (
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
