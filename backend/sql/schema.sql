CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS shuttle_requests (
  id UUID PRIMARY KEY,
  guest_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  airline_code TEXT,
  voucher_code TEXT UNIQUE,
  terminal TEXT NOT NULL,
  gate_proximity TEXT,
  courtesy_pickup BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'pending',
  language_pref TEXT NOT NULL DEFAULT 'en',
  passenger_count INTEGER NOT NULL DEFAULT 1,
  selected_seats JSONB,
  coords geometry(Point, 4326),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Migration: Add passenger_count and selected_seats if they don't exist
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'shuttle_requests' AND column_name = 'passenger_count') THEN
    ALTER TABLE shuttle_requests ADD COLUMN passenger_count INTEGER NOT NULL DEFAULT 1;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'shuttle_requests' AND column_name = 'selected_seats') THEN
    ALTER TABLE shuttle_requests ADD COLUMN selected_seats JSONB;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_shuttle_requests_terminal ON shuttle_requests(terminal);
CREATE INDEX IF NOT EXISTS idx_shuttle_requests_status ON shuttle_requests(status);
CREATE INDEX IF NOT EXISTS idx_shuttle_requests_coords ON shuttle_requests USING GIST (coords);
