-- Phase 12A production verification (read-only).
-- Run in the Supabase SQL editor after applying migrations. This script emits
-- metadata only; it never selects user rows or credential values.

-- Every sensitive table must report row_security_enabled = true.
SELECT
  c.relname AS table_name,
  c.relrowsecurity AS row_security_enabled
FROM pg_class AS c
JOIN pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('trips', 'route_points', 'gear_templates', 'gear_items', 'trip_packing_items')
ORDER BY c.relname;

-- Expect exactly SELECT/INSERT/UPDATE/DELETE policies, all scoped to authenticated.
SELECT
  tablename,
  policyname,
  cmd,
  roles
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('trips', 'route_points', 'gear_templates', 'gear_items', 'trip_packing_items')
ORDER BY tablename, cmd;

-- Every value in these columns must be false.
SELECT
  table_name,
  has_table_privilege('anon', format('public.%I', table_name), 'SELECT') AS anon_can_select,
  has_table_privilege('anon', format('public.%I', table_name), 'INSERT') AS anon_can_insert,
  has_table_privilege('anon', format('public.%I', table_name), 'UPDATE') AS anon_can_update,
  has_table_privilege('anon', format('public.%I', table_name), 'DELETE') AS anon_can_delete
FROM unnest(ARRAY[
  'trips',
  'route_points',
  'gear_templates',
  'gear_items',
  'trip_packing_items'
]) AS table_name
ORDER BY table_name;

-- Existing databases receive new checks as NOT VALID so legacy measurements
-- are never silently altered. Review false rows, remediate deliberately, then
-- run ALTER TABLE ... VALIDATE CONSTRAINT for each constraint. Fresh databases
-- should report true for all constraints.
SELECT
  c.relname AS table_name,
  con.conname AS constraint_name,
  con.convalidated AS validated
FROM pg_constraint AS con
JOIN pg_class AS c ON c.oid = con.conrelid
JOIN pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('trips', 'route_points', 'gear_templates', 'gear_items', 'trip_packing_items')
  AND con.contype = 'c'
ORDER BY c.relname, con.conname;

-- Must return one valid, unique index.
SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'trip_packing_items'
  AND indexname = 'uq_trip_packing_items_trip_source';
