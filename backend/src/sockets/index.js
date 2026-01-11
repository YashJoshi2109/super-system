import { randomUUID } from 'crypto';
import { z } from 'zod';
import { createRequest, updateStatus } from '../repositories/requestsRepo.js';
import { withinGeofence } from '../services/geofence.js';
import { groupNearby } from '../services/grouping.js';
import { calculateETA } from '../services/eta.js';
import { getFlightInfo } from '../services/flightApi.js';
import { sendSMS } from '../services/sms.js';
import { createFlightAlertRule, parseFlightCode, deleteFlightAlertRule } from '../services/flightAlerts.js';

const emptyToUndefined = (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v);
const optionalShortString = (min = 1, max = 50) =>
  z.preprocess(emptyToUndefined, z.string().trim().min(min).max(max)).optional();

const joinRequestSchema = z.object({
  guest_name: z.string().min(1),
  phone: z.string().min(5),
  airline_code: optionalShortString(2, 20),
  voucher_code: z.string().trim().length(5, 'Voucher must be 5 characters'),
  terminal: z.string().min(1),
  gate_proximity: z.string().trim().min(1),
  courtesy_pickup: z.boolean().default(false),
  language_pref: optionalShortString(2, 5),
  passenger_count: z.number().int().min(1).max(20).default(1),
  selected_seats: z.preprocess(
    (val) => {
      // Normalize selected_seats to always be an array
      if (Array.isArray(val)) {
        return val;
      }
      if (val && typeof val === 'object') {
        // Convert object to array (handles cases where Socket.IO transforms array to object)
        return Object.values(val).filter(v => typeof v === 'string');
      }
      return [];
    },
    z.array(z.string()).default([])
  ),
  coordinates: z.object({ lat: z.number(), lng: z.number() })
});

const statusChangeSchema = z.object({
  request_id: z.string(),
  status: z.enum(['pending', 'accepted', 'picked_up', 'completed'])
});

// Rate limiting for Socket.IO connections
const socketRateLimiter = new Map(); // socket_id -> { count, resetTime }

function checkSocketRateLimit(socketId, maxRequests = 100, windowMs = 60000) {
  const now = Date.now();
  const limit = socketRateLimiter.get(socketId);
  
  if (!limit || now > limit.resetTime) {
    socketRateLimiter.set(socketId, { count: 1, resetTime: now + windowMs });
    return true;
  }
  
  if (limit.count >= maxRequests) {
    return false; // Rate limit exceeded
  }
  
  limit.count++;
  return true;
}

// Input sanitization helper
function sanitizeInput(input) {
  if (typeof input === 'string') {
    return input
      .trim()
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove script tags
      .replace(/[<>]/g, ''); // Remove HTML brackets
  }
  if (typeof input === 'object' && input !== null) {
    const sanitized = {};
    for (const [key, value] of Object.entries(input)) {
      sanitized[sanitizeInput(key)] = sanitizeInput(value);
    }
    return sanitized;
  }
  return input;
}

// Export functions to access socket state from other modules (e.g., webhook handlers)
let ioInstance = null;
let activeRequestsMap = null;

export function getIoInstance() {
  return ioInstance;
}

export function getActiveRequests() {
  return activeRequestsMap;
}

