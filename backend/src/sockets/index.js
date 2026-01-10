import { randomUUID } from 'crypto';
import { z } from 'zod';
import { createRequest, updateStatus } from '../repositories/requestsRepo.js';
import { withinGeofence } from '../services/geofence.js';
import { groupNearby } from '../services/grouping.js';

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
  coordinates: z.object({ lat: z.number(), lng: z.number() })
});

const statusChangeSchema = z.object({
  request_id: z.string(),
  status: z.enum(['pending', 'accepted', 'picked_up', 'completed'])
});

export function initSockets(io) {
  let driverLocation = null;
  const activeRequests = new Map(); // request_id -> request payload

  io.on('connection', (socket) => {
    console.log('Socket connected:', socket.id);

    socket.on('join_request', async (payload) => {
      const parse = joinRequestSchema.safeParse(payload);
      if (!parse.success) {
        socket.emit('request_error', { message: 'Invalid request', issues: parse.error.issues });
        return;
      }

      const request = {
        ...parse.data,
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

      activeRequests.set(request.id, request);
      io.emit('new_ride_request', request);
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

    socket.on('update_driver_location', (coords) => {
      driverLocation = coords;
      io.emit('driver_moved', driverLocation);
    });

    socket.on('update_guest_location', (data) => {
      const { request_id, coords } = data || {};
      if (!request_id || !coords) return;
      io.emit('guest_moved', { request_id, coords });
    });

    socket.on('send_message', (msgData) => {
      io.emit('receive_message', { ...msgData, ts: new Date().toISOString() });
    });

    socket.on('status_change', async (data) => {
      const parse = statusChangeSchema.safeParse(data);
      if (!parse.success) return;

      const req = activeRequests.get(parse.data.request_id);
      if (req) {
        req.status = parse.data.status;
        activeRequests.set(req.id, req);
      }

      io.emit('update_status', parse.data);

      try {
        await updateStatus(parse.data.request_id, parse.data.status);
      } catch (err) {
        console.error('Failed to update status', err);
      }
    });

    socket.on('disconnect', () => {
      console.log('Socket disconnected:', socket.id);
    });
  });
}
