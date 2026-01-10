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
  coords geometry(Point, 4326),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shuttle_requests_terminal ON shuttle_requests(terminal);
CREATE INDEX IF NOT EXISTS idx_shuttle_requests_status ON shuttle_requests(status);
CREATE INDEX IF NOT EXISTS idx_shuttle_requests_coords ON shuttle_requests USING GIST (coords);
