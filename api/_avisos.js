// Valoraciones de partido y avisos de la campanita a jugadores.
//
// Las dos tablas viven aqui y no en ensureSchema (_db.js) porque esa funcion
// esta en el techo de tamano y el trinquete solo deja encoger
// (tools/code-size-baseline.json). Es el mismo arreglo que ensureAuthSchema.
// Detalle: ai_context/valoraciones_y_avisos.md
import { sql } from '@vercel/postgres';
import { ensureSchema } from './_db.js';
import { pushAJugadores, pushAAdmins } from './_push.js';

let listo = null;

// Una fila por (partido, quien vota, a quien vota). Ambiente y nivel van en la
// misma fila pero se contestan por separado: cada uno puede ser NULL.
async function crearTablas() {
  await ensureSchema();
  await sql`
    CREATE TABLE IF NOT EXISTS match_feedback (
      id SERIAL PRIMARY KEY,
      match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
      rater_player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      rated_player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      actitud TEXT CHECK (actitud IN ('buen_rollo', 'mejorable')),
      nivel TEXT CHECK (nivel IN ('por_debajo', 'en_su_nivel', 'por_encima')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (match_id, rater_player_id, rated_player_id),
      CHECK (rater_player_id <> rated_player_id)
    )
  `;
  // Avisos con destinatario y estado de visto. Los de valoracion no estan
  // aqui: se calculan al vuelo y desaparecen al contestar.
  await sql`
    CREATE TABLE IF NOT EXISTS avisos (
      id SERIAL PRIMARY KEY,
      player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      texto TEXT NOT NULL,
      enlace TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      visto_at TIMESTAMPTZ
    )
  `;
}

// Memoizada y reintentable, como ensureAuthSchema: si falla, la siguiente
// peticion lo vuelve a intentar.
export function ensureAvisosSchema() {
  if (!listo) listo = crearTablas().catch((err) => { listo = null; throw err; });
  return listo;
}

// Dias que un partido admite valoraciones desde que se jugo.
export const DIAS_PARA_VALORAR = 14;

// Partidos recientes del jugador y cuantas valoraciones le faltan de cada
// clase. Tres companeros de pista: valorar a los tres completa la clase.
// `matches.date` es texto en dos formatos (DD/MM/AAAA y AAAA-MM-DD); lo que no
// encaja en ninguno queda en NULL y fuera, en vez de romper la consulta.
export async function partidosParaValorar(playerId) {
  const { rows } = await sql`
    WITH mios AS (
      SELECT m.*, CASE
        WHEN m.date ~ '^\\d{4}-\\d{2}-\\d{2}$' THEN m.date::date
        WHEN m.date ~ '^\\d{2}/\\d{2}/\\d{4}$' THEN to_date(m.date, 'DD/MM/YYYY')
      END AS dia
      FROM matches m
      WHERE ${playerId} IN (m.player1a_id, m.player1b_id, m.player2a_id, m.player2b_id)
        -- Solo partidos jugados: los de liga sin jugar llevan 0-0 (o nada) y
        -- salian en /valorar como «Partido del 05/10» repetido (2026-10-17).
        AND COALESCE(m.set1_team1, 0) + COALESCE(m.set1_team2, 0) > 0
    )
    SELECT m.id, m.date, p1a.name AS p1a, p1b.name AS p1b, p2a.name AS p2a, p2b.name AS p2b,
      3 - COUNT(f.actitud) AS faltan_actitud,
      3 - COUNT(f.nivel) AS faltan_nivel
    FROM mios m
    JOIN players p1a ON p1a.id = m.player1a_id JOIN players p1b ON p1b.id = m.player1b_id
    JOIN players p2a ON p2a.id = m.player2a_id JOIN players p2b ON p2b.id = m.player2b_id
    LEFT JOIN match_feedback f ON f.match_id = m.id AND f.rater_player_id = ${playerId}
      AND f.rated_player_id IN (m.player1a_id, m.player1b_id, m.player2a_id, m.player2b_id)
    WHERE m.dia BETWEEN current_date - ${DIAS_PARA_VALORAR}::int AND current_date
    GROUP BY m.id, m.date, m.dia, p1a.name, p1b.name, p2a.name, p2b.name
    ORDER BY m.dia DESC, m.id DESC`;
  // Los cuatro nombres van con el id para poder ensenar el partido sin otra
  // consulta. /history lo reconoce por el id desde el 2026-10-17.
  return rows.map((r) => ({
    id: r.id, fecha: r.date, jugadores: [r.p1a, r.p1b, r.p2a, r.p2b],
    faltanActitud: Number(r.faltan_actitud), faltanNivel: Number(r.faltan_nivel)
  }));
}

