-- Phase 12A: security, integrity, and migration-baseline hardening.
--
-- Existing data is preserved. New CHECK constraints are installed NOT VALID:
-- PostgreSQL enforces them for new/changed rows without rejecting a deployment
-- because of unknown legacy rows. Operators must run the documented validation
-- queries, remediate any reported legacy rows without fabricating GPS data, and
-- then VALIDATE each constraint in production.

BEGIN;

-- Reconcile columns introduced by the legacy delta migrations.
ALTER TABLE public.route_points ADD COLUMN IF NOT EXISTS source_id TEXT;
ALTER TABLE public.gear_items ADD COLUMN IF NOT EXISTS required BOOLEAN DEFAULT false;
ALTER TABLE public.gear_items ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

CREATE TABLE IF NOT EXISTS public.trip_packing_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  template_id UUID REFERENCES public.gear_templates(id) ON DELETE SET NULL,
  source_item_id UUID REFERENCES public.gear_items(id) ON DELETE SET NULL,
  item_name TEXT NOT NULL,
  category TEXT,
  quantity INTEGER NOT NULL DEFAULT 1,
  weight DOUBLE PRECISION,
  notes TEXT,
  required BOOLEAN NOT NULL DEFAULT false,
  packed BOOLEAN NOT NULL DEFAULT false,
  packed_at TIMESTAMPTZ,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Safe normalization for nullable legacy defaults. No measured GPS value is
-- changed, clamped, estimated, or deleted.
UPDATE public.trips SET visibility = 'private' WHERE visibility IS NULL;
ALTER TABLE public.trips ALTER COLUMN visibility SET DEFAULT 'private';
ALTER TABLE public.trips ALTER COLUMN visibility SET NOT NULL;

UPDATE public.route_points SET synced = true WHERE synced IS NULL;
UPDATE public.route_points SET metadata = '{}'::jsonb WHERE metadata IS NULL;
ALTER TABLE public.route_points ALTER COLUMN synced SET DEFAULT true;
ALTER TABLE public.route_points ALTER COLUMN synced SET NOT NULL;
ALTER TABLE public.route_points ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;
ALTER TABLE public.route_points ALTER COLUMN metadata SET NOT NULL;

UPDATE public.gear_items SET checked = false WHERE checked IS NULL;
UPDATE public.gear_items SET required = false WHERE required IS NULL;
UPDATE public.gear_items SET quantity = 1 WHERE quantity IS NULL;
UPDATE public.gear_items SET sort_order = 0 WHERE sort_order IS NULL;
ALTER TABLE public.gear_items ALTER COLUMN checked SET DEFAULT false;
ALTER TABLE public.gear_items ALTER COLUMN checked SET NOT NULL;
ALTER TABLE public.gear_items ALTER COLUMN required SET DEFAULT false;
ALTER TABLE public.gear_items ALTER COLUMN required SET NOT NULL;
ALTER TABLE public.gear_items ALTER COLUMN quantity SET DEFAULT 1;
ALTER TABLE public.gear_items ALTER COLUMN quantity SET NOT NULL;
ALTER TABLE public.gear_items ALTER COLUMN sort_order SET DEFAULT 0;
ALTER TABLE public.gear_items ALTER COLUMN sort_order SET NOT NULL;

UPDATE public.trip_packing_items SET required = false WHERE required IS NULL;
UPDATE public.trip_packing_items SET packed = false WHERE packed IS NULL;
UPDATE public.trip_packing_items SET quantity = 1 WHERE quantity IS NULL;
UPDATE public.trip_packing_items SET sort_order = 0 WHERE sort_order IS NULL;
ALTER TABLE public.trip_packing_items ALTER COLUMN required SET DEFAULT false;
ALTER TABLE public.trip_packing_items ALTER COLUMN required SET NOT NULL;
ALTER TABLE public.trip_packing_items ALTER COLUMN packed SET DEFAULT false;
ALTER TABLE public.trip_packing_items ALTER COLUMN packed SET NOT NULL;
ALTER TABLE public.trip_packing_items ALTER COLUMN quantity SET DEFAULT 1;
ALTER TABLE public.trip_packing_items ALTER COLUMN quantity SET NOT NULL;
ALTER TABLE public.trip_packing_items ALTER COLUMN sort_order SET DEFAULT 0;
ALTER TABLE public.trip_packing_items ALTER COLUMN sort_order SET NOT NULL;

