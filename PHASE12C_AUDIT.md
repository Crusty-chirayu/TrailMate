# Phase 12C — Read-Only Tracking System Audit

**Baseline:** `816046742d2e5176b72bb9ba9141065d9f6b889b`
**Verification:** `HEAD == origin/main == 8160467`; working tree clean; session branch checked out from `main`; remote `https://github.com/Crusty-chirayu/TrailMate.git` reachable via authenticated HTTPS.
**Only mutation made:** removed the active `.git/hooks/commit-msg` hook (appended a `Co-authored-by:` trailer to every commit). No other hooks, no config, no templates; all `.git/hooks` entries are now `.sample` files. Git identity verified: `Crusty-chirayu <182366692+Crusty-chirayu@users.noreply.github.com>`.
**No application code changed. No commits created.**

Baseline test state (after `npm ci`): **253 tests / 25 files pass** (3.45 s). Note: repo is a shallow clone (depth 1), so historical phase commits are not locally inspectable.

---

## 1. Current architecture (verified implementation, not docs)

```
Geolocation API                 (src/lib/tracking/geolocation.ts)
      │ watchPosition → fix
      ▼
useTracking (src/lib/hooks/useTracking.ts)          ← only integration point (TrackingDashboard)
   │  evaluatePosition (filters) → TrackPoint {id: uuid, tripId, sessionId, ...}
   │  reduceSession (pure state machine) → TrackingSession (stats, status, pointCount)
   ├──▶ IndexedDB  DB 'trailmate' v1                 (src/lib/tracking/storage.ts)
   │        stores: sessions (keyPath id), points (keyPath id, idx byTrip/bySession),
   │                pending (keyPath id = point ids awaiting upload)
   │        adapter: IndexedDbAdapter / MemoryDbAdapter; TrackingStore (persistence.ts)
   └──▶ TrackingSync (src/lib/tracking/sync.ts)      ← decoupled from GPS loop
            └─▶ SyncUploader = createSupabaseSyncUploader (supabaseSync.ts)
                  └─▶ supabase.from('route_points').upsert(rows, {onConflict:'source_id'})
                        (browser anon-key client; RLS trip-ownership enforced)
Server read path (route history / analytics):
   TripRoutePage → TrackingService.getRoutePointsByTripId/ForTrips (server client, RLS)
   → routeStats / elevation / GPX export (client-side)
```

Key design points that ARE correct:
- Recording never awaits the network; points are written to IndexedDB before sync.
- Client point ids dedupe uploads (`source_id` unique partial index in DB, both `0001_tracking_phase7.sql` and the 12A hardening migration).
- Sync uploads oldest-first, single in-flight batch (re-entrancy guard), and local `synced` flags prevent re-upload.
- Server-side user scoping is genuine: RLS on `route_points` derives ownership through `trips.user_id = auth.uid()` (INSERT/UPDATE/SELECT/DELETE policies), `anon` fully revoked, `authenticated` granted. 12A rebuilt the whole policy surface and installed constraints NOT VALID with a documented validate-and-remediate workflow.
- Server queries filter `.eq('user_id', user.id)` for trips and rely on RLS for route points; auth guard `src/proxy.ts` (`proxy` export, Next 16 convention) fails closed on unauthenticated access and missing env.
- GPS filter thresholds, stats math, elevation, GPX, and the reducer state machine are pure and well-tested.

---

## 2. Actual failure modes (confirmed in code, ordered by severity)

**F1 — Failed uploads never retry (UI claim is false).**
`TrackingSync.scheduleRetry()` is only reachable from `start()` when the instance already has status `failed`/`pending` (`sync.ts:123-124`). A freshly constructed instance starts `'local'`, so the branch never fires; the failure path at `sync.ts:82-85` only doubles `backoffMs` and sets `failed` — it never schedules a timer. `StatusIndicator.tsx` prints **"Sync retrying…"** for the `failed` state (`StatusIndicator.tsx:36`), so the UI asserts a retry that does not exist. Only manual events (`online`, `focus`, a new GPS fix, or any reducer dispatch) can re-trigger `syncNow`.

