# TrailMate Reconstruction Architecture

**Status:** Reconstruction in progress
**Started:** 2026-09-05
**Repository:** https://github.com/Crusty-chirayu/TrailMate.git

---

## Repository Baseline

### Current State
- **Branch:** main
- **Remote:** origin (https://github.com/Crusty-chirayu/TrailMate.git)
- **Status:** Clean working tree
- **Files Present:** Configuration files only (package.json, next.config.mjs, tailwind.config.ts, tsconfig.json, .env files, README.md)
- **Missing Files:** Entire application source tree (`src/`), database schema (`supabase/schema.sql`)

### Security Status
**CRITICAL:** Git commit `3b8932b` contained real Supabase credentials:
- `NEXT_PUBLIC_SUPABASE_URL=https://ecsmydzaajlwyekxxivj.supabase.co`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_KRM4dTGx6Sn-aAZG93gbRg_y9RP0ykT`

These were later changed to placeholders in commit `8d9c2d5`, but real credentials remain in Git history.

**Required Actions:**
1. Rotate Supabase project credentials immediately
2. Update `.gitignore` to ignore `.env` (currently only ignores `.env*.local`)
3. Ensure `.env` contains only placeholder values going forward

### Environment Baseline
- **Node.js:** v24.16.0
- **npm:** 11.13.0
- **Next.js:** 14.2.35 (outdated, requires upgrade)
- **React:** ^18 (outdated, requires upgrade to 19.x)
- **Security Issues:** 5 high severity vulnerabilities in dependencies

---

## Chosen Technology Stack

### Core Framework
- **Next.js:** 16.3.4 (latest stable, addresses security vulnerabilities)
- **React:** 19.2.8 (latest stable)
- **TypeScript:** 5.x (strict mode)
- **Node.js:** 18+ (supports current Next.js 16.x)

### Backend & Auth
- **Supabase:** 
  - PostgreSQL database
  - Supabase Auth
  - `@supabase/ssr` v0.12+ (latest for Next.js 16 compatibility)
  - `@supabase/supabase-js` v2.x

### Styling & UI
- **Tailwind CSS:** 3.4+ (current version)
- **Lucide React:** Latest (icon library)
- **Design System:** Custom TrailMate design tokens and primitives

### Testing (Phase 10)
- **Jest** + **React Testing Library** (unit/integration)
- **Playwright** (E2E testing)
- **Vitest** (if adopted for better performance)

### Maps & GIS (Phase 9)
- **Leaflet** + **react-leaflet** (open-source, offline-capable)
- **Alternative:** MapLibre GL JS (if 3D/advanced features needed)

### Performance & Build
- **Turbopack** (Next.js 16.x built-in)
- **Image optimization:** Next.js Image component
- **Code splitting:** Automatic via Next.js

---

## Application Architecture

### Architectural Principles
1. **Layered separation:** Server-only, client-only, and shared code clearly separated
2. **Domain-driven:** Business logic in domain services, not components
3. **Security-first:** RLS at database boundary, validation at multiple layers
4. **Offline-resilient:** Progressive enhancement, graceful degradation
5. **Performance-conscious:** Lazy loading, code splitting, optimized bundles

### Directory Structure
```
trailmate/
├── .devin/
│   └── RECONSTRUCTION_LEDGER.md       # Project progress tracking
├── supabase/
│   └── schema.sql                     # Database schema with RLS policies
├── src/
│   ├── app/                           # Next.js App Router
│   │   ├── layout.tsx                 # Root layout with app shell
│   │   ├── page.tsx                   # Dashboard
│   │   ├── globals.css                # Global styles + design tokens
│   │   ├── login/                     # Authentication pages
│   │   ├── signup/
│   │   ├── auth/callback/            # Supabase auth callback
│   │   ├── trips/                     # Trip management
│   │   ├── gear/                      # Gear management
│   │   └── settings/                  # User settings
│   ├── components/
│   │   ├── ui/                        # Reusable UI primitives
│   │   ├── layout/                    # Layout components (Navigation, Footer)
│   │   ├── features/                  # Feature-specific components
│   │   └── providers/                 # Context providers
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts             # Browser client singleton
│   │   │   ├── server.ts             # Server client
│   │   │   └── middleware.ts         # Session refresh middleware
│   │   ├── domain/                    # Business logic layer
│   │   │   ├── trips/
│   │   │   ├── tracking/
│   │   │   ├── gear/
│   │   │   └── analytics/
│   │   ├── hooks/                     # Custom React hooks
│   │   ├── utils/                     # Utility functions
│   │   └── mockStore.ts               # LocalStorage fallback
│   ├── types/
│   │   ├── database.ts                # Database type definitions
│   │   ├── domain.ts                  # Domain types
│   │   └── api.ts                     # API contract types
│   └── middleware.ts                  # Next.js middleware
├── public/                            # Static assets
├── tests/                             # Test files (Phase 10)
└── package.json
```

---

## Route Structure

### Public Routes
- `/` - Dashboard (authenticated)
- `/login` - Login page
- `/signup` - Sign up page
- `/auth/callback` - Supabase auth callback

### Protected Routes (require authentication)
- `/trips` - Trip list
- `/trips/new` - Create new trip
- `/trips/[id]` - Trip detail & GPS tracking
- `/gear` - Gear templates & checklists
- `/settings` - User settings

### Future Routes
- `/explore` - Public trails discovery
- `/trips/[id]/share` - Shared trip view

---

## Database Model

### Core Tables

#### `trips`
```sql
CREATE TABLE trips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  activity_type TEXT NOT NULL CHECK (activity_type IN ('trekking', 'cycling', 'camping', 'other')),
  planned_date DATE,
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'active', 'completed', 'cancelled')),
  estimated_distance DOUBLE PRECISION,
  estimated_elevation_gain DOUBLE PRECISION,
  estimated_duration INTEGER, -- minutes
  difficulty TEXT CHECK (difficulty IN ('easy', 'moderate', 'hard', 'expert')),
  visibility TEXT DEFAULT 'private' CHECK (visibility IN ('private', 'shared', 'public')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_trips_user_id ON trips(user_id);
CREATE INDEX idx_trips_status ON trips(status);
CREATE INDEX idx_trips_planned_date ON trips(planned_date);
```

#### `route_points`
```sql
CREATE TABLE route_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  elevation DOUBLE PRECISION,
  accuracy DOUBLE PRECISION,
  recorded_at TIMESTAMPTZ DEFAULT now(),
  synced BOOLEAN DEFAULT true,
  metadata JSONB
);

