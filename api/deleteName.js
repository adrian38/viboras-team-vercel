import { sql } from '@vercel/postgres';
import { ensureSchema, readBody } from './_db.js';

const ADMIN_KEY = '4F7K9Q2Z';

export default async function handler(req, res) {
  try {
    await ensureSchema();
    const data = await readBody(req);
    const providedKey = data && data.adminKey ? String(data.adminKey) : '';
    if (providedKey !== ADMIN_KEY) {
      res.status(401).json({ ok: false, error: 'unauthorized' });
      return;
    }
    const name = data && data.name ? String(data.name).trim() : '';
    if (!name) {
      res.status(200).json({ ok: false, error: 'empty' });
      return;
    }
    // Mark player as inactive instead of deleting to preserve historical references.
    const result = await sql`UPDATE players SET active = FALSE WHERE name = ${name} RETURNING id`;
    res.status(200).json({ ok: true, deleted: result.rowCount > 0 });
  } catch (err) {
    console.error('deleteName error', err);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
}
