// Valoraciones de partido y avisos de la campanita a jugadores.
//
// Las dos tablas viven aqui y no en ensureSchema (_db.js) porque esa funcion
// esta en el techo de tamano y el trinquete solo deja encoger
// (tools/code-size-baseline.json). Es el mismo arreglo que ensureAuthSchema.
// Detalle: ai_context/valoraciones_y_avisos.md
import { sql } from '@vercel/postgres';
import { ensureSchema } from './_db.js';

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
  // Los cuatro nombres, para que /history reconozca el partido: alli se
  // identifica por fecha y jugadores, porque getResults no manda el id.
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
// entrada por cada valoracion pendiente.
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
  for (const p of (await partidosParaValorar(playerId)).slice(0, 5)) {
    const enlace = `/valorar?partido=${p.id}`;
    if (p.faltanActitud > 0) items.push({ tipo: 'actitud', texto: `¿Qué tal el ambiente en el partido del ${diaYMes(p.fecha)}?`, enlace });
    if (p.faltanNivel > 0) items.push({ tipo: 'nivel', texto: `¿Estaban en su nivel? Partido del ${diaYMes(p.fecha)}`, enlace });
  }
  return items;
}

export async function marcarAvisoVisto(playerId, avisoId) {
  await ensureAvisosSchema();
  await sql`UPDATE avisos SET visto_at = now() WHERE id = ${avisoId} AND player_id = ${playerId} AND visto_at IS NULL`;
}

// Tras editar un resultado: un aviso a cada jugador del partido, el de antes y
// el de ahora, menos a quien lo edito.
export async function avisarEdicion(user, playerIds, fecha) {
  await ensureAvisosSchema();
  const quien = user.player_name || 'Un administrador';
  const texto = `${quien} editó vuestro partido del ${diaYMes(fecha)}. Comprueba el resultado.`;
  const destinos = [...new Set(playerIds.filter((id) => id && id !== user.player_id))];
  for (const id of destinos) {
    await sql`INSERT INTO avisos (player_id, texto, enlace) VALUES (${id}, ${texto}, '/history')`;
  }
}
