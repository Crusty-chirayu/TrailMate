import { redirect } from 'next/navigation'
import { TripService } from '@/lib/domain/trips/service'
import { validateTripInput } from '@/lib/domain/trips/validation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { ArrowLeft, MapPin } from 'lucide-react'
import type { ActivityType } from '@/types/domain'

export default function NewTripPage() {
  async function createTrip(formData: FormData) {
    'use server'

    const title = String(formData.get('title') ?? '').trim()
    const activityType = String(formData.get('activityType') ?? '').trim() as ActivityType
    const description = String(formData.get('description') ?? '')
    const plannedDate = String(formData.get('plannedDate') ?? '')
    const estimatedDistance = String(formData.get('estimatedDistance') ?? '')

    const validation = validateTripInput(
      {
        title,
        activityType,
        description: description || null,
        plannedDate: plannedDate || null,
        estimatedDistance: estimatedDistance || null,
      },
      { isUpdate: false },
    )
    if (!validation.valid) {
      throw new Error(validation.errors.join('; '))
    }

    let planned: Date | undefined
    if (plannedDate) {
      planned = new Date(plannedDate)
      if (isNaN(planned.getTime())) throw new Error('Planned date is invalid')
    }

    let distance: number | undefined
    if (estimatedDistance) {
      const km = parseFloat(estimatedDistance)
      if (!Number.isFinite(km) || km < 0) throw new Error('Estimated distance must be a non-negative number')
      distance = km * 1000
    }

    // Creation errors are not redirect errors, so redirect is outside the catch
    try {
      await TripService.createTrip({
        title,
        activityType,
        description: description || undefined,
        plannedDate: planned,
        estimatedDistance: distance,
      })
    } catch (error) {
      // Re-throw redirect so Next.js can handle it; do not swallow
      if (error instanceof Error && (error as unknown as { digest?: string }).digest?.startsWith('NEXT_REDIRECT')) throw error
      console.error('Failed to create trip:', error)
      throw new Error(error instanceof Error ? error.message : 'Failed to create trip')
    }

    redirect('/trips')
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        {/* Header */}
        <div className="mb-8">
          <Button href="/trips" variant="ghost" className="mb-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Trips
          </Button>
          <h1 className="text-3xl font-bold mb-2">Plan New Adventure</h1>
          <p className="text-muted-foreground">
            Create a new trip and start planning your outdoor experience
          </p>
        </div>

        {/* Form */}
        <Card>
          <CardHeader>
            <CardTitle>Trip Details</CardTitle>
            <CardDescription>
              Enter the basic information for your new adventure
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={createTrip} className="space-y-6">
              {/* Title */}
              <div className="space-y-2">
                <label htmlFor="title" className="text-sm font-medium">
                  Trip Title *
                </label>
                <Input
                  id="title"
                  name="title"
                  placeholder="e.g., Summer Trekking Expedition"
                  required
                />
              </div>

              {/* Activity Type */}
              <div className="space-y-2">
                <label htmlFor="activityType" className="text-sm font-medium">
                  Activity Type *
                </label>
                <select
                  id="activityType"
                  name="activityType"
                  className="w-full px-4 py-2 rounded-md border border-input bg-background text-sm"
                  required
                  aria-describedby="activityType-help"
                >
                  <option value="">Select activity type</option>
                  <option value="trekking">Trekking</option>
                  <option value="cycling">Cycling</option>
                  <option value="camping">Camping</option>
                  <option value="other">Other</option>
                </select>
                <p id="activityType-help" className="text-xs text-muted-foreground">
                  Choose from the supported activity types.
                </p>
              </div>

              {/* Description */}
              <div className="space-y-2">
                <label htmlFor="description" className="text-sm font-medium">
                  Description
                </label>
                <textarea
                  id="description"
                  name="description"
                  placeholder="Describe your adventure..."
                  className="w-full px-4 py-2 rounded-md border border-input bg-background text-sm min-h-[100px]"
                />
              </div>

              {/* Planned Date */}
              <div className="space-y-2">
                <label htmlFor="plannedDate" className="text-sm font-medium">
                  Planned Date
                </label>
                <Input
                  id="plannedDate"
                  name="plannedDate"
                  type="date"
                />
              </div>

              {/* Estimated Distance */}
              <div className="space-y-2">
                <label htmlFor="estimatedDistance" className="text-sm font-medium">
                  Estimated Distance (km)
                </label>
                <Input
                  id="estimatedDistance"
                  name="estimatedDistance"
                  type="number"
                  step="0.1"
                  min="0"
                  placeholder="e.g., 15.5"
                />
              </div>

              {/* Actions */}
              <div className="flex gap-4 pt-4">
                <Button type="submit" className="flex-1">
                  <MapPin className="h-4 w-4 mr-2" />
                  Create Trip
                </Button>
                <Button href="/trips" variant="outline">Cancel</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
