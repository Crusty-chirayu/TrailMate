# TrailMate

TrailMate is an outdoor trip planner and foreground GPS trail recorder built
with Next.js, TypeScript, Supabase, PostgreSQL, Leaflet, and IndexedDB. It keeps
route analytics tied to recorded points rather than estimated or fabricated
activity data.

## Project status

Phase 11 analytics is complete. Phase 12A hardens the database, environment
handling, route boundary, and browser security configuration. Phase 12B hardens
trip reliability and journey behavior. Phase 12C delivers account-isolated
offline storage, deterministic sync recovery, offline completion
reconciliation, normalized GPX/KML import and export, trip sharing with public
trail pages, and an installable offline app shell.

### Implemented

- Supabase email/password authentication and cookie-backed sessions
- Trip planning, listing, detail, deletion, editing, and lifecycle handling
- Foreground browser GPS recording with quality filtering
- User-scoped IndexedDB route/session storage with resumable recording
- Deterministic sync state machine with bounded retry, queue drain, and quarantine
- Offline trip completion reconciliation
- RLS-protected synchronization of route points to Supabase
- Normalized GPX/KML route import and GPX/KML export
- Trip sharing and public trail pages
- Live and historical Leaflet route maps
- Route distance, duration, speed, and elevation statistics
- Elevation profile and chart
- Gear templates and snapshot-based trip packing checklists
- Server-rendered expedition analytics, activity summaries, trends, and records
- Installable PWA shell with offline fallback

### Not currently implemented

- Background GPS recording after the browser closes the page
- Offline map tiles or offline gear/trip mutations
- End-to-end tests and CI pipeline
- Accessibility and performance audit
- Production deployment verification

Map tiles require network access. GPS points continue to be written locally
while connectivity is unavailable and are eligible for later synchronization;
account-scoped isolation, retry hardening, and completion reconciliation are
implemented, while offline map tiles and background recording remain future
work.

## Runtime requirements

- Node.js `>=20.9.0`
- npm 10 or newer
- A Supabase project for authentication and persistent application data

The application uses Next.js 16.3.4, React 19, TypeScript in strict mode,
Tailwind CSS 3, Supabase SSR, and PostgreSQL with Row Level Security.

## Local setup

```bash
git clone https://github.com/Crusty-chirayu/TrailMate.git
cd TrailMate
npm ci
cp .env.example .env.local
```

Set the two public browser values in `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-or-publishable-key
```

Environment files other than `.env.example` are intentionally ignored. Never
commit `.env.local`, a service-role key, database password, or another server
secret. A Supabase anon/publishable key is designed for browser use, but it must
still be paired with correct RLS and should not be stored in tracked environment
files.

Earlier repository history contained configured Supabase values. Those values
must be treated as exposed and rotated in the Supabase dashboard. The current
repository is secured without rewriting public Git history.

Start the development server:

```bash
npm run dev
```

## Database setup and migrations

`supabase/migrations/` is the authoritative database history.

- `0001_tracking_phase7.sql` retains its historical version/name for migration
  compatibility, but now contains the complete fresh-install Phase 12A baseline.
- `0002_gear_system.sql` is an idempotent compatibility migration.
- `20260906000100_phase12a_security_hardening.sql` safely reconciles existing
  databases, resets the RLS policy surface, adds integrity checks, and enforces
  template-assignment uniqueness.
- `supabase/schema.sql` is a readable snapshot of the resulting schema. It is
  not an upgrade script and must not be applied over an existing database.

With the Supabase CLI linked to the intended project, apply migrations in order:

```bash
supabase link --project-ref your-project-ref
supabase db push
```

Before migrating an existing production project, take a database backup. The
Phase 12A migration does not delete route or packing rows and does not clamp or
invent measured GPS values. New checks are added `NOT VALID` on existing
installations so they immediately protect new writes without silently changing
legacy measurements. After deployment:

1. Run `supabase/verification/phase12a_production_checks.sql` in the SQL editor.
2. Confirm RLS is enabled for all five application tables.
3. Confirm `anon` has no table privileges.
4. Review any unvalidated constraints and remediate legacy rows deliberately.
5. Run `ALTER TABLE ... VALIDATE CONSTRAINT ...` for each reviewed constraint.

A fresh database receives validated constraints directly from the baseline.
Live database verification is still required because static repository checks
cannot prove the state of a hosted Supabase project.

### Access model

All application tables have RLS enabled:

- `trips` and `gear_templates` compare `user_id` with `auth.uid()`.
- `route_points` authorize through their owning trip.
- `gear_items` authorize through their owning template.
- `trip_packing_items` authorize through their owning trip.

Each table has explicit `SELECT`, `INSERT`, `UPDATE`, and `DELETE` policies for
`authenticated`. Table privileges are revoked from `anon`. No service-role key
is used by the application.

## Security controls

The Next.js configuration sets:

- Content Security Policy
- `Referrer-Policy: strict-origin-when-cross-origin`
- a restrictive `Permissions-Policy` with geolocation limited to self
- `X-Content-Type-Options: nosniff`
- frame denial through both CSP and `X-Frame-Options`
- production HSTS
- removal of the `X-Powered-By` response header

The CSP permits only the external origins currently required by the product:
Supabase HTTPS/WebSocket endpoints and OpenStreetMap tile images. Inline script
and style execution remains allowed because Next.js hydration and Leaflet use
inline output under the current architecture; `unsafe-eval` is development-only.

Protected trip, gear, and dashboard routes are enforced in `src/proxy.ts`.
Unauthenticated requests redirect to `/login`; `/login`, `/signup`, and the auth
callback remain public.

## Quality commands

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm audit
npm run db:validate
npm run security:scan
```

`db:validate` checks migration versions, baseline/snapshot drift, RLS coverage,
explicit policy operations, anonymous privilege revocation, important database
constraints, assignment uniqueness, and `source_id` type alignment.

`security:scan` scans tracked files without printing matched credential values.
It also warns when environment files exist in historical commits so rotation is
not forgotten.

## Architecture

- `src/app/` — App Router pages, server actions, and auth callback
- `src/components/` — UI, tracking, packing, and analytics components
- `src/lib/domain/` — deterministic domain rules and server data services
- `src/lib/tracking/` — geolocation, IndexedDB persistence, and synchronization
- `src/lib/supabase/` — typed browser/server Supabase clients
- `src/types/` — database and domain contracts
- `supabase/migrations/` — authoritative schema history
- `supabase/verification/` — read-only hosted database checks
- `scripts/security/` — schema and tracked-secret validation

Raw route analytics are calculated server-side from the same canonical route
statistics used elsewhere. GPS collection persists locally before upload so a
network failure does not block recording.

## Roadmap

Foundation work takes priority over new surface area. Planned later phases
include core trip-flow reliability, account-isolated offline storage, robust
sync retry behavior, validated route import, trip sharing, PWA support,
end-to-end testing, CI, accessibility review, and production deployment.
