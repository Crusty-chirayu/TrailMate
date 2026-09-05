import { describe, expect, it } from 'vitest'
import { buildActivityRecords, groupRoutePointsByTrip } from './analyticsService'
import type { RoutePoint as DomainRoutePoint, Trip } from '@/types/domain'
import { computeRouteStats } from './routeStats'
import { haversineDistance } from './geo'

const LEG_M = haversineDistance(46, 8, 46.01, 8)

function makeTrip(overrides: Partial<Trip> & Pick<Trip, 'id'>): Trip {
  return {
    userId: 'user-1',
    title: 'Trip',
    activityType: 'trekking',
    status: 'completed',
    visibility: 'private',
    createdAt: new Date('2026-09-01T08:00:00.000Z'),
    updatedAt: new Date('2026-09-01T08:00:00.000Z'),
    ...overrides,
  }
}

function makePoint(
  tripId: string,
  index: number,
  recordedAt: string,
  elevation?: number,
): DomainRoutePoint {
  return {
    id: `${tripId}-p${index}`,
    tripId,
    lat: 46 + index * 0.01,
    lng: 8,
    elevation, // undefined = no altitude reported (DB nulls are mapped at the service boundary)
    accuracy: 10,
    recordedAt: new Date(recordedAt),
    synced: true,
    metadata: {},
  }
}

describe('groupRoutePointsByTrip', () => {
  it('returns an empty map for no points', () => {
    expect(groupRoutePointsByTrip([]).size).toBe(0)
  })

  it('groups by trip id preserving chronological order within a trip', () => {
    const points = [
      makePoint('t1', 0, '2026-09-04T09:00:00.000Z'),
      makePoint('t1', 1, '2026-09-04T09:01:00.000Z'),
      makePoint('t2', 0, '2026-08-20T08:00:00.000Z'),
      makePoint('t1', 2, '2026-09-04T09:02:00.000Z'),
    ]
    const grouped = groupRoutePointsByTrip(points)
    expect(grouped.size).toBe(2)
    expect(grouped.get('t1')!.map(p => p.recordedAt.toISOString())).toEqual([
      '2026-09-04T09:00:00.000Z',
      '2026-09-04T09:01:00.000Z',
      '2026-09-04T09:02:00.000Z',
    ])
    expect(grouped.get('t2')!.length).toBe(1)
    expect(grouped.get('t2')![0].lat).toBe(46)
  })

  it('maps stored rows onto route-history points (absent altitude stays undefined)', () => {
    const withElev = makePoint('t1', 0, '2026-09-04T09:00:00.000Z', 350)
    const noElev = makePoint('t1', 1, '2026-09-04T09:01:00.000Z')
    const grouped = groupRoutePointsByTrip([withElev, noElev])
    const [first, second] = grouped.get('t1')!
    expect(first.elevation).toBe(350)
    expect(second.elevation).toBeUndefined()
    expect(first.lat).toBe(46)
    expect(first.lng).toBe(8)
  })
})

describe('buildActivityRecords', () => {
  const trips = [
    makeTrip({
      id: 't1',
      title: 'Alpine',
      status: 'completed',
      endDate: new Date('2026-09-04T16:00:00.000Z'),
    }),
    makeTrip({
      id: 't2',
      title: 'Planned Ride',
      status: 'planned',
      activityType: 'cycling',
      plannedDate: new Date('2026-10-01T00:00:00.000Z'),
    }),
  ]

  it('keeps trip order and leaves route undefined for trips without points', () => {
    const pointsByTrip = groupRoutePointsByTrip([
      makePoint('t1', 0, '2026-09-04T09:00:00.000Z'),
      makePoint('t1', 1, '2026-09-04T09:06:00.000Z'),
    ])
    const records = buildActivityRecords(trips, pointsByTrip)
    expect(records.map(r => r.tripId)).toEqual(['t1', 't2'])
    expect(records[0].route).toBeDefined()
    expect(records[1].route).toBeUndefined()
    expect(records[1].status).toBe('planned')
    expect(records[1].date).toEqual(new Date('2026-10-01T00:00:00.000Z'))
  })

  it('derives per-trip route stats through the canonical adapter', () => {
    const points = [
      makePoint('t1', 0, '2026-09-04T09:00:00.000Z', 100),
      makePoint('t1', 1, '2026-09-04T09:06:00.000Z', 250),
    ]
    const records = buildActivityRecords(trips, groupRoutePointsByTrip(points))
    const canonical = computeRouteStats(
      points.map(p => ({ lat: p.lat, lng: p.lng, elevation: p.elevation, recordedAt: p.recordedAt })),
    )
    expect(records[0].route!.distance).toBe(canonical.totalDistance)
    expect(records[0].route!.distance).toBe(Math.round(LEG_M))
    expect(records[0].route!.elapsedSeconds).toBe(360)
    expect(records[0].route!.elevationGain).toBe(150)
    expect(records[0].route!.maxElevation).toBe(250)
  })

  it('handles the empty-trips case', () => {
    expect(buildActivityRecords([], new Map())).toEqual([])
  })
})
