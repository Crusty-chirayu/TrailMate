// Canonical model for imported GPX/KML routes.
//
// Imported points mirror the tracked route representation: latitude,
// longitude, optional elevation/accuracy, and an optional timestamp. When a
// source file has no timestamps the point is imported without one and the
// server assigns its own import time — recorded data is never fabricated.

export interface ImportedRoutePoint {
  lat: number
  lng: number
  /** Meters; zero is a valid value and is preserved. */
  elevation?: number
  /** Epoch milliseconds when the source file provided a timestamp. */
  timestamp?: number
  /** Meters; only present when the source format carries accuracy. */
  accuracy?: number
}

export interface ImportedRoute {
  format: 'gpx' | 'kml'
  /** Derived from the file name (no fabricated metadata). */
  name: string
  points: ImportedRoutePoint[]
  /** Non-fatal notes, e.g. skipped duplicates or invalid coordinates. */
  warnings: string[]
  pointCount: number
}
