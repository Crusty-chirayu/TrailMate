import { describe, expect, it } from 'vitest'
import { tripUpdatesToDatabase } from './service'

describe('trip update correctness (partial updates preserve fields)', () => {
  it('status-only update produces only status key', () => {
    expect(tripUpdatesToDatabase({ status: 'active' })).toEqual({ status: 'active' })
  })
  it('title-only update', () => {
    expect(tripUpdatesToDatabase({ title: 'New title' })).toEqual({ title: 'New title' })
  })
  it('activity-only update', () => {
    expect(tripUpdatesToDatabase({ activityType: 'cycling' })).toEqual({ activity_type: 'cycling' })
  })
  it('date-only update (plannedDate)', () => {
    const d = new Date('2026-09-10T00:00:00Z')
    expect(tripUpdatesToDatabase({ plannedDate: d })).toEqual({ planned_date: d.toISOString() })
  })
  it('visibility-only update', () => {
    expect(tripUpdatesToDatabase({ visibility: 'public' })).toEqual({ visibility: 'public' })
  })
  it('numeric zero is preserved (not treated as falsy)', () => {
    expect(tripUpdatesToDatabase({ estimatedDistance: 0 })).toEqual({ estimated_distance: 0 })
    expect(tripUpdatesToDatabase({ estimatedElevationGain: 0 })).toEqual({ estimated_elevation_gain: 0 })
    expect(tripUpdatesToDatabase({ estimatedDuration: 0 })).toEqual({ estimated_duration: 0 })
  })
  it('nullable fields: null is sent as null, omitted is absent', () => {
    expect(tripUpdatesToDatabase({ description: null })).toEqual({ description: null })
    expect(tripUpdatesToDatabase({ })).toEqual({})
    expect(tripUpdatesToDatabase({ description: null, estimatedDistance: null })).toEqual({ description: null, estimated_distance: null })
  })
  it('empty string is distinct from null and omitted', () => {
    // For title, empty string is still a value (will fail validation later, but mapping must preserve distinction)
    expect(tripUpdatesToDatabase({ title: '' })).toEqual({ title: '' })
    // Omitted vs empty vs null
    expect(tripUpdatesToDatabase({ title: 'A' })).toEqual({ title: 'A' })
    expect(tripUpdatesToDatabase({ description: '' })).toEqual({ description: '' })
    expect(tripUpdatesToDatabase({} as never)).toEqual({})
  })
  it('false-like values: plannedDate null clears the date', () => {
    expect(tripUpdatesToDatabase({ plannedDate: null })).toEqual({ planned_date: null })
    expect(tripUpdatesToDatabase({ startDate: null })).toEqual({ start_date: null })
    expect(tripUpdatesToDatabase({ endDate: null })).toEqual({ end_date: null })
    expect(tripUpdatesToDatabase({ difficulty: null })).toEqual({ difficulty: null })
  })
  it('preserves legitimate falsy and zero without default invention', () => {
    // No default values for omitted fields
    expect(tripUpdatesToDatabase({ estimatedDistance: 0, estimatedDuration: 0 })).toEqual({
      estimated_distance: 0,
      estimated_duration: 0,
    })
    // Undefined fields do not appear
    const r = tripUpdatesToDatabase({ title: 'T', estimatedDistance: 0 })
    expect(r).toEqual({ title: 'T', estimated_distance: 0 })
    expect('description' in r).toBe(false)
    expect('status' in r).toBe(false)
  })
  it('maps all TripWriteFields correctly with nullish semantics', () => {
    const d = new Date('2026-09-06T00:00:00Z')
    expect(
      tripUpdatesToDatabase({
        title: 'Trip',
        description: null,
        activityType: 'trekking',
        plannedDate: d,
        startDate: null,
        endDate: d,
        status: 'planned',
        estimatedDistance: 0,
        estimatedElevationGain: 0,
        estimatedDuration: 0,
        difficulty: null,
        visibility: 'private',
      }),
    ).toEqual({
      title: 'Trip',
      description: null,
      activity_type: 'trekking',
      planned_date: d.toISOString(),
      start_date: null,
      end_date: d.toISOString(),
      status: 'planned',
      estimated_distance: 0,
      estimated_elevation_gain: 0,
      estimated_duration: 0,
      difficulty: null,
      visibility: 'private',
    })
  })
})
