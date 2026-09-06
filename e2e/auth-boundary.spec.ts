import { test, expect } from '@playwright/test'

// The core unauthenticated contract of TrailMate:
//  - Public auth pages must render their forms and stay reachable.
//  - Every protected route must fail closed and redirect to /login when the
//    request is not authenticated (no Supabase session).

test.describe('public auth pages', () => {
  test('login page renders the authentication form', async ({ page }) => {
    await page.goto('/login')

    await expect(
      page.getByRole('heading', { name: 'Welcome Back' }),
    ).toBeVisible()
    await expect(page.locator('input#email')).toBeVisible()
    await expect(page.locator('input#password')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible()
    // Primary auth-flow navigation still works without JavaScript.
    await expect(
      page.getByRole('link', { name: 'Sign up' }),
    ).toHaveAttribute('href', '/signup')
  })

  test('signup page renders the registration form', async ({ page }) => {
    await page.goto('/signup')

    await expect(
      page.getByRole('heading', { name: 'Create Account' }),
    ).toBeVisible()
    await expect(page.locator('input#email')).toBeVisible()
    await expect(page.locator('input#password')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Sign Up' })).toBeVisible()
    await expect(
      page.getByRole('link', { name: 'Sign in' }),
    ).toHaveAttribute('href', '/login')
  })

  test('auth inputs expose accessible labels', async ({ page }) => {
    await page.goto('/login')

    for (const [id, label] of [
      ['email', 'Email'],
      ['password', 'Password'],
    ] as const) {
      await expect(page.locator(`input#${id}`)).toHaveAttribute('id', id)
      await expect(page.locator(`label[for="${id}"]`)).toHaveText(label)
    }
  })
})

test.describe('protected routes fail closed', () => {
  const protectedRoutes = [
    '/',
    '/trips',
    '/trips/new',
    '/gear',
    '/gear/gear-list',
    '/trips/example-trip-id',
  ] as const

  for (const route of protectedRoutes) {
    test(`${route} redirects to /login when unauthenticated`, async ({
      page,
    }) => {
      await page.goto(route)

      await expect(page).toHaveURL(/\/login$/)
      await expect(
        page.getByRole('heading', { name: 'Welcome Back' }),
      ).toBeVisible()
    })
  }
})
