import { sql } from '@vercel/postgres';
import { ensureSchema, formatSet } from './_db.js';

async function getNames(req, res) {
  try {
    await ensureSchema();
    const includeInactiveRaw = String(req.query?.includeInactive || req.body?.includeInactive || '').toLowerCase();
    const includeInactive = includeInactiveRaw === '1' || includeInactiveRaw === 'true';

    const query = includeInactive
      ? sql`SELECT name FROM players ORDER BY LOWER(name), name`
      : sql`SELECT name FROM players WHERE active = TRUE ORDER BY LOWER(name), name`;

    const { rows } = await query;
    res.setHeader('content-type', 'application/json');
    res.setHeader('cache-control', 'no-store');
    res.status(200).send(JSON.stringify({ names: rows.map((r) => r.name) }));
  } catch (err) {
    console.error('read:getNames error', err);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
}

async function getLeagues(req, res) {
  try {
    await ensureSchema();
    const q = await sql`SELECT id, name, start_date, end_date, substitution_groups FROM leagues ORDER BY name`;
    res.status(200).json(q.rows || []);
  } catch (e) {
    console.error('read:getLeagues error', e);
    res.status(500).json([]);
  }
}

async function getResults(req, res) {
  try {
    await ensureSchema();

    const eventTypeParam = String(req.query?.eventType || req.body?.eventType || '').trim();
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
        e.start_date AS event_start_date,
        e.end_date AS event_end_date,
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
      start_date: r.event_start_date || '',
      end_date: r.event_end_date || '',
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
          type: row.event_type || '',
          start_date: row.start_date || '',
          end_date: row.end_date || ''
        }])
    ).values()].sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));

    res.setHeader('cache-control', 'no-store');
    res.status(200).json({ matches, events });
  } catch (err) {
    console.error('read:getResults error', err);
    res.status(500).json({ matches: [], events: [] });
  }
}

async function getSlots(req, res) {
  try {
    await ensureSchema();
    const date = req.query && (req.query.date || req.body?.date);
    if (!date) {
      res.status(400).send('missing date');
      return;
    }

    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const todayIso = `${yyyy}-${mm}-${dd}`;
    await sql`DELETE FROM availability WHERE date ~ '^\\d{4}-\\d{2}-\\d{2}$' AND date < ${todayIso}`;

    const { rows } = await sql`
      SELECT p.name AS name, a.hour AS hour
      FROM availability a
      JOIN players p ON a.player_id = p.id
      WHERE a.date = ${String(date)} AND p.active = TRUE
      ORDER BY a.id`;

    const result = {};
    for (const r of rows) {
      if (!result[r.hour]) result[r.hour] = [];
      result[r.hour].push(r.name);
    }
    res.setHeader('cache-control', 'no-store');
    res.status(200).json(result);
  } catch (err) {
    console.error('read:getSlots error', err);
    res.status(500).json({});
  }
}

export default async function handler(req, res) {
  const action = String(req.query?.action || req.body?.action || '').trim();

  switch (action) {
    case 'getNames':
      return getNames(req, res);
    case 'getLeagues':
      return getLeagues(req, res);
    case 'getResults':
      return getResults(req, res);
    case 'getSlots':
      return getSlots(req, res);
    default:
      res.status(404).json({ ok: false, error: 'unknown_action' });
      return;
  }
}
