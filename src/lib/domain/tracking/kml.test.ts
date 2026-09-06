import { describe, it, expect } from 'vitest'
import { buildKml, kmlFilename } from './kml'
import type { RouteHistoryPoint } from './routeStats'

function point(lat: number, lng: number, elevation?: number): RouteHistoryPoint {
  return { lat, lng, elevation, recordedAt: new Date('2026-09-06T10:00:00Z') }
}

describe('KML export', () => {
  it('produces a KML document with a LineString in lon,lat,alt order', () => {
    const doc = buildKml([point(51.5, -0.09, 100), point(51.51, -0.08)], { name: 'Loop' })
    expect(doc).toContain('<kml xmlns="http://www.opengis.net/kml/2.2">')
    expect(doc).toContain('<LineString>')
    expect(doc).toContain('-0.0900000,51.5000000,100.00')
    expect(doc).toContain('-0.0800000,51.5100000')
  })

  it('omits altitude from the coordinate triple when missing', () => {
    const doc = buildKml([point(10, 20), point(11, 21, 5)], { name: 'Flat' })
    expect(doc).not.toContain('20.0000000,10.0000000,')
    expect(doc).toContain('21.0000000,11.0000000,5.00')
  })

  it('escapes XML-special characters in metadata', () => {
    const doc = buildKml([point(1, 2)], { name: 'A&B <Trail> "x"' })
    expect(doc).toContain('A&amp;B &lt;Trail&gt; &quot;x&quot;')
  })

  it('handles an empty point list without crashing', () => {
    const doc = buildKml([], { name: 'empty' })
    expect(doc).toContain('<coordinates>')
    expect(doc).toContain('</coordinates>')
  })

  it('sanitizes filenames', () => {
    expect(kmlFilename('My Trail: Loop (2026)')).toBe('my-trail-loop-2026.kml')
    expect(kmlFilename('  ///  ')).toBe('route.kml')
  })
})
