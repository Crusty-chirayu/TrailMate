'use client'

// GPX/KML route import.
//
// Parses the file through the shared normalized pipeline, persists via the
// RLS-protected server action, and falls back to the durable local queue when
// the server is unreachable so an import never silently loses points.

import { useRef, useState } from 'react'
import { Upload, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { parseRouteFile, RouteImportError } from '@/lib/domain/tracking/routeImport'
import { importRouteAction } from '@/app/trips/[id]/track/actions'

const MAX_FILE_BYTES = 20 * 1024 * 1024

interface RouteImportButtonProps {
  tripId: string
  onQueued: (input: {
    format: 'gpx' | 'kml'
    fileName: string
    points: { lat: number; lng: number; elevation?: number; timestamp?: number; accuracy?: number }[]
  }) => Promise<{ queued: number; existing: boolean }>
}

export default function RouteImportButton({ tripId, onQueued }: RouteImportButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  const reset = () => {
    if (inputRef.current) inputRef.current.value = ''
  }

  const handleFile = async (file: File) => {
    setBusy(true)
    setMessage(null)
    setWarnings([])
    setError(null)
    try {
      if (file.size > MAX_FILE_BYTES) {
        throw new RouteImportError('File is too large (max 20 MB).')
      }
      const content = await file.text()
      const route = await parseRouteFile(file.name, content)

      const result = await importRouteAction(tripId, route.format, route.name, route.points)
      if (result.ok) {
        setMessage(`${result.imported} point(s) imported.`)
      } else if (result.error?.includes('User not authenticated')) {
        setError('Sign in is required to import a route.')
      } else {
        // Server unreachable: fall back to the durable local queue.
        const queued = await onQueued({ format: route.format, fileName: file.name, points: route.points })
        if (queued.existing) {
          setMessage('This file was already imported.')
        } else {
          setMessage(`${queued.queued} point(s) queued locally — will sync when online.`)
        }
      }
      if (route.warnings.length > 0) setWarnings(route.warnings)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to import route.')
    } finally {
      setBusy(false)
      reset()
    }
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept=".gpx,.kml,application/gpx+xml,application/vnd.google-earth.kml+xml"
        className="sr-only"
        id="route-import-input"
        aria-label="Choose a GPX or KML route file"
        onChange={e => {
          const file = e.target.files?.[0]
          if (file) void handleFile(file)
        }}
      />
      <Button
        size="sm"
        variant="outline"
        disabled={busy}
        aria-busy={busy}
        aria-controls="route-import-input"
        onClick={() => inputRef.current?.click()}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Upload className="h-4 w-4" aria-hidden />}
        {busy ? 'Importing…' : 'Import GPX / KML'}
      </Button>
      {message && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-emerald-400" role="status">
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
          {message}
        </p>
      )}
      {error && (
        <p className="mt-2 text-xs text-destructive" role="alert">
          <AlertTriangle className="mr-1 inline h-3.5 w-3.5" aria-hidden />
          {error}
        </p>
      )}
      {warnings.length > 0 && (
        <ul className="mt-2 list-disc pl-4 text-xs text-muted-foreground">
          {warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
