'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { clearLocalTripData } from '@/lib/tracking/localCleanup'

function isRedirectError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'digest' in error &&
    typeof (error as { digest: string }).digest === 'string' &&
    (error as { digest: string }).digest.startsWith('NEXT_REDIRECT')
  )
}

export default function DeleteTripButton({
  tripId,
  tripTitle,
  userId,
  onDelete,
}: {
  tripId: string
  tripTitle: string
  userId: string
  onDelete: (formData: FormData) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)
  const router = useRouter()

  useEffect(() => {
    if (open) {
      // Focus confirm for keyboard users, but allow tab to cancel; initial focus on cancel is safer for destructive action
      cancelRef.current?.focus()
    }
  }, [open])

  const handleConfirm = async () => {
    setLoading(true)
    setError(null)
    try {
      const formData = new FormData()
      formData.set('tripId', tripId)
      await onDelete(formData)
      // Server action will redirect; if it does not throw redirect, navigate to list
      void clearLocalTripData(tripId, userId)
      router.push('/trips')
    } catch (e) {
      if (isRedirectError(e)) throw e
      setError(e instanceof Error ? e.message : 'Failed to delete trip')
      setLoading(false)
    }
  }

  // Close on Escape is handled via dialog's key; also support explicit cancel
  if (!open) {
    return (
      <Button variant="destructive" size="icon" aria-label={`Delete trip ${tripTitle}`} onClick={() => setOpen(true)}>
        <Trash2 className="h-4 w-4" />
      </Button>
    )
  }

  return (
    <>
      <Button variant="destructive" size="icon" aria-label={`Delete trip ${tripTitle}`} onClick={() => setOpen(true)}>
        <Trash2 className="h-4 w-4" />
      </Button>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-trip-title"
        aria-describedby="delete-trip-desc"
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        onClick={() => !loading && setOpen(false)}
        onKeyDown={e => {
          if (e.key === 'Escape' && !loading) setOpen(false)
        }}
      >
        <div
          className="w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-lg"
          onClick={e => e.stopPropagation()}
        >
          <h2 id="delete-trip-title" className="text-lg font-semibold mb-2">
            Delete trip?
          </h2>
          <p id="delete-trip-desc" className="text-sm text-muted-foreground mb-4">
            This will permanently delete <span className="font-medium text-foreground">{tripTitle}</span> and its route data. This action cannot be undone.
          </p>
          {error && (
            <p role="alert" className="mb-4 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-3">
            <Button
              ref={cancelRef}
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={loading}
              aria-label="Cancel deletion"
            >
              Cancel
            </Button>
            <Button
              ref={confirmRef}
              variant="destructive"
              onClick={handleConfirm}
              disabled={loading}
              aria-label={`Confirm delete ${tripTitle}`}
            >
              {loading ? 'Deleting…' : 'Delete'}
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}
