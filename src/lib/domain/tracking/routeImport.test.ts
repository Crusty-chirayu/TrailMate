import { describe, it, expect } from 'vitest'
import { parseRouteFile, RouteImportError, MAX_IMPORT_POINTS } from './routeImport'

const GPX_VALID = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">
  <trk><name>Loop</name><trkseg>
    <trkpt lat="51.5000" lon="-0.0900"><ele>10.5</ele><time>2026-09-06T10:00:00Z</time></trkpt>
    <trkpt lat="51.5010" lon="-0.0890"><ele>12.0</ele><time>2026-09-06T10:00:10Z</time></trkpt>
  </trkseg></trk>
</gpx>`

const GPX_ROUTE = `<?xml version="1.0"?>
<gpx version="1.1" creator="test">
  <rte><name>Road</name>
    <rtept lat="1.0" lon="2.0"><ele>0</ele></rtept>
    <rtept lat="1.1" lon="2.1"></rtept>
  </rte>
</gpx>`

const KML_VALID = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document><name>Loop</name>
    <Placemark><LineString><coordinates>
      -0.09,51.5,100.5 -0.08,51.51,101.0
    </coordinates></LineString></Placemark>
  </Document>
</kml>`

const KML_TRACK = `<?xml version="1.0"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:gx="http://www.google.com/kml/ext/2.2">
  <Document>
    <Placemark>
      <gx:Track>
        <when>2026-09-06T10:00:00Z</when>
        <when>2026-09-06T10:00:10Z</when>
        <gx:coord>-0.09 51.5 100</gx:coord>
        <gx:coord>-0.08 51.51 101</gx:coord>
      </gx:Track>
    </Placemark>
  </Document>
</kml>`

describe('parseRouteFile', () => {
  it('parses a valid GPX track with elevation and timestamps preserved', async () => {
    const route = await parseRouteFile('loop.gpx', GPX_VALID)
    expect(route.format).toBe('gpx')
    expect(route.points).toHaveLength(2)
    expect(route.points[0]).toMatchObject({
      lat: 51.5, lng: -0.09, elevation: 10.5, timestamp: Date.parse('2026-09-06T10:00:00Z'),
    })
    expect(route.pointCount).toBe(2)
    expect(route.warnings).toEqual([])
  })

  it('parses GPX routes (rte/rtept) and preserves zero elevation', async () => {
    const route = await parseRouteFile('road.gpx', GPX_ROUTE)
    expect(route.points).toHaveLength(2)
    expect(route.points[0].elevation).toBe(0)
    expect(route.points[0].timestamp).toBeUndefined()
  })

  it('parses a valid KML LineString with altitude triples', async () => {
    const route = await parseRouteFile('loop.kml', KML_VALID)
    expect(route.format).toBe('kml')
    expect(route.points).toHaveLength(2)
    expect(route.points[0]).toMatchObject({ lat: 51.5, lng: -0.09, elevation: 100.5 })
  })

  it('parses gx:Track timestamps paired with coordinates', async () => {
    const route = await parseRouteFile('track.kml', KML_TRACK)
    expect(route.points).toHaveLength(2)
    expect(route.points[0].timestamp).toBe(Date.parse('2026-09-06T10:00:00Z'))
    expect(route.points[1].elevation).toBe(101)
  })

  it('rejects malformed XML', async () => {
    await expect(parseRouteFile('bad.gpx', '<gpx><trk></gpx>')).rejects.toThrow(RouteImportError)
  })

  it('rejects non-XML content', async () => {
    await expect(parseRouteFile('notes.txt', 'not xml at all')).rejects.toThrow(
      'not valid XML',
    )
  })

  it('rejects unsupported formats even with XML content', async () => {
    await expect(
      parseRouteFile('data.xml', '<?xml version="1.0"?><root><item/></root>'),
    ).rejects.toThrow('Unsupported file format')
  })

  it('rejects documents with no route points', async () => {
    await expect(
      parseRouteFile('empty.gpx', '<?xml version="1.0"?><gpx><trk><trkseg></trkseg></trk></gpx>'),
    ).rejects.toThrow('No route points')
  })

  it('skips invalid coordinates with a warning and keeps valid ones', async () => {
    const content = `<?xml version="1.0"?>
<gpx version="1.1"><trk><trkseg>
  <trkpt lat="91" lon="0"/>
  <trkpt lat="0" lon="181"/>
  <trkpt lat="12.3" lon="45.6"/>
</trkseg></trk></gpx>`
    const route = await parseRouteFile('mixed.gpx', content)
    expect(route.points).toHaveLength(1)
    expect(route.warnings.length).toBeGreaterThanOrEqual(2)
  })

  it('deduplicates identical coordinates and timestamps', async () => {
    const content = `<?xml version="1.0"?>
<gpx version="1.1"><trk><trkseg>
  <trkpt lat="1" lon="2"><time>2026-01-01T00:00:00Z</time></trkpt>
  <trkpt lat="1" lon="2"><time>2026-01-01T00:00:00Z</time></trkpt>
</trkseg></trk></gpx>`
    const route = await parseRouteFile('dup.gpx', content)
    expect(route.points).toHaveLength(1)
    expect(route.warnings).toContain('1 duplicate point(s) were removed.')
  })

  it('rejects files above the point cap', async () => {
    const count = MAX_IMPORT_POINTS + 1
    const points = Array.from(
      { length: count },
      (_, i) => `<trkpt lat="0.${String(i).padStart(6, '0')}" lon="${i % 180}"/>`,
    ).join('')
    const content = `<?xml version="1.0"?><gpx version="1.1"><trk><trkseg>${points}</trkseg></trk></gpx>`
    await expect(parseRouteFile('huge.gpx', content)).rejects.toThrow('too many points')
  })

  it('detects KML by content even with a neutral extension', async () => {
    const route = await parseRouteFile('download.xml', KML_VALID)
    expect(route.format).toBe('kml')
  })
})
