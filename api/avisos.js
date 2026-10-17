// Valorar a los companeros de un partido (/valorar) y marcar avisos de la
// campanita como vistos. Solo jugadores con sesion y ficha: quien vota y a
// quien se vota salen de la cuenta, nunca del cuerpo de la peticion.
// Detalle: ai_context/valoraciones_y_avisos.md
import { sql } from '@vercel/postgres';
import { readBody, toInt, formatSet } from './_db.js';
import { exigirSesion, sinCache } from './_auth.js';
import { ensureAvisosSchema, partidosParaValorar, marcarAvisoVisto } from './_avisos.js';

const ACTITUDES = ['buen_rollo', 'mejorable'];
const NIVELES = ['por_debajo', 'en_su_nivel', 'por_encima'];

async function pendientes(req, res, user) {
  res.status(200).json({ ok: true, partidos: await partidosParaValorar(user.player_id) });
}

// El partido, si el jugador estuvo en el y aun se puede valorar. Lo que ya
// voto vuelve para que la pagina lo marque.
async function partidoDe(user, matchId) {
  const abiertos = await partidosParaValorar(user.player_id);
  if (!abiertos.some((p) => p.id === matchId)) return null;
  const { rows } = await sql`
    SELECT m.id, m.date, m.format,
      m.player1a_id, m.player1b_id, m.player2a_id, m.player2b_id,
      p1a.name AS p1a, p1b.name AS p1b, p2a.name AS p2a, p2b.name AS p2b,
      m.set1_team1, m.set1_team2, m.set2_team1, m.set2_team2, m.set3_team1, m.set3_team2
    FROM matches m
    JOIN players p1a ON p1a.id = m.player1a_id JOIN players p1b ON p1b.id = m.player1b_id
    JOIN players p2a ON p2a.id = m.player2a_id JOIN players p2b ON p2b.id = m.player2b_id
    WHERE m.id = ${matchId}`;
  return rows[0] || null;
}

async function partido(req, res, user) {
  const m = await partidoDe(user, toInt(req.query?.id));
  if (!m) {
    res.status(404).json({ ok: false, error: 'not_found', message: 'Ese partido no es tuyo o ya no se puede valorar.' });
    return;
  }
  const jugadores = [
    { id: m.player1a_id, name: m.p1a, equipo: 1 }, { id: m.player1b_id, name: m.p1b, equipo: 1 },
    { id: m.player2a_id, name: m.p2a, equipo: 2 }, { id: m.player2b_id, name: m.p2b, equipo: 2 }
  ];
  const { rows } = await sql`
    SELECT rated_player_id, actitud, nivel FROM match_feedback
    WHERE match_id = ${m.id} AND rater_player_id = ${user.player_id}`;
  const mios = new Map(rows.map((r) => [r.rated_player_id, r]));
  const sets = [[m.set1_team1, m.set1_team2], [m.set2_team1, m.set2_team2], [m.set3_team1, m.set3_team2]]
    .filter(([a, b]) => a !== null && b !== null).map(([a, b]) => `${formatSet(a)}-${formatSet(b)}`);
  res.status(200).json({
    ok: true,
    partido: { id: m.id, fecha: m.date, sets, equipo1: [m.p1a, m.p1b], equipo2: [m.p2a, m.p2b] },
    otros: jugadores.filter((j) => j.id !== user.player_id).map((j) => ({
      ...j, actitud: mios.get(j.id)?.actitud || null, nivel: mios.get(j.id)?.nivel || null
    }))
  });
}

// Cada voto trae `actitud` o `nivel` (o los dos). El que no viene se conserva:
// las dos preguntas se contestan por separado.
function votosValidos(data, otros) {
  const votos = Array.isArray(data?.votos) ? data.votos : [];
  const limpios = [];
  for (const v of votos) {
    const id = toInt(v?.playerId);
    const actitud = v?.actitud == null ? null : String(v.actitud);
    const nivel = v?.nivel == null ? null : String(v.nivel);
    if (!otros.includes(id)) return null;
    if (actitud !== null && !ACTITUDES.includes(actitud)) return null;
    if (nivel !== null && !NIVELES.includes(nivel)) return null;
    if (actitud !== null || nivel !== null) limpios.push({ id, actitud, nivel });
  }
  return limpios.length ? limpios : null;
}

async function valorar(req, res, user) {
  const data = await readBody(req);
  const m = await partidoDe(user, toInt(data?.partido));
  if (!m) {
    res.status(404).json({ ok: false, error: 'not_found', message: 'Ese partido no es tuyo o ya no se puede valorar.' });
    return;
  }
  const otros = [m.player1a_id, m.player1b_id, m.player2a_id, m.player2b_id].filter((id) => id !== user.player_id);
  const votos = votosValidos(data, otros);
  if (!votos) {
    res.status(400).json({ ok: false, error: 'bad_vote', message: 'Valoración no válida.' });
    return;
  }
  for (const v of votos) {
    await sql`
      INSERT INTO match_feedback (match_id, rater_player_id, rated_player_id, actitud, nivel)
      VALUES (${m.id}, ${user.player_id}, ${v.id}, ${v.actitud}, ${v.nivel})
      ON CONFLICT (match_id, rater_player_id, rated_player_id) DO UPDATE SET
        actitud = COALESCE(EXCLUDED.actitud, match_feedback.actitud),
        nivel = COALESCE(EXCLUDED.nivel, match_feedback.nivel),
        updated_at = now()`;
  }
  res.status(200).json({ ok: true });
}

// Lo llama la campanita con sendBeacon al pulsar un aviso: sin cuerpo util,
// el id va en la query.
async function visto(req, res, user) {
  const id = toInt(req.query?.id);
  if (id) await marcarAvisoVisto(user.player_id, id);
  res.status(200).json({ ok: true });
}

const ACCIONES = {
  pendientes: ['GET', pendientes],
  partido: ['GET', partido],
  valorar: ['POST', valorar],
  visto: ['POST', visto]
};

export default async function handler(req, res) {
  const user = await exigirSesion(req, res);
  if (!user) return;
  const action = String(req.query?.action || '').trim();
  const entrada = Object.prototype.hasOwnProperty.call(ACCIONES, action) ? ACCIONES[action] : null;
  if (!entrada) {
    res.status(404).json({ ok: false, error: 'unknown_action' });
    return;
  }
  if (req.method !== entrada[0]) {
    res.setHeader('allow', entrada[0]);
    res.status(405).json({ ok: false, error: 'method_not_allowed' });
    return;
  }
  sinCache(res);
  if (!user.player_id) {
    res.status(403).json({ ok: false, error: 'no_player', message: 'Tu cuenta no tiene ficha de jugador.' });
    return;
  }
  try {
    await ensureAvisosSchema();
    await entrada[1](req, res, user);
  } catch (err) {
    console.error(`avisos:${action} error`, err);
    if (!res.headersSent) res.status(500).json({ ok: false, error: 'server_error' });
  }
}
