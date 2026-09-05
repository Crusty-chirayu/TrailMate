-- TrailMate Database Schema
-- PostgreSQL with Row Level Security (RLS)

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Trips table
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

-- Indexes for trips
CREATE INDEX idx_trips_user_id ON trips(user_id);
CREATE INDEX idx_trips_status ON trips(status);
CREATE INDEX idx_trips_planned_date ON trips(planned_date);
CREATE INDEX idx_trips_activity_type ON trips(activity_type);

-- Route points table (GPS waypoints)
CREATE TABLE route_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  elevation DOUBLE PRECISION,
  accuracy DOUBLE PRECISION,
  recorded_at TIMESTAMPTZ DEFAULT now(),
  synced BOOLEAN DEFAULT true,
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Indexes for route points
CREATE INDEX idx_route_points_trip_id ON route_points(trip_id);
CREATE INDEX idx_route_points_recorded_at ON route_points(recorded_at);

-- Gear templates table
CREATE TABLE gear_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT, -- 'backpacking', 'day-hike', 'cycling', etc.
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for gear templates
CREATE INDEX idx_gear_templates_user_id ON gear_templates(user_id);
CREATE INDEX idx_gear_templates_category ON gear_templates(category);

-- Gear items table
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

-- Indexes for gear items
CREATE INDEX idx_gear_items_template_id ON gear_items(template_id);
CREATE INDEX idx_gear_items_category ON gear_items(category);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_trips_updated_at BEFORE UPDATE ON trips
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_gear_templates_updated_at BEFORE UPDATE ON gear_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (RLS)

-- Enable RLS on all tables
ALTER TABLE trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE route_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE gear_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE gear_items ENABLE ROW LEVEL SECURITY;

-- RLS Policies for trips
CREATE POLICY "Users can view own trips" ON trips
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own trips" ON trips
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own trips" ON trips
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own trips" ON trips
  FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for route points (access via trip ownership)
CREATE POLICY "Users can view route points of own trips" ON route_points
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM trips 
      WHERE trips.id = route_points.trip_id 
      AND trips.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert route points for own trips" ON route_points
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM trips 
      WHERE trips.id = route_points.trip_id 
      AND trips.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update route points of own trips" ON route_points
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM trips 
      WHERE trips.id = route_points.trip_id 
      AND trips.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete route points of own trips" ON route_points
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM trips 
      WHERE trips.id = route_points.trip_id 
      AND trips.user_id = auth.uid()
    )
  );

-- RLS Policies for gear templates
CREATE POLICY "Users can view own gear templates" ON gear_templates
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own gear templates" ON gear_templates
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own gear templates" ON gear_templates
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own gear templates" ON gear_templates
  FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for gear items (access via template ownership)
CREATE POLICY "Users can view gear items of own templates" ON gear_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM gear_templates 
      WHERE gear_templates.id = gear_items.template_id 
      AND gear_templates.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert gear items for own templates" ON gear_items
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM gear_templates 
      WHERE gear_templates.id = gear_items.template_id 
      AND gear_templates.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update gear items of own templates" ON gear_items
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM gear_templates 
      WHERE gear_templates.id = gear_items.template_id 
      AND gear_templates.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete gear items of own templates" ON gear_items
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM gear_templates 
      WHERE gear_templates.id = gear_items.template_id 
      AND gear_templates.user_id = auth.uid()
    )
  );

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON TABLE trips TO anon, authenticated;
GRANT ALL ON TABLE route_points TO anon, authenticated;
GRANT ALL ON TABLE gear_templates TO anon, authenticated;
GRANT ALL ON TABLE gear_items TO anon, authenticated;
