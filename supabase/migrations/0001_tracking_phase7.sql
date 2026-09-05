-- TrailMate authoritative migration baseline (Phase 12A).
--
-- The 0001 filename is retained because existing databases may already have
-- that migration version recorded. Before Phase 12A this file was only a
-- route_points delta and could not create a fresh database. It now defines the
-- complete fresh-install schema; existing databases receive the same changes
-- through 20260906000100_phase12a_security_hardening.sql.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE public.trips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  activity_type TEXT NOT NULL,
  planned_date DATE,
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'planned',
  estimated_distance DOUBLE PRECISION,
  estimated_elevation_gain DOUBLE PRECISION,
  estimated_duration INTEGER,
  difficulty TEXT,
  visibility TEXT NOT NULL DEFAULT 'private',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT trips_title_valid CHECK (char_length(btrim(title)) BETWEEN 1 AND 160),
  CONSTRAINT trips_description_length CHECK (description IS NULL OR char_length(description) <= 5000),
  CONSTRAINT trips_activity_type_valid CHECK (activity_type IN ('trekking', 'cycling', 'camping', 'other')),
  CONSTRAINT trips_status_valid CHECK (status IN ('planned', 'active', 'completed', 'cancelled')),
  CONSTRAINT trips_difficulty_valid CHECK (difficulty IS NULL OR difficulty IN ('easy', 'moderate', 'hard', 'expert')),
  CONSTRAINT trips_visibility_valid CHECK (visibility IN ('private', 'shared', 'public')),
  CONSTRAINT trips_distance_valid CHECK (
    estimated_distance IS NULL OR (
      estimated_distance >= 0
      AND estimated_distance < 'Infinity'::DOUBLE PRECISION
    )
  ),
  CONSTRAINT trips_elevation_gain_valid CHECK (
    estimated_elevation_gain IS NULL OR (
      estimated_elevation_gain >= 0
      AND estimated_elevation_gain < 'Infinity'::DOUBLE PRECISION
    )
  ),
  CONSTRAINT trips_duration_valid CHECK (estimated_duration IS NULL OR estimated_duration >= 0),
  CONSTRAINT trips_date_order_valid CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
);

CREATE TABLE public.route_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  elevation DOUBLE PRECISION,
  accuracy DOUBLE PRECISION,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  synced BOOLEAN NOT NULL DEFAULT true,
  source_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  CONSTRAINT route_points_latitude_valid CHECK (lat BETWEEN -90 AND 90),
  CONSTRAINT route_points_longitude_valid CHECK (lng BETWEEN -180 AND 180),
  CONSTRAINT route_points_elevation_finite CHECK (
    elevation IS NULL OR (
      elevation > '-Infinity'::DOUBLE PRECISION
      AND elevation < 'Infinity'::DOUBLE PRECISION
    )
  ),
  CONSTRAINT route_points_accuracy_valid CHECK (
    accuracy IS NULL OR (
      accuracy >= 0
      AND accuracy < 'Infinity'::DOUBLE PRECISION
    )
  ),
  CONSTRAINT route_points_source_id_valid CHECK (
    source_id IS NULL OR char_length(btrim(source_id)) BETWEEN 1 AND 128
  )
);

CREATE TABLE public.gear_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT gear_templates_name_valid CHECK (char_length(btrim(name)) BETWEEN 1 AND 100),
  CONSTRAINT gear_templates_description_length CHECK (description IS NULL OR char_length(description) <= 500),
  CONSTRAINT gear_templates_category_length CHECK (category IS NULL OR char_length(category) <= 64)
);

CREATE TABLE public.gear_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.gear_templates(id) ON DELETE CASCADE,
  item_name TEXT NOT NULL,
  category TEXT,
  checked BOOLEAN NOT NULL DEFAULT false,
  required BOOLEAN NOT NULL DEFAULT false,
  quantity INTEGER NOT NULL DEFAULT 1,
  weight DOUBLE PRECISION,
  notes TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT gear_items_name_valid CHECK (char_length(btrim(item_name)) BETWEEN 1 AND 100),
  CONSTRAINT gear_items_category_length CHECK (category IS NULL OR char_length(category) <= 64),
  CONSTRAINT gear_items_quantity_valid CHECK (quantity BETWEEN 1 AND 999),
  CONSTRAINT gear_items_weight_valid CHECK (
    weight IS NULL OR (
      weight >= 0
      AND weight <= 1000000
      AND weight < 'Infinity'::DOUBLE PRECISION
    )
  ),
  CONSTRAINT gear_items_notes_length CHECK (notes IS NULL OR char_length(notes) <= 500),
  CONSTRAINT gear_items_sort_order_valid CHECK (sort_order >= 0)
);

-- A packing item is a snapshot. Template references are nullable provenance:
-- deleting a source does not delete a trip's historical packing state.
CREATE TABLE public.trip_packing_items (
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
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT trip_packing_items_name_valid CHECK (char_length(btrim(item_name)) BETWEEN 1 AND 100),
  CONSTRAINT trip_packing_items_category_length CHECK (category IS NULL OR char_length(category) <= 64),
  CONSTRAINT trip_packing_items_quantity_valid CHECK (quantity BETWEEN 1 AND 999),
  CONSTRAINT trip_packing_items_weight_valid CHECK (
    weight IS NULL OR (
      weight >= 0
      AND weight <= 1000000
      AND weight < 'Infinity'::DOUBLE PRECISION
    )
  ),
  CONSTRAINT trip_packing_items_notes_length CHECK (notes IS NULL OR char_length(notes) <= 500),
  CONSTRAINT trip_packing_items_sort_order_valid CHECK (sort_order >= 0),
  CONSTRAINT trip_packing_items_packed_at_valid CHECK (packed OR packed_at IS NULL)
);

CREATE INDEX idx_trips_user_created ON public.trips(user_id, created_at DESC);
CREATE INDEX idx_trips_user_status ON public.trips(user_id, status);
CREATE INDEX idx_trips_user_activity ON public.trips(user_id, activity_type);
CREATE INDEX idx_route_points_trip_recorded ON public.route_points(trip_id, recorded_at);
CREATE UNIQUE INDEX idx_route_points_source_id ON public.route_points(source_id) WHERE source_id IS NOT NULL;
CREATE INDEX idx_gear_templates_user_created ON public.gear_templates(user_id, created_at DESC);
CREATE INDEX idx_gear_items_template_sort ON public.gear_items(template_id, sort_order);
CREATE INDEX idx_trip_packing_items_trip_sort ON public.trip_packing_items(trip_id, sort_order);
CREATE INDEX idx_trip_packing_items_trip_packed ON public.trip_packing_items(trip_id, packed);
-- PostgreSQL treats NULLs as distinct, so ad-hoc items (source_item_id IS NULL)
-- can be duplicated while each source template item can be assigned only once.
CREATE UNIQUE INDEX uq_trip_packing_items_trip_source
  ON public.trip_packing_items(trip_id, source_item_id);

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

CREATE TRIGGER update_trips_updated_at
  BEFORE UPDATE ON public.trips
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_gear_templates_updated_at
  BEFORE UPDATE ON public.gear_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_gear_items_updated_at
  BEFORE UPDATE ON public.gear_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_trip_packing_items_updated_at
  BEFORE UPDATE ON public.trip_packing_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

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
