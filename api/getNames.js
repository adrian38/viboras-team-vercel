import { sql } from '@vercel/postgres';
import { ensureSchema } from './_db.js';

export default async function handler(req, res) {
  try {
    await ensureSchema();
    const { rows } = await sql`SELECT name FROM players ORDER BY id`;
    res.setHeader('content-type', 'application/json');
    res.setHeader('cache-control', 'no-store');
    res.status(200).send(JSON.stringify({ names: rows.map((r) => r.name) }));
  } catch (err) {
    console.error('getNames error', err);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
}
