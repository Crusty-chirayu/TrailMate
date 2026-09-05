import { describe, expect, it } from 'vitest'
import {
  ACTIVITY_TYPE_ORDER,
  buildTrendSeries,
  computeTripAnalytics,
  emptyTripAnalytics,
  filterByWindow,
  latestRecordDate,
  resolveWindow,
  summarizeByActivity,
  tripActivityRecord,
  tripReferenceDate,
  utcDayStart,
  type TripActivityRecord,
  type TripRouteSummary,
} from './analytics'
import type { ActivityType, Trip } from '@/types/domain'
import { computeRouteStats, type RouteHistoryPoint } from './routeStats'
import { calculateStatistics } from './statistics'
import { haversineDistance } from './geo'

/**
 * Reference "now" for windowed tests. All timestamps in this file are UTC;
 * the analytics window contract is UTC calendar-day based, so these fixtures
 * are deterministic in every runtime timezone.
 */
const REF = new Date('2026-09-05T12:00:00.000Z')

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

function makeTrip(overrides: Partial<Trip> & Pick<Trip, 'id'>): Trip {
  return {
    userId: 'user-1',
    title: 'Test Trip',
    activityType: 'trekking',
    status: 'completed',
    visibility: 'private',
    createdAt: new Date('2026-09-01T08:00:00.000Z'),
    updatedAt: new Date('2026-09-01T08:00:00.000Z'),
    ...overrides,
  }
}

/**
 * Records a route up a meridian: `segments` legs of 0.01° latitude each
 * (constant geodesic length), `segmentSeconds` apart.
 */
function makePoints(
  start: string,
  segments: number,
  segmentSeconds: number,
  elevationFor: (index: number) => number | undefined = () => undefined,
): RouteHistoryPoint[] {
  const t0 = new Date(start).getTime()
  const points: RouteHistoryPoint[] = []
  for (let i = 0; i <= segments; i++) {
    points.push({
      lat: 46 + i * 0.01,
      lng: 8,
      elevation: elevationFor(i),
      recordedAt: new Date(t0 + i * segmentSeconds * 1000),
    })
  }
  return points
}

/** One 0.01° latitude leg in meters (project geo math, used for expectations). */
const LEG_M = haversineDistance(46, 8, 46.01, 8)

/** Hand-built record with exact values — tests the aggregator, not the adapter. */
function rec(overrides: Partial<TripActivityRecord> & Pick<TripActivityRecord, 'tripId'>): TripActivityRecord {
  return {
    title: 'Trip',
    status: 'completed',
    activityType: 'trekking',
    date: new Date('2026-09-01T12:00:00.000Z'),
    ...overrides,
  }
}

function route(partial: Partial<TripRouteSummary> = {}): TripRouteSummary {
  return {
    distance: 0,
    elapsedSeconds: 0,
    movingSeconds: 0,
    elevationGain: 0,
    elevationLoss: 0,
    maxElevation: null,
    ...partial,
  }
}

// ---------------------------------------------------------------------------
// Empty dataset
// ---------------------------------------------------------------------------

