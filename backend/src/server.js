import dotenv from 'dotenv';
import http from 'http';
import express from 'express';
import cors from 'cors';
import { Server } from 'socket.io';
import { initSockets } from './sockets/index.js';
import { connectRedis } from './redisClient.js';

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

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: corsOrigins, methods: ['GET', 'POST'] }
});

initSockets(io);

connectRedis().catch((err) => console.error('Redis connect failed', err));

server.listen(port, () => {
  console.log(`Real-time logistics server running on port ${port}`);
});
