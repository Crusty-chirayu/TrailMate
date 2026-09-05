'use client'

// GPX export: builds the document client-side from the already-fetched route
// data (no extra server round-trip) and triggers a file download. Falls back to
// an error message rather than pretending the export succeeded.

import { useState, useCallback } from 'react'
import { buildGpx, gpxFilename } from '@/lib/domain/tracking/gpx'
import type { RouteHistoryPoint } from '@/lib/domain/tracking/routeStats'
import { Button } from '@/components/ui/Button'
import { Download } from 'lucide-react'

interface GpxExportButtonProps {
  points: RouteHistoryPoint[]
  tripTitle: string
}

export default function GpxExportButton({ points, tripTitle }: GpxExportButtonProps) {
  const [error, setError] = useState<string | null>(null)

  const handleExport = useCallback(() => {
    setError(null)
    try {
      const gpx = buildGpx(points, { name: tripTitle, description: 'Recorded with TrailMate' })
      const blob = new Blob([gpx], { type: 'application/gpx+xml;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = gpxFilename(tripTitle)
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(url)
    } catch {
      setError('Could not generate the GPX file. Please try again.')
    }
  }, [points, tripTitle])

  return (
    <div>
      <Button variant="outline" size="sm" onClick={handleExport} aria-label={`Export ${tripTitle} route as GPX`}>
        <Download className="h-4 w-4 mr-2" aria-hidden />
        Export GPX
      </Button>
      {error && (
        <p className="mt-2 text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}