import { redirect } from 'next/navigation'
import { GearService } from '@/lib/domain/gear/service'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { ArrowLeft, Plus, Package } from 'lucide-react'
import { validateTemplateInput } from '@/lib/domain/gear/validation'

export default async function GearPage() {
  let templates: Awaited<ReturnType<typeof GearService.getAllGearTemplates>> = []
  let loadError: string | null = null
  try {
    templates = await GearService.getAllGearTemplates()
  } catch (error) {
    if (error instanceof Error && error.message === 'User not authenticated') redirect('/login')
    console.error('Failed to load gear templates:', error)
    loadError = 'Unable to load your gear templates. Please try again.'
  }

  async function createTemplate(formData: FormData) {
    'use server'
    const name = String(formData.get('name') ?? '')
    const description = String(formData.get('description') ?? '')
    const validation = validateTemplateInput({ name, description })
    if (!validation.valid) throw new Error(validation.errors.join('; '))
    await GearService.createGearTemplate({ name, description: description || undefined })
    redirect('/gear')
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="container mx-auto px-4 py-8 max-w-3xl">
        <Button href="/dashboard" variant="ghost" className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold">Gear</h1>
            <p className="text-muted-foreground">Reusable packing lists for your expeditions</p>
          </div>
        </div>

        {/* Create template */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Plus className="h-4 w-4" />
              New gear template
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form action={createTemplate} className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1 space-y-3">
                <Input name="name" placeholder="e.g. Weekend Hike" required aria-label="Template name" maxLength={100} />
                <Input name="description" placeholder="Description (optional)" aria-label="Template description" maxLength={500} />
              </div>
              <Button type="submit" className="sm:self-end">
                Create
              </Button>
            </form>
          </CardContent>
        </Card>

        {loadError && (
          <p className="mb-6 rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive" role="alert">
            {loadError}
          </p>
        )}

        {!loadError && templates.length === 0 && (
          <div className="rounded-md border border-dashed border-border p-10 text-center">
            <Package className="mx-auto h-8 w-8 text-muted-foreground/50 mb-3" aria-hidden="true" />
            <p className="font-medium mb-1">No gear templates yet</p>
            <p className="text-sm text-muted-foreground">
              Create your first list above — e.g. &ldquo;Day Hike&rdquo; or &ldquo;Winter Expedition&rdquo;.
            </p>
          </div>
        )}

        {templates.length > 0 && (
          <ul className="space-y-3">
            {templates.map(template => (
              <li key={template.id}>
                <a
                  href={`/gear/${template.id}`}
                  className="block rounded-md border border-border p-4 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{template.name}</p>
                      {template.description && (
                        <p className="text-sm text-muted-foreground truncate">{template.description}</p>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(template.updatedAt).toLocaleDateString()}
                    </span>
                  </div>
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  )
}