export function initSockets(io) {
  ioInstance = io;
  let driverLocation = null;
  const activeRequests = new Map(); // request_id -> request payload
  activeRequestsMap = activeRequests; // Export reference for webhook handlers
  const etas = new Map(); // request_id -> { etaMinutes, distanceKm, lastUpdated }
  const bookedSeats = new Map(); // seat_id -> request_id (when driver accepts, seats get booked)
  const flightAlertRules = new Map(); // request_id -> alert_rule_id (for cleanup)
  const mapsApiKey = process.env.MAPTILER_KEY || process.env.MAPS_API_KEY || process.env.VITE_MAPTILER_KEY;
  const flightApiKey = process.env.FLIGHT_API_KEY;

  // Periodic ETA updates (every 30 seconds) - Optimized for 100+ users
  setInterval(async () => {
    if (!driverLocation || !mapsApiKey) return;
    // Limit concurrent ETA calculations to prevent overload
    const activeRequestsArray = Array.from(activeRequests.entries()).slice(0, 50); // Process max 50 at a time
    for (const [reqId, req] of activeRequestsArray) {
      if (req.coordinates && driverLocation && ['pending', 'accepted'].includes(req.status)) {
        try {
          const eta = await calculateETA(driverLocation, req.coordinates, mapsApiKey);
          if (eta) {
            etas.set(reqId, { ...eta, lastUpdated: new Date().toISOString() });
            io.to(`request_${reqId}`).emit('eta_update', { request_id: reqId, ...eta });
          }
        } catch (err) {
          console.error(`ETA calculation error for request ${reqId}:`, err.message);
        }
      }
    }
  }, 30000);

  // Clean up rate limiter periodically
  setInterval(() => {
    const now = Date.now();
    for (const [socketId, limit] of socketRateLimiter.entries()) {
      if (now > limit.resetTime) {
        socketRateLimiter.delete(socketId);
      }
    }
  }, 60000); // Clean every minute

  io.on('connection', (socket) => {
    console.log('Socket connected:', socket.id);
    
    // Rate limiting check
    if (!checkSocketRateLimit(socket.id)) {
      console.warn(`Rate limit exceeded for socket ${socket.id}`);
      socket.emit('error', { message: 'Rate limit exceeded. Please slow down.' });
      socket.disconnect(true);
      return;
    }

    socket.on('join_request', async (payload) => {
      // Rate limiting per socket
      if (!checkSocketRateLimit(socket.id, 10, 60000)) { // 10 requests per minute
        socket.emit('request_error', { message: 'Too many requests. Please wait a moment.', detail: 'rate_limit' });
        return;
      }

      // Sanitize input to prevent XSS
      const sanitizedPayload = sanitizeInput(payload);
      
      // Validate with Zod schema (selected_seats normalization is handled by z.preprocess)
      const parse = joinRequestSchema.safeParse(sanitizedPayload);
      if (!parse.success) {
        console.warn(`Invalid request from socket ${socket.id}:`, parse.error.issues);
        socket.emit('request_error', { message: 'Invalid request data', issues: parse.error.issues });
        return;
      }

      // Flight API integration - auto-detect terminal if airline code provided
      let detectedTerminal = parse.data.terminal;
      let flightInfo = null;
      if (parse.data.airline_code && flightApiKey) {
        flightInfo = await getFlightInfo(parse.data.airline_code, flightApiKey);
        if (flightInfo?.terminal) {
          detectedTerminal = flightInfo.terminal;
          socket.emit('flight_info', { ...flightInfo, suggested_terminal: detectedTerminal });
        }
      }

      const request = {
        ...parse.data,
        terminal: detectedTerminal,
        courtesy_pickup: Boolean(parse.data.courtesy_pickup),
        language_pref: parse.data.language_pref || 'en',
        id: randomUUID(),
        socket_id: socket.id,
        status: 'pending',
        created_at: new Date().toISOString()
      };

      // Geofence warning (non-blocking)
      if (request.coordinates && !withinGeofence(request.terminal, request.coordinates)) {
        socket.emit('geofence_warning', { terminal: request.terminal, coords: request.coordinates });
      }

      // Check for seat conflicts (if seats are already booked by accepted requests)
      const conflictingSeats = [];
      if (parse.data.selected_seats && parse.data.selected_seats.length > 0) {
        for (const seat of parse.data.selected_seats) {
          if (bookedSeats.has(seat)) {
            conflictingSeats.push(seat);
          }
        }
      }

      if (conflictingSeats.length > 0) {
        socket.emit('request_error', { 
          message: `Seats ${conflictingSeats.join(', ')} are already booked. Please select different seats.`,
          detail: 'seat_conflict'
        });
        return;
      }

      activeRequests.set(request.id, request);
      socket.join(`request_${request.id}`); // Join request-specific room for chat/updates
      
      // Create FlightStats alert rule if flight code is provided
      if (parse.data.airline_code) {
        const flightInfo = parseFlightCode(parse.data.airline_code);
        if (flightInfo) {
          // Get webhook URL (should be your public server URL)
          const webhookBaseUrl = process.env.WEBHOOK_BASE_URL || process.env.PUBLIC_URL || 'https://your-server.com';
          const callbackUrl = `${webhookBaseUrl}/api/webhooks/flight-alerts`;
          
          // Parse flight date from current date (or you can ask guests for flight date)
          const now = new Date();
          const year = now.getFullYear().toString();
          const month = String(now.getMonth() + 1).padStart(2, '0');
          const day = String(now.getDate()).padStart(2, '0');
          
          // For DFW airport (hotel location), we need departure airport
          // This is a limitation - FlightStats requires both airports
          // You may need to ask guests for their departure airport, or use a default
          const departureAirport = 'JFK'; // Default or ask user - you'll need to add this to the form
          const arrivalAirport = 'DFW'; // Dallas/Fort Worth (hotel location)
          
          createFlightAlertRule({
            carrier: flightInfo.carrier,
            flightNumber: flightInfo.flightNumber,
            departureAirport: departureAirport,
            arrivalAirport: arrivalAirport,
            year: year,
            month: month,
            day: day,
            callbackUrl: callbackUrl,
            events: ['depDelay', 'can', 'arrGate', 'preArr60', 'arr'], // Monitor delays, cancellations, gate changes, pre-arrival, arrival
            requestId: request.id,
            phone: request.phone
          }).then(result => {
            if (result.success && result.ruleId) {
              flightAlertRules.set(request.id, result.ruleId);
              console.log(`Flight alert rule created for request ${request.id}:`, result.ruleId);
            } else {
              console.warn(`Failed to create flight alert rule for request ${request.id}:`, result.error);
            }
          }).catch(err => {
            console.error('Error creating flight alert rule:', err);
          });
        }
      }
      
      // Broadcast new request with seat info
      io.emit('new_ride_request', request);
      socket.emit('request_ack', { request_id: request.id });
      
      // Broadcast current seat availability (pending selections from other guests)
      const pendingSeats = Array.from(activeRequests.values())
        .filter(r => r.status === 'pending' && r.selected_seats && r.id !== request.id)
        .flatMap(r => r.selected_seats);
      socket.emit('seat_availability', { 
        booked: Array.from(bookedSeats.keys()), 
        pending: pendingSeats 
      });
      
      // Also broadcast to all so everyone gets updated availability
      const allPendingSeats = Array.from(activeRequests.values())
        .filter(r => r.status === 'pending' && r.selected_seats)
        .flatMap(r => r.selected_seats);
      io.emit('seat_availability', { 
        booked: Array.from(bookedSeats.keys()), 
        pending: allPendingSeats 
      });
      socket.emit('request_ack', { request_id: request.id });

      try {
        await createRequest(request);
      } catch (err) {
        console.error('Failed to persist request', err);
        if (err?.code === '23505') {
          socket.emit('request_error', { message: 'Already submitted. Please call the hotel (817-545-8108)', detail: 'duplicate voucher_code' });
        } else {
          socket.emit('request_error', { message: 'Unable to save request right now', detail: err?.message });
        }
      }

      // Emit grouped view for drivers/admins
      io.emit('grouped_requests', groupNearby([...activeRequests.values()]));
    });

    socket.on('update_driver_location', async (coords) => {
      // Rate limiting for location updates
      if (!checkSocketRateLimit(socket.id, 60, 60000)) { // 60 updates per minute
        return; // Silently ignore excessive updates
      }

      // Validate coordinates
      if (!coords || typeof coords.lat !== 'number' || typeof coords.lng !== 'number') {
        socket.emit('error', { message: 'Invalid coordinates' });
        return;
      }

      // Validate coordinate ranges (prevent invalid GPS data)
      if (coords.lat < -90 || coords.lat > 90 || coords.lng < -180 || coords.lng > 180) {
        socket.emit('error', { message: 'Coordinates out of valid range' });
        return;
      }

      driverLocation = coords;
      io.emit('driver_moved', driverLocation);

      // Calculate ETA for all active requests
      if (mapsApiKey) {
        for (const [reqId, req] of activeRequests.entries()) {
          if (req.coordinates && ['pending', 'accepted'].includes(req.status)) {
            const eta = await calculateETA(coords, req.coordinates, mapsApiKey);
            if (eta) {
              etas.set(reqId, { ...eta, lastUpdated: new Date().toISOString() });
              io.to(`request_${reqId}`).emit('eta_update', { request_id: reqId, ...eta });
            }
          }
        }
      }
    });

    socket.on('update_guest_location', (data) => {
      const { request_id, coords } = data || {};
      if (!request_id || !coords) return;
      io.emit('guest_moved', { request_id, coords });
    });

    socket.on('join_chat', (data) => {
      const { request_id, role, name } = data || {};
      if (request_id) {
        socket.join(`chat_${request_id}`);
        socket.to(`chat_${request_id}`).emit('user_joined', { role, name, ts: new Date().toISOString() });
      }
    });

    socket.on('send_message', (msgData) => {
      // Rate limiting for messages
      if (!checkSocketRateLimit(socket.id, 30, 60000)) { // 30 messages per minute
        socket.emit('error', { message: 'Message rate limit exceeded. Please slow down.' });
        return;
      }

      // Sanitize message data
      const sanitized = sanitizeInput(msgData);
      const { request_id, from, role, text } = sanitized || {};
      
      // Validate message
      if (!request_id || !from || !text || typeof text !== 'string') {
        socket.emit('error', { message: 'Invalid message data' });
        return;
      }

      // Prevent message spam (max 500 characters)
      if (text.length > 500) {
        socket.emit('error', { message: 'Message too long. Maximum 500 characters.' });
        return;
      }

      // Validate role
      if (!['guest', 'driver', 'admin'].includes(role)) {
        socket.emit('error', { message: 'Invalid role' });
        return;
      }

      const message = { 
        ...sanitized, 
        text: text.substring(0, 500), // Ensure max length
        ts: new Date().toISOString(), 
        id: randomUUID() 
      };
      io.to(`chat_${request_id}`).emit('receive_message', message);
    });

    socket.on('driver_arrived', async (data) => {
      const { request_id } = data || {};
      if (request_id) {
        const req = activeRequests.get(request_id);
        const notificationMsg = '🚐 Your Super 8 shuttle has arrived! Please look for the van at your location.';
        
        // Send push notification via socket
        io.to(`request_${request_id}`).emit('push_notification', {
          type: 'driver_arrived',
          message: notificationMsg,
          request_id,
          ts: new Date().toISOString()
        });

        // Send SMS if phone number is available
        if (req?.phone) {
          try {
            await sendSMS(req.phone, notificationMsg);
          } catch (err) {
            console.error('SMS send error for', req.phone, err);
          }
        }
      }
    });

    socket.on('status_change', async (data) => {
      const parse = statusChangeSchema.safeParse(data);
      if (!parse.success) return;

      const req = activeRequests.get(parse.data.request_id);
      if (req) {
        const oldStatus = req.status;
        req.status = parse.data.status;
        activeRequests.set(req.id, req);

        // When driver accepts, book the seats permanently
        if (parse.data.status === 'accepted' && oldStatus === 'pending') {
          if (req.selected_seats && req.selected_seats.length > 0) {
            // Book seats
            req.selected_seats.forEach(seat => {
              bookedSeats.set(seat, req.id);
            });
            
            // Broadcast updated seat availability
            const pendingSeats = Array.from(activeRequests.values())
              .filter(r => r.status === 'pending' && r.selected_seats && r.id !== req.id)
              .flatMap(r => r.selected_seats);
            io.emit('seat_availability', { 
              booked: Array.from(bookedSeats.keys()), 
              pending: pendingSeats 
            });
          }
        }

        // When request is completed or cancelled, free up seats
        if (parse.data.status === 'completed' || parse.data.status === 'cancelled') {
          if (req.selected_seats && req.selected_seats.length > 0) {
            req.selected_seats.forEach(seat => {
              if (bookedSeats.get(seat) === req.id) {
                bookedSeats.delete(seat);
              }
            });
            
            // Broadcast updated seat availability
            const pendingSeats = Array.from(activeRequests.values())
              .filter(r => r.status === 'pending' && r.selected_seats)
              .flatMap(r => r.selected_seats);
            io.emit('seat_availability', { 
              booked: Array.from(bookedSeats.keys()), 
              pending: pendingSeats 
            });
          }
        }

        // Send push notifications on status changes
        if (parse.data.status === 'accepted') {
          const notificationMsg = '✅ Your ride request has been accepted! Driver is on the way. Your seats are confirmed.';
          io.to(`request_${parse.data.request_id}`).emit('push_notification', {
            type: 'accepted',
            message: notificationMsg,
            request_id: parse.data.request_id,
            ts: new Date().toISOString()
          });
          // Send SMS notification
          if (req.phone) {
            try {
              await sendSMS(req.phone, notificationMsg);
            } catch (err) {
              console.error('SMS send error for accepted status:', req.phone, err);
            }
          }
        } else if (parse.data.status === 'picked_up') {
          const notificationMsg = '🎉 You\'ve been picked up! Enjoy your ride.';
          io.to(`request_${parse.data.request_id}`).emit('push_notification', {
            type: 'picked_up',
            message: notificationMsg,
            request_id: parse.data.request_id,
            ts: new Date().toISOString()
          });
          // Send SMS notification
          if (req.phone) {
            try {
              await sendSMS(req.phone, notificationMsg);
            } catch (err) {
              console.error('SMS send error for picked_up status:', req.phone, err);
            }
          }
        }
      }

      io.emit('update_status', parse.data);

      try {
        await updateStatus(parse.data.request_id, parse.data.status);
      } catch (err) {
        console.error('Failed to update status', err);
      }
    });

    socket.on('request_eta', async (data) => {
      const { request_id } = data || {};
      const req = activeRequests.get(request_id);
      if (req && driverLocation && req.coordinates && mapsApiKey) {
        const eta = await calculateETA(driverLocation, req.coordinates, mapsApiKey);
        if (eta) {
          socket.emit('eta_update', { request_id, ...eta });
        }
      } else if (etas.has(request_id)) {
        socket.emit('eta_update', { request_id, ...etas.get(request_id) });
      }
    });

    socket.on('vacate_seats', async (data) => {
      const { request_id } = data || {};
      if (!request_id) {
        socket.emit('error', { message: 'Request ID required' });
        return;
      }

      const req = activeRequests.get(request_id);
      if (req && req.selected_seats && req.selected_seats.length > 0) {
        // Free up seats for this request
        req.selected_seats.forEach(seat => {
          if (bookedSeats.get(seat) === req.id) {
            bookedSeats.delete(seat);
          }
        });
        
        // Broadcast updated seat availability
        const pendingSeats = Array.from(activeRequests.values())
          .filter(r => r.status === 'pending' && r.selected_seats && r.id !== req.id)
          .flatMap(r => r.selected_seats);
        io.emit('seat_availability', { 
          booked: Array.from(bookedSeats.keys()), 
          pending: pendingSeats 
        });
        
        socket.emit('vacate_seats_success', { request_id, message: 'Seats vacated successfully' });
      } else {
        socket.emit('error', { message: 'Request not found or no seats to vacate' });
      }
    });

    socket.on('disconnect', () => {
      console.log('Socket disconnected:', socket.id);
      // Clean up: remove requests if guest disconnects
      for (const [reqId, req] of activeRequests.entries()) {
        if (req.socket_id === socket.id && req.status === 'pending') {
          // Clean up flight alert rule if exists
          const alertRuleId = flightAlertRules.get(reqId);
          if (alertRuleId) {
            deleteFlightAlertRule(alertRuleId).catch(err => 
              console.error('Failed to delete flight alert rule:', err)
            );
            flightAlertRules.delete(reqId);
          }
          activeRequests.delete(reqId);
          io.emit('grouped_requests', groupNearby([...activeRequests.values()]));
        }
      }
    });
  });

  // Return activeRequests reference for webhook handlers
  return Promise.resolve({ activeRequests });
}
