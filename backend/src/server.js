import dotenv from 'dotenv';
import http from 'http';
import express from 'express';
import cors from 'cors';
import { Server } from 'socket.io';
import { initSockets } from './sockets/index.js';
import { connectRedis } from './redisClient.js';
import { listRecent } from './repositories/requestsRepo.js';
import { pool } from './db.js';

dotenv.config();

// Ensure database columns exist
async function ensureDatabaseSchema() {
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
    }

    console.log('✓ Database schema is up to date');
  } catch (err) {
    console.error('Error ensuring database schema:', err);
    // Don't crash on migration errors, but log them
  }
}

const port = process.env.PORT || 3001;
const parsedOrigins = (process.env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
const corsOrigins = parsedOrigins.length ? parsedOrigins : '*';

const app = express();
app.use(cors({ origin: corsOrigins, credentials: true }));
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'hotel-micro-logistics', ts: new Date().toISOString() });
});

app.get('/api/export/csv', async (_req, res) => {
  try {
    const requests = await listRecent(1000); // Get up to 1000 recent requests
    const headers = ['ID', 'Guest Name', 'Phone', 'Voucher Code', 'Terminal', 'Gate', 'Status', 'Courtesy Pickup', 'Passengers', 'Selected Seats', 'Language', 'Created At'];
    const rows = requests.map(r => [
      r.id,
      r.guest_name,
      r.phone,
      r.voucher_code || '',
      r.terminal,
      r.gate_proximity || '',
      r.status,
      r.courtesy_pickup ? 'Yes' : 'No',
      r.passenger_count || 1,
      (r.selected_seats && Array.isArray(r.selected_seats) ? r.selected_seats.join(', ') : '') || '',
      r.language_pref || 'en',
      new Date(r.created_at).toLocaleString()
    ]);

    const csv = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="shuttle-requests-${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(csv);
  } catch (err) {
    console.error('CSV export error:', err);
    res.status(500).json({ error: 'Failed to export data' });
  }
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: corsOrigins, methods: ['GET', 'POST'] }
});

initSockets(io);

connectRedis().catch((err) => console.error('Redis connect failed', err));

// Ensure database schema is up to date before starting server
ensureDatabaseSchema().then(() => {
  server.listen(port, () => {
    console.log(`Real-time logistics server running on port ${port}`);
  });
}).catch((err) => {
  console.error('Failed to ensure database schema:', err);
  // Still start server, but log the error
  server.listen(port, () => {
    console.log(`Real-time logistics server running on port ${port}`);
    console.warn('⚠️  Database schema migration may have failed. Please check manually.');
  });
});
