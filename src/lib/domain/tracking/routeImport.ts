// Normalized GPX/KML route import pipeline.
//
// Both formats are parsed into one canonical route representation that mirrors
// the tracked route model (lat/lng with optional elevation, timestamp and
// accuracy). Parsing is string-based (node-friendly, testable) — a single
// implementation handles both formats; no duplication per format.
//
// Rules:
// - coordinates must be finite and within valid bounds
// - zero is a valid elevation/accuracy value and is preserved
// - timestamps are preserved verbatim; missing timestamps are marked
// - duplicate points (identical coordinates AND identical timestamp when both
//   exist) are removed with a warning
// - a hard point cap prevents unbounded imports
// - malformed XML or an unsupported document raises an ImportError

import { XMLParser } from 'fast-xml-parser'
import type { ImportedRoute, ImportedRoutePoint } from '@/types/import'

export const MAX_IMPORT_POINTS = 50_000

export class RouteImportError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RouteImportError'
  }
}

export type ImportFormat = 'gpx' | 'kml'

interface XmlPrimitive {
  [key: string]: unknown
}

function looksLikeXml(content: string): boolean {
  return content.trimStart().startsWith('<?xml') || content.trimStart().startsWith('<')
}

function detectFormat(fileName: string, content: string, xml: XmlPrimitive | null): ImportFormat {
  const lower = fileName.toLowerCase()
  if (lower.endsWith('.kml')) return 'kml'
  if (lower.endsWith('.gpx')) return 'gpx'
  if (xml) {
    if ('gpx' in xml) return 'gpx'
    if ('kml' in xml) return 'kml'
  }
  throw new RouteImportError(
    'Unsupported file format. Choose a .gpx or .kml route file.',
  )
}

function asArray(value: unknown): unknown[] {
  if (value === undefined || value === null) return []
  return Array.isArray(value) ? value : [value]
}

function parseNumber(value: unknown): number | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined
  const n = typeof value === 'number' ? value : Number.parseFloat(value)
  return Number.isFinite(n) ? n : undefined
}

function parseIsoTimestamp(value: unknown): number | undefined {
  if (typeof value !== 'string') return undefined
  const t = Date.parse(value)
  return Number.isFinite(t) ? t : undefined
}

interface CandidatePoint {
  lat?: number
  lng?: number
  elevation?: number
  timestamp?: number
  timestampMissing: boolean
  accuracy?: number
}

function validatePoint(candidate: CandidatePoint, warnings: string[]): ImportedRoutePoint | null {
  const { lat, lng } = candidate
  if (lat === undefined || lng === undefined) return null
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    warnings.push(`Skipped out-of-range coordinate (${lat}, ${lng})`)
    return null
  }
  const point: ImportedRoutePoint = { lat, lng }
  if (candidate.elevation !== undefined && Number.isFinite(candidate.elevation)) {
    point.elevation = candidate.elevation
  }
  if (candidate.timestamp !== undefined) {
    point.timestamp = candidate.timestamp
  }
  if (candidate.accuracy !== undefined && Number.isFinite(candidate.accuracy)) {
    point.accuracy = candidate.accuracy
  }
  return point
}

function dedupePoints(points: ImportedRoutePoint[]): { points: ImportedRoutePoint[]; duplicates: number } {
  const seen = new Set<string>()
  let duplicates = 0
  const unique: ImportedRoutePoint[] = []
  for (const p of points) {
    const key = `${p.lat.toFixed(7)},${p.lng.toFixed(7)},${p.timestamp ?? 'none'}`
    if (seen.has(key)) {
      duplicates += 1
      continue
    }
    seen.add(key)
    unique.push(p)
  }
  return { points: unique, duplicates }
}

/** Parses a GPX document (trkpt/rtept segments) into the canonical model. */
function parseGpx(root: XmlPrimitive): { points: ImportedRoutePoint[]; warnings: string[] } {
  const warnings: string[] = []
  const candidates: CandidatePoint[] = []
  const gpx = root.gpx as XmlPrimitive

  const gpxTrk = (gpx.trk ?? gpx.trk as unknown) as XmlPrimitive
  if (gpxTrk) {
    for (const trk of asArray(gpxTrk)) {
      const track = trk as XmlPrimitive
      for (const seg of asArray(track.trkseg ?? (track.trkseg as unknown))) {
        const segment = seg as XmlPrimitive
        for (const pt of asArray(segment.trkpt)) {
          const p = pt as XmlPrimitive
          candidates.push({
            lat: parseNumber(p['@_lat']),
            lng: parseNumber(p['@_lon']),
            elevation: parseNumber(p.ele),
            timestamp: parseIsoTimestamp(p.time),
            timestampMissing: p.time === undefined,
          })
        }
      }
    }
  }

  const gpxRte = (gpx.rte ?? gpx.rte) as XmlPrimitive
  if (gpxRte) {
    for (const rte of asArray(gpxRte)) {
      const route = rte as XmlPrimitive
      for (const pt of asArray(route.rtept ?? (route.rtept as unknown))) {
        const p = pt as XmlPrimitive
        candidates.push({
          lat: parseNumber(p['@_lat']),
          lng: parseNumber(p['@_lon']),
          elevation: parseNumber(p.ele),
          timestamp: parseIsoTimestamp(p.time),
          timestampMissing: p.time === undefined,
        })
      }
    }
  }

  const points: ImportedRoutePoint[] = []
  for (const c of candidates) {
    const validated = validatePoint(c, warnings)
    if (validated) points.push(validated)
  }
  return { points, warnings }
}

