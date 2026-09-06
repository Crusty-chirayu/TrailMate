import { test, expect } from '@playwright/test'

// Browser security hardening (next.config.mjs `headers()`):
// the CSP, frame and content-type protections must be present on both the
// public pages and the fail-closed auth redirects, and the framework must not
// advertise its technology via the X-Powered-By header.

test('applies security headers and hides X-Powered-By on public pages', async ({
  request,
}) => {
  const response = await request.get('/login')
  expect(response.status()).toBe(200)

  const headers = response.headers()
  expect(headers['x-frame-options']).toBe('DENY')
  expect(headers['x-content-type-options']).toBe('nosniff')
  expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin')
  expect(headers['permissions-policy']).toContain('geolocation=(self)')
  expect(headers['content-security-policy']).toContain(`default-src 'self'`)
  expect(headers['content-security-policy']).toContain(`object-src 'none'`)
  expect(headers['x-powered-by']).toBeUndefined()
})

test('fail-closed redirect stays protected and does not leak framework', async ({
  request,
}) => {
  const response = await request.get('/', { maxRedirects: 0 })
  expect(response.status()).toBe(307)

  const headers = response.headers()
  expect(headers.location).toBe('/login')
  expect(headers['x-frame-options']).toBe('DENY')
  expect(headers['x-content-type-options']).toBe('nosniff')
  expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin')
  expect(headers['x-powered-by']).toBeUndefined()
})

test('CSP permits only the configured integrations', async ({ request }) => {
  const response = await request.get('/signup')
  expect(response.status()).toBe(200)

  const csp = response.headers()['content-security-policy'] ?? ''
  expect(csp).toContain(`base-uri 'self'`)
  expect(csp).toContain(`frame-ancestors 'none'`)
  expect(csp).toContain(`frame-src 'none'`)
  expect(csp).toContain(`upgrade-insecure-requests`)
  // No inline third-party analytics or ad origins.
  expect(csp).not.toContain('googleanalytics')
  expect(csp).not.toContain('doubleclick')
})
