# Hotel Micro-Logistics Backend (No Docker)

Tech: Node.js, Express, Socket.io, Postgres (+ PostGIS), optional Redis.

## Setup
1) Install Postgres locally and enable PostGIS:
   - `CREATE EXTENSION postgis;`
2) Create database and run `sql/schema.sql`.
3) Copy `env.example` to `.env` and set:
   - `DATABASE_URL=postgres://user:pass@localhost:5432/hotel_logistics`
   - `CORS_ORIGINS=http://localhost:5173` (adjust as needed)
4) Install dependencies:
   - `cd backend && npm install`
5) Run:
   - `npm run dev` (nodemon) or `npm start`.

## Socket Events
- `join_request` { guest_name, phone, airline_code?, voucher_code?, terminal, gate_proximity?, language_pref?, coordinates? }
  - Emits `new_ride_request`, `grouped_requests`, optional `geofence_warning`.
- `update_driver_location` { lat, lng, heading?, speed? } -> emits `driver_moved`.
- `update_guest_location` { request_id, coords } -> emits `guest_moved`.
- `send_message` { roomId?, from, role, text } -> emits `receive_message`.
- `status_change` { request_id, status } -> emits `update_status`.

## Notes
- Live locations are held in memory for now; use Redis for durability/fan-out if scaling.
- Geofence polygons are placeholders; replace with real terminal shapes in `services/geofence.js`.
- Grouping window defaults to 8 minutes and 200m radius in `services/grouping.js`.
