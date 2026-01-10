import dotenv from 'dotenv';
import http from 'http';
import express from 'express';
import cors from 'cors';
import { Server } from 'socket.io';
import { initSockets } from './sockets/index.js';
import { connectRedis } from './redisClient.js';
import { listRecent } from './repositories/requestsRepo.js';

dotenv.config();

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
    const headers = ['ID', 'Guest Name', 'Phone', 'Voucher Code', 'Terminal', 'Gate', 'Status', 'Courtesy Pickup', 'Language', 'Created At'];
    const rows = requests.map(r => [
      r.id,
      r.guest_name,
      r.phone,
      r.voucher_code || '',
      r.terminal,
      r.gate_proximity || '',
      r.status,
      r.courtesy_pickup ? 'Yes' : 'No',
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

server.listen(port, () => {
  console.log(`Real-time logistics server running on port ${port}`);
});
