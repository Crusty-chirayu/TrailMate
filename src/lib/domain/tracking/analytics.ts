// Trip analytics domain — pure and deterministic.
//
// This module AGGREGATES normalized per-trip records. It deliberately does
// NOT implement route math of its own: per-trip statistics come from the
// existing canonical implementations
//   - computeRouteStats()   (routeStats.ts)  — distance, elapsed time, elevation
//   - calculateStatistics() (statistics.ts)  — moving time (speed-threshold rule)
// `tripActivityRecord()` below is the single composition point where those
// two are consumed; everything else in this file is summation, averaging,
// max-finding, and date-window filtering over the resulting records.
// There is exactly one implementation of each mathematical rule in the codebase.

import { computeRouteStats, type RouteHistoryPoint } from './routeStats'
import { calculateStatistics } from './statistics'
import type { TrackPoint } from '@/types/tracking'
import type { ActivityType, Trip, TripStatus } from '@/types/domain'

// ---------------------------------------------------------------------------
// Input model
// ---------------------------------------------------------------------------

/** Recorded route summary for one trip (values as computed by the canonical
 *  route functions — meters and whole seconds). */
export interface TripRouteSummary {
  /** Distance in meters (canonical: computeRouteStats). */
  distance: number
  /** Elapsed seconds between first and last recorded point. */
  elapsedSeconds: number
  /** Seconds actually moving (canonical: calculateStatistics). */
  movingSeconds: number
  /** Ascent in meters; 0 when no altitude data exists (never fabricated). */
  elevationGain: number
  /** Descent in meters; 0 when no altitude data exists. */
  elevationLoss: number
  /** Highest recorded altitude in meters, or null when no altitude exists. */
  maxElevation: number | null
}

/**
 * A normalized, per-trip input record for analytics.
 *
 * `route` is undefined when the trip has no recorded route — analytics then
 * count the trip in status totals but contribute nothing to distance/time/
 * elevation, so no value is ever invented for a trip without data.
 */
export interface TripActivityRecord {
  tripId: string
  title: string
  status: TripStatus
  activityType: ActivityType
  /**
   * Reference date used for windowing. Chosen from real trip fields by
   * `tripReferenceDate()` (endDate → startDate → plannedDate → createdAt).
   * Null only when no field is a valid date; the aggregators handle that
   * (see window semantics below) instead of guessing.
   */
  date: Date | null
  /** Recorded route statistics, present only when a route exists. */
  route?: TripRouteSummary
}

// ---------------------------------------------------------------------------
// Window semantics (documented contract)
// ---------------------------------------------------------------------------

const MS_PER_DAY = 86_400_000

/**
 * Time window for analytics.
 * - `'all'` — every record with a usable date (plus date-less records).
 * - `{ days: N }` — the last N calendar days ending on the reference day.
 */
export type AnalyticsWindow = 'all' | { days: number }

export interface TripAnalyticsOptions {
  /** Which time window to aggregate. Default: `'all'`. */
  window?: AnalyticsWindow
  /**
   * The "now" anchor that window spans are measured back from.
   *
   * Determinism rule: the pure functions NEVER read the wall clock. When
   * omitted, the reference date defaults to the latest valid record date in
   * the dataset (epoch when no record has a valid date). Production callers
   * should pass an explicit `new Date()`.
   */
  referenceDate?: Date
}

export interface WindowBounds {
  /** Inclusive lower bound — UTC midnight. */
  startInclusive: Date
  /** Exclusive upper bound — UTC midnight of the day AFTER the reference day. */
  endExclusive: Date
}

/**
 * DATE SEMANTICS (canonical for all TrailMate analytics):
 *
 * - Windows are calendar-day aligned in UTC. There is no local-timezone
 *   involvement: a record belongs to the UTC day of its timestamp.
 * - `{ days: N }` covers [utcMidnight(ref) − (N−1) days, utcMidnight(ref) + 1 day):
 *   N full UTC days including the reference day itself.
 * - Boundaries: a record exactly at the start UTC midnight is INCLUDED; a
 *   record exactly at the end UTC midnight (start of the next day) is
 *   EXCLUDED.
 * - Future dates (after the reference day) are excluded from every windowed
 *   result but included in `'all'` results.
 * - Missing/invalid dates can be assigned to no window: they are excluded
 *   from windowed results but included in `'all'` results.
 * - All math uses `Date` epoch milliseconds, which is timezone-independent.
 */
