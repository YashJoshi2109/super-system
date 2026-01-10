# Hotel Micro-Logistics Frontend (No Docker)

Tech: React + Vite + Tailwind + Socket.io client.

## Setup
1) `cd frontend`
2) Copy `.env.example` (create one) to `.env` and set `VITE_SOCKET_URL=http://localhost:3001`
3) `npm install`
4) `npm run dev` (defaults to port 5173)

## Structure
- `src/App.jsx` simple role switcher (guest/driver/admin) wired to sockets.
- `src/lib/socket.js` connects to backend via `VITE_SOCKET_URL`.
- Tailwind ready via `tailwind.config.js` and `index.css`.

Replace map/chat UI with production components as you iterate.
