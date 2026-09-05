import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { MapPin } from 'lucide-react'

export default function TripNotFound() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="container mx-auto px-4 py-8 max-w-xl">
        <Card>
          <CardHeader className="text-center">
            <MapPin className="h-12 w-12 text-muted-foreground mx-auto mb-3" aria-hidden="true" />
            <CardTitle>Trip not found</CardTitle>
            <CardDescription>This trip does not exist or you do not have access to it.</CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center gap-3">
            <Button href="/trips">Back to trips</Button>
            <Button href="/trips/new" variant="outline">Create a trip</Button>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
