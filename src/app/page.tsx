import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function Home() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-4xl font-bold mb-4">Welcome to TrailMate</h1>
        <p className="text-muted-foreground mb-8">
          Your outdoor adventure companion for trip planning and GPS tracking.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="p-6 bg-card rounded-lg border border-border">
            <h2 className="text-xl font-semibold mb-2">Plan Trips</h2>
            <p className="text-muted-foreground text-sm">
              Create and manage your outdoor adventures with detailed planning tools.
            </p>
          </div>

          <div className="p-6 bg-card rounded-lg border border-border">
            <h2 className="text-xl font-semibold mb-2">Track Routes</h2>
            <p className="text-muted-foreground text-sm">
              Record GPS waypoints in real-time and analyze your routes.
            </p>
          </div>

          <div className="p-6 bg-card rounded-lg border border-border">
            <h2 className="text-xl font-semibold mb-2">Manage Gear</h2>
            <p className="text-muted-foreground text-sm">
              Organize equipment and ensure you're prepared for every adventure.
            </p>
          </div>
        </div>

        <div className="mt-8 p-4 bg-primary/10 rounded-lg border border-primary/20">
          <p className="text-sm text-primary">
            Authentication system implemented. Ready for data layer implementation.
          </p>
        </div>
      </div>
    </main>
  )
}
