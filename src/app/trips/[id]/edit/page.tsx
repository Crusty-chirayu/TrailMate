import { redirect, notFound } from 'next/navigation'
import { TripService } from '@/lib/domain/trips/service'
import { validateTripInput } from '@/lib/domain/trips/validation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { ArrowLeft } from 'lucide-react'

export const dynamic = 'force-dynamic'

function toDateInputValue(date?: Date): string {
  if (!date) return ''
  return date.toISOString().slice(0, 10)
}

function formatKm(meters?: number): string {
  if (meters == null) return ''
  return (meters / 1000).toString()
}

export default async function TripEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const trip = await loadTrip(id)

  async function updateTripAction(formData: FormData) {
    'use server'
    const title = String(formData.get('title') ?? '').trim()
    const activityType = String(formData.get('activityType') ?? '').trim()
    const description = String(formData.get('description') ?? '')
    const plannedDateRaw = String(formData.get('plannedDate') ?? '')
    const estimatedDistanceRaw = String(formData.get('estimatedDistance') ?? '')
    const estimatedElevationGainRaw = String(formData.get('estimatedElevationGain') ?? '')
    const estimatedDurationRaw = String(formData.get('estimatedDuration') ?? '')
    const difficulty = String(formData.get('difficulty') ?? '')
    const visibility = String(formData.get('visibility') ?? '')

    const validation = validateTripInput(
      {
        title,
        activityType,
        description: description || null,
        plannedDate: plannedDateRaw || null,
        estimatedDistance: estimatedDistanceRaw || null,
        estimatedElevationGain: estimatedElevationGainRaw || null,
        estimatedDuration: estimatedDurationRaw || null,
        difficulty: difficulty || null,
        visibility: visibility || null,
      },
      { isUpdate: true },
    )
    if (!validation.valid) {
      throw new Error(validation.errors.join('; '))
    }

    const updates: Parameters<typeof TripService.updateTrip>[1] = {}

    // Only send fields that were present in the form; empty string means clear nullable fields where allowed
    // Title and activity are required, so always send
    updates.title = title
    updates.activityType = activityType as Parameters<typeof TripService.updateTrip>[1]['activityType']

    // Description: empty means clear (null), non-empty is the trimmed value
    if (description === '') updates.description = null
    else if (description !== '') updates.description = description
    else updates.description = null // form always sends string; treat empty as null

    // Planned date: empty clears, otherwise parse
    if (plannedDateRaw === '') updates.plannedDate = null
    else if (plannedDateRaw) {
      const d = new Date(plannedDateRaw)
      if (isNaN(d.getTime())) throw new Error('Planned date is invalid')
      updates.plannedDate = d
    }

    // Estimated distance: empty means omitted? For edit we treat empty as null to clear, but spec says distinguish omitted vs null vs 0
    // Here the edit form distinguishes: empty string → null (clear), "0" → 0, omitted is not possible because field always present.
    if (estimatedDistanceRaw === '') updates.estimatedDistance = null
    else if (estimatedDistanceRaw) {
      const km = parseFloat(estimatedDistanceRaw)
      if (!Number.isFinite(km) || km < 0) throw new Error('Estimated distance must be a non-negative number')
      updates.estimatedDistance = km * 1000
    }

    if (estimatedElevationGainRaw === '') updates.estimatedElevationGain = null
    else if (estimatedElevationGainRaw) {
      const v = parseFloat(estimatedElevationGainRaw)
      if (!Number.isFinite(v) || v < 0) throw new Error('Estimated elevation gain must be non-negative')
      updates.estimatedElevationGain = v
    }

    if (estimatedDurationRaw === '') updates.estimatedDuration = null
    else if (estimatedDurationRaw) {
      const v = parseInt(estimatedDurationRaw, 10)
      if (!Number.isFinite(v) || v < 0) throw new Error('Estimated duration must be non-negative')
      updates.estimatedDuration = v
    }

    if (difficulty === '') updates.difficulty = null
    else if (difficulty) updates.difficulty = difficulty as Parameters<typeof TripService.updateTrip>[1]['difficulty']

    if (visibility) updates.visibility = visibility as Parameters<typeof TripService.updateTrip>[1]['visibility']

    try {
      await TripService.updateTrip(id, updates)
    } catch (error) {
      if (error instanceof Error && (error as unknown as { digest?: string }).digest?.startsWith('NEXT_REDIRECT')) throw error
      console.error('Failed to update trip:', error)
      throw new Error(error instanceof Error ? error.message : 'Failed to update trip')
    }

    redirect(`/trips/${id}`)
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <Button href={`/trips/${id}`} variant="ghost" className="mb-4" aria-label="Back to trip details">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to trip
        </Button>
        <h1 className="text-3xl font-bold mb-2">Edit trip</h1>
        <p className="text-muted-foreground mb-8">Update the trip details. Changes preserve all other fields.</p>

        <Card>
          <CardHeader>
            <CardTitle>Trip details</CardTitle>
            <CardDescription>Edit the fields you want to change.</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={updateTripAction} className="space-y-6">
              <div className="space-y-2">
                <label htmlFor="title" className="text-sm font-medium">
                  Trip title *
                </label>
                <Input id="title" name="title" defaultValue={trip.title} required aria-label="Trip title" maxLength={160} />
              </div>

              <div className="space-y-2">
                <label htmlFor="activityType" className="text-sm font-medium">
                  Activity type *
                </label>
                <select
                  id="activityType"
                  name="activityType"
                  defaultValue={trip.activityType}
                  className="w-full px-4 py-2 rounded-md border border-input bg-background text-sm"
                  required
                  aria-label="Activity type"
                >
                  <option value="trekking">Trekking</option>
                  <option value="cycling">Cycling</option>
                  <option value="camping">Camping</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div className="space-y-2">
                <label htmlFor="description" className="text-sm font-medium">
                  Description
                </label>
                <textarea
                  id="description"
                  name="description"
                  defaultValue={trip.description ?? ''}
                  placeholder="Describe your adventure..."
                  className="w-full px-4 py-2 rounded-md border border-input bg-background text-sm min-h-[100px]"
                  aria-label="Trip description"
                  maxLength={5000}
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="plannedDate" className="text-sm font-medium">
                  Planned date
                </label>
                <Input id="plannedDate" name="plannedDate" type="date" defaultValue={toDateInputValue(trip.plannedDate)} aria-label="Planned date" />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label htmlFor="estimatedDistance" className="text-sm font-medium">
                    Estimated distance (km)
                  </label>
                  <Input
                    id="estimatedDistance"
                    name="estimatedDistance"
                    type="number"
                    step="0.1"
                    min="0"
                    defaultValue={formatKm(trip.estimatedDistance)}
                    placeholder="e.g., 15.5"
                    aria-label="Estimated distance in kilometers"
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="estimatedElevationGain" className="text-sm font-medium">
                    Elevation gain (m)
                  </label>
                  <Input
                    id="estimatedElevationGain"
                    name="estimatedElevationGain"
                    type="number"
                    step="1"
                    min="0"
                    defaultValue={trip.estimatedElevationGain != null ? String(trip.estimatedElevationGain) : ''}
                    placeholder="e.g., 1200"
                    aria-label="Estimated elevation gain in meters"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label htmlFor="estimatedDuration" className="text-sm font-medium">
                    Estimated duration (minutes)
                  </label>
                  <Input
                    id="estimatedDuration"
                    name="estimatedDuration"
                    type="number"
                    step="1"
                    min="0"
                    defaultValue={trip.estimatedDuration != null ? String(trip.estimatedDuration) : ''}
                    placeholder="e.g., 240"
                    aria-label="Estimated duration in minutes"
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="difficulty" className="text-sm font-medium">
                    Difficulty
                  </label>
                  <select
                    id="difficulty"
                    name="difficulty"
                    defaultValue={trip.difficulty ?? ''}
                    className="w-full px-4 py-2 rounded-md border border-input bg-background text-sm"
                    aria-label="Difficulty"
                  >
                    <option value="">Not set</option>
                    <option value="easy">Easy</option>
                    <option value="moderate">Moderate</option>
                    <option value="hard">Hard</option>
                    <option value="expert">Expert</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="visibility" className="text-sm font-medium">
                  Visibility
                </label>
                <select
                  id="visibility"
                  name="visibility"
                  defaultValue={trip.visibility}
                  className="w-full px-4 py-2 rounded-md border border-input bg-background text-sm"
                  aria-label="Visibility"
                >
                  <option value="private">Private</option>
                  <option value="shared">Shared</option>
                  <option value="public">Public</option>
                </select>
              </div>

              <div className="flex gap-4 pt-4">
                <Button type="submit" className="flex-1" aria-label="Save trip changes">
                  Save changes
                </Button>
                <Button href={`/trips/${id}`} variant="outline" aria-label="Cancel editing">
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}

async function loadTrip(id: string) {
  try {
    return await TripService.getTripById(id)
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (message.includes('No rows') || message.includes('PGRST116') || message.includes('not found')) notFound()
    if (message === 'User not authenticated') redirect('/login')
    console.error('Failed to load trip for edit:', error)
    throw error
  }
}
