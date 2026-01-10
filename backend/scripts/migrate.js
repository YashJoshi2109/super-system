#!/usr/bin/env node
/**
 * Quick migration script to add missing columns
 * Usage: node scripts/migrate.js
 */

import dotenv from 'dotenv';
import { pool } from '../src/db.js';

dotenv.config();

async function migrate() {
  console.log('Running database migration...\n');

  try {
    // Check if passenger_count column exists
    const checkPassengerCount = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'shuttle_requests' 
      AND column_name = 'passenger_count';
    `);

    if (checkPassengerCount.rows.length === 0) {
      console.log('Adding passenger_count column...');
      await pool.query(`
        ALTER TABLE shuttle_requests 
        ADD COLUMN passenger_count INTEGER NOT NULL DEFAULT 1;
      `);
      console.log('✓ Added passenger_count column');
    } else {
      console.log('✓ passenger_count column already exists');
    }

    // Check if selected_seats column exists
    const checkSelectedSeats = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'shuttle_requests' 
      AND column_name = 'selected_seats';
    `);

    if (checkSelectedSeats.rows.length === 0) {
      console.log('Adding selected_seats column...');
      await pool.query(`
        ALTER TABLE shuttle_requests 
        ADD COLUMN selected_seats JSONB;
      `);
      console.log('✓ Added selected_seats column');
    } else {
      console.log('✓ selected_seats column already exists');
    }

    console.log('\n✅ Migration completed successfully!');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Migration failed:', err.message);
    console.error(err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
