import dotenv from 'dotenv';
import http from 'http';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import compression from 'compression';
import morgan from 'morgan';
import { Server } from 'socket.io';
import { initSockets } from './sockets/index.js';
import { connectRedis } from './redisClient.js';
import { listRecent } from './repositories/requestsRepo.js';
import { pool } from './db.js';

dotenv.config();

// Validate required environment variables
const requiredEnvVars = ['DATABASE_URL', 'PORT'];
const missingEnvVars = requiredEnvVars.filter(key => !process.env[key]);
if (missingEnvVars.length > 0) {
  console.error('❌ Missing required environment variables:', missingEnvVars.join(', '));
  process.exit(1);
}

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
const isProduction = process.env.NODE_ENV === 'production';
const parsedOrigins = (process.env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
const corsOrigins = parsedOrigins.length ? parsedOrigins : (isProduction ? [] : '*');

const app = express();

// Security Headers with Helmet
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://api.maptiler.com", "https://api.openweathermap.org", "https://api.open-meteo.com"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: isProduction ? [] : null,
    },
  },
  crossOriginEmbedderPolicy: false, // Allow Socket.IO
  crossOriginResourcePolicy: { policy: "cross-origin" },
}));

// Compression middleware
app.use(compression());

// Logging middleware (morgan)
if (isProduction) {
  app.use(morgan('combined'));
} else {
  app.use(morgan('dev'));
}

// CORS configuration
app.use(cors({ 
  origin: corsOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Body parser with size limits
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting - Prevent abuse and DoS attacks
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs (handles 100+ users)
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50, // More restrictive for API endpoints
  message: 'Too many API requests, please try again later.',
});

app.use(generalLimiter);

// Health check endpoint (no rate limiting for monitoring)
app.get('/health', async (_req, res) => {
  try {
    const dbHealth = await pool.query('SELECT 1 as health');
    const healthStatus = {
      ok: true,
      service: 'hotel-micro-logistics',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      database: dbHealth.rows[0] ? 'connected' : 'disconnected',
      environment: process.env.NODE_ENV || 'development'
    };
    res.status(dbHealth.rows[0] ? 200 : 503).json(healthStatus);
  } catch (err) {
    res.status(503).json({
      ok: false,
      service: 'hotel-micro-logistics',
      timestamp: new Date().toISOString(),
      error: 'Database connection failed',
      message: err.message
    });
  }
});

// CSV Export with rate limiting and admin authentication
app.get('/api/export/csv', apiLimiter, async (req, res) => {
  try {
    // Basic admin authentication (enhance with proper auth in production)
    const adminPin = req.headers['x-admin-pin'] || req.query.pin;
    if (adminPin !== process.env.ADMIN_PIN && process.env.ADMIN_PIN) {
      return res.status(401).json({ error: 'Unauthorized: Admin PIN required' });
    }

    const requests = await listRecent(1000);
    const headers = ['ID', 'Guest Name', 'Phone', 'Voucher Code', 'Terminal', 'Gate', 'Status', 'Courtesy Pickup', 'Passengers', 'Selected Seats', 'Language', 'Created At'];
    
    // Sanitize data to prevent CSV injection
    const sanitizeCSV = (value) => {
      const str = String(value || '');
      // Remove potentially dangerous characters and escape quotes
      return str.replace(/[=+\-@]/g, '').replace(/"/g, '""');
    };

    const rows = requests.map(r => [
      sanitizeCSV(r.id),
      sanitizeCSV(r.guest_name),
      sanitizeCSV(r.phone),
      sanitizeCSV(r.voucher_code || ''),
      sanitizeCSV(r.terminal),
      sanitizeCSV(r.gate_proximity || ''),
      sanitizeCSV(r.status),
      r.courtesy_pickup ? 'Yes' : 'No',
      r.passenger_count || 1,
      sanitizeCSV((r.selected_seats && Array.isArray(r.selected_seats) ? r.selected_seats.join(', ') : '') || ''),
      sanitizeCSV(r.language_pref || 'en'),
      sanitizeCSV(new Date(r.created_at).toLocaleString())
    ]);

    const csv = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="shuttle-requests-${new Date().toISOString().split('T')[0]}.csv"`);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.send('\ufeff' + csv); // BOM for Excel UTF-8 support
  } catch (err) {
    console.error('CSV export error:', err);
    res.status(500).json({ error: 'Failed to export data' });
  }
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: corsOrigins, methods: ['GET', 'POST'] },
  pingTimeout: 60000,
  pingInterval: 25000,
  maxHttpBufferSize: 1e6, // 1MB max message size
  allowEIO3: true // Allow older Socket.IO clients
});

// Error handling for server
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ Port ${port} is already in use. Please stop the existing process or use a different port.`);
    console.error(`   To find and kill the process: lsof -ti:${port} | xargs kill -9`);
  } else {
    console.error('❌ Server error:', err);
  }
  process.exit(1);
});

// Graceful shutdown handlers
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log('HTTP server closed');
    pool.end(() => {
      console.log('Database pool closed');
      process.exit(0);
    });
  });
});

process.on('SIGINT', () => {
  console.log('\nSIGINT received, shutting down gracefully...');
  server.close(() => {
    console.log('HTTP server closed');
    pool.end(() => {
      console.log('Database pool closed');
      process.exit(0);
    });
  });
});

// Unhandled error handlers
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit - log and continue
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  // Exit on uncaught exceptions
  process.exit(1);
});

initSockets(io);

connectRedis().catch((err) => {
  console.warn('⚠️  Redis connect failed (continuing without Redis):', err.message);
  // Continue without Redis - it's optional for basic functionality
});

// Start server after database initialization
ensureDatabaseSchema()
  .then(() => {
    server.listen(port, () => {
      console.log(`\n✅ Real-time logistics server running on port ${port}`);
      console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`   CORS Origins: ${Array.isArray(corsOrigins) ? corsOrigins.join(', ') : corsOrigins}`);
      console.log(`   Database: Connected (Pool: ${pool.totalCount || 'N/A'} connections)`);
      console.log(`   Rate Limiting: Enabled (100 req/15min per IP)\n`);
    });
  })
  .catch((err) => {
    console.error('❌ Server failed to start due to DB initialization error:', err);
    // Still try to start server in case it's just a migration issue
    server.listen(port, () => {
      console.warn('⚠️  Server started but database schema check failed. Please verify manually.');
    });
  });
