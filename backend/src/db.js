import pkg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pkg;

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL environment variable is required');
}

// Optimized connection pool for 100+ concurrent users
export const pool = new Pool({
  connectionString: databaseUrl,
  ssl: databaseUrl && databaseUrl.includes('localhost') ? false : { rejectUnauthorized: false },
  // Connection pool settings for 100+ concurrent users
  max: 20, // Maximum number of clients in the pool (increase for more load)
  min: 5, // Minimum number of clients in the pool
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 5000, // Return an error after 5 seconds if connection could not be established
  // Statement timeout (prevent long-running queries)
  statement_timeout: 30000, // 30 seconds
  query_timeout: 30000,
});

pool.on('error', (err) => {
  console.error('❌ Unexpected PostgreSQL pool error:', err);
  // Don't exit process, let it reconnect
});

pool.on('connect', () => {
  console.log('✅ Database connection established');
});

pool.on('acquire', () => {
  // Client acquired from pool
});

pool.on('remove', () => {
  // Client removed from pool
});

// Health check function
export async function checkDatabaseHealth() {
  try {
    const result = await pool.query('SELECT NOW() as current_time, version() as pg_version');
    return { healthy: true, time: result.rows[0].current_time, version: result.rows[0].pg_version };
  } catch (err) {
    console.error('Database health check failed:', err);
    return { healthy: false, error: err.message };
  }
}
