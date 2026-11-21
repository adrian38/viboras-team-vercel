// Las cuatro lecturas que alimentan al motor de rating, en un sitio.
//
// Vivian sueltas dentro de los handlers de api/read.js, que las devolvia por
// HTTP a /rating. Ahora el rating tambien se calcula en el servidor
// (api/_motor.js) y necesita exactamente los mismos datos. Copiarlas habria
// sido garantizar que un dia el numero de la pantalla y el de la base dejen
// de coincidir sin que nadie lo note, que es la version peor de todas: no
// falla, miente.
//
// Aqui no hay `res` ni cabeceras: son consultas y ya. Quien las sirva por
// HTTP les pone el envoltorio.
import { sql } from '@vercel/postgres';
import { ensureSchema, formatSet } from './_db.js';
import { ensureAvisosSchema } from './_avisos.js';

// Los tipos de evento que /rating pide, que son todos los que puntuan y los
// torneos, porque el motor ya se encarga de descartar estos ultimos.
export const TIPOS_DE_RATING = ['ranked', 'grupo_liga', 'pozo', 'compas', 'doble_ko', 'legacy'];

export async function nombresDeJugadores(incluirInactivos) {
  await ensureSchema();
  const { rows } = incluirInactivos
    ? await sql`SELECT name FROM players ORDER BY LOWER(name), name`
    : await sql`SELECT name FROM players WHERE active = TRUE ORDER BY LOWER(name), name`;
  return rows.map((r) => r.name);
}

export async function ratingsDePartida() {
  await ensureSchema();
  const { rows } = await sql`SELECT name, initial_rating FROM players WHERE initial_rating IS NOT NULL`;
  return rows.map((r) => ({ jugador: r.name, rating: Number(r.initial_rating) }));
}

export async function votosDeNivel() {
  await ensureAvisosSchema();
  const { rows } = await sql`
    SELECT to_char(f.fecha, 'YYYY-MM-DD') AS fecha,
      p.name AS jugador,
      SUM(CASE f.nivel WHEN 'en_su_nivel' THEN 1 ELSE -1 END)::int AS neto
    FROM match_feedback_por_dia f
    JOIN players p ON p.id = f.rated_player_id
    WHERE f.nivel IS NOT NULL
    GROUP BY 1, 2
    HAVING SUM(CASE f.nivel WHEN 'en_su_nivel' THEN 1 ELSE -1 END) <> 0`;
  return rows.filter((r) => r.fecha);
}

// Los partidos tal y como los espera el motor: las mismas claves que devuelve
// /api/read?action=getResults, porque es ese JSON el que el motor sabe leer.
export async function partidosDeTipos(tipos) {
  await ensureSchema();
  const { rows } = await sql`
    SELECT
      m.id, m.date, m.format, m.event_id, m.round,
      e.type AS event_type, e.name AS event_name,
      e.start_date AS event_start_date, e.end_date AS event_end_date,
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
    WHERE e.type = ANY(${tipos})
    ORDER BY m.id`;
  return rows.map((r) => ({
    id: r.id,
    format: r.format || 'bo3_regular',
    event_id: r.event_id || null,
    event_type: r.event_type || null,
    event_name: r.event_name || null,
    start_date: r.event_start_date || '',
    end_date: r.event_end_date || '',
    round: r.round || null,
    date: r.date,
    p1a: r.p1a || '', p1b: r.p1b || '',
    p2a: r.p2a || '', p2b: r.p2b || '',
    s11: formatSet(r.set1_team1), s21: formatSet(r.set1_team2),
    s12: formatSet(r.set2_team1), s22: formatSet(r.set2_team2),
    s13: formatSet(r.set3_team1), s23: formatSet(r.set3_team2)
  }));
}
