import { sql } from '@vercel/postgres';
import { ensureSchema, readBody } from './_db.js';

export default async function handler(req, res) {
  try {
    await ensureSchema();
    const data = await readBody(req);
    const name = data && data.name ? String(data.name).trim() : '';
    if (!name) {
      res.status(200).json({ ok: false, error: 'empty' });
      return;
    }
    const result = await sql`INSERT INTO players (name) VALUES (${name}) ON CONFLICT (name) DO NOTHING RETURNING id`;
    const added = result.rowCount > 0;
    res.status(200).json({ ok: true, added });
  } catch (err) {
    console.error('submitName error', err);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
}
