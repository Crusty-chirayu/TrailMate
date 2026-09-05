-- Legacy Phase 8 gear compatibility migration.
--
-- The authoritative fresh schema is migration 0001. This migration remains at
-- its original version for databases that have migration history, and is safe
-- to run after the Phase 12A baseline without duplicate-object failures.

ALTER TABLE public.gear_items
  ADD COLUMN IF NOT EXISTS required BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.gear_items
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

CREATE TABLE IF NOT EXISTS public.trip_packing_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  template_id UUID REFERENCES public.gear_templates(id) ON DELETE SET NULL,
  source_item_id UUID REFERENCES public.gear_items(id) ON DELETE SET NULL,
  item_name TEXT NOT NULL,
  category TEXT,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 1),
  weight DOUBLE PRECISION,
  notes TEXT,
  required BOOLEAN NOT NULL DEFAULT false,
  packed BOOLEAN NOT NULL DEFAULT false,
  packed_at TIMESTAMPTZ,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trip_packing_items_trip_sort
  ON public.trip_packing_items(trip_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_trip_packing_items_trip_packed
  ON public.trip_packing_items(trip_id, packed);

DROP TRIGGER IF EXISTS update_gear_items_updated_at ON public.gear_items;
CREATE TRIGGER update_gear_items_updated_at
  BEFORE UPDATE ON public.gear_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_trip_packing_items_updated_at ON public.trip_packing_items;
CREATE TRIGGER update_trip_packing_items_updated_at
  BEFORE UPDATE ON public.trip_packing_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.trip_packing_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view packing items of own trips" ON public.trip_packing_items;
DROP POLICY IF EXISTS "Users can insert packing items for own trips" ON public.trip_packing_items;
DROP POLICY IF EXISTS "Users can update packing items of own trips" ON public.trip_packing_items;
DROP POLICY IF EXISTS "Users can delete packing items of own trips" ON public.trip_packing_items;

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

REVOKE ALL ON TABLE public.trip_packing_items FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.trip_packing_items TO authenticated;