CREATE INDEX idx_route_points_trip_id ON route_points(trip_id);
CREATE INDEX idx_route_points_recorded_at ON route_points(recorded_at);
```

#### `gear_templates`
```sql
CREATE TABLE gear_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT, -- 'backpacking', 'day-hike', 'cycling', etc.
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_gear_templates_user_id ON gear_templates(user_id);
```

#### `gear_items`
```sql
CREATE TABLE gear_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES gear_templates(id) ON DELETE CASCADE,
  item_name TEXT NOT NULL,
  category TEXT, -- 'navigation', 'shelter', 'clothing', etc.
  checked BOOLEAN DEFAULT false,
  quantity INTEGER DEFAULT 1,
  weight DOUBLE PRECISION, -- grams
  notes TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_gear_items_template_id ON gear_items(template_id);
```

### Row Level Security Policies

All tables enforce RLS with user-scoped access:

```sql
-- Trips: User can only access their own trips
ALTER TABLE trips ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own trips" ON trips FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own trips" ON trips FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own trips" ON trips FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own trips" ON trips FOR DELETE USING (auth.uid() = user_id);

-- Route points: Access via trip ownership
ALTER TABLE route_points ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view route points of own trips" ON route_points 
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM trips WHERE trips.id = route_points.trip_id AND trips.user_id = auth.uid()
  ));
-- Similar policies for INSERT/UPDATE/DELETE

-- Gear templates: User-scoped
ALTER TABLE gear_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own gear templates" ON gear_templates 
  FOR ALL USING (auth.uid() = user_id);

-- Gear items: Access via template ownership
ALTER TABLE gear_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage gear items of own templates" ON gear_items 
  FOR ALL USING (EXISTS (
    SELECT 1 FROM gear_templates WHERE gear_templates.id = gear_items.template_id AND gear_templates.user_id = auth.uid()
  ));
