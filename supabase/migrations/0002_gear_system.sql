-- Phase 8: Gear System — trip packing state + required/optional distinction.
--
-- 1. gear_items gains a `required` flag and `updated_at`.
-- 2. New `trip_packing_items` table: a SNAPSHOT of gear items copied into a
--    trip at assignment time. Editing or deleting the source template/item can
--    never corrupt a trip's historical packing state; template_id and
--    source_item_id are kept as nullable provenance references (ON DELETE SET NULL).
-- Safe to apply to an existing database; preserves data.

-- Required/optional distinction on reusable template items.
ALTER TABLE public.gear_items ADD COLUMN IF NOT EXISTS required BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.gear_items ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- updated_at trigger for gear items.
CREATE TRIGGER update_gear_items_updated_at BEFORE UPDATE ON public.gear_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trip packing snapshot.
CREATE TABLE IF NOT EXISTS public.trip_packing_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  template_id UUID REFERENCES public.gear_templates(id) ON DELETE SET NULL,
  source_item_id UUID REFERENCES public.gear_items(id) ON DELETE SET NULL,
  item_name TEXT NOT NULL,
  category TEXT,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 1),
  weight DOUBLE PRECISION, -- grams per unit
  notes TEXT,
  required BOOLEAN NOT NULL DEFAULT false,
  packed BOOLEAN NOT NULL DEFAULT false,
  packed_at TIMESTAMPTZ,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trip_packing_items_trip_id ON public.trip_packing_items(trip_id);
CREATE INDEX IF NOT EXISTS idx_trip_packing_items_category ON public.trip_packing_items(category);
CREATE INDEX IF NOT EXISTS idx_trip_packing_items_packed ON public.trip_packing_items(packed);

ALTER TABLE public.trip_packing_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view packing items of own trips" ON public.trip_packing_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM trips
      WHERE trips.id = trip_packing_items.trip_id
      AND trips.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert packing items for own trips" ON public.trip_packing_items
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM trips
      WHERE trips.id = trip_packing_items.trip_id
      AND trips.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update packing items of own trips" ON public.trip_packing_items
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM trips
      WHERE trips.id = trip_packing_items.trip_id
      AND trips.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM trips
      WHERE trips.id = trip_packing_items.trip_id
      AND trips.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete packing items of own trips" ON public.trip_packing_items
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM trips
      WHERE trips.id = trip_packing_items.trip_id
      AND trips.user_id = auth.uid()
    )
  );

CREATE TRIGGER update_trip_packing_items_updated_at BEFORE UPDATE ON public.trip_packing_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

GRANT ALL ON TABLE public.trip_packing_items TO anon, authenticated;