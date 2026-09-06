// Pure KML 2.2 export builder for recorded route points.
// Produces a standalone <kml> document with a single LineString — no I/O,
// fully testable. Altitude is emitted in the coordinate triple only when
// present; nothing is invented.

import type { RouteHistoryPoint } from './routeStats'
import { escapeXml } from './gpx'

const KML_HEADER =
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<kml xmlns="http://www.opengis.net/kml/2.2">\n'

function formatCoordinate(value: number): string {
  return value.toFixed(7)
}

export interface KmlMetadata {
  name: string
  description?: string
}

/**
 * Builds a KML document (LineString) from chronologically ordered points.
 * KML coordinates are "lon,lat,alt" triples; altitude is omitted from the
 * triple when absent so KML consumers do not read a fabricated value of 0.
 */
export function buildKml(points: ReadonlyArray<RouteHistoryPoint>, metadata: KmlMetadata): string {
  const parts: string[] = [KML_HEADER]
  parts.push('  <Document>\n')
  parts.push(`    <name>${escapeXml(metadata.name)}</name>\n`)
  if (metadata.description) {
    parts.push(`    <description>${escapeXml(metadata.description)}</description>\n`)
  }
  parts.push('    <Placemark>\n')
  parts.push(`      <name>${escapeXml(metadata.name)}</name>\n`)
  parts.push('      <LineString>\n')
  parts.push('        <coordinates>\n')
  for (const point of points) {
    const alt =
      point.elevation !== undefined && Number.isFinite(point.elevation)
        ? `,${point.elevation.toFixed(2)}`
        : ''
    parts.push(
      `          ${formatCoordinate(point.lng)},${formatCoordinate(point.lat)}${alt}\n`,
    )
  }
  parts.push('        </coordinates>\n')
  parts.push('      </LineString>\n')
  parts.push('    </Placemark>\n')
  parts.push('  </Document>\n')
  parts.push('</kml>\n')
  return parts.join('')
}

/** Sanitizes a title into a safe KML file name. */
export function kmlFilename(title: string): string {
  const clean = title
    .trim()
    .replace(/[^a-z0-9._-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
  return `${clean || 'route'}.kml`
}
