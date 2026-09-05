import { describe, expect, it } from 'vitest'
import {
  tripCreateToDatabase,
  tripRowToDomain,
  tripUpdatesToDatabase,
} from './trips/service'
import {
  routePointRowToDomain,
  routePointToDatabase,
} from './tracking/service'
import {
  gearItemRowToDomain,
  gearItemToDatabase,
} from './gear/service'
import { buildTemplateAssignmentRows } from './gear/tripPacking'
import type { GearItem, RoutePoint, Trip } from '@/types/database'

const tripRow: Trip = {
  id: 'trip-1',
  user_id: 'user-1',
  title: 'Sea-level walk',
  description: null,
  activity_type: 'trekking',
  planned_date: null,
  start_date: null,
  end_date: null,
  status: 'planned',
  estimated_distance: 0,
  estimated_elevation_gain: 0,
  estimated_duration: 0,
  difficulty: null,
  visibility: 'private',
  created_at: '2026-09-06T00:00:00.000Z',
  updated_at: '2026-09-06T00:00:00.000Z',
}

const routePointRow: RoutePoint = {
  id: 'point-1',
  trip_id: 'trip-1',
  lat: 0,
  lng: 0,
  elevation: 0,
  accuracy: 0,
  recorded_at: '2026-09-06T00:00:00.000Z',
  synced: true,
  source_id: 'source-1',
  metadata: {},
}

const gearItemRow: GearItem = {
  id: 'item-1',
  template_id: 'template-1',
  item_name: 'Map',
  category: 'navigation',
  checked: false,
  required: true,
  quantity: 1,
  weight: 0,
  notes: null,
  sort_order: 0,
  created_at: '2026-09-06T00:00:00.000Z',
  updated_at: '2026-09-06T00:00:00.000Z',
}

describe('database mapping invariants', () => {
  it('preserves zero elevation and accuracy in both mapping directions', () => {
    const domain = routePointRowToDomain(routePointRow)
    expect(domain.elevation).toBe(0)
    expect(domain.accuracy).toBe(0)

    expect(routePointToDatabase({
      tripId: 'trip-1',
      lat: 0,
      lng: 0,
      elevation: 0,
      accuracy: 0,
    })).toMatchObject({ elevation: 0, accuracy: 0 })
  })

  it('preserves zero trip estimates in both mapping directions', () => {
    const domain = tripRowToDomain(tripRow)
    expect(domain.estimatedDistance).toBe(0)
    expect(domain.estimatedElevationGain).toBe(0)
    expect(domain.estimatedDuration).toBe(0)

    expect(tripCreateToDatabase({
      title: 'Zero baseline',
      activityType: 'other',
      estimatedDistance: 0,
      estimatedElevationGain: 0,
      estimatedDuration: 0,
    }, 'user-1')).toMatchObject({
      estimated_distance: 0,
      estimated_elevation_gain: 0,
      estimated_duration: 0,
    })
  })

  it('maps only supplied trip update fields', () => {
    expect(tripUpdatesToDatabase({ status: 'completed' })).toEqual({
      status: 'completed',
    })
    expect(tripUpdatesToDatabase({
      estimatedDistance: 0,
      description: null,
    })).toEqual({
      estimated_distance: 0,
      description: null,
    })
  })

  it('preserves zero gear weight and sort order', () => {
    const domain = gearItemRowToDomain(gearItemRow)
    expect(domain.weight).toBe(0)
    expect(domain.sortOrder).toBe(0)

    expect(gearItemToDatabase({
      templateId: 'template-1',
      itemName: 'Map',
      quantity: 1,
      weight: 0,
      sortOrder: 0,
    })).toMatchObject({ weight: 0, sort_order: 0 })
  })
})

describe('template assignment snapshots', () => {
  const source = {
    id: 'source-1',
    item_name: 'Water bottle',
    category: 'hydration',
    quantity: 2,
    weight: 0,
    notes: null,
    required: true,
    sort_order: 0,
  }

  it('emits each source item once and preserves zero-valued fields', () => {
    const rows = buildTemplateAssignmentRows(
      'trip-1',
      'template-1',
      [source, source],
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      trip_id: 'trip-1',
      source_item_id: 'source-1',
      weight: 0,
      sort_order: 0,
    })
  })

  it('does not emit a source item that is already assigned', () => {
    const rows = buildTemplateAssignmentRows(
      'trip-1',
      'template-1',
      [source],
      new Set(['source-1']),
    )
    expect(rows).toEqual([])
  })
})
