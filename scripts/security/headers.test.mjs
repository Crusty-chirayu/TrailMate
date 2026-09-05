import { describe, expect, it } from 'vitest'
import nextConfig, { securityHeaders } from '../../next.config.mjs'

describe('Next.js security headers', () => {
  const byName = new Map(securityHeaders.map(header => [header.key, header.value]))

  it('removes framework attribution and emits the required browser protections', async () => {
    expect(nextConfig.poweredByHeader).toBe(false)
    expect(byName.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin')
    expect(byName.get('Permissions-Policy')).toContain('geolocation=(self)')
    expect(byName.get('X-Content-Type-Options')).toBe('nosniff')
    expect(byName.get('X-Frame-Options')).toBe('DENY')
    expect(await nextConfig.headers()).toEqual([
      { source: '/(.*)', headers: securityHeaders },
    ])
  })

  it('keeps the CSP compatible with Supabase, Leaflet tiles, local fonts, and blob downloads', () => {
    const csp = byName.get('Content-Security-Policy')
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).toContain("object-src 'none'")
    expect(csp).toContain('https://*.tile.openstreetmap.org')
    expect(csp).toContain('https://*.supabase.co')
    expect(csp).toContain('wss://*.supabase.co')
    expect(csp).toContain("font-src 'self' data:")
    expect(csp).toContain("media-src 'self' blob:")
  })
})
