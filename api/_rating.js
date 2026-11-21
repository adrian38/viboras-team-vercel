// El rating de cada jugador, guardado.
//
// Hasta ahora el rating sólo existía mientras una pantalla lo calculaba: el
// motor recorre el histórico en el navegador y el servidor nunca supo el
// número. Eso bastaba para enseñarlo, y no basta para decidir con él —que es
// lo que hace falta desde que un partido puede pedir «sólo avanzados».
//
// Lo que se guarda es el resultado del MISMO motor con los MISMOS datos
// (api/_motor.js), así que la base y la pantalla dicen lo mismo. Si alguna
// vez no coinciden, es que esta tabla está vieja, no que haya dos cuentas.
//
// Detalle: ai_context/rating_en_el_servidor.md
import { sql } from '@vercel/postgres';
import { ensureSchema } from './_db.js';
import { calcularRatings } from './_motor.js';
import {
  TIPOS_DE_RATING, nombresDeJugadores, ratingsDePartida, votosDeNivel, partidosDeTipos
} from './_lecturas.js';

let listo = null;

// Fuera de ensureSchema, que está en el techo de tamaño. `rating_at` no es
// adorno: sin él no se puede saber si lo guardado es de antes del último
// partido, que es la única forma de notar que el recálculo dejó de correr.
async function crearColumnas() {
  await ensureSchema();
  await sql`ALTER TABLE players ADD COLUMN IF NOT EXISTS rating DOUBLE PRECISION`;
  await sql`ALTER TABLE players ADD COLUMN IF NOT EXISTS rd DOUBLE PRECISION`;
  await sql`ALTER TABLE players ADD COLUMN IF NOT EXISTS categoria TEXT`;
  await sql`ALTER TABLE players ADD COLUMN IF NOT EXISTS rating_at TIMESTAMPTZ`;
}

export function ensureRatingSchema() {
  if (!listo) listo = crearColumnas().catch((err) => { listo = null; throw err; });
  return listo;
}

// Recalcula el rating de TODOS y lo guarda. Es todo o nada a propósito: el
// Glicko de uno depende de contra quién jugó, así que no existe «recalcular
// sólo a Marta». Son cincuenta y pico partidos y cuarenta jugadores; lo caro
// sería no hacerlo y tener la tabla vieja.
export async function recalcularRatings() {
  await ensureRatingSchema();
  const [nombres, matches, ratings, votos] = await Promise.all([
    nombresDeJugadores(true),
    partidosDeTipos(TIPOS_DE_RATING),
    ratingsDePartida(),
    votosDeNivel()
  ]);
  const salida = await calcularRatings({ nombres, matches, ratings, votos });
  if (!salida.length) return 0;
  // Una sola sentencia y no cuarenta: el `unnest` mete los tres arrays en
  // paralelo y el JOIN por nombre los reparte.
  await sql`
    UPDATE players p SET rating = v.rating, rd = v.rd, categoria = v.categoria, rating_at = now()
    FROM (
      SELECT * FROM unnest(
        ${salida.map((j) => j.name)}::text[],
        ${salida.map((j) => j.rating)}::float8[],
        ${salida.map((j) => j.rd)}::float8[],
        ${salida.map((j) => j.categoria)}::text[]
      ) AS t(name, rating, rd, categoria)
    ) v
    WHERE p.name = v.name`;
  return salida.length;
}

// El recálculo que cuelga de guardar un resultado. No puede tirar la
// petición: el resultado ya está guardado y que el rating tarde un minuto
// más en moverse no es un error que enseñarle a nadie.
export async function recalcularSinRuido(motivo) {
  try {
    const n = await recalcularRatings();
    console.log(`rating: recalculados ${n} jugadores (${motivo})`);
    return { ok: true, jugadores: n };
  } catch (err) {
    console.error(`rating: no se pudo recalcular (${motivo})`, err);
    // Devuelve el motivo ademas de registrarlo. El cron lo pone en su
    // respuesta, que esta detras del secreto: sin esto, la unica senal de
    // que el rating lleva semanas sin moverse es que nadie la mira.
    return { ok: false, error: String(err && err.message || err) };
  }
}

// La categoría guardada de un jugador. `null` si nunca se ha calculado, que
// es distinto de «no tiene categoría»: quien decida con esto tiene que
// mirar la diferencia.
export async function categoriaDe(playerId) {
  await ensureRatingSchema();
  const { rows } = await sql`SELECT categoria, rating_at FROM players WHERE id = ${playerId}`;
  if (!rows.length || !rows[0].rating_at) return null;
  return rows[0].categoria || null;
}