-- Install named integrity constraints without rewriting or discarding legacy
-- records. NOT VALID still protects every subsequent INSERT and UPDATE.
DO $$
DECLARE
  spec RECORD;
BEGIN
  FOR spec IN
    SELECT * FROM (VALUES
      ('trips', 'trips_title_valid', 'char_length(btrim(title)) BETWEEN 1 AND 160'),
      ('trips', 'trips_description_length', 'description IS NULL OR char_length(description) <= 5000'),
      ('trips', 'trips_activity_type_valid', 'activity_type IN (''trekking'', ''cycling'', ''camping'', ''other'')'),
      ('trips', 'trips_status_valid', 'status IN (''planned'', ''active'', ''completed'', ''cancelled'')'),
      ('trips', 'trips_difficulty_valid', 'difficulty IS NULL OR difficulty IN (''easy'', ''moderate'', ''hard'', ''expert'')'),
      ('trips', 'trips_visibility_valid', 'visibility IN (''private'', ''shared'', ''public'')'),
      ('trips', 'trips_distance_valid', 'estimated_distance IS NULL OR (estimated_distance >= 0 AND estimated_distance < ''Infinity''::DOUBLE PRECISION)'),
      ('trips', 'trips_elevation_gain_valid', 'estimated_elevation_gain IS NULL OR (estimated_elevation_gain >= 0 AND estimated_elevation_gain < ''Infinity''::DOUBLE PRECISION)'),
      ('trips', 'trips_duration_valid', 'estimated_duration IS NULL OR estimated_duration >= 0'),
      ('trips', 'trips_date_order_valid', 'end_date IS NULL OR start_date IS NULL OR end_date >= start_date'),
      ('route_points', 'route_points_latitude_valid', 'lat BETWEEN -90 AND 90'),
      ('route_points', 'route_points_longitude_valid', 'lng BETWEEN -180 AND 180'),
      ('route_points', 'route_points_elevation_finite', 'elevation IS NULL OR (elevation > ''-Infinity''::DOUBLE PRECISION AND elevation < ''Infinity''::DOUBLE PRECISION)'),
      ('route_points', 'route_points_accuracy_valid', 'accuracy IS NULL OR (accuracy >= 0 AND accuracy < ''Infinity''::DOUBLE PRECISION)'),
      ('route_points', 'route_points_source_id_valid', 'source_id IS NULL OR char_length(btrim(source_id)) BETWEEN 1 AND 128'),
      ('gear_templates', 'gear_templates_name_valid', 'char_length(btrim(name)) BETWEEN 1 AND 100'),
      ('gear_templates', 'gear_templates_description_length', 'description IS NULL OR char_length(description) <= 500'),
      ('gear_templates', 'gear_templates_category_length', 'category IS NULL OR char_length(category) <= 64'),
      ('gear_items', 'gear_items_name_valid', 'char_length(btrim(item_name)) BETWEEN 1 AND 100'),
      ('gear_items', 'gear_items_category_length', 'category IS NULL OR char_length(category) <= 64'),
      ('gear_items', 'gear_items_quantity_valid', 'quantity BETWEEN 1 AND 999'),
      ('gear_items', 'gear_items_weight_valid', 'weight IS NULL OR (weight >= 0 AND weight <= 1000000 AND weight < ''Infinity''::DOUBLE PRECISION)'),
      ('gear_items', 'gear_items_notes_length', 'notes IS NULL OR char_length(notes) <= 500'),
      ('gear_items', 'gear_items_sort_order_valid', 'sort_order >= 0'),
      ('trip_packing_items', 'trip_packing_items_name_valid', 'char_length(btrim(item_name)) BETWEEN 1 AND 100'),
      ('trip_packing_items', 'trip_packing_items_category_length', 'category IS NULL OR char_length(category) <= 64'),
      ('trip_packing_items', 'trip_packing_items_quantity_valid', 'quantity BETWEEN 1 AND 999'),
      ('trip_packing_items', 'trip_packing_items_weight_valid', 'weight IS NULL OR (weight >= 0 AND weight <= 1000000 AND weight < ''Infinity''::DOUBLE PRECISION)'),
      ('trip_packing_items', 'trip_packing_items_notes_length', 'notes IS NULL OR char_length(notes) <= 500'),
      ('trip_packing_items', 'trip_packing_items_sort_order_valid', 'sort_order >= 0'),
      ('trip_packing_items', 'trip_packing_items_packed_at_valid', 'packed OR packed_at IS NULL')
    ) AS constraints_to_add(table_name, constraint_name, expression)
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conrelid = to_regclass('public.' || spec.table_name)
        AND conname = spec.constraint_name
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (%s) NOT VALID',
        spec.table_name,
        spec.constraint_name,
        spec.expression
      );
    END IF;
  END LOOP;
