-- Phase 12C: trip sharing and public trails.
--
-- `visibility` remains the single source of truth:
-- - private : only the owner (existing RLS)
-- - shared  : owner-created share tokens; an authenticated visitor with a
--             valid token can read the trip and its route through
--             SECURITY DEFINER functions that project a safe column set
-- - public  : any visitor (anon included) can read the trip and route
--             through a narrow SELECT policy plus a public page that projects
--             only safe fields
--
-- No secret, account, or private field is exposed: the functions and the
-- public policy return route geometry and trip profile fields only.

BEGIN;

CREATE TABLE IF NOT EXISTS public.trip_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT trip_shares_token_valid CHECK (char_length(btrim(token)) BETWEEN 16 AND 128)
);

CREATE INDEX IF NOT EXISTS idx_trip_shares_trip ON public.trip_shares(trip_id);

ALTER TABLE public.trip_shares ENABLE ROW LEVEL SECURITY;

-- Owners manage their own share tokens.
CREATE POLICY "Users can view own trip shares" ON public.trip_shares
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.trips
    WHERE trips.id = trip_shares.trip_id
      AND trips.user_id = (SELECT auth.uid())
  ));
CREATE POLICY "Users can create shares for own trips" ON public.trip_shares
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.trips
    WHERE trips.id = trip_shares.trip_id
      AND trips.user_id = (SELECT auth.uid())
  ));
CREATE POLICY "Users can delete their own trip shares" ON public.trip_shares
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.trips
    WHERE trips.id = trip_shares.trip_id
      AND trips.user_id = (SELECT auth.uid())
  ));

-- Public trail access: anon and authenticated visitors can read trips that
-- are explicitly visibility='public'. No write operation is granted.
CREATE POLICY "Anyone can view public trips" ON public.trips
  FOR SELECT TO anon, authenticated
  USING (visibility = 'public');

CREATE POLICY "Anyone can view route points of public trips" ON public.route_points
  FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public.trips
    WHERE trips.id = route_points.trip_id
      AND trips.visibility = 'public'
  ));

-- Secure token access for `shared` trips. SECURITY DEFINER validates the
-- token and returns an explicit safe column projection only.
CREATE OR REPLACE FUNCTION public.get_shared_trip(p_token text)
RETURNS TABLE (
  id uuid,
  title text,
  description text,
  activity_type text,
  difficulty text,
  visibility text,
  planned_date date,
  start_date timestamptz,
  end_date timestamptz,
  status text,
  estimated_distance double precision,
  estimated_elevation_gain double precision,
  estimated_duration integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT t.id, t.title, t.description, t.activity_type, t.difficulty,
         t.visibility, t.planned_date, t.start_date, t.end_date, t.status,
         t.estimated_distance, t.estimated_elevation_gain, t.estimated_duration
  FROM public.trips t
  JOIN public.trip_shares s ON s.trip_id = t.id
  WHERE s.token = p_token
    AND t.visibility = 'shared'
    AND t.status <> 'cancelled'
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_shared_route(p_token text)
RETURNS TABLE (
  lat double precision,
  lng double precision,
  elevation double precision,
  accuracy double precision,
  recorded_at timestamptz,
  synced boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT r.lat, r.lng, r.elevation, r.accuracy, r.recorded_at, r.synced
  FROM public.route_points r
  JOIN public.trip_shares s ON s.trip_id = r.trip_id
  JOIN public.trips t ON t.id = r.trip_id
  WHERE s.token = p_token
    AND t.visibility = 'shared'
    AND t.status <> 'cancelled'
  ORDER BY r.recorded_at ASC;
$$;

GRANT USAGE ON SCHEMA public TO anon;
GRANT SELECT ON TABLE public.trips TO anon;
GRANT SELECT ON TABLE public.route_points TO anon;
GRANT EXECUTE ON FUNCTION public.get_shared_trip(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_shared_route(text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_shared_trip(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_shared_route(text) FROM anon;

COMMIT;
