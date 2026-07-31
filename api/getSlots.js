import { sql } from '@vercel/postgres';
import { ensureSchema } from './_db.js';

function todayIso() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

export default async function handler(req, res) {
  try {
    await ensureSchema();
    const date = req.query && req.query.date;
    if (!date) {
      res.status(400).send('missing date');
      return;
    }

    // Clean up availability rows for past dates (only prunes YYYY-MM-DD entries).
    const today = todayIso();
    await sql`DELETE FROM availability WHERE date ~ '^\\d{4}-\\d{2}-\\d{2}$' AND date < ${today}`;

    const { rows } = await sql`
      SELECT p.name AS name, a.hour AS hour
      FROM availability a
      JOIN players p ON a.player_id = p.id
      WHERE a.date = ${String(date)}
      ORDER BY a.id`;

    const result = {};
    for (const r of rows) {
      if (!result[r.hour]) result[r.hour] = [];
      result[r.hour].push(r.name);
    }
    res.setHeader('cache-control', 'no-store');
    res.status(200).json(result);
  } catch (err) {
    console.error('getSlots error', err);
    res.status(500).json({});
  }
}