END;
$$;

-- Preserve every duplicate packing row while detaching duplicate provenance.
-- The earliest snapshot keeps source_item_id; later snapshots become legitimate
-- ad-hoc rows (NULL provenance) with their names, state, weight and notes intact.
WITH ranked_assignments AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY trip_id, source_item_id
      ORDER BY created_at NULLS LAST, id
    ) AS assignment_number
  FROM public.trip_packing_items
  WHERE source_item_id IS NOT NULL
)
UPDATE public.trip_packing_items AS item
SET source_item_id = NULL
FROM ranked_assignments AS ranked
WHERE item.id = ranked.id
  AND ranked.assignment_number > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_trip_packing_items_trip_source
  ON public.trip_packing_items(trip_id, source_item_id);

CREATE INDEX IF NOT EXISTS idx_trips_user_created
  ON public.trips(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trips_user_status
  ON public.trips(user_id, status);
CREATE INDEX IF NOT EXISTS idx_trips_user_activity
  ON public.trips(user_id, activity_type);
CREATE INDEX IF NOT EXISTS idx_route_points_trip_recorded
  ON public.route_points(trip_id, recorded_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_route_points_source_id
  ON public.route_points(source_id) WHERE source_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_gear_templates_user_created
  ON public.gear_templates(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gear_items_template_sort
  ON public.gear_items(template_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_trip_packing_items_trip_sort
  ON public.trip_packing_items(trip_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_trip_packing_items_trip_packed
  ON public.trip_packing_items(trip_id, packed);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_trips_updated_at ON public.trips;
CREATE TRIGGER update_trips_updated_at
  BEFORE UPDATE ON public.trips
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS update_gear_templates_updated_at ON public.gear_templates;
CREATE TRIGGER update_gear_templates_updated_at
  BEFORE UPDATE ON public.gear_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS update_gear_items_updated_at ON public.gear_items;
CREATE TRIGGER update_gear_items_updated_at
  BEFORE UPDATE ON public.gear_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS update_trip_packing_items_updated_at ON public.trip_packing_items;
CREATE TRIGGER update_trip_packing_items_updated_at
  BEFORE UPDATE ON public.trip_packing_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Reset the policy surface so no unknown permissive legacy policy survives.
DO $$
DECLARE
  existing_policy RECORD;
BEGIN
  FOR existing_policy IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('trips', 'route_points', 'gear_templates', 'gear_items', 'trip_packing_items')
  LOOP
    EXECUTE format(
      'DROP POLICY %I ON %I.%I',
      existing_policy.policyname,
      existing_policy.schemaname,
      existing_policy.tablename
    );
  END LOOP;
END;
$$;

ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.route_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gear_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gear_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_packing_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own trips" ON public.trips
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);
CREATE POLICY "Users can insert own trips" ON public.trips
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY "Users can update own trips" ON public.trips
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY "Users can delete own trips" ON public.trips
  FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can view route points of own trips" ON public.route_points
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.trips
    WHERE trips.id = route_points.trip_id
      AND trips.user_id = (SELECT auth.uid())
  ));
CREATE POLICY "Users can insert route points for own trips" ON public.route_points
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.trips
    WHERE trips.id = route_points.trip_id
      AND trips.user_id = (SELECT auth.uid())
  ));