```

---

## Data Access Strategy

### Layered Architecture
1. **Database Layer:** PostgreSQL with RLS
2. **Data Access Layer:** Supabase client wrappers with type safety
3. **Domain Layer:** Business logic, calculations, validation
4. **Presentation Layer:** React components consuming domain services

### Data Access Patterns
- **Server Components:** Use `createServerClient` for data fetching
- **Client Components:** Use `createBrowserClient` singleton for mutations
- **Server Actions:** For form submissions and mutations
- **Domain Services:** Isolate business logic from data access

### Offline Strategy
- **Primary:** Supabase with RLS
- **Fallback:** LocalStorage-based `MockStorage` when env vars missing
- **Phase 9 Enhancement:** IndexedDB for offline route recording with sync queue

---

## Authentication Architecture

### Supabase Auth Integration
- **Email/Password:** Primary auth method
- **Session Management:** Cookie-based sessions via `@supabase/ssr`
- **Middleware:** Automatic session refresh on every request
- **Client Sync:** Browser singleton with `onAuthStateChange` listener

### Auth Flow
1. User visits `/login` or `/signup`
2. Supabase Auth handles credentials
3. PKCE flow redirects to `/auth/callback`
4. Middleware refreshes session cookies
5. User redirected to dashboard
6. Client singleton maintains session state

### Security Measures
- Server-only Supabase service client (never exposed to browser)
- Browser client uses anon key only
- RLS enforces data access at database level
- Session refresh on every server request
- Protected routes check auth status

---

## State Management Strategy

### Local State
- **Component State:** React `useState` for UI state
- **Form State:** React Hook Form for complex forms
- **Navigation State:** Next.js App Router navigation

### Server State
- **Data Fetching:** React Server Components for initial data
- **Mutations:** Server Actions for writes
- **Cache:** Next.js built-in fetch caching

### Client State
- **Auth State:** `useAuth()` hook with Supabase client
- **GPS State:** Custom hook for geolocation tracking
- **Offline State:** IndexedDB sync status tracking

### No Global State Management
Avoiding Redux/Zustand unless necessary. The combination of:
- Server Components for data
- React hooks for local state
- URL params for navigation state
...should be sufficient for this application scope.

---

## Offline Strategy

### Phase 1-8: Basic Offline Support
- **Fallback Mode:** LocalStorage when Supabase unavailable
- **Read-Only UI:** Allow viewing cached data when offline
- **Optimistic UI:** Immediate UI updates, sync on reconnect

### Phase 9: Advanced Offline Architecture
- **Service Worker:** Cache app shell and critical assets
- **IndexedDB:** Store route points, gear items offline
- **Sync Queue:** Queue mutations when offline, replay on reconnect
- **Conflict Resolution:** Last-write-wins with timestamps
- **Offline Detection:** Network status API integration

### Offline Data Model
```typescript
interface OfflineQueueItem {
  id: string;
  type: 'trip' | 'route_point' | 'gear_item';
  action: 'create' | 'update' | 'delete';
  data: any;
  timestamp: number;
  synced: boolean;
}
```

---

## Mapping & GPS Strategy

### GPS Tracking
- **API:** `navigator.geolocation` with high-accuracy mode
- **Accuracy Filtering:** Minimum distance (5m), minimum time (1s)
- **Data Model:** Lat, lng, elevation, accuracy, timestamp
- **States:** idle, requesting, tracking, paused, error, saved
- **Fallback:** Demo mode (clearly labeled) for testing

### Map Technology
- **Primary:** Leaflet + react-leaflet (open-source, mature)
- **Fallback:** Static map imagery if tiles unavailable
- **Features:**
  - Route polyline rendering
  - Current location marker
  - Waypoint markers
  - Elevation profile overlay
  - Offline tile caching (Phase 9)

### Route Analytics
- **Distance:** Haversine formula for great-circle distance
- **Elevation:** Cumulative gain/loss calculation
- **Speed:** Pace calculation from timestamps
- **Domain Services:** Isolated, tested calculation functions

---

## Testing Strategy

### Unit Tests (Phase 10)
- **Domain Logic:** Trip calculations, GPS processing, gear logic
- **Utilities:** Validation, formatting, data transformation
- **Framework:** Jest + React Testing Library

### Integration Tests
- **Data Access:** Supabase queries with test database
- **Auth Flows:** Login/signup/logout with test accounts
- **API Routes:** Server actions and route handlers

### E2E Tests
- **Critical Workflows:** 
  - User signup → login → create trip → track GPS → view route
  - Gear template creation → item management → packing progress
- **Framework:** Playwright
- **Coverage:** Core user journeys, not edge cases

### Test Organization
```
tests/
├── unit/
│   ├── domain/
│   └── utils/
├── integration/
│   ├── auth/
│   └── data-access/
└── e2e/
    ├── trips.spec.ts
    ├── tracking.spec.ts
    └── gear.spec.ts
