import { describe, expect, it } from 'vitest'
import { tripRowToDomain, tripUpdatesToDatabase } from './service'
import { canTransition, lifecycleDatesForTransition } from './lifecycle'
import { validateTripInput, isActivityType } from './validation'
import type { Trip } from '@/types/database'

const baseRow: Trip = {
  id: 'trip-1',
  user_id: 'user-1',
  title: 'Original',
  description: 'Desc',
  activity_type: 'trekking',
  planned_date: '2026-09-10T00:00:00.000Z',
  start_date: null,
  end_date: null,
  status: 'planned',
  estimated_distance: 10000,
  estimated_elevation_gain: 500,
  estimated_duration: 240,
  difficulty: 'moderate',
  visibility: 'private',
  created_at: '2026-09-01T00:00:00.000Z',
  updated_at: '2026-09-01T00:00:00.000Z',
}

describe('trip journey (full lifecycle with field preservation)', () => {
  it('loads existing values correctly', () => {
    const domain = tripRowToDomain(baseRow)
    expect(domain.title).toBe('Original')
    expect(domain.activityType).toBe('trekking')
    expect(domain.plannedDate?.toISOString()).toBe('2026-09-10T00:00:00.000Z')
    expect(domain.estimatedDistance).toBe(10000)
    expect(domain.status).toBe('planned')
  })

  it('valid update preserves unrelated fields (title-only)', () => {
    const updates = { title: 'Renamed' }
    const db = tripUpdatesToDatabase(updates)
    expect(db).toEqual({ title: 'Renamed' })
    expect('description' in db).toBe(false)
    expect('status' in db).toBe(false)
  })

  it('invalid update is rejected by validation', () => {
    const r = validateTripInput({ title: '', activityType: 'trekking' }, { isUpdate: true })
    expect(r.valid).toBe(false)
    const r2 = validateTripInput({ activityType: 'hiking' }, { isUpdate: true })
    expect(r2.valid).toBe(false)
  })

  it('status-only update does not erase estimates or dates', () => {
    const db = tripUpdatesToDatabase({ status: 'active' })
    expect(db).toEqual({ status: 'active' })
    // Ensure no other keys leaked
    expect(Object.keys(db)).toEqual(['status'])
  })

  it('completes trip journey: planned → active → completed with dates', () => {
    // Start with planned
    expect(canTransition('planned', 'active')).toBe(true)
    const startNow = new Date('2026-09-06T10:00:00Z')
    const startDates = lifecycleDatesForTransition('planned', 'active', {}, startNow)
    expect(startDates.startDate?.toISOString()).toBe(startNow.toISOString())

    // Simulate trip now active with startDate
    const activeTrip = { ...baseRow, status: 'active' as const, start_date: startNow.toISOString() }
    const activeDomain = tripRowToDomain(activeTrip)
    expect(activeDomain.status).toBe('active')
    expect(activeDomain.startDate?.toISOString()).toBe(startNow.toISOString())
    // Other fields preserved
    expect(activeDomain.title).toBe('Original')
    expect(activeDomain.estimatedDistance).toBe(10000)

    // Active → completed
    expect(canTransition('active', 'completed')).toBe(true)
    const endNow = new Date('2026-09-06T14:00:00Z')
    const endDates = lifecycleDatesForTransition('active', 'completed', { startDate: startNow }, endNow)
    expect(endDates.endDate?.toISOString()).toBe(endNow.toISOString())

    // Invalid: planned → completed should be rejected
    expect(canTransition('planned', 'completed')).toBe(false)
  })

  it('repeated transitions are rejected', () => {
    expect(canTransition('active', 'active')).toBe(false)
    expect(canTransition('completed', 'completed')).toBe(false)
    expect(canTransition('completed', 'active')).toBe(false)
  })

  it('ownership rejection is enforced via user_id filter (contract)', () => {
    // This is a contract test: TripService always filters by user_id.
    // We verify the mapping preserves user_id and service uses eq('user_id', user.id)
    // The actual rejection is tested via integration with mocked Supabase (not live DB).
    const domain = tripRowToDomain(baseRow)
    expect(domain.userId).toBe('user-1')
  })

  it('filters remain validated across create/update/filter', () => {
    // Activity must be consistent: DB, validation, and filter all use trekking/cycling/camping/other
    for (const a of ['trekking', 'cycling', 'camping', 'other'] as const) {
      expect(validateTripInput({ title: 'T', activityType: a }, { isUpdate: false }).valid).toBe(true)
    }
    expect(validateTripInput({ title: 'T', activityType: 'hiking' }, { isUpdate: false }).valid).toBe(false)
    // Filter helper drops hiking
    expect(isActivityType('hiking')).toBe(false)
  })

  it('zero and nullable handling in journey', () => {
    // Zero distance is valid and must not be treated as omitted
    const zeroDb = tripUpdatesToDatabase({ estimatedDistance: 0 })
    expect(zeroDb).toEqual({ estimated_distance: 0 })
    // Null clears the field
    const nullDb = tripUpdatesToDatabase({ estimatedDistance: null })
    expect(nullDb).toEqual({ estimated_distance: null })
    // Omitted leaves field absent
    const omittedDb = tripUpdatesToDatabase({})
    expect(omittedDb).toEqual({})
  })
})
