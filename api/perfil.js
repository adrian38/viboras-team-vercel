// Lo que la pagina /cuenta-nueva ensena de quien ha entrado: su cuenta, su
// ficha de inscripcion, sus partidos, lo que le han valorado, lo que tiene
// votado y sus dispositivos.
//
// Todo de lectura y todo de uno mismo: no hay ninguna accion que escriba, y
// ninguna consulta recibe un id de jugador de fuera. El de la sesion y ya.
//
// Dos cosas que la pagina ensena y aqui no estan, porque no existen en la
// base:
//
//   - el lado de pista (drive / reves / ambos): no hay columna donde vivir;
//   - el rating, que lo calcula el navegador a partir del historico. El motor
//     ya esta triplicado (ai_context/motor_de_rating_duplicado.md) y una
//     cuarta copia en el servidor seria la peor de todas.
//
// `matches.date` es texto en dos formatos (DD/MM/AAAA y AAAA-MM-DD), como en
// api/_avisos.js: lo que no encaja en ninguno queda en NULL y fuera, en vez
// de romper la consulta.
import { sql } from '@vercel/postgres';
import { exigirSesion, sinCache } from './_auth.js';
import { ensureSchema } from './_db.js';
import { ensureAvisosSchema, partidosParaValorar } from './_avisos.js';
import { describirInscripcion } from './_inscripcion.js';
import { ensurePushSchema } from './_push.js';
import { ensureBuzonSchema } from './_buzon.js';

// Los partidos del jugador con el equipo en el que jugo y los sets de cada
// pareja ya contados. La base de casi todo lo que sigue.
function partidosDe(playerId) {
  return sql`
    WITH mios AS (
      SELECT m.*,
        CASE WHEN ${playerId} IN (m.player1a_id, m.player1b_id) THEN 1 ELSE 2 END AS equipo,
        CASE
          WHEN m.date ~ '^\\d{4}-\\d{2}-\\d{2}$' THEN m.date::date
          WHEN m.date ~ '^\\d{2}/\\d{2}/\\d{4}$' THEN to_date(m.date, 'DD/MM/YYYY')
        END AS dia
      FROM matches m
      WHERE ${playerId} IN (m.player1a_id, m.player1b_id, m.player2a_id, m.player2b_id)
    )
    SELECT id, dia, equipo,
      player1a_id, player1b_id, player2a_id, player2b_id,
      -- Los partidos de torneo (timed_games) guardan JUEGOS en estas mismas
      -- columnas, no sets: cuentan para ganados y perdidos, pero sumarlos al
      -- marcador de sets mezclaria dos unidades distintas.
      format IN ('bo3_regular', 'bo3_stb', 'bo1_regular') AS por_sets,
      (CASE WHEN set1_team1 > set1_team2 THEN 1 ELSE 0 END
       + CASE WHEN set2_team1 > set2_team2 THEN 1 ELSE 0 END
       + CASE WHEN set3_team1 > set3_team2 THEN 1 ELSE 0 END) AS sets1,
      (CASE WHEN set1_team2 > set1_team1 THEN 1 ELSE 0 END
       + CASE WHEN set2_team2 > set2_team1 THEN 1 ELSE 0 END
       + CASE WHEN set3_team2 > set3_team1 THEN 1 ELSE 0 END) AS sets2
    FROM mios
    ORDER BY dia DESC NULLS LAST, id DESC`;
}

// Partidos seguidos ganados contando desde el ultimo. Un empate a sets no
// cuenta como victoria y corta la racha, que es lo que es.
function rachaDe(filas) {
  let racha = 0;
  for (const f of filas) {
    const mios = f.equipo === 1 ? f.sets1 : f.sets2;
    const suyos = f.equipo === 1 ? f.sets2 : f.sets1;
    if (mios <= suyos) break;
    racha += 1;
  }
  return racha;
}