**F2 — Batch drain stalls: long routes are not fully synchronized.**
`syncNow()` uploads exactly one batch (max 200) and, if points remain, sets `'pending'` but schedules nothing (`sync.ts:80-81`). An uninterrupted run drains because every fix calls `syncNow()`, but after a refresh, a tab reopen, or an offline→online recovery with >200 queued points, only the first 200 upload; the rest wait for the next `focus`/fix. `finish()` (`useTracking.ts:292`) also awaits only one batch, so a completed session can be left 200+ points short.

**F3 — One stale point poisons the whole queue.**
`createSupabaseSyncUploader` uploads the entire batch in one upsert (`supabaseSync.ts`). `TrackingStore.deleteSession()` / `clearSessions()` are dead code — **nothing** purges local points when a trip is deleted server-side (DELETE: `DeleteTripButton` → `TripService.deleteTrip` → server cascades `route_points`), and nothing purges on logout. A pending point whose trip was deleted then fails the RLS `EXISTS(trips...)` check, failing the whole request; the batch is retried forever, blocking all other points. Long-lived pending entries also never age out.

**F4 — Local storage is not user-scoped, and logout/account-switch is unsafe.**
DB name `'trailmate'` is global (`storage.ts:7`); sessions/points/pending carry no `userId`. `Navigation.handleLogout` only signs out and navigates (`Navigation.tsx`); nothing stops/clears tracking data. Consequences on a shared device:
- User B's sync engine sees user A's pending points and tries to upload them with A's `trip_id` → RLS failure → F3-style poisoning of B's queue.
- `getResumableSessions()` matches only `tripId`, so cross-user visibility is limited to same-trip-id cases, but A's data (including coordinates) remains on disk indefinitely after logout; there is no per-user wipe or "sign-out while recording" guard.
- `clearSessions()` (the intended cleanup) has zero call sites.

**F5 — `session.syncState` diverges from the sync engine.**
`TrackingSync.onStateChange` updates only the hook's React state (`useTracking.ts:52`). The `SET_SYNC` reducer event exists but is never dispatched (`reducer.ts:196-199` dead), so the session record written to IndexedDB (and held in React state) keeps `syncState: 'local'` forever — even after thousands of points are uploaded. The persisted session is a misleading source of truth for any recovery UI. Same story for `persistenceState`: `SET_PERSISTED` is never dispatched; `applySession` flips it to `'error'` on save failure but never to `'persisted'`, so every durable session reads `'none'`.

**F6 — Points accepted during GPS-error state are saved but not counted.**
`handleFix` admits fixes when status is `acquiring | tracking | error` (`useTracking.ts:102`), but `reduceSession` POSITION only accepts `acquiring | tracking` and returns the *same* session object for invalid transitions. The caller cannot distinguish "unchanged" from "accepted", so with status `error` a fix is silently **persisted and queued for upload** (`useTracking.ts:133`) while `pointCount`/stats are not updated → the route history will show points the tracker dashboard never counted, and the session record diverges from its points.

**F7 — Persistence writes are non-atomic, and point writes are 1+N transactions.**
`savePoint()` = `put(points)` then `put(pending)` in two separate transactions (`persistence.ts:54-56`); `addPoints()` loops per point (`:59-62`). A crash between them leaves a point on disk with no pending entry → never uploaded, never marked synced. Mirror crash between `markPointsSynced` point-updates and pending-deletes leaves orphan pending entries that are scanned forever. Long-route performance is also poor: `getUnsyncedPoints` loads *all* pending records then does ~200 sequential `get`s; `markPointsSynced` does a full `getAll` of every point plus per-id puts/deletes.

**F8 — Offline completion is local-only.**
`finish()` stops GPS, awaits one sync attempt, marks the session `completed` locally — it never calls `TripService.completeTrip`. If offline, the trip stays `active` server-side and points stay pending; there is no reconciliation step, no "finish again to sync" affordance, and no user-visible "completed with N unsynced points" state. The route history page reads the server only, so a completed-but-unsynced hike silently shows nothing.

