import { Card, CardContent } from '@/components/ui/Card'

export default function TripsLoading() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="container mx-auto px-4 py-8">
        <div className="h-8 w-48 bg-muted animate-pulse rounded mb-8" aria-hidden="true" />
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
          {Array.from({ length: 5 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="pt-6">
                <div className="h-8 w-12 bg-muted animate-pulse rounded" aria-hidden="true" />
                <div className="h-4 w-16 bg-muted animate-pulse rounded mt-2" aria-hidden="true" />
              </CardContent>
            </Card>
          ))}
        </div>
        <p className="sr-only">Loading trips…</p>
        <div className="space-y-4" aria-hidden="true">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-24 bg-muted animate-pulse rounded-md" />
          ))}
        </div>
      </div>
    </main>
  )
}