function diaYMes(fecha) {
  const t = String(fecha || '');
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  return iso ? `${iso[3]}/${iso[2]}` : t.slice(0, 5);
}

// Lo que la campanita ensena a un jugador: los avisos guardados sin ver y una
// entrada por partido con algo por valorar. Hasta el 2026-10-18 eran dos
// (ambiente y nivel); Adrian pidio una: /valorar ya ensena las dos preguntas.
export async function avisosDeJugador(playerId) {
  if (!playerId) return [];
  await ensureAvisosSchema();
  const { rows } = await sql`
    SELECT id, texto, enlace, created_at FROM avisos
    WHERE player_id = ${playerId} AND visto_at IS NULL
      AND created_at > now() - interval '30 days'
    ORDER BY created_at DESC LIMIT 20
  `;
  const items = rows.map((r) => ({ tipo: 'aviso', id: r.id, texto: r.texto, cuando: r.created_at, enlace: r.enlace }));
  // Se filtra antes de cortar: cinco partidos ya valorados no tapan uno viejo.
  const pendientes = (await partidosParaValorar(playerId)).filter((p) => p.faltanActitud > 0 || p.faltanNivel > 0);
  for (const p of pendientes.slice(0, 5)) {
    items.push({ tipo: 'valorar', texto: `Valora el partido del ${diaYMes(p.fecha)}`, enlace: `/valorar?partido=${p.id}` });
  }
  return items;
}

export async function marcarAvisoVisto(playerId, avisoId) {
  await ensureAvisosSchema();
  await sql`UPDATE avisos SET visto_at = now() WHERE id = ${avisoId} AND player_id = ${playerId} AND visto_at IS NULL`;
}

// Tras cambiar el resultado de un partido (write.js, editado): un aviso a cada
// jugador del partido, el de antes y el de ahora, menos a quien lo cambio.
export async function avisarEdicion(user, playerIds, fecha) {
  await ensureAvisosSchema();
  const quien = user.player_name || 'Un administrador';
  const texto = `${quien} cambió el resultado de vuestro partido del ${diaYMes(fecha)}. Compruébalo.`;
  const destinos = [...new Set(playerIds.filter((id) => id && id !== user.player_id))];
  for (const id of destinos) {
    await sql`INSERT INTO avisos (player_id, texto, enlace) VALUES (${id}, ${texto}, '/history')`;
  }
  await pushAJugadores(destinos, { texto, enlace: '/history' });
}

// Si el partido aun se puede valorar: un resultado viejo subido hoy no abre
// /valorar, y el push llevaria a un «ese partido no es tuyo».
function seValoraTodavia(fecha) {
  const t = String(fecha || '');
  const p = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(t) || /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (!p) return false;
  const [a, m, d] = p[1].length === 4 ? [p[1], p[2], p[3]] : [p[3], p[2], p[1]];
  const dias = (Date.now() - Date.UTC(Number(a), Number(m) - 1, Number(d))) / 86400000;
  return dias > -1 && dias < DIAS_PARA_VALORAR + 1;
}

// Los avisos de valorar no se guardan (se calculan al vuelo), asi que el push
// sale cuando nace el partido: a los otros tres, no a quien lo subio.
export async function avisarPartidoNuevo(user, playerIds, fecha, matchId) {
  if (!seValoraTodavia(fecha)) return;
  const texto = `¿Qué tal el partido del ${diaYMes(fecha)}? Valora a tus compañeros.`;
  await pushAJugadores(playerIds.filter((id) => id !== user.player_id), { texto, enlace: `/valorar?partido=${matchId}` });
}

// Un torneo entra con todos sus resultados de golpe: un solo push por jugador,
// no uno por partido.
export async function avisarTorneo(nombre, fecha, playerIds) {
  if (!seValoraTodavia(fecha)) return;
  await pushAJugadores(playerIds, { texto: `Ya están los resultados de ${nombre}. Valora a tus compañeros.`, enlace: '/valorar' });
}

// El «pide entrar» de la campanita de los administradores. La cuenta ya esta
// creada cuando se llama: un fallo aqui no puede convertir el alta en un 500.
export async function avisarAltaPendiente(userId) {
  try {
    const { rows } = await sql`
      SELECT COALESCE(p.name, u.requested_player_name, u.email) AS quien
      FROM users u LEFT JOIN players p ON p.id = u.player_id WHERE u.id = ${userId}`;
    if (rows.length) await pushAAdmins({ texto: `${rows[0].quien} pide entrar`, enlace: '/cuenta' });
  } catch (err) {
    console.error('avisos: alta pendiente', err);
  }
}
