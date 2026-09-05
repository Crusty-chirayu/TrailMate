'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'

export default function TripsError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('Trips error boundary:', error)
  }, [error])

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="container mx-auto px-4 py-8 max-w-xl">
        <Card>
          <CardHeader>
            <CardTitle>Unable to load trips</CardTitle>
            <CardDescription>Something went wrong while loading your trips. Please try again.</CardDescription>
          </CardHeader>
          <CardContent className="flex gap-3">
            <Button onClick={() => reset()}>Try again</Button>
            <Button href="/trips" variant="outline">Back to trips</Button>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
