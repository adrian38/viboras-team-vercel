import { sql } from '@vercel/postgres';
import { ensureSchema, getOrCreatePlayerId, getPlayerId, toInt, readBody } from './_db.js';

export default async function handler(req, res) {
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

      const upd = await sql`
        UPDATE matches SET
          date = ${date},
          format = ${format}, event_id = 1, round = NULL,
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
      if (upd.rowCount > 0) {
        res.status(200).json({ ok: true });
        return;
      }
    } else {
      // Update-in-place if the same match key already exists (idempotent submit)
      const upd = await sql`
        UPDATE matches SET
          set1_team1 = ${s11}, set1_team2 = ${s21},
          set2_team1 = ${s12}, set2_team2 = ${s22},
          set3_team1 = ${s13}, set3_team2 = ${s23},
          format = ${format}, event_id = 1, round = NULL
        WHERE date = ${date}
          AND player1a_id IS NOT DISTINCT FROM ${p1a_id}
          AND player1b_id IS NOT DISTINCT FROM ${p1b_id}
          AND player2a_id IS NOT DISTINCT FROM ${p2a_id}
          AND player2b_id IS NOT DISTINCT FROM ${p2b_id}
        RETURNING id`;
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
    console.error('submitResult error', err);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
}
