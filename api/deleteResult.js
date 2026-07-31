import { sql } from '@vercel/postgres';
import { ensureSchema, getPlayerId, readBody } from './_db.js';

export default async function handler(req, res) {
  try {
    await ensureSchema();
    const data = await readBody(req);
    const date = String(data.date || '').trim();
    const p1a_id = await getPlayerId(data.p1a);
    const p1b_id = await getPlayerId(data.p1b);
    const p2a_id = await getPlayerId(data.p2a);
    const p2b_id = await getPlayerId(data.p2b);

    await sql`
      DELETE FROM matches
      WHERE date = ${date}
        AND player1a_id IS NOT DISTINCT FROM ${p1a_id}
        AND player1b_id IS NOT DISTINCT FROM ${p1b_id}
        AND player2a_id IS NOT DISTINCT FROM ${p2a_id}
        AND player2b_id IS NOT DISTINCT FROM ${p2b_id}`;
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('deleteResult error', err);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
}
