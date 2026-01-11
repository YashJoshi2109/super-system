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
import { authenticateUser } from './services/auth.js';
import { authenticateToken, requireRole } from './middleware/auth.js';

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

// Store io instance and activeRequests for webhook handlers (set after initSockets)
let ioInstanceGlobal = null;
let activeRequestsGlobal = null;

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

// Authentication endpoints
app.post('/api/auth/login', express.json(), async (req, res) => {
  try {
    const { username, password, role } = req.body;
    
    if (!username || !password || !role) {
      return res.status(400).json({ error: 'Username, password, and role are required' });
    }

    if (!['driver', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role. Must be driver or admin' });
    }

    const result = await authenticateUser(username, password, role);
    
    if (result.success) {
      res.json({
        success: true,
        token: result.token,
        user: result.user
      });
    } else {
      res.status(401).json({ error: result.error });
    }
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Verify token endpoint
app.get('/api/auth/verify', authenticateToken, (req, res) => {
  res.json({
    valid: true,
    user: req.user
  });
});

// FlightStats Alert Webhook Endpoint
// This endpoint receives flight alert callbacks from FlightStats/Cirium
app.post('/api/webhooks/flight-alerts', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    // Verify request is from FlightStats (optional but recommended)
    // You can verify the Cirium-Flex-Alert-Hash header using your appKey
    
    const alert = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    
    if (!alert || !alert.event || !alert.flightStatus) {
      console.warn('Invalid alert payload received');
      return res.status(400).json({ error: 'Invalid alert payload' });
    }

    // Extract request ID and phone from alert metadata (stored in name/value pairs)
    const requestId = alert._requestId || alert.requestId;
    const phone = alert._phone || alert.phone;

    if (!requestId || !phone) {
      console.warn('Alert received without requestId or phone:', alert);
      return res.status(200).json({ received: true }); // Return 200 to acknowledge
    }

    // Dynamically import to avoid circular dependencies
    const { formatFlightAlertMessage } = await import('./services/flightAlerts.js');
    const { sendSMS } = await import('./services/sms.js');
    
    // Format alert message
    const message = formatFlightAlertMessage(alert);
    console.log('Flight alert received:', {
      requestId,
      eventType: alert.event?.type,
      flight: `${alert.flightStatus?.carrierFsCode}${alert.flightStatus?.flightNumber}`
    });

    // Send SMS to guest
    if (phone) {
      try {
        await sendSMS(phone, message);
        console.log('Flight alert SMS sent to', phone);
      } catch (err) {
        console.error('Failed to send flight alert SMS:', err);
      }
    }

    // Send push notification via Socket.IO if request is active
    if (ioInstanceGlobal && activeRequestsGlobal) {
      const request = activeRequestsGlobal.get(requestId);
      
      if (request) {
        ioInstanceGlobal.to(`request_${requestId}`).emit('push_notification', {
          type: 'flight_alert',
          message: message,
          request_id: requestId,
          flight_info: {
            carrier: alert.flightStatus?.carrierFsCode,
            flightNumber: alert.flightStatus?.flightNumber,
            eventType: alert.event?.type
          },
          ts: new Date().toISOString()
        });
      }
    }

    // Always return 200 to acknowledge receipt
    res.status(200).json({ received: true, processed: true });
  } catch (err) {
    console.error('Error processing flight alert webhook:', err);
    // Return 200 anyway to prevent FlightStats from retrying
    res.status(200).json({ received: true, error: err.message });
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

// Store io instance for webhook handlers
ioInstanceGlobal = io;

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

// Initialize sockets and store references for webhook handlers
initSockets(io).then(({ activeRequests }) => {
  activeRequestsGlobal = activeRequests;
  ioInstanceGlobal = io;
}).catch(err => {
  console.error('Error initializing sockets:', err);
});

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
