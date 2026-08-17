import { sql } from '@vercel/postgres';
import { ensureSchema, formatSet } from './_db.js';

export default async function handler(req, res) {
  try {
    await ensureSchema();

    const eventTypeParam = String(req.query?.eventType || '').trim();
    const requestedTypes = eventTypeParam
      ? eventTypeParam
          .split(',')
          .map((type) => String(type).trim().toLowerCase())
          .filter(Boolean)
      : ['ranked'];

    const normalizedTypes = [...new Set(requestedTypes)];

    const { rows } = await sql`
      SELECT
        m.id,
        m.date,
        m.format,
        m.event_id,
        m.round,
        e.type AS event_type,
        e.name AS event_name,
        p1a.name AS p1a, p1b.name AS p1b,
        p2a.name AS p2a, p2b.name AS p2b,
        m.set1_team1, m.set1_team2,
        m.set2_team1, m.set2_team2,
        m.set3_team1, m.set3_team2
      FROM matches m
      LEFT JOIN events e ON e.id = m.event_id
      LEFT JOIN players p1a ON m.player1a_id = p1a.id
      LEFT JOIN players p1b ON m.player1b_id = p1b.id
      LEFT JOIN players p2a ON m.player2a_id = p2a.id
      LEFT JOIN players p2b ON m.player2b_id = p2b.id
      WHERE e.type = ANY(${normalizedTypes})
      ORDER BY m.id`;

    const matches = rows.map((r) => ({
      format: r.format || 'bo3_regular',
      event_id: r.event_id || null,
      event_type: r.event_type || null,
      event_name: r.event_name || null,
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

    const events = [...new Map(
      matches
        .filter((row) => row.event_id)
        .map((row) => [String(row.event_id), {
          id: row.event_id,
          event_id: row.event_id,
          name: row.event_name || `Evento ${row.event_id}`,
          type: row.event_type || ''
        }])
    ).values()].sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));

    res.setHeader('cache-control', 'no-store');
    res.status(200).json({ matches, events });
  } catch (err) {
    console.error('getResults error', err);
    res.status(500).json({ matches: [], events: [] });
  }
}