// El otro de tu pareja, o los dos de enfrente, con cuantas veces y cuantas
// ganando. `cuenta` es un Map de id a { veces, ganados }.
function sumarCompanerosYRivales(filas) {
  const companeros = new Map();
  const rivales = new Map();
  const anotar = (mapa, id, gano) => {
    if (!id) return;
    const r = mapa.get(id) || { veces: 0, ganados: 0 };
    r.veces += 1;
    if (gano) r.ganados += 1;
    mapa.set(id, r);
  };
  for (const f of filas) {
    const gano = (f.equipo === 1 ? f.sets1 : f.sets2) > (f.equipo === 1 ? f.sets2 : f.sets1);
    const mi = f.equipo === 1 ? [f.player1a_id, f.player1b_id] : [f.player2a_id, f.player2b_id];
    const otra = f.equipo === 1 ? [f.player2a_id, f.player2b_id] : [f.player1a_id, f.player1b_id];
    anotar(companeros, mi.find((id) => id !== f.player_id_mio), gano);
    for (const id of otra) anotar(rivales, id, gano);
  }
  return { companeros, rivales };
}

// El de mas veces, con su nombre. null si no hay ninguno.
async function masFrecuente(mapa) {
  let mejor = null;
  for (const [id, r] of mapa) {
    if (!mejor || r.veces > mejor.veces) mejor = { id, ...r };
  }
  if (!mejor) return null;
  const { rows } = await sql`SELECT name FROM players WHERE id = ${mejor.id}`;
  if (!rows.length) return null;
  return {
    nombre: rows[0].name,
    veces: mejor.veces,
    porcentaje: Math.round((mejor.ganados / mejor.veces) * 100)
  };
}

function totales(filas) {
  const t = { jugados: filas.length, ganados: 0, setsFavor: 0, setsContra: 0 };
  for (const f of filas) {
    const mios = f.equipo === 1 ? f.sets1 : f.sets2;
    const suyos = f.equipo === 1 ? f.sets2 : f.sets1;
    if (f.por_sets) {
      t.setsFavor += mios;
      t.setsContra += suyos;
    }
    if (mios > suyos) t.ganados += 1;
  }
  t.porcentaje = t.jugados ? Math.round((t.ganados / t.jugados) * 100) : 0;
  return t;
}

// Un partido organizado y todavia sin resultado esta en `matches` con el
// marcador a 0-0 (asi lo deja /day al formar las parejas). No se ha jugado:
// contarlo lo meteria en los perdidos y hundiria el porcentaje.
function decidido(f) {
  return f.sets1 + f.sets2 > 0;
}

async function partidos(playerId) {
  const { rows: todas } = await partidosDe(playerId);
  const rows = todas.filter(decidido);
  // El id propio no viene en la fila: se lo ponemos para no pasarlo por
  // parametro a cada ayudante.
  for (const f of rows) f.player_id_mio = playerId;
  const { companeros, rivales } = sumarCompanerosYRivales(rows);
  const ultimo = rows.find((f) => f.dia);
  return {
    ...totales(rows),
    racha: rachaDe(rows),
    ultimo: ultimo ? ultimo.dia : null,
    companero: await masFrecuente(companeros),
    rival: await masFrecuente(rivales)
  };
}

// Lo que le han votado a uno. Mismo filtro que read.js (getNivelVotos): solo
// cuentan los votos entre jugadores que siguen en el partido.
async function valoraciones(playerId) {
  const { rows } = await sql`
    SELECT
      count(*) FILTER (WHERE f.actitud = 'buen_rollo')::int AS buen_rollo,
      count(*) FILTER (WHERE f.actitud = 'mejorable')::int AS mejorable,
      count(*) FILTER (WHERE f.nivel IS NOT NULL)::int AS nivel_votos,
      COALESCE(SUM(CASE f.nivel
        WHEN 'por_debajo' THEN -1 WHEN 'por_encima' THEN 1 ELSE 0 END), 0)::int AS nivel_neto
    FROM match_feedback f
    JOIN matches m ON m.id = f.match_id
    WHERE f.rated_player_id = ${playerId}
      AND f.rater_player_id IN (m.player1a_id, m.player1b_id, m.player2a_id, m.player2b_id)
      AND f.rated_player_id IN (m.player1a_id, m.player1b_id, m.player2a_id, m.player2b_id)`;
  const v = rows[0];
  const pendientes = await partidosParaValorar(playerId);
  return {
    buenRollo: v.buen_rollo,
    mejorable: v.mejorable,
    nivelVotos: v.nivel_votos,
    nivelNeto: v.nivel_neto,
    pendientes: pendientes.length
  };
}

