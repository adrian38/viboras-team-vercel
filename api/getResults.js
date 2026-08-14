import { sql } from '@vercel/postgres';
import { ensureSchema, formatSet } from './_db.js';

export default async function handler(req, res) {
  try {
    await ensureSchema();
    const { rows } = await sql`
      SELECT
        m.id,
        m.date,
        m.format,
        m.event_id,
        m.round,
        p1a.name AS p1a, p1b.name AS p1b,
        p2a.name AS p2a, p2b.name AS p2b,
        m.set1_team1, m.set1_team2,
        m.set2_team1, m.set2_team2,
        m.set3_team1, m.set3_team2
      FROM matches m
      LEFT JOIN players p1a ON m.player1a_id = p1a.id
      LEFT JOIN players p1b ON m.player1b_id = p1b.id
      LEFT JOIN players p2a ON m.player2a_id = p2a.id
      LEFT JOIN players p2b ON m.player2b_id = p2b.id
      ORDER BY m.id`;
    const matches = rows.map((r) => ({
      format: r.format || 'bo3_regular',
      event_id: r.event_id || null,
      round: r.round || null,
      date: r.date,
      p1a: r.p1a || '',
      p1b: r.p1b || '',
      p2a: r.p2a || '',
      p2b: r.p2b || '',
      s11: formatSet(r.set1_team1),
      s21: formatSet(r.set1_team2),
      s12: formatSet(r.set2_team1),
      s22: formatSet(r.set2_team2),
      s13: formatSet(r.set3_team1),
      s23: formatSet(r.set3_team2)
    }));
    res.setHeader('cache-control', 'no-store');
    res.status(200).json({ matches });
  } catch (err) {
    console.error('getResults error', err);
    res.status(500).json({ matches: [] });
  }
}
