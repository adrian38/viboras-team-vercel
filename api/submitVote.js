import { sql } from '@vercel/postgres';
import { ensureSchema, getOrCreatePlayerId, readBody } from './_db.js';

export default async function handler(req, res) {
  try {
    await ensureSchema();
    const data = await readBody(req);
    const date = data && data.date ? String(data.date) : '';
    const name = data && data.name ? String(data.name) : '';
    const slots = Array.isArray(data && data.slots) ? data.slots : [];

    if (!date || !name) {
      res.status(400).send('missing data');
      return;
    }

    const playerId = await getOrCreatePlayerId(name);
    if (!playerId) {
      res.status(400).send('missing data');
      return;
    }

    await sql`DELETE FROM availability WHERE player_id = ${playerId} AND date = ${date}`;

    for (const slot of slots) {
      const hour = String(slot || '').trim();
      if (!hour) continue;
      await sql`INSERT INTO availability (player_id, date, hour)
        VALUES (${playerId}, ${date}, ${hour})
        ON CONFLICT (player_id, date, hour) DO NOTHING`;
    }

    res.status(200).send('ok');
  } catch (err) {
    console.error('submitVote error', err);
    res.status(500).send('error');
  }
}
