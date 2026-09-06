'use client'

// GPX/KML export: builds the document client-side from the already-fetched route
// data (no extra server round-trip) and triggers a file download. Falls back to
// an error message rather than pretending the export succeeded.

import { useState, useCallback } from 'react'
import { buildGpx, gpxFilename } from '@/lib/domain/tracking/gpx'
import { buildKml, kmlFilename } from '@/lib/domain/tracking/kml'
import type { RouteHistoryPoint } from '@/lib/domain/tracking/routeStats'
import { Button } from '@/components/ui/Button'
import { Download } from 'lucide-react'

interface GpxExportButtonProps {
  points: RouteHistoryPoint[]
  tripTitle: string
  /** Formats to offer; defaults to GPX only for backwards compatibility. */
  formats?: Array<'gpx' | 'kml'>
}

export default function GpxExportButton({ points, tripTitle, formats = ['gpx'] }: GpxExportButtonProps) {
  const [error, setError] = useState<string | null>(null)

  const handleExport = useCallback(
    (format: 'gpx' | 'kml') => {
      setError(null)
      try {
        const content =
          format === 'gpx'
            ? buildGpx(points, { name: tripTitle, description: 'Recorded with TrailMate' })
            : buildKml(points, { name: tripTitle, description: 'Recorded with TrailMate' })
        const blob = new Blob([content], { type: 'application/octet-stream' })
        const url = URL.createObjectURL(blob)
        const anchor = document.createElement('a')
        anchor.href = url
        anchor.download = format === 'gpx' ? gpxFilename(tripTitle) : kmlFilename(tripTitle)
        document.body.appendChild(anchor)
        anchor.click()
        anchor.remove()
        URL.revokeObjectURL(url)
      } catch {
        setError('Could not generate the export file. Please try again.')
      }
    },
    [points, tripTitle],
  )

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {formats.map(format => (
          <Button
            key={format}
            variant="outline"
            size="sm"
            onClick={() => handleExport(format)}
            aria-label={`Export ${tripTitle} route as ${format.toUpperCase()}`}
          >
            <Download className="h-4 w-4 mr-2" aria-hidden />
            Export {format.toUpperCase()}
          </Button>
        ))}
      </div>
      {error && (
        <p className="mt-2 text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