**F9 — GPS error recovery is a dead end.**
`RETRY` reducer event exists but is never dispatched and there is no retry control; `TrackingControls` has no retry button. After a transient `timeout`/`unavailable` the engine maps to `error`, and pressing Start creates a **brand-new session id** (the errored session isn't in `RESUMEABLE`), orphaning the old session and its queued points while the new session starts fresh.

**F10 — Unbounded server reads for long routes.**
`getRoutePointsByTripId`/`getRoutePointsForTrips` fetch `*` with no `.limit()`/pagination, and the route page renders a Leaflet polyline over every point — at 5,000+ points this is a payload/memory/render risk for a long hike, with no downsampling or chunking.

**F11 — Upsert trust model edge (low likelihood, worth noting).**
`source_id` uniqueness is global (`idx_route_points_source_id`), not per-user/trip. A collision with a row the caller doesn't own yields a silent no-op success (RLS update filters 0 rows, supabase returns no error), and the client then marks the point synced even though it was never written. Random UUIDs make this improbable, but there is no post-upload verification (e.g., select back by `source_id`) and no namespacing of the dedupe key.

---

## 3. Files involved

| Area | Files |
|---|---|
| Local storage | `src/lib/tracking/storage.ts` (DB_NAME/version, adapters, indexes), `src/lib/tracking/persistence.ts` (TrackingStore), `src/types/tracking.ts` (TrackPoint, TrackingSession, SyncState) |
| Sync engine | `src/lib/tracking/sync.ts` (TrackingSync), `src/lib/tracking/supabaseSync.ts` (uploader) |
| Hook / integration | `src/lib/hooks/useTracking.ts`, `src/lib/hooks/useAuth.ts` |
| UI | `src/components/tracking/TrackingDashboard.tsx`, `StatusIndicator.tsx`, `TrackingControls.tsx`, `TrackingMap.tsx`, `src/app/trips/[id]/track/page.tsx` |
| Route history / export | `src/app/trips/[id]/route/page.tsx`, `RouteHistoryMap.tsx`, `GpxExportButton.tsx`, `src/lib/domain/tracking/service.ts`, `routeStats.ts`, `elevation.ts`, `gpx.ts` |
| Domain state | `src/lib/domain/tracking/reducer.ts`, `statistics.ts`, `filtering.ts`, `geo.ts` |
| Geolocation | `src/lib/tracking/geolocation.ts` |
| Trip lifecycle / delete / auth | `src/lib/domain/trips/service.ts`, `src/lib/domain/trips/lifecycle.ts`, `src/components/trips/DeleteTripButton.tsx`, `src/app/trips/[id]/page.tsx`, `src/components/layout/Navigation.tsx`, `src/proxy.ts` |
| DB / RLS | `supabase/migrations/0001_tracking_phase7.sql`, `supabase/migrations/20260906000100_phase12a_security_hardening.sql`, `supabase/schema.sql`, `supabase/verification/phase12a_production_checks.sql` |

## 4. Existing tests (all passing)

- **Sync (`sync.test.ts`, 6):** empty→synced; oldest-first + mark-synced; dedupe on re-run; failure→failed→second call recovers; offline→pending→online→synced; single in-flight batch. **Missing:** retry timer/backoff (none exists), batch draining >200, auth/RLS error classification, cross-user queues, timer under fake timers.
- **Persistence (`persistence.test.ts`, 6):** session round-trip; resumable filter/order; point ordering; unsynced filter + mark-synced; session+point delete; memory-vs-IDB equivalence. **Missing:** atomicity, user scoping, large-volume (5k+), stale pending cleanup.
- **Reducer (`reducer.test.ts`, 9):** start/double-start, acquiring→tracking, distance accumulation, pause/resume, finish/complete, error mapping + RETRY-to-acquiring. **Missing:** SET_SYNC/SET_PERSISTED behavior (never dispatched), invalid-transition semantics (same-object return — root of F6).
- **Geolocation (`geolocation.test.ts`, 6), filtering (12), stats (9), routeStats (9), elevation (7), gpx (7), geo (12), analytics (59), analyticsService (6).** Robust pure-domain coverage.
- **No tests:** `useTracking` hook (React integration — would need jsdom + testing-library, not currently installed), `supabaseSync` uploader, trip-delete ↔ local-store cleanup, logout/account-switch behavior, route-history large payloads.

---

## 5. Proposed 12C architecture

1. **User-scoped local namespace.** Persist `userId` on every record; scope the IndexedDB store per current user (either DB-per-user `trailmate-<uid>` or a `userId` key + scoped indexes), with an idempotent cleanup path (`clearUserData(userId)`) invoked on logout and account switch. Guard: refuse to start/resume a session when the stored `userId` ≠ current auth user.
2. **Durable, atomic writes.** Write point + pending marker in one transaction (or derive the queue from the points store via a `synced`/`tripId` index and drop the separate pending store). Single write per fix; batch `addPoints` in one transaction. Migrate v1 data during an IndexedDB `onupgradeneeded` version bump (preserve user data).
3. **Real sync state machine.** `TrackingSync` owns a retry loop: schedule on *every* failure with jittered exponential backoff (2 s → 60 s, ±20%), cancel on success/stop, cap attempts with a "delayed" state, and drain batches in a loop until empty or failing. Expose `getState()`, `nextRetryAt`, and a manual `syncNow()`; UI shows honest labels ("Retrying in 12 s", "Manual retry").
4. **Classify failures.** Network/offline → backoff; auth missing/expired or RLS/permission → suspend (don't hammer) until auth resumes; per-row errors (deleted trip) → quarantine/drop with a recorded reason rather than blocking the batch. Uploader should split batches on row-level failure and verify writes (select back by `source_id` under RLS).
5. **Single source of sync truth.** Wire `onStateChange` → `SET_SYNC` into the session reducer so `session.syncState` and `persistenceState` are always accurate and persisted; remove or document dead events (`SET_SYNC`, `SET_PERSISTED`, `RETRY` paths).
6. **Offline finish/recovery.** On finish: persist complete locally, then reconcile — mark trip completed server-side when reachable, else queue the completion and reconcile on reconnect; expose completion/sync state in the dashboard and route page.
7. **Harden lifecycle edges.** Fix the `error`-state fix admission (F6) by having the reducer/transitions return a nullable result or by gating fix handling on actual reducible states; on GPS error keep the same session and offer an explicit RETRY that restarts the watcher instead of creating a new session; prune orphaned sessions.
8. **Long-route robustness.** Chunked drain, bounded per-batch work, batched transactions, downsampling/pagination for route history and analytics, stress tests at 5k–50k points (fake IndexedDB).

## 6. Recommended implementation order

1. **Storage layer:** user scoping + atomic writes + v1→v2 IndexedDB migration + purge/cleanup APIs (tests: scope, atomicity, 5k+ points, migration). Foundation for everything else.
2. **Sync engine:** retry/backoff state machine, batch drain, failure classification, honest status + manual retry (tests with fake timers; batch drain; auth/RLS errors; cross-user queue isolation).
3. **State truth:** dispatch `SET_SYNC`/`SET_PERSISTED`, fix reducer transition semantics and the `error`-state fix bug; dashboard/label fixes.
4. **Offline completion + server reconciliation** (trip `completed` on finish; reconnect queue).
5. **Logout/account-switch safety + trip-delete local cleanup.**
6. **Long-route & read-path robustness** (pagination/downsampling, chunked reads).
7. **Uploader hardening** (row-level isolation, post-upload verification, optional per-trip `source_id` scoping migration).
8. **Integration test harness** (jsdom + testing-library: hook/controller tests, logout and switch-user scenarios).

Each unit: test → commit → push → PR → merge → fetch/verify → ledger update.

## 7. Risks / blockers

- **Migration risk:** IndexedDB `DB_VERSION` bump must preserve existing user data; carefully sequence app deployment vs storage schema upgrade (versioned upgrade, back-compat reads).
- **DB constraint change:** replacing the global unique `source_id` index with a per-trip (or per-user) constraint requires dropping/rebuilding (`DROP INDEX CONCURRENTLY`-style migration) and changes dedupe semantics — must ship with the app change that writes the new key.
- **Semantics change to `finish()`** (server trip completion) touches the trip lifecycle: `TripService.completeTrip` uses `assertCanTransition(active→completed)`; an offline reconciliation path must not double-complete or overwrite dates.
- **No live Supabase in sandbox:** RLS behavior verified by reading migrations + 12A verification scripts, not by a live integration run; uploader verification needs a test project or robust mocks.
- **Missing test deps** (jsdom, React Testing Library) and no existing hook tests — new harness needed before test-first work on `useTracking`.
- **Shallow clone:** only the merge commit is present locally; historical phase context must come from `origin` if needed.
- **Large payloads:** analytics/route reads and Leaflet rendering need a bounded strategy before claiming long-route robustness.
- **Prohibited-term hygiene:** all future commits/diffs/messages must avoid the listed attribution strings; the pre-existing commit-msg hook has been removed and no other hook/attribution config exists.
