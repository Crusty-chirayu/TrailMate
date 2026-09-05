import { describe, expect, it } from 'vitest'
import { isProtectedPath } from './proxy'

describe('protected route boundary', () => {
  it.each([
    '/',
    '/trips',
    '/trips/new',
    '/trips/trip-1',
    '/gear',
    '/gear/template-1',
  ])('protects %s', path => {
    expect(isProtectedPath(path)).toBe(true)
  })

  it.each([
    '/login',
    '/signup',
    '/auth/callback',
  ])('keeps %s public', path => {
    expect(isProtectedPath(path)).toBe(false)
  })
})
