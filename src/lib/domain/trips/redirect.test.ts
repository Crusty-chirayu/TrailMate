import { describe, expect, it } from 'vitest'

function isRedirectError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'digest' in error &&
    typeof (error as { digest: string }).digest === 'string' &&
    (error as { digest: string }).digest.startsWith('NEXT_REDIRECT')
  )
}

describe('Next.js redirect correctness', () => {
  it('identifies redirect errors by digest', () => {
    expect(isRedirectError({ digest: 'NEXT_REDIRECT;push;/trips;307;' })).toBe(true)
    expect(isRedirectError({ digest: 'NEXT_REDIRECT' })).toBe(true)
    expect(isRedirectError(new Error('Failed to create trip'))).toBe(false)
    expect(isRedirectError({ digest: 'OTHER' })).toBe(false)
    expect(isRedirectError(null)).toBe(false)
    expect(isRedirectError(undefined)).toBe(false)
  })

  it('server action pattern: successful mutation redirects, failure throws plain error', async () => {
    // Simulate successful TripService.createTrip then redirect
    let redirectedTo: string | null = null
    const mockRedirect = (url: string) => {
      // Next.js redirect throws
      const e = new Error('NEXT_REDIRECT') as Error & { digest: string }
      e.digest = `NEXT_REDIRECT;push;${url};307;`
      throw e
    }

    const successfulAction = async () => {
      // pretend TripService succeeded
      mockRedirect('/trips')
    }

    try {
      await successfulAction()
    } catch (e) {
      expect(isRedirectError(e)).toBe(true)
      if (isRedirectError(e)) redirectedTo = '/trips'
    }
    expect(redirectedTo).toBe('/trips')

    // Failure case: TripService throws plain error, action should not redirect
    const failingAction = async () => {
      try {
        throw new Error('Database error')
      } catch (error) {
        if (isRedirectError(error)) throw error
        throw new Error(error instanceof Error ? error.message : 'Failed')
      }
    }

    await expect(failingAction()).rejects.toThrow('Database error')

    // Ensure redirect errors are re-thrown, not swallowed
    const swallowBuggyAction = async () => {
      try {
        mockRedirect('/trips')
      } catch (error) {
        // Buggy: swallows redirect
        console.error(error)
        throw new Error('Failed to create trip')
      }
    }
    await expect(swallowBuggyAction()).rejects.toThrow('Failed to create trip')
    // Correct version re-throws
    const correctAction = async () => {
      try {
        mockRedirect('/trips')
      } catch (error) {
        if (isRedirectError(error)) throw error
        throw new Error('Failed')
      }
    }
    try {
      await correctAction()
    } catch (e) {
      expect(isRedirectError(e)).toBe(true)
    }
  })
})
