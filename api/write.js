import { sql } from '@vercel/postgres';
import { ensureSchema, getOrCreatePlayerId, getPlayerId, readBody, toInt } from './_db.js';

async function submitName(req, res) {
  try {
    await ensureSchema();
    const data = await readBody(req);
    const name = data && data.name ? String(data.name).trim() : '';
    if (!name) {
      res.status(200).json({ ok: false, error: 'empty' });
      return;
    }
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
    console.error('write:submitName error', err);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
}

async function submitResult(req, res) {
  try {
    await ensureSchema();
    const data = await readBody(req);
    if (!data || typeof data !== 'object') {
      res.status(400).json({ ok: false, error: 'Invalid request' });
      return;
    }

    const original = data && typeof data === 'object' ? data._original : null;
    const p1a_id = await getOrCreatePlayerId(data.p1a);
    const p1b_id = await getOrCreatePlayerId(data.p1b);
    const p2a_id = await getOrCreatePlayerId(data.p2a);
    const p2b_id = await getOrCreatePlayerId(data.p2b);

    const s11 = toInt(data.s11), s21 = toInt(data.s21);
    const s12 = toInt(data.s12), s22 = toInt(data.s22);
    const s13 = toInt(data.s13), s23 = toInt(data.s23);
    const date = String(data.date || '').trim();
    const format = (String(data.format || '').trim() === 'bo3_stb') ? 'bo3_stb' : 'bo3_regular';

    if (original && typeof original === 'object') {
      const o_p1a = await getPlayerId(original.p1a);
      const o_p1b = await getPlayerId(original.p1b);
      const o_p2a = await getPlayerId(original.p2a);
      const o_p2b = await getPlayerId(original.p2b);
      const o_date = String(original.date || '').trim();
      const o_event = (original && original.event_id) ? toInt(original.event_id) : null;
      let upd;

      if (o_event !== null) {
        upd = await sql`
          UPDATE matches SET
            date = ${date},
            format = ${format},
            player1a_id = ${p1a_id}, player1b_id = ${p1b_id},
            player2a_id = ${p2a_id}, player2b_id = ${p2b_id},
            set1_team1 = ${s11}, set1_team2 = ${s21},
            set2_team1 = ${s12}, set2_team2 = ${s22},
            set3_team1 = ${s13}, set3_team2 = ${s23}
          WHERE date = ${o_date}
            AND player1a_id IS NOT DISTINCT FROM ${o_p1a}
            AND player1b_id IS NOT DISTINCT FROM ${o_p1b}
            AND player2a_id IS NOT DISTINCT FROM ${o_p2a}
            AND player2b_id IS NOT DISTINCT FROM ${o_p2b}
            AND event_id IS NOT DISTINCT FROM ${o_event}
          RETURNING id`;
      } else {
        upd = await sql`
          UPDATE matches SET
            date = ${date},
            format = ${format},
            player1a_id = ${p1a_id}, player1b_id = ${p1b_id},
            player2a_id = ${p2a_id}, player2b_id = ${p2b_id},
            set1_team1 = ${s11}, set1_team2 = ${s21},
            set2_team1 = ${s12}, set2_team2 = ${s22},
            set3_team1 = ${s13}, set3_team2 = ${s23}
          WHERE date = ${o_date}
            AND player1a_id IS NOT DISTINCT FROM ${o_p1a}
            AND player1b_id IS NOT DISTINCT FROM ${o_p1b}
            AND player2a_id IS NOT DISTINCT FROM ${o_p2a}
            AND player2b_id IS NOT DISTINCT FROM ${o_p2b}
          RETURNING id`;
      }

      if (upd.rowCount > 0) {
        res.status(200).json({ ok: true });
        return;
      }
    }

    await sql`
      INSERT INTO matches (
        date, player1a_id, player1b_id, player2a_id, player2b_id,
        set1_team1, set1_team2, set2_team1, set2_team2, set3_team1, set3_team2,
        format, event_id, round
      ) VALUES (
        ${date}, ${p1a_id}, ${p1b_id}, ${p2a_id}, ${p2b_id},
        ${s11}, ${s21}, ${s12}, ${s22}, ${s13}, ${s23},
        ${format}, 1, NULL
      )`;
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('write:submitResult error', err);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
}

async function deleteResult(req, res) {
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
    console.error('write:deleteResult error', err);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
}

async function deleteName(req, res) {
  try {
    await ensureSchema();
    const data = await readBody(req);
    const providedKey = data && data.adminKey ? String(data.adminKey) : '';
    const ADMIN_KEY = '4F7K9Q2Z';
    if (providedKey !== ADMIN_KEY) {
      res.status(401).json({ ok: false, error: 'unauthorized' });
      return;
    }
    const name = data && data.name ? String(data.name).trim() : '';
    if (!name) {
      res.status(200).json({ ok: false, error: 'empty' });
      return;
    }
    const result = await sql`UPDATE players SET active = FALSE WHERE name = ${name} RETURNING id`;
    res.status(200).json({ ok: true, deleted: result.rowCount > 0 });
  } catch (err) {
    console.error('write:deleteName error', err);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
}

async function submitVote(req, res) {
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
    console.error('write:submitVote error', err);
    res.status(500).send('error');
  }
}

export default async function handler(req, res) {
  const action = String(req.query?.action || req.body?.action || '').trim();

  switch (action) {
    case 'submitName':
      return submitName(req, res);
    case 'submitResult':
      return submitResult(req, res);
    case 'deleteResult':
      return deleteResult(req, res);
    case 'deleteName':
      return deleteName(req, res);
    case 'submitVote':
      return submitVote(req, res);
    default:
      res.status(404).json({ ok: false, error: 'unknown_action' });
      return;
  }
}