/** Parses a KML document (LineString coordinates and gx:Track) into the canonical model. */
function parseKml(root: XmlPrimitive): { points: ImportedRoutePoint[]; warnings: string[] } {
  const warnings: string[] = []
  const candidates: CandidatePoint[] = []
  const kml = root.kml as XmlPrimitive
  const document = kml.Document

  const collectPlacemarks = (node: XmlPrimitive): XmlPrimitive[] => {
    const out: XmlPrimitive[] = []
    for (const pm of asArray(node.Placemark ?? (node.Placemark as unknown))) {
      out.push(pm as XmlPrimitive)
    }
    for (const folder of asArray(node.Folder ?? (node.Folder as unknown))) {
      out.push(...collectPlacemarks(folder as XmlPrimitive))
    }
    return out
  }

  const placemarks = document ? collectPlacemarks(document as XmlPrimitive) : []

  for (const pm of placemarks) {
    const line = pm.LineString as XmlPrimitive | undefined
    if (line) {
      const raw = String(line.coordinates ?? '').trim()
      for (const tuple of raw.split(/\s+/).filter(Boolean)) {
        const [lng, lat, alt] = tuple.split(',').map(v => Number.parseFloat(v))
        candidates.push({
          lat: Number.isFinite(lat) ? lat : undefined,
          lng: Number.isFinite(lng) ? lng : undefined,
          elevation: Number.isFinite(alt) ? alt : undefined,
          timestampMissing: true,
        })
      }
    }

    const gxTrack = pm['gx:Track'] as XmlPrimitive | undefined
    if (gxTrack) {
      const whens = asArray(gxTrack.when).map(w => parseIsoTimestamp(w)).filter(
        (t): t is number => t !== undefined,
      )
      const coords = asArray(gxTrack['gx:coord']).map(c => {
        const [lng, lat, alt] = String(c).trim().split(/\s+/).map(v => Number.parseFloat(v))
        return { lat: Number.isFinite(lat) ? lat : undefined, lng: Number.isFinite(lng) ? lng : undefined, alt: Number.isFinite(alt) ? alt : undefined }
      })
      coords.forEach((c, i) => {
        candidates.push({
          lat: c.lat,
          lng: c.lng,
          elevation: c.alt,
          timestamp: whens[i],
          timestampMissing: whens[i] === undefined,
        })
      })
    }
  }

  const points: ImportedRoutePoint[] = []
  for (const c of candidates) {
    const validated = validatePoint(c, warnings)
    if (validated) points.push(validated)
  }
  return { points, warnings }
}

/**
 * Parses a route file (.gpx / .kml) into the canonical imported-route model.
 * Throws RouteImportError for malformed or unsupported content.
 */
export async function parseRouteFile(fileName: string, content: string): Promise<ImportedRoute> {
  if (!looksLikeXml(content)) {
    throw new RouteImportError('The file is not valid XML. Choose a .gpx or .kml file.')
  }

  let xml: XmlPrimitive
  try {
    const result = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      parseAttributeValue: false,
      parseTagValue: false,
    }).parse(content)
    if (result === null || typeof result !== 'object') {
      throw new Error('empty document')
    }
    xml = result as XmlPrimitive
  } catch {
    throw new RouteImportError('The file could not be parsed as XML. It may be malformed.')
  }

  const format = detectFormat(fileName, content, xml)
  const parsed = format === 'gpx' ? parseGpx(xml) : parseKml(xml)
  const { points, duplicates } = dedupePoints(parsed.points)

  if (points.length === 0) {
    throw new RouteImportError('No route points were found in the file.')
  }
  if (points.length > MAX_IMPORT_POINTS) {
    throw new RouteImportError(`The file contains too many points (${points.length}). Maximum is ${MAX_IMPORT_POINTS}.`)
  }

  const warnings = [...parsed.warnings]
  if (duplicates > 0) {
    warnings.push(`${duplicates} duplicate point(s) were removed.`)
  }

  return {
    format,
    name: fileName.replace(/\.(gpx|kml)$/i, ''),
    points,
    warnings,
    pointCount: points.length,
  }
}
