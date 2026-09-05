import { redirect } from 'next/navigation'
import { TripService } from '@/lib/domain/trips/service'
import { TripPackingService } from '@/lib/domain/gear/tripPacking'
import { GearService } from '@/lib/domain/gear/service'
import { PackingChecklist } from '@/components/gear/PackingChecklist'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { ArrowLeft } from 'lucide-react'
import { GEAR_CATEGORY_ORDER } from '@/types/domain'
import {
  togglePackedAction,
  removePackingItemAction,
  assignTemplateAction,
  addAdHocItemAction,
} from './actions'

export const dynamic = 'force-dynamic'

export default async function TripPackingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  let tripTitle: string
  let items: Awaited<ReturnType<typeof TripPackingService.getPackingItems>>
  let templates: Awaited<ReturnType<typeof GearService.getAllGearTemplates>>
  try {
    const trip = await TripService.getTripById(id)
    tripTitle = trip.title
    ;[items, templates] = await Promise.all([
      TripPackingService.getPackingItems(id),
      GearService.getAllGearTemplates(),
    ])
  } catch (error) {
    if (error instanceof Error && error.message === 'User not authenticated') redirect('/login')
    console.error('Failed to load packing page:', error)
    redirect(`/trips/${id}`)
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="container mx-auto px-4 py-6 max-w-2xl">
        <Button href={`/trips/${id}`} variant="ghost" className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          {tripTitle}
        </Button>
        <h1 className="text-2xl font-bold mb-6">Packing Checklist</h1>

        <PackingChecklist
          tripId={id}
          initialItems={items}
          onToggle={togglePackedAction}
          onRemove={removePackingItemAction}
        />

        <div className="mt-8 space-y-6">
          <AssignTemplate tripId={id} templates={templates} />
          <AddAdHocItem tripId={id} />
        </div>
      </div>
    </main>
  )
}

function AssignTemplate({
  tripId,
  templates,
}: {
  tripId: string
  templates: Awaited<ReturnType<typeof GearService.getAllGearTemplates>>
}) {
  async function assign(formData: FormData) {
    'use server'
    const templateId = String(formData.get('templateId') ?? '')
    if (!templateId) return
    await assignTemplateAction(tripId, templateId)
  }

  if (templates.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Assign a gear template</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            You have no gear templates yet.{' '}
            <Button href="/gear" variant="link" className="h-auto p-0 text-sm underline">Create one first</Button>.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Assign a gear template</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={assign} className="flex flex-col sm:flex-row gap-3">
          <select
            name="templateId"
            aria-label="Gear template"
            className="flex h-10 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            defaultValue=""
          >
            <option value="" disabled>
              Choose a template…
            </option>
            {templates.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          <Button type="submit" variant="outline">Assign to trip</Button>
        </form>
        <p className="mt-2 text-xs text-muted-foreground">
          Items are copied into this trip. Later changes to the template won&apos;t affect this list.
        </p>
      </CardContent>
    </Card>
  )
}

function AddAdHocItem({ tripId }: { tripId: string }) {
  async function add(formData: FormData) {
    'use server'
    const itemName = String(formData.get('itemName') ?? '').trim()
    if (!itemName) return
    const category = String(formData.get('category') ?? '')
    const quantity = formData.get('quantity') ? Number(formData.get('quantity')) : undefined
    const weight = formData.get('weight') ? Number(formData.get('weight')) : undefined
    const required = formData.get('required') === 'on'
    await addAdHocItemAction(tripId, {
      itemName,
      category: category || undefined,
      quantity,
      weight,
      required,
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Add item directly</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={add} className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <Input name="itemName" placeholder="Item name" aria-label="Item name" maxLength={100} required className="flex-1" />
            <select
              name="category"
              aria-label="Category"
              className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              defaultValue=""
            >
              <option value="">No category</option>
              {GEAR_CATEGORY_ORDER.map(c => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            <Input name="quantity" type="number" min={1} max={999} placeholder="Qty" aria-label="Quantity" className="w-24" />
            <Input name="weight" type="number" min={0} placeholder="Weight (g)" aria-label="Weight in grams" className="w-32" />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="required" className="h-4 w-4" />
              Required
            </label>
            <Button type="submit" className="ml-auto">Add</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}