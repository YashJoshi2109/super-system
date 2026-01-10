-- Migration: Add passenger_count and selected_seats columns to shuttle_requests table
-- Run this if the columns don't exist yet

DO $$ 
BEGIN
  -- Add passenger_count column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'shuttle_requests' 
    AND column_name = 'passenger_count'
  ) THEN
    ALTER TABLE shuttle_requests ADD COLUMN passenger_count INTEGER NOT NULL DEFAULT 1;
    RAISE NOTICE 'Added passenger_count column';
  ELSE
    RAISE NOTICE 'passenger_count column already exists';
  END IF;
  
  -- Add selected_seats column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'shuttle_requests' 
    AND column_name = 'selected_seats'
  ) THEN
    ALTER TABLE shuttle_requests ADD COLUMN selected_seats JSONB;
    RAISE NOTICE 'Added selected_seats column';
  ELSE
    RAISE NOTICE 'selected_seats column already exists';
  END IF;
END $$;