describe('empty dataset', () => {
  it('produces a fully zeroed/null summary for all time', () => {
    expect(computeTripAnalytics([])).toEqual(emptyTripAnalytics())
  })

  it('produces a fully zeroed/null summary for a window', () => {
    expect(computeTripAnalytics([], { window: { days: 30 }, referenceDate: REF })).toEqual(
      emptyTripAnalytics(),
    )
  })

  it('yields no activity summaries and no trend buckets', () => {
    expect(summarizeByActivity([], { referenceDate: REF })).toEqual([])
    expect(buildTrendSeries([], { referenceDate: REF })).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Single trip
// ---------------------------------------------------------------------------

describe('single trip', () => {
  const only = rec({
    tripId: 't1',
    title: 'Alpine Loop',
    status: 'completed',
    activityType: 'trekking',
    route: route({
      distance: 12345,
      elapsedSeconds: 3600,
      movingSeconds: 2700,
      elevationGain: 800,
      elevationLoss: 300,
      maxElevation: 1500,
    }),
  })

  it('reports every metric from the one record', () => {
    const a = computeTripAnalytics([only], { referenceDate: REF })
    expect(a.totalTrips).toBe(1)
    expect(a.completedTrips).toBe(1)
    expect(a.plannedTrips).toBe(0)
    expect(a.activeTrips).toBe(0)
    expect(a.cancelledTrips).toBe(0)
    expect(a.tripsWithRoute).toBe(1)
    expect(a.totalDistance).toBe(12345)
    expect(a.totalElapsedTime).toBe(3600)
    expect(a.totalMovingTime).toBe(2700)
    expect(a.totalElevationGain).toBe(800)
    expect(a.totalElevationLoss).toBe(300)
    expect(a.hasElevation).toBe(true)
    expect(a.averageTripDistance).toBe(12345)
    expect(a.averageDuration).toBe(3600)
    expect(a.longestTrip).toEqual({ tripId: 't1', title: 'Alpine Loop', distance: 12345 })
    expect(a.largestAscent).toEqual({ tripId: 't1', title: 'Alpine Loop', elevationGain: 800 })
    expect(a.highestElevation).toEqual({ tripId: 't1', title: 'Alpine Loop', elevation: 1500 })
    expect(a.longestMovingTime).toEqual({ tripId: 't1', title: 'Alpine Loop', movingSeconds: 2700 })
  })
})

// ---------------------------------------------------------------------------
// Multiple trips — status counts
// ---------------------------------------------------------------------------

describe('multiple trips', () => {
  it('counts every status bucket correctly', () => {
    const records = [
      rec({ tripId: 'p1', status: 'planned' }),
      rec({ tripId: 'p2', status: 'planned' }),
      rec({ tripId: 'a1', status: 'active' }),
      rec({ tripId: 'c1', status: 'completed' }),
      rec({ tripId: 'c2', status: 'completed' }),
      rec({ tripId: 'c3', status: 'completed' }),
      rec({ tripId: 'x1', status: 'cancelled' }),
    ]
    const a = computeTripAnalytics(records, { referenceDate: REF })
    expect(a.totalTrips).toBe(7)
    expect(a.plannedTrips).toBe(2)
    expect(a.activeTrips).toBe(1)
    expect(a.completedTrips).toBe(3)
    expect(a.cancelledTrips).toBe(1)
    expect(a.tripsWithRoute).toBe(0)
  })

  it('treats trips without a route as count-only (no fabricated metrics)', () => {
    const records = [
      rec({ tripId: 'p1', status: 'planned' }),
      rec({ tripId: 'c1', status: 'completed', route: route({ distance: 5000, elapsedSeconds: 1000, movingSeconds: 900 }) }),
    ]
    const a = computeTripAnalytics(records, { referenceDate: REF })
    expect(a.totalTrips).toBe(2)
    expect(a.tripsWithRoute).toBe(1)
    expect(a.totalDistance).toBe(5000)
    // Averages are over trips WITH routes, not diluted by planned trips.
    expect(a.averageTripDistance).toBe(5000)
    expect(a.averageDuration).toBe(1000)
  })
})

// ---------------------------------------------------------------------------
// Totals — distance, duration, elevation
// ---------------------------------------------------------------------------

describe('totals', () => {
  const records = [
    rec({ tripId: 't1', route: route({ distance: 1000, elapsedSeconds: 3600, movingSeconds: 3000, elevationGain: 100, elevationLoss: 50, maxElevation: 800 }) }),
    rec({ tripId: 't2', route: route({ distance: 2500, elapsedSeconds: 7200, movingSeconds: 5400, elevationGain: 300, elevationLoss: 200, maxElevation: 1200 }) }),
    rec({ tripId: 't3', route: route({ distance: 500, elapsedSeconds: 1800, movingSeconds: 900 }) }), // no elevation
    rec({ tripId: 't4' }), // no route at all
  ]

  it('sums distance', () => {
    expect(computeTripAnalytics(records, { referenceDate: REF }).totalDistance).toBe(4000)
  })

  it('sums elapsed and moving time', () => {
    const a = computeTripAnalytics(records, { referenceDate: REF })
    expect(a.totalElapsedTime).toBe(12600)
    expect(a.totalMovingTime).toBe(9300)
  })

  it('sums elevation only where altitude exists', () => {
    const a = computeTripAnalytics(records, { referenceDate: REF })
    expect(a.totalElevationGain).toBe(400)
    expect(a.totalElevationLoss).toBe(250)
    expect(a.hasElevation).toBe(true)
  })

  it('reports hasElevation=false and zero elevation when no altitude exists anywhere', () => {
    const noAlt = [
      rec({ tripId: 't1', route: route({ distance: 1000, elapsedSeconds: 100, movingSeconds: 90 }) }),
      rec({ tripId: 't2', route: route({ distance: 2000, elapsedSeconds: 200, movingSeconds: 180 }) }),
    ]
    const a = computeTripAnalytics(noAlt, { referenceDate: REF })
    expect(a.hasElevation).toBe(false)
    expect(a.totalElevationGain).toBe(0)
    expect(a.totalElevationLoss).toBe(0)
    expect(a.highestElevation).toBeNull()
    expect(a.largestAscent).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Averages
// ---------------------------------------------------------------------------

describe('averages', () => {
  it('averages distance and duration over trips with routes', () => {
    const records = [
      rec({ tripId: 't1', route: route({ distance: 1000, elapsedSeconds: 1000 }) }),
      rec({ tripId: 't2', route: route({ distance: 3000, elapsedSeconds: 3000 }) }),
      rec({ tripId: 't3' }), // planned, no route — excluded from the average
    ]
    const a = computeTripAnalytics(records, { referenceDate: REF })
    expect(a.averageTripDistance).toBe(2000)
    expect(a.averageDuration).toBe(2000)
  })

  it('returns null averages when no trip has a route', () => {
    const a = computeTripAnalytics([rec({ tripId: 'p1', status: 'planned' })], { referenceDate: REF })
    expect(a.averageTripDistance).toBeNull()
    expect(a.averageDuration).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Windows: 7 / 30 / 90 / 365 days and all-time
// ---------------------------------------------------------------------------

describe('date windows', () => {
  const far = rec({ tripId: 'far', date: new Date('2025-01-15T12:00:00.000Z'), route: route({ distance: 100 }) })
  const q2 = rec({ tripId: 'q2', date: new Date('2026-06-20T12:00:00.000Z'), route: route({ distance: 200 }) })
  const aug = rec({ tripId: 'aug', date: new Date('2026-08-20T12:00:00.000Z'), route: route({ distance: 300 }) })
  const recent = rec({ tripId: 'recent', date: new Date('2026-09-04T12:00:00.000Z'), route: route({ distance: 400 }) })
  const all = [far, q2, aug, recent]

  it('7-day window keeps only the recent trip', () => {
    const a = computeTripAnalytics(all, { window: { days: 7 }, referenceDate: REF })
    expect(a.totalTrips).toBe(1)
    expect(a.totalDistance).toBe(400)
  })

  it('30-day window keeps the August and recent trips', () => {
    const a = computeTripAnalytics(all, { window: { days: 30 }, referenceDate: REF })
    expect(a.totalTrips).toBe(2)
    expect(a.totalDistance).toBe(700)
  })

  it('90-day window adds the Q2 trip', () => {
    const a = computeTripAnalytics(all, { window: { days: 90 }, referenceDate: REF })
    expect(a.totalTrips).toBe(3)
    expect(a.totalDistance).toBe(900)
  })

  it('1-year window honors the exact 365-day boundary (start 2025-09-06T00:00Z)', () => {
    const atYearStart = rec({ tripId: 'y-start', date: new Date('2025-09-06T00:00:00.000Z'), route: route({ distance: 10 }) })
    const oneMsBeforeYearStart = rec({ tripId: 'y-before', date: new Date('2025-09-05T23:59:59.999Z'), route: route({ distance: 20 }) })
    const a = computeTripAnalytics(
      [...all, atYearStart, oneMsBeforeYearStart],
      { window: { days: 365 }, referenceDate: REF },
    )
    // far (2025-01-15) and y-before (1 ms short) fall outside; q2, aug, recent, y-start are in.
    expect(a.totalTrips).toBe(4)
    expect(a.totalDistance).toBe(200 + 300 + 400 + 10)
  })

  it('all-time window keeps everything', () => {
    const a = computeTripAnalytics(all, { window: 'all', referenceDate: REF })
    expect(a.totalTrips).toBe(4)
    expect(a.totalDistance).toBe(1000)
  })
})

// ---------------------------------------------------------------------------
// Exact boundary dates (the contract in resolveWindow's docblock)
// ---------------------------------------------------------------------------

describe('exact boundaries', () => {
  // 7-day window around REF 2026-09-05:
  //   start inclusive  = 2026-08-30T00:00:00Z
  //   end exclusive    = 2026-09-06T00:00:00Z
  const atStartMidnight = rec({ tripId: 'in-start', date: new Date('2026-08-30T00:00:00.000Z') })
  const oneMsBeforeStart = rec({ tripId: 'out-start', date: new Date('2026-08-29T23:59:59.999Z') })
  const atEndMidnight = rec({ tripId: 'out-end', date: new Date('2026-09-06T00:00:00.000Z') })
  const lastMsOfDay = rec({ tripId: 'in-end', date: new Date('2026-09-05T23:59:59.999Z') })

  it('includes the record exactly at the window start UTC midnight', () => {
    const ids = filterByWindow([atStartMidnight], { days: 7 }, REF).map(r => r.tripId)
    expect(ids).toEqual(['in-start'])
  })

  it('excludes the record one millisecond before the window start', () => {
    expect(filterByWindow([oneMsBeforeStart], { days: 7 }, REF)).toEqual([])
  })

  it('excludes the record exactly at the end UTC midnight (next day)', () => {
    expect(filterByWindow([atEndMidnight], { days: 7 }, REF)).toEqual([])
  })

  it('includes the record at the last millisecond of the reference day', () => {
    const ids = filterByWindow([lastMsOfDay], { days: 7 }, REF).map(r => r.tripId)
    expect(ids).toEqual(['in-end'])
  })

  it('applies UTC days, not local-timezone days', () => {
    // 2026-08-29T21:30Z is "Aug 30, 00:30" in UTC+3 — a local-time
    // implementation would wrongly include it in the 7-day window.
    const utcPlusThree = rec({ tripId: 'tz', date: new Date('2026-08-29T21:30:00.000Z') })
    expect(filterByWindow([utcPlusThree], { days: 7 }, REF)).toEqual([])
  })

  it('excludes future-dated trips from windows but keeps them all-time', () => {
    const future = rec({ tripId: 'future', status: 'planned', date: new Date('2026-09-10T09:00:00.000Z') })
    expect(filterByWindow([future], { days: 7 }, REF)).toEqual([])
    const all = computeTripAnalytics([future], { window: 'all', referenceDate: REF })
    expect(all.totalTrips).toBe(1)
    expect(all.plannedTrips).toBe(1)
  })

  it('treats invalid and missing dates like missing: windowed out, kept all-time', () => {
    const invalid = rec({ tripId: 'invalid', date: new Date('not-a-date') })
    const missing = rec({ tripId: 'missing', date: null })
    expect(filterByWindow([invalid, missing], { days: 7 }, REF)).toEqual([])
    const all = computeTripAnalytics([invalid, missing], { window: 'all', referenceDate: REF })
    expect(all.totalTrips).toBe(2)
  })

  it('defaults the reference date to the latest valid record date (no wall clock)', () => {
    const old = rec({ tripId: 'old', date: new Date('2026-08-18T12:00:00.000Z') })
    const newest = rec({ tripId: 'new', date: new Date('2026-08-20T12:00:00.000Z') })
    // Without referenceDate: window ends 2026-08-21, starts 2026-08-14 → both in.
    const a = computeTripAnalytics([old, newest], { window: { days: 7 } })
    expect(a.totalTrips).toBe(2)
    // A strictly earlier record falls outside the derived window.
    const older = rec({ tripId: 'older', date: new Date('2026-08-10T12:00:00.000Z') })
    const b = computeTripAnalytics([old, newest, older], { window: { days: 7 } })
    expect(b.totalTrips).toBe(2)
  })

  it('rejects invalid windows and reference dates explicitly', () => {
    for (const bad of [0, -1, 1.5, Number.NaN] as number[]) {
      expect(() => resolveWindow({ days: bad }, REF)).toThrow(RangeError)
    }
    expect(() => resolveWindow({ days: 7 }, new Date('not-a-date'))).toThrow(RangeError)
  })

  it('computes exact bounds for the documented windows', () => {
    expect(resolveWindow({ days: 7 }, REF)).toEqual({
      startInclusive: new Date('2026-08-30T00:00:00.000Z'),
      endExclusive: new Date('2026-09-06T00:00:00.000Z'),
    })
    expect(resolveWindow({ days: 30 }, REF)).toEqual({
      startInclusive: new Date('2026-08-07T00:00:00.000Z'),
      endExclusive: new Date('2026-09-06T00:00:00.000Z'),
    })
    expect(resolveWindow({ days: 365 }, REF)).toEqual({
      startInclusive: new Date('2025-09-06T00:00:00.000Z'),
      endExclusive: new Date('2026-09-06T00:00:00.000Z'),
    })
    expect(resolveWindow('all', REF)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// 30-day boundary detail (30-day start = 2026-08-07T00:00Z)
// ---------------------------------------------------------------------------

describe('30-day boundary', () => {
  it('includes 2026-08-07T00:00Z and excludes 2026-08-06T23:59:59.999Z', () => {
    const atStart = rec({ tripId: 'at', date: new Date('2026-08-07T00:00:00.000Z') })
    const before = rec({ tripId: 'before', date: new Date('2026-08-06T23:59:59.999Z') })
    const ids = filterByWindow([atStart, before], { days: 30 }, REF).map(r => r.tripId)
    expect(ids).toEqual(['at'])
  })
})

// ---------------------------------------------------------------------------
// Activity grouping
// ---------------------------------------------------------------------------

describe('activity grouping', () => {
  const records: TripActivityRecord[] = [
    rec({ tripId: 't1', activityType: 'trekking', route: route({ distance: 1000, elevationGain: 100 }) }),
    rec({ tripId: 't2', activityType: 'trekking', route: route({ distance: 500, elevationGain: 50 }) }),
    rec({ tripId: 'c1', activityType: 'cycling', route: route({ distance: 3000, elevationGain: 200 }) }),
    rec({ tripId: 'k1', activityType: 'camping', status: 'planned' }),
    rec({ tripId: 'o1', activityType: 'other', date: new Date('2025-01-01T00:00:00.000Z') }),
  ]

  it('returns only present activity types, in stable domain order (all-time)', () => {
    // All five records exist all-time, so all four domain types are present.
    const summary = summarizeByActivity(records, { referenceDate: REF })
    expect(summary.map(s => s.activityType)).toEqual(['trekking', 'cycling', 'camping', 'other'])
    expect(ACTIVITY_TYPE_ORDER).toEqual(['trekking', 'cycling', 'camping', 'other'])
  })

  it('sums per-type trip counts, route counts, distance and ascent', () => {
    const summary = summarizeByActivity(records, { referenceDate: REF })
    expect(summary).toEqual([
      { activityType: 'trekking', tripCount: 2, tripsWithRoute: 2, totalDistance: 1500, totalElevationGain: 150 },
      { activityType: 'cycling', tripCount: 1, tripsWithRoute: 1, totalDistance: 3000, totalElevationGain: 200 },
      { activityType: 'camping', tripCount: 1, tripsWithRoute: 0, totalDistance: 0, totalElevationGain: 0 },
      { activityType: 'other', tripCount: 1, tripsWithRoute: 0, totalDistance: 0, totalElevationGain: 0 },
    ])
  })

  it('honors windows (dropped types disappear entirely)', () => {
    const summary = summarizeByActivity(records, { window: { days: 30 }, referenceDate: REF })
    // 'other' (2025-01-01) is outside 30 days.
    expect(summary.map(s => s.activityType)).toEqual(['trekking', 'cycling', 'camping'])
  })
})

// ---------------------------------------------------------------------------
// Personal records
// ---------------------------------------------------------------------------

describe('personal records', () => {
  it('picks the longest trip by distance', () => {
    const records = [
      rec({ tripId: 'a', title: 'A', route: route({ distance: 100, elapsedSeconds: 10 }) }),
      rec({ tripId: 'b', title: 'B', route: route({ distance: 900, elapsedSeconds: 20 }) }),
      rec({ tripId: 'c', title: 'C', route: route({ distance: 500, elapsedSeconds: 30 }) }),
    ]
    const a = computeTripAnalytics(records, { referenceDate: REF })
    expect(a.longestTrip).toEqual({ tripId: 'b', title: 'B', distance: 900 })
  })

  it('resolves longest-trip ties to the first record in input order', () => {
    const records = [
      rec({ tripId: 'a', title: 'First', route: route({ distance: 700 }) }),
      rec({ tripId: 'b', title: 'Second', route: route({ distance: 700 }) }),
    ]
    expect(computeTripAnalytics(records, { referenceDate: REF }).longestTrip?.tripId).toBe('a')
  })

  it('picks the largest ascent and returns null when no trip ascends', () => {
    const records = [
      rec({ tripId: 'a', route: route({ elevationGain: 500 }) }),
      rec({ tripId: 'b', route: route({ elevationGain: 1200, maxElevation: 900 }) }),
      rec({ tripId: 'c', route: route({ elevationGain: 900 }) }),
    ]
    expect(computeTripAnalytics(records, { referenceDate: REF }).largestAscent)
      .toEqual({ tripId: 'b', title: 'Trip', elevationGain: 1200 })

    const flat = [rec({ tripId: 'a', route: route({ elevationGain: 0 }) })]
    expect(computeTripAnalytics(flat, { referenceDate: REF }).largestAscent).toBeNull()
  })

  it('picks the highest elevation and accepts legitimate 0 m altitudes', () => {
    const records = [
      rec({ tripId: 'a', route: route({ maxElevation: 0 }) }),
      rec({ tripId: 'b', route: route({ maxElevation: 1800 }) }),
      rec({ tripId: 'c', route: route({ maxElevation: 900 }) }),
    ]
    expect(computeTripAnalytics(records, { referenceDate: REF }).highestElevation)
      .toEqual({ tripId: 'b', title: 'Trip', elevation: 1800 })

    const seaLevel = [rec({ tripId: 'a', route: route({ maxElevation: 0 }) })]
    const a = computeTripAnalytics(seaLevel, { referenceDate: REF })
    expect(a.hasElevation).toBe(true)
    expect(a.highestElevation).toEqual({ tripId: 'a', title: 'Trip', elevation: 0 })
  })

  it('picks the longest moving time and returns null when nothing moved', () => {
    const records = [
      rec({ tripId: 'a', route: route({ movingSeconds: 100 }) }),
      rec({ tripId: 'b', route: route({ movingSeconds: 900 }) }),
      rec({ tripId: 'c', route: route({ movingSeconds: 0 }) }),
    ]
    expect(computeTripAnalytics(records, { referenceDate: REF }).longestMovingTime)
      .toEqual({ tripId: 'b', title: 'Trip', movingSeconds: 900 })

    const stationary = [rec({ tripId: 'a', route: route({ movingSeconds: 0 }) })]
    expect(computeTripAnalytics(stationary, { referenceDate: REF }).longestMovingTime).toBeNull()
  })

  it('scopes records to the window (a record inside the window wins)', () => {
    const records = [
      rec({ tripId: 'old', date: new Date('2025-01-01T00:00:00.000Z'), route: route({ distance: 5000 }) }),
      rec({ tripId: 'new', date: new Date('2026-09-01T00:00:00.000Z'), route: route({ distance: 800 }) }),
    ]
    const windowed = computeTripAnalytics(records, { window: { days: 30 }, referenceDate: REF })
    expect(windowed.longestTrip).toEqual({ tripId: 'new', title: 'Trip', distance: 800 })
    const allTime = computeTripAnalytics(records, { window: 'all', referenceDate: REF })
    expect(allTime.longestTrip).toEqual({ tripId: 'old', title: 'Trip', distance: 5000 })
  })
})

// ---------------------------------------------------------------------------
// Adapter: trip + recorded points → normalized record
// ---------------------------------------------------------------------------

describe('tripActivityRecord adapter', () => {
  it('maps canonical route stats onto the record', () => {
    const trip = makeTrip({ id: 't1', title: 'Alpine', endDate: new Date('2026-08-15T15:00:00.000Z') })
    const points = makePoints('2026-08-15T09:00:00.000Z', 3, 360, i => [100, 250, 400, 350][i])
    const record = tripActivityRecord(trip, points)

    const canonical = computeRouteStats(points)
    expect(record.route).toBeDefined()
    expect(record.route!.distance).toBe(canonical.totalDistance)
    expect(record.route!.distance).toBe(Math.round(3 * LEG_M))
    expect(record.route!.elapsedSeconds).toBe(3 * 360)
    expect(record.route!.elevationGain).toBe(canonical.elevationGain)
    expect(record.route!.elevationGain).toBe(300)
    expect(record.route!.elevationLoss).toBe(50)
    expect(record.route!.maxElevation).toBe(400)
    expect(record.date).toEqual(new Date('2026-08-15T15:00:00.000Z'))
  })

  it('derives moving time with the canonical moving rule (threshold 0.3 m/s)', () => {
    const trip = makeTrip({ id: 't1' })
    // 1111.9 m legs every 360 s ≈ 3.1 m/s → every segment is moving.
    const fast = makePoints('2026-08-15T09:00:00.000Z', 3, 360)
    expect(tripActivityRecord(trip, fast).route!.movingSeconds).toBe(3 * 360)

    // Stationary fixes: distance 0, elapsed > 0, moving time 0.
    const t0 = new Date('2026-08-15T09:00:00.000Z').getTime()
    const stationary: RouteHistoryPoint[] = [0, 1, 2].map(i => ({
      lat: 46,
      lng: 8,
      recordedAt: new Date(t0 + i * 60_000),
    }))
    const rec = tripActivityRecord(trip, stationary)
    expect(rec.route!.distance).toBe(0)
    expect(rec.route!.elapsedSeconds).toBe(120)
    expect(rec.route!.movingSeconds).toBe(0)
  })

  it('agrees with calculateStatistics for moving time on the same points', () => {
    const trip = makeTrip({ id: 't1' })
    const points = makePoints('2026-08-15T09:00:00.000Z', 4, 300)
    const expected = Math.round(
      calculateStatistics(
        points.map((p, i) => ({
          id: `x-${i}`,
          tripId: 't1',
          sessionId: 's',
          timestamp: p.recordedAt.getTime(),
          latitude: p.lat,
          longitude: p.lng,
          altitude: p.elevation,
          synced: true,
        })),
      ).movingTime,
    )
    expect(tripActivityRecord(trip, points).route!.movingSeconds).toBe(expected)
    expect(expected).toBe(4 * 300)
  })

  it('leaves route undefined when the trip has no points', () => {
    const trip = makeTrip({ id: 't1', status: 'planned', plannedDate: new Date('2026-10-01T00:00:00.000Z') })
    const record = tripActivityRecord(trip, [])
    expect(record.route).toBeUndefined()
    expect(record.date).toEqual(new Date('2026-10-01T00:00:00.000Z'))
  })

  it('keeps altitude 0 as real data (never drops falsy elevations)', () => {
    const trip = makeTrip({ id: 't1' })
    const points = makePoints('2026-08-15T09:00:00.000Z', 2, 360, i => (i === 0 ? 0 : 50))
    const record = tripActivityRecord(trip, points)
    expect(record.route!.maxElevation).toBe(50)
    expect(record.route!.elevationGain).toBe(50)
  })
})

// ---------------------------------------------------------------------------
// Reference-date precedence
// ---------------------------------------------------------------------------

describe('tripReferenceDate precedence', () => {
  const base = {
    id: 't1',
    title: 'T',
    userId: 'u',
    activityType: 'trekking' as ActivityType,
    visibility: 'private' as const,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  }

  it('prefers endDate over all other dates', () => {
    const trip = makeTrip({
      ...base,
      status: 'completed',
      plannedDate: new Date('2026-08-10T00:00:00.000Z'),
      startDate: new Date('2026-08-12T00:00:00.000Z'),
      endDate: new Date('2026-08-15T00:00:00.000Z'),
    })
    expect(tripReferenceDate(trip)).toEqual(new Date('2026-08-15T00:00:00.000Z'))
  })

  it('falls back to startDate for in-progress trips', () => {
    const trip = makeTrip({
      ...base,
      status: 'active',
      plannedDate: new Date('2026-08-10T00:00:00.000Z'),
      startDate: new Date('2026-08-12T00:00:00.000Z'),
    })
    expect(tripReferenceDate(trip)).toEqual(new Date('2026-08-12T00:00:00.000Z'))
  })

  it('falls back to plannedDate for planned trips', () => {
    const trip = makeTrip({
      ...base,
      status: 'planned',
      plannedDate: new Date('2026-10-01T00:00:00.000Z'),
    })
    expect(tripReferenceDate(trip)).toEqual(new Date('2026-10-01T00:00:00.000Z'))
  })

  it('falls back to createdAt when no other date exists', () => {
    const trip = makeTrip({ ...base, status: 'planned', createdAt: new Date('2026-03-03T09:00:00.000Z') })
    expect(tripReferenceDate(trip)).toEqual(new Date('2026-03-03T09:00:00.000Z'))
  })
})

// ---------------------------------------------------------------------------
// Trends
// ---------------------------------------------------------------------------

describe('trend series', () => {
  it('produces contiguous zero-filled daily buckets for a 7-day window', () => {
    const records = [
      rec({ tripId: 'a', date: new Date('2026-09-05T10:00:00.000Z'), route: route({ distance: 1000 }) }),
      rec({ tripId: 'b', date: new Date('2026-09-02T10:00:00.000Z'), route: route({ distance: 500, elevationGain: 120, maxElevation: 500 }) }),
      rec({ tripId: 'c', date: new Date('2026-09-02T11:00:00.000Z') }), // counted, no route
    ]
    const series = buildTrendSeries(records, { window: { days: 7 }, referenceDate: REF })
    expect(series).toHaveLength(7)
    expect(series.map(b => b.key)).toEqual([
      '2026-08-30', '2026-08-31', '2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05',
    ])
    expect(series[3]).toEqual({
      key: '2026-09-02',
      label: 'Sep 2, 2026',
      tripCount: 2,
      distance: 500,
      elevationGain: 120,
      hasElevation: true,
    })
    expect(series[6].tripCount).toBe(1)
    expect(series[6].distance).toBe(1000)
    expect(series[0].tripCount).toBe(0) // zero-filled
  })

  it('aligns week buckets to Monday (UTC)', () => {
    // REF 2026-09-05 is a Saturday. Week of Sep 5 → Monday 2026-08-31.
    const records = [rec({ tripId: 'a', date: new Date('2026-09-05T10:00:00.000Z') })]
    const series = buildTrendSeries(records, { window: { days: 14 }, referenceDate: REF, granularity: 'week' })
    // Window starts 2026-08-23 (Saturday) → first bucket is Monday 2026-08-17? No:
    // the bucket CONTAINING 2026-08-23 is the week of Monday 2026-08-17... but that
    // Monday is before the window; buckets are full calendar weeks, so the first
    // bucket key is the Monday of the week containing the window start.
    expect(series[0].key).toBe('2026-08-17')
    expect(series.at(-1)?.key).toBe('2026-08-31')
    const sepWeek = series.find(b => b.key === '2026-08-31')
    expect(sepWeek?.tripCount).toBe(1)
  })

  it('buckets by month for long windows', () => {
    const records = [
      rec({ tripId: 'a', date: new Date('2026-07-10T10:00:00.000Z'), route: route({ distance: 100 }) }),
      rec({ tripId: 'b', date: new Date('2026-08-10T10:00:00.000Z'), route: route({ distance: 200 }) }),
      rec({ tripId: 'c', date: new Date('2026-09-01T10:00:00.000Z'), route: route({ distance: 300 }) }),
    ]
    const series = buildTrendSeries(records, { window: 'all', referenceDate: REF, granularity: 'month' })
    expect(series.map(b => b.key)).toEqual(['2026-07', '2026-08', '2026-09'])
    expect(series.map(b => b.distance)).toEqual([100, 200, 300])
  })

  it('chooses a default granularity from the window (day/week/month)', () => {
    const records = [rec({ tripId: 'a', date: new Date('2026-09-01T10:00:00.000Z') })]
    const daily = buildTrendSeries(records, { window: { days: 7 }, referenceDate: REF })
    expect(daily).toHaveLength(7) // day resolution

    const weekly = buildTrendSeries(records, { window: { days: 30 }, referenceDate: REF })
    // 30 days → weekly buckets covering 2026-08-03 (Monday of the week containing Aug 7) through Sep 5's week
    expect(weekly[0].key).toBe('2026-08-03')
    expect(weekly.at(-1)?.key).toBe('2026-08-31')

    const monthly = buildTrendSeries(records, { window: { days: 365 }, referenceDate: REF })
    expect(monthly.map(b => b.key)).toEqual([
      '2025-09', '2025-10', '2025-11', '2025-12',
      '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06',
      '2026-07', '2026-08', '2026-09',
    ])
  })

  it('resolves the all-time span deterministically from the data', () => {
    const records = [
      rec({ tripId: 'a', date: new Date('2026-09-01T10:00:00.000Z') }),
      rec({ tripId: 'b', date: new Date('2026-09-04T10:00:00.000Z') }),
    ]
    // 4-day span ≤ 14 → day buckets.
    const series = buildTrendSeries(records, { window: 'all', referenceDate: REF })
    expect(series.map(b => b.key)).toEqual(['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05'])
  })

  it('excludes records with missing/invalid dates from every bucket', () => {
    const records = [
      rec({ tripId: 'a', date: null }),
      rec({ tripId: 'b', date: new Date('invalid') }),
      rec({ tripId: 'c', date: new Date('2026-09-05T10:00:00.000Z') }),
    ]
    const series = buildTrendSeries(records, { window: { days: 7 }, referenceDate: REF })
    expect(series.at(-1)?.tripCount).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// Full analytics pipeline (real Trip + real recorded points)
// ---------------------------------------------------------------------------

describe('full analytics pipeline', () => {
  function buildRecords(): TripActivityRecord[] {
    const trips: Array<{ trip: Trip; points: RouteHistoryPoint[] }> = [
      {
        // 3 legs up, then down: gain 300, loss 50, max 400.
        trip: makeTrip({
          id: 't1',
          title: 'Alpine Loop',
          status: 'completed',
          activityType: 'trekking',
          endDate: new Date('2026-09-04T16:00:00.000Z'),
        }),
        points: makePoints('2026-09-04T09:00:00.000Z', 3, 360, i => [100, 250, 400, 350][i]),
      },
      {
        // Long ride, no altitude.
        trip: makeTrip({
          id: 't2',
          title: 'Riverside Ride',
          status: 'completed',
          activityType: 'cycling',
          endDate: new Date('2026-08-20T10:00:00.000Z'),
        }),
        points: makePoints('2026-08-20T08:00:00.000Z', 10, 180),
      },
      {
        // Big climb: gain 1000, max 2000.
        trip: makeTrip({
          id: 't3',
          title: 'Summit Push',
          status: 'completed',
          activityType: 'trekking',
          endDate: new Date('2026-06-01T09:00:00.000Z'),
        }),
        points: makePoints('2026-06-01T06:00:00.000Z', 5, 300, i => 1000 + i * 200),
      },
      {
        // Planned, future, no route.
        trip: makeTrip({
          id: 't4',
          title: 'Weekend Camp',
          status: 'planned',
          activityType: 'camping',
          plannedDate: new Date('2026-09-10T00:00:00.000Z'),
        }),
        points: [],
      },
      {
        // Active today with a short recorded segment.
        trip: makeTrip({
          id: 't5',
          title: 'City Loop',
          status: 'active',
          activityType: 'cycling',
          startDate: new Date('2026-09-05T08:00:00.000Z'),
        }),
        points: makePoints('2026-09-05T08:00:00.000Z', 2, 240),
      },
      {
        // Old cancelled trip, no route.
        trip: makeTrip({
          id: 't6',
          title: 'Abandoned Plan',
          status: 'cancelled',
          activityType: 'other',
          endDate: new Date('2025-12-15T12:00:00.000Z'),
        }),
        points: [],
      },
    ]
    return trips.map(({ trip, points }) => tripActivityRecord(trip, points))
  }

  it('aggregates all-time from real trips and recorded points', () => {
    const records = buildRecords()
    const a = computeTripAnalytics(records, { window: 'all', referenceDate: REF })

    // Totals verified against the canonical per-trip stats.
    const canonicalTotals = records.reduce(
      (acc, r) => {
        if (r.route) {
          acc.distance += r.route.distance
          acc.elapsed += r.route.elapsedSeconds
          acc.moving += r.route.movingSeconds
          acc.gain += r.route.elevationGain
          acc.loss += r.route.elevationLoss
        }
        return acc
      },
      { distance: 0, elapsed: 0, moving: 0, gain: 0, loss: 0 },
    )
    expect(a.totalDistance).toBe(canonicalTotals.distance)
    expect(a.totalElapsedTime).toBe(canonicalTotals.elapsed)
    expect(a.totalMovingTime).toBe(canonicalTotals.moving)
    expect(a.totalElevationGain).toBe(canonicalTotals.gain)
    expect(a.totalElevationLoss).toBe(canonicalTotals.loss)

    // Hand-checked expectations (independent of the reduce above).
    expect(a.totalTrips).toBe(6)
    expect(a.completedTrips).toBe(3)
    expect(a.activeTrips).toBe(1)
    expect(a.plannedTrips).toBe(1)
    expect(a.cancelledTrips).toBe(1)
    expect(a.tripsWithRoute).toBe(4)
    expect(a.hasElevation).toBe(true)

    // t2 (10 legs) is the longest by distance; t3 (gain 1000) the largest ascent.
    expect(a.longestTrip).toEqual({ tripId: 't2', title: 'Riverside Ride', distance: Math.round(10 * LEG_M) })
    expect(a.largestAscent).toEqual({ tripId: 't3', title: 'Summit Push', elevationGain: 1000 })
    expect(a.highestElevation).toEqual({ tripId: 't3', title: 'Summit Push', elevation: 2000 })
    // t3: 5 legs × 300 s = 1500 s moving; t2: 10 × 180 s = 1800 s moving → t2 wins.
    expect(a.longestMovingTime).toEqual({ tripId: 't2', title: 'Riverside Ride', movingSeconds: 1800 })
  })

  it('applies windows across the full pipeline (planned future trips drop out)', () => {
    const records = buildRecords()
    const week = computeTripAnalytics(records, { window: { days: 7 }, referenceDate: REF })
    // In window: t1 (Sep 4), t5 (Sep 5 via startDate). Planned t4 (Sep 10) excluded.
    expect(week.totalTrips).toBe(2)
    expect(week.completedTrips).toBe(1)
    expect(week.activeTrips).toBe(1)
    expect(week.plannedTrips).toBe(0)
    expect(week.tripsWithRoute).toBe(2)

    const month = computeTripAnalytics(records, { window: { days: 30 }, referenceDate: REF })
    // In window: t1, t2 (Aug 20), t5.
    expect(month.totalTrips).toBe(3)
    expect(month.longestTrip).toEqual({ tripId: 't2', title: 'Riverside Ride', distance: Math.round(10 * LEG_M) })
  })

  it('is deterministic across repeated calls and input order is the only tiebreaker', () => {
    const records = buildRecords()
    const first = computeTripAnalytics(records, { window: 'all', referenceDate: REF })
    const second = computeTripAnalytics([...records].reverse(), { window: 'all', referenceDate: REF })
    // Totals are order-independent...
    expect(second.totalDistance).toBe(first.totalDistance)
    expect(second.totalMovingTime).toBe(first.totalMovingTime)
    // ...and this dataset has no ties, so records match too.
    expect(second.longestTrip).toEqual(first.longestTrip)
  })

  it('surfaces activity breakdown for real data', () => {
    const records = buildRecords()
    const summary = summarizeByActivity(records, { window: 'all', referenceDate: REF })
    expect(summary.map(s => s.activityType)).toEqual(['trekking', 'cycling', 'camping', 'other'])
    const trek = summary.find(s => s.activityType === 'trekking')!
    expect(trek.tripCount).toBe(2)
    expect(trek.tripsWithRoute).toBe(2)
    expect(trek.totalElevationGain).toBe(1300) // 300 + 1000
  })
})

// ---------------------------------------------------------------------------
// Helper sanity (guards against fixture drift)
// ---------------------------------------------------------------------------

describe('fixture sanity', () => {
  it('latestRecordDate picks the newest valid date', () => {
    const records = [
      rec({ tripId: 'a', date: new Date('2026-01-01T00:00:00.000Z') }),
      rec({ tripId: 'b', date: new Date('2026-05-01T00:00:00.000Z') }),
      rec({ tripId: 'c', date: new Date('invalid') }),
    ]
    expect(latestRecordDate(records)).toEqual(new Date('2026-05-01T00:00:00.000Z'))
  })

  it('utcDayStart is timezone-independent', () => {
    expect(utcDayStart(new Date('2026-09-05T11:59:59.999Z')).toISOString()).toBe('2026-09-05T00:00:00.000Z')
    expect(utcDayStart(new Date('2026-09-05T23:59:59.999Z')).toISOString()).toBe('2026-09-05T00:00:00.000Z')
  })
})
