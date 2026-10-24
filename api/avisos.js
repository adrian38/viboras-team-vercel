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

// Los ids de partido en la URL: uno solo, o varios separados por coma cuando
// la campanita los agrupo por ser el mismo dia y los mismos cuatro
// (api/_avisos.js, agruparPorDiaYJugadores).
function idsDe(raw) {
  return [...new Set(String(raw ?? '').split(',').map(toInt).filter((n) => n != null))];
}

// Los partidos pedidos, solo los que son del jugador y aun se pueden valorar.
async function partidosDe(user, matchIds) {
  if (!matchIds.length) return [];
  const abiertos = await partidosParaValorar(user.player_id);
  const propios = matchIds.filter((id) => abiertos.some((p) => p.id === id));
  if (!propios.length) return [];
  const { rows } = await sql`
    SELECT m.id, m.date, m.format,
      m.player1a_id, m.player1b_id, m.player2a_id, m.player2b_id,
      p1a.name AS p1a, p1b.name AS p1b, p2a.name AS p2a, p2b.name AS p2b,
      m.set1_team1, m.set1_team2, m.set2_team1, m.set2_team2, m.set3_team1, m.set3_team2
    FROM matches m
    JOIN players p1a ON p1a.id = m.player1a_id JOIN players p1b ON p1b.id = m.player1b_id
    JOIN players p2a ON p2a.id = m.player2a_id JOIN players p2b ON p2b.id = m.player2b_id
    WHERE m.id = ANY(${propios})`;
  return rows;
}

// Los datos de un partido para pintar su cabecera, sin los votos: varios
// partidos del grupo comparten companeros y los votos se resumen una vez
// para todos (ver `partido`, mas abajo).
function datosPartido(m) {
  const sets = [[m.set1_team1, m.set1_team2], [m.set2_team1, m.set2_team2], [m.set3_team1, m.set3_team2]]
    .filter(([a, b]) => a !== null && b !== null).map(([a, b]) => `${formatSet(a)}-${formatSet(b)}`);
  return { id: m.id, fecha: m.date, sets, equipo1: [m.p1a, m.p1b], equipo2: [m.p2a, m.p2b] };
}

async function partido(req, res, user) {
  const matches = await partidosDe(user, idsDe(req.query?.id));
  if (!matches.length) {
    res.status(404).json({ ok: false, error: 'not_found', message: 'Ese partido no es tuyo o ya no se puede valorar.' });
    return;
  }
  const jugadores = new Map();
  for (const m of matches) {
    for (const [id, name, equipo] of [
      [m.player1a_id, m.p1a, 1], [m.player1b_id, m.p1b, 1], [m.player2a_id, m.p2a, 2], [m.player2b_id, m.p2b, 2]
    ]) jugadores.set(id, { id, name, equipo });
  }
  jugadores.delete(user.player_id);
  const matchIds = matches.map((m) => m.id);
  const { rows } = await sql`
    SELECT match_id, rated_player_id, actitud, nivel FROM match_feedback
    WHERE match_id = ANY(${matchIds}) AND rater_player_id = ${user.player_id}`;
  // Un «otro» sale marcado solo si ya voto en todos los partidos del grupo,
  // para que un hueco en uno solo se siga pidiendo.
  const otros = [...jugadores.values()].map((j) => {
    const votos = rows.filter((r) => r.rated_player_id === j.id);
    const todos = (campo) => matchIds.every((id) => votos.some((v) => v.match_id === id && v[campo]));
    return { ...j, actitud: todos('actitud') ? votos[0].actitud : null, nivel: todos('nivel') ? votos[0].nivel : null };
  });
  res.status(200).json({ ok: true, partidos: matches.map(datosPartido), otros });
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

// El mismo voto a cada partido del grupo (un otro vale para todos: comparten
// companeros el mismo dia), para que valorar una vez baste para el grupo.
async function valorar(req, res, user) {
  const data = await readBody(req);
  const matches = await partidosDe(user, idsDe(data?.partido));
  if (!matches.length) {
    res.status(404).json({ ok: false, error: 'not_found', message: 'Ese partido no es tuyo o ya no se puede valorar.' });
    return;
  }
  const otrosIds = new Set();
  for (const m of matches) for (const id of [m.player1a_id, m.player1b_id, m.player2a_id, m.player2b_id]) {
    if (id !== user.player_id) otrosIds.add(id);
  }
  const votos = votosValidos(data, [...otrosIds]);
  if (!votos) {
    res.status(400).json({ ok: false, error: 'bad_vote', message: 'Valoración no válida.' });
    return;
  }
  for (const m of matches) {
    const deEsePartido = [m.player1a_id, m.player1b_id, m.player2a_id, m.player2b_id];
    for (const v of votos.filter((v) => deEsePartido.includes(v.id))) {
      await sql`
        INSERT INTO match_feedback (match_id, rater_player_id, rated_player_id, actitud, nivel)
        VALUES (${m.id}, ${user.player_id}, ${v.id}, ${v.actitud}, ${v.nivel})
        ON CONFLICT (match_id, rater_player_id, rated_player_id) DO UPDATE SET
          actitud = COALESCE(EXCLUDED.actitud, match_feedback.actitud),
          nivel = COALESCE(EXCLUDED.nivel, match_feedback.nivel),
          updated_at = now()`;
    }
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
