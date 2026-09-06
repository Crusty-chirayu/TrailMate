-- Phase 12C sharing verification (run as a privileged operator).
-- Read-only checks: report any problems; do not modify data.

DO $$
DECLARE
  problems text[] := '{}';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='trips' AND policyname='Anyone can view public trips') THEN
    problems := problems || 'missing public-trips SELECT policy';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='route_points' AND policyname='Anyone can view route points of public trips') THEN
    problems := problems || 'missing public route_points SELECT policy';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='trip_shares') THEN
    problems := problems || 'trip_shares has no RLS policies';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_shared_trip') THEN
    problems := problems || 'get_shared_trip function missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_shared_route') THEN
    problems := problems || 'get_shared_route function missing';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE table_schema='public' AND table_name IN ('trips','route_points')
      AND grantee='anon' AND privilege_type IN ('INSERT','UPDATE','DELETE')
  ) THEN
    problems := problems || 'anon has write privileges on public route data';
  END IF;

  IF cardinality(problems) > 0 THEN
    RAISE NOTICE 'SHARING PROBLEMS: %', array_to_string(problems, '; ');
  ELSE
    RAISE NOTICE 'Sharing verification passed.';
  END IF;
END $$;
