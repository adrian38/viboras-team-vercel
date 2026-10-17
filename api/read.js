import { sql } from '@vercel/postgres';
import { ensureSchema, formatSet } from './_db.js';
import { exigirSesion, exigirAdmin } from './_auth.js';
import { describirInscripcion } from './_inscripcion.js';
import { ensureAvisosSchema } from './_avisos.js';

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
      id: r.id, format: r.format || 'bo3_regular',
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

// Estado de cada fila del Excel de jugadores. "Rechazado" existe desde el
// 2026-10-17; las cuentas rechazadas antes se borraron y no salen.
const ESTADO_CUENTA = { active: 'Activo', pending: 'Pendiente', blocked: 'Bloqueado', rejected: 'Rechazado' };

function estadoJugador(player, user) {
  if (user && user.status === 'rejected') return ESTADO_CUENTA.rejected;
  if (player && player.active === false) return 'De baja';
  return user ? (ESTADO_CUENTA[user.status] || user.status) : 'Sin cuenta';
}

// Solo admin. Una fila por cuenta, mas una por cada jugador sin cuenta. El
// rating no esta aqui: lo calcula el navegador (rating-export.js lo cruza).
// La usan el Excel de /rating y la pantalla de jugadores del panel.
async function exportPlayers(req, res) {
  if (!await exigirAdmin(req, res)) return;
  try {
    res.setHeader('cache-control', 'no-store');
    res.status(200).json({ ok: true, players: await filasDeJugadores(), inscripcion: describirInscripcion() });
  } catch (err) {
    console.error('read:exportPlayers error', err);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
}

async function filasDeJugadores() {
  const [{ rows: players }, { rows: users }] = await Promise.all([
    sql`SELECT id, name, active FROM players`,
    sql`SELECT id, email, status, role, player_id, requested_player_name, created_at, approved_at,
               rejected_at, email_verified_at, signup_form FROM users ORDER BY created_at`
  ]);
  const porId = new Map(players.map((p) => [p.id, p]));
  const conCuenta = new Set();
  const filas = users.map((u) => {
    const p = porId.get(u.player_id);
    // Un rechazado que reclamaba un jugador no le da cuenta: el jugador sale
    // aparte, como «Sin cuenta».
    const suyo = p && u.status !== 'rejected' ? p : null;
    if (suyo) conCuenta.add(p.id);
    return {
      // Los id y el status los usa la pantalla de jugadores del panel de
      // administracion (admin-jugadores.js), que lee esta misma lista.
      userId: u.id,
      playerId: suyo ? suyo.id : null,
      playerActive: suyo ? suyo.active : null,
      status: u.status,
      name: p ? p.name : u.requested_player_name || '',
      estado: estadoJugador(p, u),
      email: u.email,
      role: u.role,
      createdAt: u.created_at,
      approvedAt: u.approved_at,
      rejectedAt: u.rejected_at,
      emailVerified: Boolean(u.email_verified_at),
      form: u.signup_form || {}
    };
  });
  for (const p of players) {
    if (conCuenta.has(p.id)) continue;
    filas.push({ userId: null, playerId: p.id, playerActive: p.active, name: p.name, estado: estadoJugador(p, null), form: {} });
  }
  return filas;
}

// Votos de «¿estaban en su nivel?» sumados por dia y jugador, para el motor
// de rating (nivel-votos.js): en su nivel o por encima +1, por debajo -1.
// Solo cuentan los votos entre jugadores que siguen en el partido: si se
// edita y cambia un jugador, lo que se voto de el deja de contar.
async function getNivelVotos(req, res) {
  try {
    await ensureAvisosSchema();
    const { rows } = await sql`
      SELECT to_char(CASE
          WHEN m.date ~ '^\\d{4}-\\d{2}-\\d{2}$' THEN m.date::date
          WHEN m.date ~ '^\\d{2}/\\d{2}/\\d{4}$' THEN to_date(m.date, 'DD/MM/YYYY')
        END, 'YYYY-MM-DD') AS fecha,
        p.name AS jugador,
        SUM(CASE f.nivel WHEN 'por_debajo' THEN -1 ELSE 1 END)::int AS neto
      FROM match_feedback f
      JOIN matches m ON m.id = f.match_id
      JOIN players p ON p.id = f.rated_player_id
      WHERE f.nivel IS NOT NULL
        AND f.rater_player_id IN (m.player1a_id, m.player1b_id, m.player2a_id, m.player2b_id)
        AND f.rated_player_id IN (m.player1a_id, m.player1b_id, m.player2a_id, m.player2b_id)
      GROUP BY 1, 2
      HAVING SUM(CASE f.nivel WHEN 'por_debajo' THEN -1 ELSE 1 END) <> 0`;
    res.setHeader('cache-control', 'no-store');
    res.status(200).json({ ok: true, votos: rows.filter((r) => r.fecha) });
  } catch (err) {
    console.error('read:getNivelVotos error', err);
    res.status(500).json({ ok: false, votos: [] });
  }
}

// Votos de «¿qué tal el ambiente?» recibidos por cada jugador, para la
// pantalla Jugadores del panel (admin-jugadores.js). Solo admin y solo
// cuentas: quien voto no sale de aqui. Mismo filtro que getNivelVotos.
async function getAmbiente(req, res) {
  if (!await exigirAdmin(req, res)) return;
  try {
    await ensureAvisosSchema();
    const { rows } = await sql`
      SELECT f.rated_player_id AS player_id,
        COUNT(*) FILTER (WHERE f.actitud = 'buen_rollo')::int AS buen_rollo,
        COUNT(*) FILTER (WHERE f.actitud = 'mejorable')::int AS mejorable
      FROM match_feedback f
      JOIN matches m ON m.id = f.match_id
      WHERE f.actitud IS NOT NULL
        AND f.rater_player_id IN (m.player1a_id, m.player1b_id, m.player2a_id, m.player2b_id)
        AND f.rated_player_id IN (m.player1a_id, m.player1b_id, m.player2a_id, m.player2b_id)
      GROUP BY f.rated_player_id`;
    res.setHeader('cache-control', 'no-store');
    res.status(200).json({ ok: true, ambiente: rows });
  } catch (err) {
    console.error('read:getAmbiente error', err);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
}

// El rating con el que arranca cada alta nueva (players.initial_rating, que
// se fija al aprobarla), para el motor de rating (rating-inicial.js).
async function getRatingsDePartida(req, res) {
  try {
    const { rows } = await sql`SELECT name, initial_rating FROM players WHERE initial_rating IS NOT NULL`;
    res.setHeader('cache-control', 'no-store');
    res.status(200).json({ ok: true, ratings: rows.map((r) => ({ jugador: r.name, rating: Number(r.initial_rating) })) });
  } catch (err) {
    console.error('read:getRatingsDePartida error', err);
    res.status(500).json({ ok: false, ratings: [] });
  }
}

export default async function handler(req, res) {
  // Desde el 2026-10-16 la app entera va detras de la sesion, lecturas
  // incluidas: ai_context/cuentas_y_sesiones.md
  if (!await exigirSesion(req, res)) return;
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
    case 'exportPlayers':
      return exportPlayers(req, res);
    case 'getNivelVotos':
      return getNivelVotos(req, res);
    case 'getAmbiente':
      return getAmbiente(req, res);
    case 'getRatingsDePartida':
      return getRatingsDePartida(req, res);
    default:
      res.status(404).json({ ok: false, error: 'unknown_action' });
      return;
  }
}
