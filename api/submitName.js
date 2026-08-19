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
    // If the name exists but is inactive, reactivate it. If it doesn't exist, insert.
    const existing = await sql`SELECT id, active FROM players WHERE name = ${name}`;
    let added = false;
    if (existing.rows.length === 0) {
      const result = await sql`INSERT INTO players (name, active) VALUES (${name}, TRUE) RETURNING id`;
      added = result.rowCount > 0;
    } else if (existing.rows[0].active === false) {
      await sql`UPDATE players SET active = TRUE WHERE name = ${name}`;
      added = true;
    }
    res.status(200).json({ ok: true, added });
  } catch (err) {
    console.error('submitName error', err);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
}
