import { describe, expect, it } from 'vitest'
import { buildGpx, escapeXml, gpxFilename } from './gpx'
import type { RouteHistoryPoint } from './routeStats'

const T0 = new Date(Date.UTC(2026, 0, 1, 10, 0, 0))

function point(lat: number, lng: number, minutes: number, elevation?: number): RouteHistoryPoint {
  return {
    lat,
    lng,
    elevation,
    recordedAt: new Date(T0.getTime() + minutes * 60_000),
  }
}

describe('buildGpx', () => {
  it('produces a GPX 1.1 document with trk/seg/pt structure', () => {
    const gpx = buildGpx(
      [point(46.5, 8.0, 0, 1200), point(46.501, 8.001, 5, 1250)],
      { name: 'Test Trip' },
    )
    expect(gpx).toContain('<gpx version="1.1"')
    expect(gpx).toContain('<metadata>')
    expect(gpx).toContain('<name>Test Trip</name>')
    expect(gpx).toContain('<trk>')
    expect(gpx).toContain('<trkseg>')
    expect(gpx.match(/<trkpt /g)).toHaveLength(2)
    expect(gpx).toContain('<ele>1200.00</ele>')
    expect(gpx).toContain('<time>2026-01-01T10:00:00.000Z</time>')
    expect(gpx.trimEnd().endsWith('</gpx>')).toBe(true)
  })

  it('omits ele when altitude is missing (never invents elevation)', () => {
    const gpx = buildGpx([point(46.5, 8.0, 0)], { name: 'Flat' })
    expect(gpx).not.toContain('<ele>')
    expect(gpx).toContain('<time>2026-01-01T10:00:00.000Z</time>')
  })

  it('escapes XML-special characters in metadata', () => {
    const gpx = buildGpx([point(0, 0, 0)], { name: 'Ben & Jerry\'s <Ridge>' })
    expect(gpx).toContain('<name>Ben &amp; Jerry&apos;s &lt;Ridge&gt;</name>')
    expect(gpx).not.toContain('Ben & Jerry')
  })

  it('includes metadata bounds and description when provided', () => {
    const gpx = buildGpx(
      [point(-10, -20, 0), point(10, 20, 1)],
      { name: 'X', description: 'A hike' },
    )
    expect(gpx).toContain('<desc>A hike</desc>')
    expect(gpx).toContain('minlat="-10.0000000"')
    expect(gpx).toContain('maxlon="20.0000000"')
  })

  it('handles an empty point list without crashing', () => {
    const gpx = buildGpx([], { name: 'Empty' })
    expect(gpx).toContain('<name>Empty</name>')
    expect(gpx).not.toContain('<trkpt')
    expect(gpx.trimEnd().endsWith('</gpx>')).toBe(true)
  })
})

describe('escapeXml / gpxFilename', () => {
  it('escapes all five XML entities', () => {
    expect(escapeXml('&<>"\'')).toBe('&amp;&lt;&gt;&quot;&apos;')
  })

  it('sanitizes filenames', () => {
    expect(gpxFilename('Weekend Hike!')).toBe('weekend-hike.gpx')
    expect(gpxFilename('   ')).toBe('trailmate-route.gpx')
    expect(gpxFilename('Rainy/Trek: 2026')).toBe('rainytrek-2026.gpx')
  })
})
