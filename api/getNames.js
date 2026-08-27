import { sql } from '@vercel/postgres';
import { ensureSchema } from './_db.js';

export default async function handler(req, res) {
  try {
    await ensureSchema();
    const includeInactiveRaw = String(req.query?.includeInactive || '').toLowerCase();
    const includeInactive = includeInactiveRaw === '1' || includeInactiveRaw === 'true';

    const query = includeInactive
      ? sql`SELECT name FROM players ORDER BY LOWER(name), name`
      : sql`SELECT name FROM players WHERE active = TRUE ORDER BY LOWER(name), name`;

    const { rows } = await query;
    res.setHeader('content-type', 'application/json');
    res.setHeader('cache-control', 'no-store');
    res.status(200).send(JSON.stringify({ names: rows.map((r) => r.name) }));
  } catch (err) {
    console.error('getNames error', err);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
}
