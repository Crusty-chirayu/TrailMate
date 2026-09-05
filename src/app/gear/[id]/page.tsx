import { redirect } from 'next/navigation'
import { GearService } from '@/lib/domain/gear/service'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { ArrowLeft, Plus } from 'lucide-react'
import { validateItemInput, normalizeCategory } from '@/lib/domain/gear/validation'
import { GEAR_CATEGORY_ORDER } from '@/types/domain'
import { formatWeight, computePackingProgress } from '@/lib/domain/gear/progress'

export default async function GearTemplatePage({ params }: { params: { id: string } }) {
  let template: Awaited<ReturnType<typeof GearService.getGearTemplateById>> | null = null
  let items: Awaited<ReturnType<typeof GearService.getGearItemsByTemplateId>> = []
  try {
    template = await GearService.getGearTemplateById(params.id)
    items = await GearService.getGearItemsByTemplateId(params.id)
  } catch (error) {
    console.error('Failed to load template:', error)
    redirect('/gear')
  }

  async function deleteItem(formData: FormData) {
    'use server'
    await GearService.deleteGearItem(String(formData.get('itemId')))
    redirect(`/gear/${params.id}`)
  }

  async function deleteTemplate() {
    'use server'
    await GearService.deleteGearTemplate(params.id)
    redirect('/gear')
  }

  const progress = computePackingProgress(
    items.map(i => ({
      category: i.category,
      quantity: i.quantity,
      weight: i.weight,
      required: i.required,
      packed: i.checked,
    })),
  )

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="container mx-auto px-4 py-8 max-w-3xl">
        <Button href="/gear" variant="ghost" className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Gear
        </Button>
        <div className="flex items-start justify-between mb-2">
          <div>
            <h1 className="text-3xl font-bold">{template.name}</h1>
            {template.description && <p className="text-muted-foreground mt-1">{template.description}</p>}
          </div>
          <form action={deleteTemplate}>
            <Button type="submit" variant="outline" size="sm">
              Delete template
            </Button>
          </form>
        </div>
        <p className="text-sm text-muted-foreground mb-8 tabular-nums">
          {progress.totalItems} items
          {progress.totalWeight > 0 && <> · {formatWeight(progress.totalWeight)} total</>}
          {' · '}
          {items.filter(i => i.required).length} required
        </p>
        <AddItemForm templateId={params.id} />
        <ItemsList templateId={params.id} items={items} deleteItem={deleteItem} />
      </div>
    </main>
  )
}

function AddItemForm({ templateId }: { templateId: string }) {
  async function addItem(formData: FormData) {
    'use server'
    const itemName = String(formData.get('itemName') ?? '')
    const category = String(formData.get('category') ?? '')
    const quantity = formData.get('quantity') ? Number(formData.get('quantity')) : null
    const weight = formData.get('weight') ? Number(formData.get('weight')) : null
    const required = formData.get('required') === 'on'
    const notes = String(formData.get('notes') ?? '')

    const validation = validateItemInput({ itemName, category, quantity, weight, notes })
    if (!validation.valid) throw new Error(validation.errors.join('; '))

    await GearService.createGearItem({
      templateId,
      itemName,
      category: normalizeCategory(category),
      quantity: quantity ?? undefined,
      weight: weight ?? undefined,
      required,
      notes: notes || undefined,
    })
    redirect(`/gear/${templateId}`)
  }

  return (
    <Card className="mb-8">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Plus className="h-4 w-4" />
          Add item
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form action={addItem} className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Input name="itemName" placeholder="Item name" required aria-label="Item name" maxLength={100} className="col-span-2" />
            <select
              name="category"
              aria-label="Category"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              defaultValue=""
            >
              <option value="">No category</option>
              {GEAR_CATEGORY_ORDER.map(c => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
            <Input name="quantity" type="number" min={1} max={999} placeholder="Qty" aria-label="Quantity" defaultValue={1} />
            <Input name="weight" type="number" min={0} step="1" placeholder="Weight (g)" aria-label="Weight in grams per unit" />
            <label className="flex items-center gap-2 text-sm col-span-2 self-center">
              <input type="checkbox" name="required" className="h-4 w-4" />
              Required item
            </label>
          </div>
          <div className="flex gap-3">
            <Input name="notes" placeholder="Notes (optional)" aria-label="Notes" maxLength={500} className="flex-1" />
            <Button type="submit">Add</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

function ItemsList({
  templateId,
  items,
  deleteItem,
}: {
  templateId: string
  items: Awaited<ReturnType<typeof GearService.getGearItemsByTemplateId>>
  deleteItem: (formData: FormData) => Promise<void>
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border p-10 text-center">
        <p className="font-medium mb-1">No items in this template</p>
        <p className="text-sm text-muted-foreground">Add your first item above.</p>
      </div>
    )
  }

  return (
    <ul className="divide-y divide-border rounded-md border border-border">
      {items.map(item => (
        <li key={item.id} className="flex items-center gap-3 px-3 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate">
              {item.itemName}
              {item.quantity > 1 && <span className="text-muted-foreground font-normal"> ×{item.quantity}</span>}
            </p>
            <p className="text-xs text-muted-foreground">
              {[item.category, item.weight != null ? formatWeight(item.weight * item.quantity) : null, item.notes]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
          {item.required && (
            <Badge variant="warning" className="shrink-0">
              Required
            </Badge>
          )}
          <form action={deleteItem} className="shrink-0">
            <input type="hidden" name="itemId" value={item.id} />
            <Button type="submit" variant="ghost" size="sm" aria-label={`Remove ${item.itemName}`}>
              Remove
            </Button>
          </form>
        </li>
      ))}
    </ul>
  )
}