import { randomUUID } from 'crypto';
import { z } from 'zod';
import { createRequest, updateStatus } from '../repositories/requestsRepo.js';
import { withinGeofence } from '../services/geofence.js';
import { groupNearby } from '../services/grouping.js';
import { calculateETA } from '../services/eta.js';
import { getFlightInfo } from '../services/flightApi.js';
import { sendSMS } from '../services/sms.js';

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
  selected_seats: z.array(z.string()).default([]),
  coordinates: z.object({ lat: z.number(), lng: z.number() })
});

const statusChangeSchema = z.object({
  request_id: z.string(),
  status: z.enum(['pending', 'accepted', 'picked_up', 'completed'])
});

export function initSockets(io) {
  let driverLocation = null;
  const activeRequests = new Map(); // request_id -> request payload
  const etas = new Map(); // request_id -> { etaMinutes, distanceKm, lastUpdated }
  const bookedSeats = new Map(); // seat_id -> request_id (when driver accepts, seats get booked)
  const mapsApiKey = process.env.MAPTILER_KEY || process.env.MAPS_API_KEY || process.env.VITE_MAPTILER_KEY;
  const flightApiKey = process.env.FLIGHT_API_KEY;

  // Periodic ETA updates (every 30 seconds)
  setInterval(async () => {
    if (!driverLocation || !mapsApiKey) return;
    for (const [reqId, req] of activeRequests.entries()) {
      if (req.coordinates && driverLocation && ['pending', 'accepted'].includes(req.status)) {
        const eta = await calculateETA(driverLocation, req.coordinates, mapsApiKey);
        if (eta) {
          etas.set(reqId, { ...eta, lastUpdated: new Date().toISOString() });
          io.to(`request_${reqId}`).emit('eta_update', { request_id: reqId, ...eta });
        }
      }
    }
  }, 30000);

  io.on('connection', (socket) => {
    console.log('Socket connected:', socket.id);

    socket.on('join_request', async (payload) => {
      const parse = joinRequestSchema.safeParse(payload);
      if (!parse.success) {
        socket.emit('request_error', { message: 'Invalid request', issues: parse.error.issues });
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
      const { request_id, from, role, text } = msgData || {};
      if (request_id && from && text) {
        const message = { ...msgData, ts: new Date().toISOString(), id: randomUUID() };
        io.to(`chat_${request_id}`).emit('receive_message', message);
      }
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
          io.to(`request_${parse.data.request_id}`).emit('push_notification', {
            type: 'accepted',
            message: '✅ Your ride request has been accepted! Driver is on the way. Your seats are confirmed.',
            request_id: parse.data.request_id,
            ts: new Date().toISOString()
          });
        } else if (parse.data.status === 'picked_up') {
          io.to(`request_${parse.data.request_id}`).emit('push_notification', {
            type: 'picked_up',
            message: '🎉 You\'ve been picked up! Enjoy your ride.',
            request_id: parse.data.request_id,
            ts: new Date().toISOString()
          });
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

    socket.on('disconnect', () => {
      console.log('Socket disconnected:', socket.id);
      // Clean up: remove requests if guest disconnects
      for (const [reqId, req] of activeRequests.entries()) {
        if (req.socket_id === socket.id && req.status === 'pending') {
          activeRequests.delete(reqId);
          io.emit('grouped_requests', groupNearby([...activeRequests.values()]));
        }
      }
    });
  });
}