```

---

## Deployment Strategy

### Platform Options
- **Primary:** Vercel (native Next.js hosting)
- **Alternative:** Railway, Render, or self-hosted
- **Database:** Supabase (managed PostgreSQL)

### Environment Configuration
- **Production:** Separate Supabase project with production credentials
- **Staging:** Separate Supabase project for testing
- **Development:** Local development with `.env.local`

### CI/CD Pipeline (Phase 11)
- **GitHub Actions:**
  - On push: Run lint, typecheck, tests
  - On PR: Full test suite + security audit
  - On main: Deploy to staging
  - On tag: Deploy to production

### Deployment Checklist
- [ ] Environment variables configured
- [ ] Database schema applied
- [ ] RLS policies verified
- [ ] SSL/TLS enabled
- [ ] Domain configured
- [ ] Monitoring set up
- [ ] Error tracking (Sentry or similar)
- [ ] Analytics (privacy-respecting)

---

## Major Milestones

### Phase 1: Engineering Foundation ✅
**Objective:** Establish current, secure technical foundation
- Upgrade Next.js to 16.3.4
- Upgrade React to 19.2.8
- Fix security vulnerabilities
- Create app directory structure
- Configure TypeScript strict mode
- Set up ESLint, Prettier
- Fix .gitignore for security

### Phase 2: Authentication & Security
**Objective:** Implement secure Supabase auth
- Create Supabase client/server architecture
- Implement middleware session refresh
- Build login/signup pages
- Create auth callback handler
- Implement protected route middleware
- Configure RLS policies
- Security audit

### Phase 3: Core Data Layer
**Objective:** Build database and data access
- Create database schema
- Implement RLS policies
- Build TypeScript database types
- Create data access layer
- Implement MockStorage fallback
- Add validation layer
- Domain service foundation

### Phase 4: Core UI Shell & Design System
**Objective:** Establish visual foundation
- Create design system tokens
- Build reusable UI primitives
- Implement Navigation component
- Create app layout structure
- Set up responsive breakpoints
- Dark mode support
- Accessibility foundation

### Phase 5: Dashboard
**Objective:** Build command center experience
- Create dashboard with metrics
- Recent activities feed
- Quick actions
- Empty states
- Loading states
- Mobile optimization

### Phase 6: Trip Management
**Objective:** Implement trip CRUD
- Trip list with filters
- Trip creation form
- Trip detail view
- Trip deletion
- Status management
- Activity type handling

### Phase 7: GPS Tracking
**Objective:** Build real GPS recording
- Geolocation integration
- Tracking state machine
- Route point recording
- Accuracy filtering
- Route statistics
- Offline persistence
- Demo mode

### Phase 8: Gear System
**Objective:** Build gear management
- Template CRUD
- Item management
- Packing progress
- Category organization
- Bulk operations
- Mobile checklist UX

### Phase 9: Advanced Features
**Objective:** Add premium features
- Map visualization (Leaflet)
- GPX import/export
- Elevation profile charts
- Service Worker PWA
- IndexedDB offline sync
- Advanced filtering

### Phase 10: Testing, Accessibility, Performance
**Objective:** Quality hardening
- Unit test suite
- Integration tests
- E2E tests
- Accessibility audit
- Performance optimization
- Bundle analysis
- Lighthouse audit

### Phase 11: Production Hardening
**Objective:** Production readiness
- CI/CD pipeline
- Security audit
- Error tracking
- Monitoring
- Analytics
- Documentation
- Deployment verification

---

## Design System Direction

### Visual Identity
**Inspiration:** National park field guides, topographic maps, premium outdoor equipment

### Color Palette (Dark Theme)
- **Background:** Slate-950 (base), Slate-900 (surfaces)
- **Text:** Slate-50 (primary), Slate-400 (secondary)
- **Accents:** 
  - Emerald-500 (success, GPS active)
  - Amber-500 (warning, tracking indicators)
  - Purple-500 (gear, secondary actions)
  - Blue-500 (primary actions)
- **Borders:** Slate-800 (subtle), Slate-700 (stronger)

### Typography
- **Scale:** Modular scale (12px base)
- **Weights:** 400 (regular), 500 (medium), 600 (semibold), 700 (bold)
- **Line heights:** Generous for readability
- **Hierarchy:** Clear size/weight differentiation

### Spacing
- **Scale:** 4px base (4, 8, 12, 16, 24, 32, 48, 64, 96)
- **Components:** Consistent padding/margins
- **Layout:** 8px grid alignment

### Components
**Primitives:** Button, Input, Select, Dialog, Drawer, Badge, Progress, EmptyState
**Feature:** MapPanel, RouteMetric, CoordinateReadout, TripCard, GearChecklist

### Motion
- **Duration:** Fast (150ms), Medium (300ms), Slow (500ms)
- **Easing:** ease-out for most, ease-in-out for entrances
- **Purpose:** State changes, not decoration

---

## Next Steps

1. **Immediate:** Begin Phase 1 (Engineering Foundation)
2. **Security:** Address credential exposure in Git history
3. **Dependencies:** Upgrade to secure, current versions
4. **Architecture:** Implement layered structure
5. **Design:** Build design system before features
6. **Quality:** Test at each phase, not just at end

---

**Last Updated:** 2026-09-05
**Next Phase:** Phase 1 - Engineering Foundation