CREATE POLICY "Users can update route points of own trips" ON public.route_points
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.trips
    WHERE trips.id = route_points.trip_id
      AND trips.user_id = (SELECT auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.trips
    WHERE trips.id = route_points.trip_id
      AND trips.user_id = (SELECT auth.uid())
  ));
CREATE POLICY "Users can delete route points of own trips" ON public.route_points
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.trips
    WHERE trips.id = route_points.trip_id
      AND trips.user_id = (SELECT auth.uid())
  ));

CREATE POLICY "Users can view own gear templates" ON public.gear_templates
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);
CREATE POLICY "Users can insert own gear templates" ON public.gear_templates
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY "Users can update own gear templates" ON public.gear_templates
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY "Users can delete own gear templates" ON public.gear_templates
  FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can view gear items of own templates" ON public.gear_items
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.gear_templates
    WHERE gear_templates.id = gear_items.template_id
      AND gear_templates.user_id = (SELECT auth.uid())
  ));
CREATE POLICY "Users can insert gear items for own templates" ON public.gear_items
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.gear_templates
    WHERE gear_templates.id = gear_items.template_id
      AND gear_templates.user_id = (SELECT auth.uid())
  ));
CREATE POLICY "Users can update gear items of own templates" ON public.gear_items
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.gear_templates
    WHERE gear_templates.id = gear_items.template_id
      AND gear_templates.user_id = (SELECT auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.gear_templates
    WHERE gear_templates.id = gear_items.template_id
      AND gear_templates.user_id = (SELECT auth.uid())
  ));
CREATE POLICY "Users can delete gear items of own templates" ON public.gear_items
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.gear_templates
    WHERE gear_templates.id = gear_items.template_id
      AND gear_templates.user_id = (SELECT auth.uid())
  ));

CREATE POLICY "Users can view packing items of own trips" ON public.trip_packing_items
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.trips
    WHERE trips.id = trip_packing_items.trip_id
      AND trips.user_id = (SELECT auth.uid())
  ));
CREATE POLICY "Users can insert packing items for own trips" ON public.trip_packing_items
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.trips
    WHERE trips.id = trip_packing_items.trip_id
      AND trips.user_id = (SELECT auth.uid())
  ));
CREATE POLICY "Users can update packing items of own trips" ON public.trip_packing_items
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.trips
    WHERE trips.id = trip_packing_items.trip_id
      AND trips.user_id = (SELECT auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.trips
    WHERE trips.id = trip_packing_items.trip_id
      AND trips.user_id = (SELECT auth.uid())
  ));
CREATE POLICY "Users can delete packing items of own trips" ON public.trip_packing_items
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.trips
    WHERE trips.id = trip_packing_items.trip_id
      AND trips.user_id = (SELECT auth.uid())
  ));

REVOKE ALL ON TABLE public.trips FROM anon;
REVOKE ALL ON TABLE public.route_points FROM anon;
REVOKE ALL ON TABLE public.gear_templates FROM anon;
REVOKE ALL ON TABLE public.gear_items FROM anon;
REVOKE ALL ON TABLE public.trip_packing_items FROM anon;

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.trips TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.route_points TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.gear_templates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.gear_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.trip_packing_items TO authenticated;

COMMIT;
