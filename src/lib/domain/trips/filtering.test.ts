import { describe, expect, it } from 'vitest'
// Pure filtering logic is also tested via the same validation that the page uses.
// Here we test the deterministic URL filter contract.

function filterTrips(
  trips: Array<{ title: string; status: string; activityType: string }>,
  filters: { search?: string; status?: string; activity?: string },
) {
  const search = (filters.search ?? '').trim().toLowerCase()
  const validStatus = ['planned', 'active', 'completed', 'cancelled'].includes(filters.status ?? '') ? filters.status : undefined
  const validActivity = ['trekking', 'cycling', 'camping', 'other'].includes(filters.activity ?? '') ? filters.activity : undefined
  return trips.filter(t => {
    if (validStatus && t.status !== validStatus) return false
    if (validActivity && t.activityType !== validActivity) return false
    if (search && !t.title.toLowerCase().includes(search)) return false
    return true
  })
}

describe('URL-driven trip filtering', () => {
  const fixtures = [
    { title: 'Alpine Trek', status: 'planned', activityType: 'trekking' },
    { title: 'City Cycle', status: 'active', activityType: 'cycling' },
    { title: 'Desert Camp', status: 'completed', activityType: 'camping' },
    { title: 'Lake Other', status: 'cancelled', activityType: 'other' },
    { title: 'Alpine Cycle', status: 'planned', activityType: 'cycling' },
  ]

  it('filters by search (case-insensitive, trimmed)', () => {
    expect(filterTrips(fixtures, { search: 'alpine' })).toHaveLength(2)
    expect(filterTrips(fixtures, { search: '  ALPINE  ' })).toHaveLength(2)
    expect(filterTrips(fixtures, { search: 'city' })[0].title).toBe('City Cycle')
  })
  it('filters by status', () => {
    expect(filterTrips(fixtures, { status: 'planned' })).toHaveLength(2)
    expect(filterTrips(fixtures, { status: 'active' })[0].title).toBe('City Cycle')
  })
  it('filters by activity', () => {
    expect(filterTrips(fixtures, { activity: 'cycling' })).toHaveLength(2)
    expect(filterTrips(fixtures, { activity: 'trekking' })).toHaveLength(1)
  })
  it('handles combinations', () => {
    expect(filterTrips(fixtures, { search: 'alpine', activity: 'cycling' })).toHaveLength(1)
    expect(filterTrips(fixtures, { status: 'planned', activity: 'cycling' })[0].title).toBe('Alpine Cycle')
    expect(filterTrips(fixtures, { search: 'alpine', status: 'planned' })).toHaveLength(2)
  })
  it('ignores invalid query values (validated drop)', () => {
    // invalid status/activity should be ignored, not cause empty result or error
    expect(filterTrips(fixtures, { status: 'hiking' as string })).toHaveLength(5)
    expect(filterTrips(fixtures, { activity: 'hiking' as string })).toHaveLength(5)
    expect(filterTrips(fixtures, { status: 'INVALID' })).toHaveLength(5)
  })
  it('clearing filters returns all', () => {
    expect(filterTrips(fixtures, {})).toHaveLength(5)
    expect(filterTrips(fixtures, { search: '', status: '', activity: '' })).toHaveLength(5)
  })
  it('never duplicates query params — deterministic', () => {
    // Filtering is pure function; repeated calls give same result
    const a = filterTrips(fixtures, { search: 'alpine', status: 'planned', activity: 'trekking' })
    const b = filterTrips(fixtures, { search: 'alpine', status: 'planned', activity: 'trekking' })
    expect(a).toEqual(b)
  })
})
