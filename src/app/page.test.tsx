/**
 * Server-render smoke tests for the dashboard (Expedition Log).
 *
 * Services are mocked at the module boundary — the page under test is the
 * composition itself: window-param parsing, analytics → formatted metrics,
 * context line, empty states, and the quick actions / recent trips wiring.
 * The analytics domain and service mapping have their own dedicated tests.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderToReadableStream } from 'react-dom/server'

/** Async SSR: the page is an async (server) component, so the legacy
 *  synchronous renderToString cannot represent it. On Node the returned
 *  stream is a (web) ReadableStream; drain it fully to get the HTML. */
async function renderPage(props: { searchParams: Promise<Record<string, string | undefined>> }): Promise<string> {
  // React 19: renderToReadableStream is async and resolves to a web ReadableStream.
  const stream = await renderToReadableStream(<Home {...props} />)
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let html = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    html += decoder.decode(value, { stream: true })
  }
  // React SSR inserts <!-- --> between adjacent text/expression nodes; strip
  // the markers so assertions read like the visible text.
  return html.replaceAll('<!-- -->', '')
}

const mockGetUser = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: () => mockGetUser() },
  }),
}))

const mockRecords: unknown[] = []
const mockTrips: unknown[] = []
vi.mock('@/lib/domain/tracking/analyticsService', () => ({
  TripAnalyticsService: {
    getTripActivityRecords: async () => mockRecords,
  },
}))
vi.mock('@/lib/domain/trips/service', () => ({
  TripService: {
    getAllTrips: async () => mockTrips,
  },
}))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`)
  },
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(''),
}))

import Home from './page'

const DAY_MS = 86_400_000

function record(overrides: Record<string, unknown>): unknown {
  return {
    tripId: 't1',
    title: 'Alpine Loop',
    status: 'completed',
    activityType: 'trekking',
    date: new Date(Date.now() - DAY_MS),
    route: {
      distance: 12345,
      elapsedSeconds: 3600,
      movingSeconds: 2700,
      elevationGain: 500,
      elevationLoss: 120,
      maxElevation: 1500,
    },
    ...overrides,
  }
}

function trip(overrides: Record<string, unknown>): unknown {
  return {
    id: 't1',
    userId: 'u1',
    title: 'Alpine Loop',
    activityType: 'trekking',
    status: 'completed',
    visibility: 'private',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

describe('dashboard (server render)', () => {
  beforeEach(() => {
    mockGetUser.mockReset()
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'qa@example.com' } } })
    mockRecords.length = 0
    mockTrips.length = 0
  })

  it('renders the empty expedition log for a user without trips', async () => {
    const html = await renderPage({ searchParams: Promise.resolve({}) })
    expect(html).toContain('Expedition Log')
    expect(html).toContain('No expeditions logged yet')
    expect(html).toContain('Plan Your First Trip')
    expect(html).toContain('New Trip')
    expect(html).toContain('No trips yet')
    // No analysis sections for a user without trips (no empty clutter)
    expect(html).not.toContain('Personal records')
    expect(html).not.toContain('By activity')
    expect(html).not.toContain('Distance ·')
  })

  it('renders windowed metrics and context from real analytics values', async () => {
    mockRecords.push(record({}))
    mockTrips.push(trip({ plannedDate: new Date() }))

    const html = await renderPage({ searchParams: Promise.resolve({ window: 'all' }) })

    // Primary metrics (formatted)
    expect(html).toContain('12.3 km')
    expect(html).toContain('Elevation gained')
    expect(html).toContain('+500 m')
    expect(html).toContain('Moving time')
    expect(html).toContain('45:00') // 2700 s moving
    expect(html).toContain('of 1:00:00 elapsed') // 3600 s elapsed
    // Window + context
    expect(html).toContain('all time')
    expect(html).toContain('1 completed')
    expect(html).toContain('average recorded trip 12.3 km over 1:00:00')
    expect(html).toContain('longest:')
    expect(html).toContain('Alpine Loop')
    // Recent adventures
    expect(html).toContain('Recent Adventures')

    // Trend (11E): all-time window with one recent record → day buckets
    expect(html).toContain('Distance · all time')
    expect(html).toContain('Distance per day for all time')
    expect(html).toContain('recorded in 1 of 2 days')

    // Activity breakdown (11D) — only the activity types actually present
    expect(html).toContain('By activity · all time')
    expect(html).toContain('Trekking')
    expect(html).not.toContain('Cycling')

    // Personal records (11F) — all-time, linked to the source trip
    expect(html).toContain('Personal records · all time')
    expect(html).toContain('Longest distance')
    expect(html).toContain('Largest ascent')
    expect(html).toContain('Highest elevation')
    expect(html).toContain('Longest moving time')
    expect(html).toContain('href="/trips/t1"')
  })

  it('renders the no-altitude honesty state (em dash, not a fabricated zero)', async () => {
    mockRecords.push(record({
      route: {
        distance: 3000,
        elapsedSeconds: 900,
        movingSeconds: 800,
        elevationGain: 0,
        elevationLoss: 0,
        maxElevation: null,
      },
    }))
    const html = await renderPage({ searchParams: Promise.resolve({ window: 'all' }) })
    expect(html).toContain('no altitude data')
    // Records: only the ones backed by real data appear (flat, no-altitude
    // route has no ascent or elevation record).
    expect(html).toContain('Longest distance')
    expect(html).not.toContain('Largest ascent')
    expect(html).not.toContain('Highest elevation')
  })

  it('redirects to login when the session is missing', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    await expect(renderPage({ searchParams: Promise.resolve({}) })).rejects.toThrow('REDIRECT:/login')
  })
})
