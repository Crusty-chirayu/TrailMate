// Pure GPX 1.1 export builder for recorded route points.
// Produces a standalone <gpx> document string — no I/O, fully testable.
// Missing altitude is simply omitted from <ele>; nothing is invented.

import type { RouteHistoryPoint } from './routeStats'

const GPX_HEADER =
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<gpx version="1.1" creator="TrailMate" xmlns="http://www.topografix.com/GPX/1/1">\n'

/** Escapes XML special characters in text/metadata content. */
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function formatCoordinate(value: number): string {
  return value.toFixed(7)
}

export interface GpxMetadata {
  name: string
  description?: string
}

/**
 * Builds a GPX 1.1 track document from chronologically ordered points.
 * Points without altitude simply omit <ele>; timestamps are always emitted
 * when present, as GPX consumers rely on <time> for playback.
 */
export function buildGpx(
  points: ReadonlyArray<RouteHistoryPoint>,
  metadata: GpxMetadata,
): string {
  const parts: string[] = [GPX_HEADER]

  parts.push('  <metadata>\n')
  parts.push(`    <name>${escapeXml(metadata.name)}</name>\n`)
  if (metadata.description) {
    parts.push(`    <desc>${escapeXml(metadata.description)}</desc>\n`)
  }
  if (points.length > 0) {
    const first = points[0]
    const last = points[points.length - 1]
    parts.push(`    <time>${first.recordedAt.toISOString()}</time>\n`)
    parts.push(
      `    <bounds minlat="${formatCoordinate(Math.min(...points.map(p => p.lat)))}" minlon="${formatCoordinate(Math.min(...points.map(p => p.lng)))}" maxlat="${formatCoordinate(Math.max(...points.map(p => p.lat)))}" maxlon="${formatCoordinate(Math.max(...points.map(p => p.lng)))}"/>\n`,
    )
    void last
  }
  parts.push('  </metadata>\n')

  parts.push('  <trk>\n')
  parts.push(`    <name>${escapeXml(metadata.name)}</name>\n`)
  parts.push('    <trkseg>\n')
  for (const point of points) {
    const attrs = [`lat="${formatCoordinate(point.lat)}"`, `lon="${formatCoordinate(point.lng)}"`]
    parts.push(`      <trkpt ${attrs.join(' ')}>\n`)
    if (point.elevation !== undefined && Number.isFinite(point.elevation)) {
      parts.push(`        <ele>${point.elevation.toFixed(2)}</ele>\n`)
    }
    parts.push(`        <time>${point.recordedAt.toISOString()}</time>\n`)
    parts.push('      </trkpt>\n')
  }
  parts.push('    </trkseg>\n')
  parts.push('  </trk>\n')
  parts.push('</gpx>\n')

  return parts.join('')
}

/** Suggested filename for a GPX download, sanitized of unsafe characters. */
export function gpxFilename(name: string): string {
  const safe = name
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase()
  return `${safe || 'trailmate-route'}.gpx`
}