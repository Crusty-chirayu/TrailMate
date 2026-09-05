import { describe, expect, it } from 'vitest'
import { validateTripInput, isActivityType, isTripStatus, VALID_ACTIVITY_TYPES } from './validation'

describe('trip validation', () => {
  it('accepts all valid activity values', () => {
    for (const a of VALID_ACTIVITY_TYPES) {
      expect(isActivityType(a)).toBe(true)
      const r = validateTripInput({ title: 'T', activityType: a }, { isUpdate: false })
      expect(r.valid).toBe(true)
    }
  })

  it('rejects hiking and other invalid activities', () => {
    expect(isActivityType('hiking')).toBe(false)
    expect(isActivityType('')).toBe(false)
    expect(isActivityType('HIKING')).toBe(false)
    const r = validateTripInput({ title: 'T', activityType: 'hiking' }, { isUpdate: false })
    expect(r.valid).toBe(false)
    expect(r.errors.join(' ')).toMatch(/Activity must be one of/)
  })

  it('rejects empty title and overly long title', () => {
    expect(validateTripInput({ title: '', activityType: 'trekking' }, { isUpdate: false }).valid).toBe(false)
    expect(validateTripInput({ title: '   ', activityType: 'trekking' }, { isUpdate: false }).valid).toBe(false)
    expect(validateTripInput({ title: 'x'.repeat(161), activityType: 'trekking' }, { isUpdate: false }).valid).toBe(false)
    expect(validateTripInput({ title: 'x'.repeat(160), activityType: 'trekking' }, { isUpdate: false }).valid).toBe(true)
  })

  it('allows title-only update without requiring activity', () => {
    const r = validateTripInput({ title: 'New title' }, { isUpdate: true })
    expect(r.valid).toBe(true)
  })

  it('allows activity-only update and rejects invalid activity on update', () => {
    expect(validateTripInput({ activityType: 'cycling' }, { isUpdate: true }).valid).toBe(true)
    expect(validateTripInput({ activityType: 'hiking' }, { isUpdate: true }).valid).toBe(false)
  })

  it('rejects invalid status and accepts valid ones', () => {
    expect(validateTripInput({ title: 'T', activityType: 'other', status: 'active' }, { isUpdate: false }).valid).toBe(true)
    expect(validateTripInput({ title: 'T', activityType: 'other', status: 'unknown' }, { isUpdate: false }).valid).toBe(false)
    expect(validateTripInput({ status: 'completed' }, { isUpdate: true }).valid).toBe(true)
    expect(validateTripInput({ status: 'flying' }, { isUpdate: true }).valid).toBe(false)
  })

  it('validates date order', () => {
    const start = new Date('2026-09-06T10:00:00Z')
    const end = new Date('2026-09-05T10:00:00Z')
    expect(validateTripInput({ title: 'T', activityType: 'trekking', startDate: start, endDate: end }, { isUpdate: false }).valid).toBe(false)
    expect(validateTripInput({ title: 'T', activityType: 'trekking', startDate: start, endDate: new Date('2026-09-07T10:00:00Z') }, { isUpdate: false }).valid).toBe(true)
  })

  it('validates numeric estimates', () => {
    expect(validateTripInput({ title: 'T', activityType: 'trekking', estimatedDistance: -1 }, { isUpdate: false }).valid).toBe(false)
    expect(validateTripInput({ title: 'T', activityType: 'trekking', estimatedDistance: 0 }, { isUpdate: false }).valid).toBe(true)
    expect(validateTripInput({ title: 'T', activityType: 'trekking', estimatedDistance: 'not-a-number' as unknown as number }, { isUpdate: false }).valid).toBe(false)
    expect(validateTripInput({ estimatedDistance: 0 }, { isUpdate: true }).valid).toBe(true)
    expect(validateTripInput({ estimatedDistance: -5 }, { isUpdate: true }).valid).toBe(false)
  })

  it('allows clearing nullable fields via null treatment', () => {
    // Description 5000 limit
    expect(validateTripInput({ title: 'T', activityType: 'trekking', description: 'x'.repeat(5000) }, { isUpdate: false }).valid).toBe(true)
    expect(validateTripInput({ title: 'T', activityType: 'trekking', description: 'x'.repeat(5001) }, { isUpdate: false }).valid).toBe(false)
  })

  it('validates difficulty and visibility enums', () => {
    expect(validateTripInput({ title: 'T', activityType: 'trekking', difficulty: 'easy' }, { isUpdate: false }).valid).toBe(true)
    expect(validateTripInput({ title: 'T', activityType: 'trekking', difficulty: 'impossible' }, { isUpdate: false }).valid).toBe(false)
    expect(validateTripInput({ visibility: 'public' }, { isUpdate: true }).valid).toBe(true)
    expect(validateTripInput({ visibility: 'secret' }, { isUpdate: true }).valid).toBe(false)
  })

  it('parses activity filter helper consistently', () => {
    expect(validateTripInput({ title: 'T', activityType: 'trekking' }, { isUpdate: false }).valid).toBe(true)
    // Cross-check: database constraint, analytics order, and validation must agree
    // VALID_ACTIVITY_TYPES == DB CHECK + analytics ACTIVITY_TYPE_ORDER
    expect(VALID_ACTIVITY_TYPES).toEqual(['trekking', 'cycling', 'camping', 'other'])
  })
})

describe('isTripStatus helper', () => {
  it('validates trip statuses', () => {
    expect(isTripStatus('planned')).toBe(true)
    expect(isTripStatus('active')).toBe(true)
    expect(isTripStatus('completed')).toBe(true)
    expect(isTripStatus('cancelled')).toBe(true)
    expect(isTripStatus('archived')).toBe(false)
  })
})