// Las franjas votadas que quedan por delante. Las pasadas no estan: getSlots
// las borra cada vez que alguien abre un dia, asi que de aqui no sale ningun
// historico, solo lo que viene.
async function disponibilidad(playerId) {
  const { rows } = await sql`
    SELECT date, count(*)::int AS horas
    FROM availability
    WHERE player_id = ${playerId} AND date ~ '^\\d{4}-\\d{2}-\\d{2}$'
    GROUP BY date ORDER BY date`;
  return {
    franjas: rows.reduce((n, r) => n + r.horas, 0),
    dias: rows.map((r) => ({ dia: r.date, horas: r.horas }))
  };
}

async function dispositivos(userId) {
  // Las dos tablas las crea quien las usa, y puede que nadie lo haya hecho
  // todavia en este arranque: sin esto, un grupo sin push rompe la pagina.
  await ensurePushSchema();
  await ensureBuzonSchema();
  const { rows } = await sql`
    SELECT
      (SELECT count(*) FROM push_subscriptions WHERE user_id = ${userId})::int AS push,
      (SELECT count(*) FROM buzon WHERE user_id = ${userId})::int AS buzon`;
  return rows[0];
}

// Las respuestas de la inscripcion con su titulo y su texto, en el orden en
// que se preguntaron. El formulario vive en _inscripcion.js: si cambia una
// opcion alli, aqui sale sola.
function ficha(form) {
  const datos = form || {};
  return describirInscripcion().map(({ campo, titulo, opciones }) => {
    const valor = datos[campo];
    const texto = opciones ? (opciones.find(([v]) => v === valor) || [])[1] : valor;
    return { campo, titulo, valor: texto || null };
  });
}

async function cuenta(userId) {
  const { rows } = await sql`
    SELECT u.email, u.role, u.status, u.created_at, u.email_verified_at, u.signup_form,
           p.name AS player_name, p.initial_rating
    FROM users u LEFT JOIN players p ON p.id = u.player_id
    WHERE u.id = ${userId}`;
  const u = rows[0] || {};
  return {
    nombre: u.player_name || null,
    correo: u.email,
    correoVerificado: Boolean(u.email_verified_at),
    alta: u.created_at,
    rol: u.role,
    estado: u.status,
    salida: u.initial_rating === null || u.initial_rating === undefined ? null : Number(u.initial_rating),
    ficha: ficha(u.signup_form)
  };
}

// Sin ficha de jugador no hay partidos, ni valoraciones, ni disponibilidad:
// todo eso cuelga de players.id. La cuenta si existe, asi que se responde lo
// que hay y la pagina esconde el resto.
async function todo(req, res, user) {
  const datos = { ok: true, cuenta: await cuenta(user.id), dispositivos: await dispositivos(user.id) };
  if (user.player_id) {
    await ensureAvisosSchema();
    datos.partidos = await partidos(user.player_id);
    datos.valoraciones = await valoraciones(user.player_id);
    datos.disponibilidad = await disponibilidad(user.player_id);
  }
  res.status(200).json(datos);
}

export default async function handler(req, res) {
  const user = await exigirSesion(req, res);
  if (!user) return;
  if (req.method !== 'GET') {
    res.setHeader('allow', 'GET');
    res.status(405).json({ ok: false, error: 'method_not_allowed' });
    return;
  }
  sinCache(res);
  try {
    await ensureSchema();
    await todo(req, res, user);
  } catch (err) {
    console.error('perfil error', err);
    if (!res.headersSent) res.status(500).json({ ok: false, error: 'server_error' });
  }
}