export function resolveWindow(window: AnalyticsWindow, referenceDate: Date): WindowBounds | null {
  if (window === 'all') return null
  if (!Number.isInteger(window.days) || window.days < 1) {
    throw new RangeError(`analytics window days must be a positive integer, got ${window.days}`)
  }
  if (!isValidDate(referenceDate)) {
    throw new RangeError('analytics referenceDate must be a valid Date')
  }
  const refDay = utcDayStart(referenceDate)
  return {
    startInclusive: new Date(refDay.getTime() - (window.days - 1) * MS_PER_DAY),
    endExclusive: new Date(refDay.getTime() + MS_PER_DAY),
  }
}

/** UTC midnight of the day containing `d`. Deterministic; ignores local TZ. */
export function utcDayStart(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

export function isValidDate(d: Date | null | undefined): d is Date {
  return d instanceof Date && Number.isFinite(d.getTime())
}

/**
 * Filters records to a window. Date-less / invalid-date records are dropped
 * from windowed results (they cannot be placed on the time axis); the
 * `'all'` window keeps them.
 */
export function filterByWindow(
  records: readonly TripActivityRecord[],
  window: AnalyticsWindow,
  referenceDate: Date,
): TripActivityRecord[] {
  const bounds = resolveWindow(window, referenceDate)
  if (bounds === null) return [...records]
  const start = bounds.startInclusive.getTime()
  const end = bounds.endExclusive.getTime()
  return records.filter(r => {
    if (!isValidDate(r.date)) return false
    const t = r.date.getTime()
    return t >= start && t < end
  })
}

/** Latest valid record date, or epoch when none exists. */
export function latestRecordDate(records: readonly TripActivityRecord[]): Date {
  let latest = Number.NEGATIVE_INFINITY
  for (const r of records) {
    if (isValidDate(r.date) && r.date.getTime() > latest) latest = r.date.getTime()
  }
  return latest === Number.NEGATIVE_INFINITY ? new Date(0) : new Date(latest)
}

// ---------------------------------------------------------------------------
// Adapter: Trip + recorded points → normalized record
// ---------------------------------------------------------------------------

/**
 * Chooses the windowing reference date for a trip from REAL fields only:
 * endDate → startDate → plannedDate → createdAt.
 *
 * endDate is when the trip actually finished (the natural "when did this
 * activity happen" answer); startDate covers in-progress/multi-day trips;
 * plannedDate covers trips that have not started; createdAt is the
 * last-resort fallback (always present for stored trips). No field is
 * invented when the others are missing.
 */
export function tripReferenceDate(trip: Trip): Date | null {
  const candidates: Array<Date | undefined> = [
    trip.endDate,
    trip.startDate,
    trip.plannedDate,
    trip.createdAt,
  ]
  for (const candidate of candidates) {
    if (isValidDate(candidate)) return candidate
  }
  return null
}

/**
 * Normalizes a trip and its recorded route into a `TripActivityRecord`.
 *
 * Consumes the canonical implementations exactly once each:
 *   - `computeRouteStats(points)` → distance, elapsed time, elevation
 *   - `calculateStatistics(points)` → moving time (same speed-threshold rule
 *     the live tracker uses, so history and live numbers agree)
 */
export function tripActivityRecord(
  trip: Trip,
  points: readonly RouteHistoryPoint[],
  movingSpeedMps?: number,
): TripActivityRecord {
  const record: TripActivityRecord = {
    tripId: trip.id,
    title: trip.title,
    status: trip.status,
    activityType: trip.activityType,
    date: tripReferenceDate(trip),
  }

  if (points.length > 0) {
    const stats = computeRouteStats(points)
    const moving = calculateStatistics(
      points.map((p, index): TrackPoint => ({
        id: `${trip.id}-${index}`,
        tripId: trip.id,
        sessionId: 'analytics',
        timestamp: p.recordedAt.getTime(),
        latitude: p.lat,
        longitude: p.lng,
        altitude: p.elevation,
        synced: true,
      })),
      movingSpeedMps,
    )
    record.route = {
      distance: stats.totalDistance,
      elapsedSeconds: stats.duration,
      movingSeconds: Math.round(moving.movingTime),
      elevationGain: stats.elevationGain,
      elevationLoss: stats.elevationLoss,
      maxElevation: stats.maxElevation,
    }
  }
  return record
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

/** A personal record's link back to the source trip. */
export interface TripReference {
  tripId: string
  title: string
}

/**
 * Aggregated trip analytics for one window.
 *
 * All counts cover the full filtered trip set; all distance/time/elevation
 * totals and averages cover only trips WITH a recorded route in the window;
 * personal records are the per-window maxima (null when no trip qualifies).
 */
export interface TripAnalytics {
  totalTrips: number
  plannedTrips: number
  activeTrips: number
  completedTrips: number
  cancelledTrips: number
  /** Trips in the window that have a recorded route. */
  tripsWithRoute: number

  /** Sum of recorded distances (meters). 0 when no route data. */
  totalDistance: number
  /** Sum of elapsed route times (seconds). */
  totalElapsedTime: number
  /** Sum of moving times (seconds). */
  totalMovingTime: number
  /** Sum of ascent (meters). 0 when no altitude data exists. */
  totalElevationGain: number
  /** Sum of descent (meters). 0 when no altitude data exists. */
  totalElevationLoss: number
  /** True when at least one trip in the window recorded altitude. */
  hasElevation: boolean

  /** totalDistance / tripsWithRoute (meters), null when no trip has a route. */
  averageTripDistance: number | null
  /** totalElapsedTime / tripsWithRoute (seconds), null when no trip has a route. */
  averageDuration: number | null

  /** Recorded trip with the greatest distance (ties: first in input order). */
  longestTrip: (TripReference & { distance: number }) | null
  /** Recorded trip with the greatest ascent; null when all ascent is 0. */
  largestAscent: (TripReference & { elevationGain: number }) | null
  /** Recorded trip with the highest elevation; null when no altitude data. */
  highestElevation: (TripReference & { elevation: number }) | null
  /** Recorded trip with the greatest moving time; null when all is 0. */
  longestMovingTime: (TripReference & { movingSeconds: number }) | null
}

export function emptyTripAnalytics(): TripAnalytics {
  return {
    totalTrips: 0,
    plannedTrips: 0,
    activeTrips: 0,
    completedTrips: 0,
    cancelledTrips: 0,
    tripsWithRoute: 0,
    totalDistance: 0,
    totalElapsedTime: 0,
    totalMovingTime: 0,
    totalElevationGain: 0,
    totalElevationLoss: 0,
    hasElevation: false,
    averageTripDistance: null,
    averageDuration: null,
    longestTrip: null,
    largestAscent: null,
    highestElevation: null,
    longestMovingTime: null,
  }
}

interface Scope {
  filtered: TripActivityRecord[]
  referenceDate: Date
  window: AnalyticsWindow
}

/** Resolves window + reference date once, shared by all aggregators. */
function resolveScope(records: readonly TripActivityRecord[], options: TripAnalyticsOptions): Scope {
  const window = options.window ?? 'all'
  const referenceDate = options.referenceDate ?? latestRecordDate(records)
  return {
    filtered: filterByWindow(records, window, referenceDate),
    referenceDate,
    window,
  }
}

/**
 * Computes the full analytics summary for a window.
 *
 * Deterministic: identical input (records + options) always yields identical
 * output. Ties for personal records resolve to the FIRST record in input
 * order, so callers should pass records in a stable order (e.g. by date).
 */
export function computeTripAnalytics(
  records: readonly TripActivityRecord[],
  options: TripAnalyticsOptions = {},
): TripAnalytics {
  const { filtered } = resolveScope(records, options)

  const result = emptyTripAnalytics()
  for (const r of filtered) {
    result.totalTrips++
    if (r.status === 'planned') result.plannedTrips++
    else if (r.status === 'active') result.activeTrips++
    else if (r.status === 'completed') result.completedTrips++
    else if (r.status === 'cancelled') result.cancelledTrips++

    const route = r.route
    if (!route) continue

    result.tripsWithRoute++
    result.totalDistance += route.distance
    result.totalElapsedTime += route.elapsedSeconds
    result.totalMovingTime += route.movingSeconds
    result.totalElevationGain += route.elevationGain
    result.totalElevationLoss += route.elevationLoss

    if (route.maxElevation !== null) {
      result.hasElevation = true
      if (result.highestElevation === null || route.maxElevation > result.highestElevation.elevation) {
        result.highestElevation = { tripId: r.tripId, title: r.title, elevation: route.maxElevation }
      }
    }
    if (route.elevationGain > 0 &&
        (result.largestAscent === null || route.elevationGain > result.largestAscent.elevationGain)) {
      result.largestAscent = { tripId: r.tripId, title: r.title, elevationGain: route.elevationGain }
    }
    if (result.longestTrip === null || route.distance > result.longestTrip.distance) {
      result.longestTrip = { tripId: r.tripId, title: r.title, distance: route.distance }
    }
    if (route.movingSeconds > 0 &&
        (result.longestMovingTime === null || route.movingSeconds > result.longestMovingTime.movingSeconds)) {
      result.longestMovingTime = { tripId: r.tripId, title: r.title, movingSeconds: route.movingSeconds }
    }
  }

  result.averageTripDistance =
    result.tripsWithRoute > 0 ? result.totalDistance / result.tripsWithRoute : null
  result.averageDuration =
    result.tripsWithRoute > 0 ? result.totalElapsedTime / result.tripsWithRoute : null

  return result
}

// ---------------------------------------------------------------------------
// Activity breakdown
// ---------------------------------------------------------------------------

/** Stable display order for the four activity types (domain.ts). */
export const ACTIVITY_TYPE_ORDER: readonly ActivityType[] = ['trekking', 'cycling', 'camping', 'other']

export interface ActivitySummary {
  activityType: ActivityType
  tripCount: number
  tripsWithRoute: number
  totalDistance: number
  totalElevationGain: number
  /** True when at least one trip of this type recorded altitude. */
  hasElevation: boolean
}

/**
 * Per-activity totals for a window. Only activity types PRESENT in the
 * filtered set are returned (no empty categories), in `ACTIVITY_TYPE_ORDER`.
 */
export function summarizeByActivity(
  records: readonly TripActivityRecord[],
  options: TripAnalyticsOptions = {},
): ActivitySummary[] {
  const { filtered } = resolveScope(records, options)
  const byType = new Map<ActivityType, ActivitySummary>()
  for (const r of filtered) {
    let summary = byType.get(r.activityType)
    if (!summary) {
      summary = {
        activityType: r.activityType,
        tripCount: 0,
        tripsWithRoute: 0,
        totalDistance: 0,
        totalElevationGain: 0,
        hasElevation: false,
      }
      byType.set(r.activityType, summary)
    }
    summary.tripCount++
    if (r.route) {
      summary.tripsWithRoute++
      summary.totalDistance += r.route.distance
      summary.totalElevationGain += r.route.elevationGain
      if (r.route.maxElevation !== null) summary.hasElevation = true
    }
  }
  return ACTIVITY_TYPE_ORDER.filter(type => byType.has(type)).map(type => byType.get(type)!)
}

// ---------------------------------------------------------------------------
// Trends
// ---------------------------------------------------------------------------

export type TrendGranularity = 'day' | 'week' | 'month'

export interface TrendBucket {
  /** Machine key of the bucket start: `YYYY-MM-DD` (day/week) or `YYYY-MM` (month), UTC. */
  key: string
  /** Deterministic human label (UTC). */
  label: string
  /** Trips in this bucket (any status, valid dates only). */
  tripCount: number
  /** Recorded distance in this bucket (meters). */
  distance: number
  /** Recorded ascent in this bucket (meters). */
  elevationGain: number
  /** True when at least one trip in the bucket recorded altitude. */
  hasElevation: boolean
}

export interface TrendOptions extends TripAnalyticsOptions {
  /**
   * Bucket size. When omitted it is chosen deterministically from the window:
   * ≤14 days → day, ≤92 days → week, otherwise month. For `'all'` the choice
   * is based on the span from the earliest record date to the reference date.
   */
  granularity?: TrendGranularity
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function dayKey(d: Date): string {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`
}

function bucketStart(t: Date, granularity: TrendGranularity): Date {
  const day = utcDayStart(t)
  switch (granularity) {
    case 'day':
      return day
    case 'week': {
      // ISO weeks start on Monday. getUTCDay(): 0 = Sunday.
      const offsetFromMonday = (day.getUTCDay() + 6) % 7
      return new Date(day.getTime() - offsetFromMonday * MS_PER_DAY)
    }
    case 'month':
      return new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), 1))
  }
}

function nextBucketStart(b: Date, granularity: TrendGranularity): Date {
  switch (granularity) {
    case 'day':
      return new Date(b.getTime() + MS_PER_DAY)
    case 'week':
      return new Date(b.getTime() + 7 * MS_PER_DAY)
    case 'month':
      return new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth() + 1, 1))
  }
}

function bucketKey(b: Date, granularity: TrendGranularity): string {
  return granularity === 'month'
    ? `${b.getUTCFullYear()}-${pad2(b.getUTCMonth() + 1)}`
    : dayKey(b)
}

function bucketLabel(b: Date, granularity: TrendGranularity): string {
  const month = MONTH_NAMES[b.getUTCMonth()]
  switch (granularity) {
    case 'day':
      return `${month} ${b.getUTCDate()}, ${b.getUTCFullYear()}`
    case 'week':
      return `Week of ${month} ${b.getUTCDate()}, ${b.getUTCFullYear()}`
    case 'month':
      return `${month} ${b.getUTCFullYear()}`
  }
}

/**
 * The bucket size a trend series will use for these records — exported so
 * callers (charts, labels) agree with `buildTrendSeries` on the resolution.
 */
export function resolveTrendGranularity(
  window: AnalyticsWindow,
  records: readonly TripActivityRecord[],
  referenceDate: Date,
  granularity?: TrendGranularity,
): TrendGranularity {
  if (granularity) return granularity
  return defaultGranularity(window, records, referenceDate)
}

function defaultGranularity(
  window: AnalyticsWindow,
  records: readonly TripActivityRecord[],
  referenceDate: Date,
): TrendGranularity {
  if (window !== 'all') {
    if (window.days <= 14) return 'day'
    if (window.days <= 92) return 'week'
    return 'month'
  }
  // 'all': base the resolution on the real span of the data.
  let first = Number.POSITIVE_INFINITY
  for (const r of records) {
    if (isValidDate(r.date) && r.date.getTime() < first) first = r.date.getTime()
  }
  if (first === Number.POSITIVE_INFINITY) return 'month'
  const spanDays = Math.max(
    0,
    Math.floor((utcDayStart(referenceDate).getTime() - utcDayStart(new Date(first)).getTime()) / MS_PER_DAY),
  )
  if (spanDays <= 14) return 'day'
  if (spanDays <= 130) return 'week'
  return 'month'
}

/**
 * Builds a contiguous, zero-filled trend series for a window — one bucket per
 * day/week/month from the window start to the reference day.
 *
 * Bucket alignment: UTC. Weeks start on Monday. Records with invalid or
 * missing dates are never plotted (same rule as `filterByWindow`), and
 * records outside the window are excluded. The returned series is the raw
 * material for charting; UI layers render it.
 */
export function buildTrendSeries(
  records: readonly TripActivityRecord[],
  options: TrendOptions = {},
): TrendBucket[] {
  const window = options.window ?? 'all'
  const referenceDate = options.referenceDate ?? latestRecordDate(records)
  if (!isValidDate(referenceDate)) {
    throw new RangeError('analytics referenceDate must be a valid Date')
  }
  const granularity = resolveTrendGranularity(window, records, referenceDate, options.granularity)
  const bounds = resolveWindow(window, referenceDate)

  // Window lower bound in epoch ms (−∞ for 'all' — but 'all' needs real data
  // to have a first bucket, so it returns [] below when nothing is plottable).
  const lowerBoundMs = bounds?.startInclusive.getTime() ?? Number.NEGATIVE_INFINITY
  const refDay = utcDayStart(referenceDate)

  let firstBucket: Date
  if (bounds !== null) {
    firstBucket = bucketStart(bounds.startInclusive, granularity)
  } else {
    let first = Number.POSITIVE_INFINITY
    for (const r of records) {
      if (isValidDate(r.date) && r.date.getTime() < first) first = r.date.getTime()
    }
    if (first === Number.POSITIVE_INFINITY) return []
    firstBucket = bucketStart(new Date(first), granularity)
  }

  const buckets: TrendBucket[] = []
  for (let start = firstBucket; start.getTime() <= refDay.getTime(); start = nextBucketStart(start, granularity)) {
    const end = nextBucketStart(start, granularity)
    const bucket: TrendBucket = {
      key: bucketKey(start, granularity),
      label: bucketLabel(start, granularity),
      tripCount: 0,
      distance: 0,
      elevationGain: 0,
      hasElevation: false,
    }
    const startMs = start.getTime()
    const endMs = end.getTime()
    for (const r of records) {
      if (!isValidDate(r.date)) continue
      const t = r.date.getTime()
      if (t < startMs || t >= endMs) continue
      if (t < lowerBoundMs) continue
      bucket.tripCount++
      if (r.route) {
        bucket.distance += r.route.distance
        bucket.elevationGain += r.route.elevationGain
        if (r.route.maxElevation !== null) bucket.hasElevation = true
      }
    }
    buckets.push(bucket)
  }
  return buckets
}
