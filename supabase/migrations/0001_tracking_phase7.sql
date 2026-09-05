-- Phase 7: GPS Tracking - idempotent synchronization support.
--
-- Adds a stable, client-generated `source_id` to `route_points` so track points
-- uploaded from the browser can be synchronized safely with an UPSERT ON
-- CONFLICT (source_id). Safe to apply to an existing database; preserves data.

-- The column that holds the stable client id.
ALTER TABLE public.route_points ADD COLUMN IF NOT EXISTS source_id TEXT;

-- Unique, partial index backing the upsert conflict target.
-- Partial so that pre-existing NULLs (legacy server-inserted points) remain valid.
CREATE UNIQUE INDEX IF NOT EXISTS idx_route_points_source_id
  ON public.route_points (source_id)
  WHERE source_id IS NOT NULL;

COMMENT ON COLUMN public.route_points.source_id IS
  'Stable client-generated id used for idempotent synchronization of GPS track points.';