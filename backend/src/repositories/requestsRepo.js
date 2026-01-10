import { pool } from '../db.js';

export async function createRequest(req) {
  const text = `
    INSERT INTO shuttle_requests
      (id, guest_name, phone, airline_code, voucher_code, terminal, gate_proximity, courtesy_pickup, status, language_pref, coords, created_at)
    VALUES
      ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, ST_SetSRID(ST_MakePoint($11, $12), 4326), $13)
    RETURNING id;
  `;
  const values = [
    req.id,
    req.guest_name,
    req.phone,
    req.airline_code || null,
    (req.voucher_code || '').toUpperCase(),
    req.terminal,
    req.gate_proximity || null,
    req.courtesy_pickup || false,
    req.status,
    req.language_pref || 'en',
    req.coordinates?.lng ?? null,
    req.coordinates?.lat ?? null,
    req.created_at ? new Date(req.created_at) : new Date()
  ];
  await pool.query(text, values);
}

export async function updateStatus(requestId, status) {
  const text = `UPDATE shuttle_requests SET status = $2 WHERE id = $1`;
  await pool.query(text, [requestId, status]);
}

export async function listRecent(limit = 50) {
  const text = `
    SELECT id, guest_name, phone, airline_code, voucher_code, terminal, gate_proximity,
           status, language_pref,
           CASE WHEN coords IS NOT NULL THEN json_build_object('lat', ST_Y(coords), 'lng', ST_X(coords)) END as coordinates,
           created_at
    FROM shuttle_requests
    ORDER BY created_at DESC
    LIMIT $1;
  `;
  const { rows } = await pool.query(text, [limit]);
  return rows;
}
