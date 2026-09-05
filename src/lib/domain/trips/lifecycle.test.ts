import { describe, expect, it } from 'vitest'
import { canTransition, assertCanTransition, lifecycleDatesForTransition, transitionWithDates } from './lifecycle'

describe('trip lifecycle', () => {
  it('allows planned → active', () => {
    expect(canTransition('planned', 'active')).toBe(true)
    assertCanTransition('planned', 'active')
  })
  it('allows active → completed', () => {
    expect(canTransition('active', 'completed')).toBe(true)
  })
  it('allows planned → cancelled and active → cancelled', () => {
    expect(canTransition('planned', 'cancelled')).toBe(true)
    expect(canTransition('active', 'cancelled')).toBe(true)
  })
  it('rejects invalid transitions', () => {
    expect(canTransition('planned', 'completed')).toBe(false)
    expect(canTransition('completed', 'active')).toBe(false)
    expect(canTransition('cancelled', 'planned')).toBe(false)
    expect(canTransition('active', 'planned')).toBe(false)
    expect(canTransition('completed', 'cancelled')).toBe(false)
    expect(() => assertCanTransition('planned', 'completed')).toThrow(/Invalid trip transition/)
  })
  it('rejects same-status no-op transitions', () => {
    expect(canTransition('planned', 'planned')).toBe(false)
    expect(canTransition('active', 'active')).toBe(false)
  })
  it('sets startDate on planned → active when missing', () => {
    const now = new Date('2026-09-06T12:00:00Z')
    const dates = lifecycleDatesForTransition('planned', 'active', {}, now)
    expect(dates.startDate?.toISOString()).toBe(now.toISOString())
  })
  it('preserves existing startDate on planned → active', () => {
    const now = new Date('2026-09-06T12:00:00Z')
    const existing = new Date('2026-09-01T10:00:00Z')
    const dates = lifecycleDatesForTransition('planned', 'active', { startDate: existing }, now)
    expect(dates).toEqual({})
  })
  it('sets endDate on active → completed when missing', () => {
    const now = new Date('2026-09-06T14:00:00Z')
    const dates = lifecycleDatesForTransition('active', 'completed', {}, now)
    expect(dates.endDate?.toISOString()).toBe(now.toISOString())
  })
  it('preserves existing endDate on active → completed', () => {
    const now = new Date('2026-09-06T14:00:00Z')
    const existing = new Date('2026-09-06T13:00:00Z')
    const dates = lifecycleDatesForTransition('active', 'completed', { endDate: existing }, now)
    expect(dates).toEqual({})
  })
  it('transitionWithDates returns status plus dates', () => {
    const now = new Date('2026-09-06T12:00:00Z')
    const result = transitionWithDates('planned', 'active', {}, now)
    expect(result.status).toBe('active')
    expect(result.startDate?.toISOString()).toBe(now.toISOString())
  })
  it('rejects invalid transition via transitionWithDates', () => {
    expect(() => transitionWithDates('planned', 'completed', {})).toThrow()
  })
})
