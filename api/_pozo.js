// El pozo contra la base: crear el torneo, leerlo y encadenar las rondas.
//
// El esquema no se toca en ensureSchema() de _db.js por lo mismo que las
// cuentas (api/_auth.js:5): el trinquete de tools/code-size-baseline.json
// tiene clavada esa funcion en 122 lineas y una sola linea mas rompe
// `npm run check`. Asi que las tres columnas que necesita el pozo se anaden
// aqui, y quien llame a ensurePozoSchema() tiene que haber llamado antes a
// ensureSchema(): se cuelgan de `events` y de `matches`.
//
// Las rondas no existen hasta que se pueden formar. La 1 se crea con el
// torneo; la 2 aparece cuando las cuatro pistas de la 1 tienen resultado, y
// asi. Un resultado que falta bloquea a todo el mundo, y eso es el formato,
// no un fallo.
//
// Detalle: ai_context/pozo_americano.md
import { sql } from '@vercel/postgres';
import {
  JUGADORES_POR_PISTA, PISTAS_MIN, PISTAS_MAX, RONDAS_MIN, RONDAS_MAX,
  clasificacion, rondaInicial, rondaSiguiente
} from './_pozo-motor.js';

let pozoReady = null;

export function ensurePozoSchema() {
  if (!pozoReady) {
    pozoReady = (async () => {
      // La configuracion del torneo: pistas, rondas, tabla de puntos y la
      // siembra con la que se formo la primera ronda. JSONB y no columnas
      // porque es de un tipo de evento, no de todos.
      await sql`ALTER TABLE events ADD COLUMN IF NOT EXISTS pozo_config JSONB`;
      // En que pista se juega. Hasta ahora la pista no se guardaba en ningun
      // sitio, y en el pozo decide los puntos y el movimiento de la ronda
      // siguiente: no se puede deducir del marcador.
      await sql`ALTER TABLE matches ADD COLUMN IF NOT EXISTS court INTEGER`;
      // Quien gana cuando los juegos quedan iguales. Solo se mira si
      // set1_team1 = set1_team2, y lo dicen los jugadores.
      await sql`ALTER TABLE matches ADD COLUMN IF NOT EXISTS tie_winner SMALLINT`;
    })().catch((err) => { pozoReady = null; throw err; });
  }
  return pozoReady;
}

// --- Lectura -------------------------------------------------------------

function aPartido(fila) {
  return {
    id: fila.id,
    round: Number(fila.round),
    court: fila.court,
    team1: [fila.player1a_id, fila.player1b_id],
    team2: [fila.player2a_id, fila.player2b_id],
    juegos1: fila.set1_team1 === null ? null : Number(fila.set1_team1),
    juegos2: fila.set1_team2 === null ? null : Number(fila.set1_team2),
    tieWinner: fila.tie_winner === null ? null : Number(fila.tie_winner)
  };
}

export async function partidosDelPozo(eventId) {
  const { rows } = await sql`
    SELECT id, round, court,
           player1a_id, player1b_id, player2a_id, player2b_id,
           set1_team1, set1_team2, tie_winner
    FROM matches
    WHERE event_id = ${eventId}`;
  return rows.map(aPartido).sort((a, b) => (a.round - b.round) || (a.court - b.court));
}

export async function eventoPozo(eventId) {
  const { rows } = await sql`
    SELECT id, name, start_date, pozo_config
    FROM events
    WHERE id = ${eventId} AND type = 'pozo'`;
  if (!rows.length) return null;
  const fila = rows[0];
  const config = fila.pozo_config || null;
  if (!config || !Array.isArray(config.siembra)) return null;
  return { id: fila.id, nombre: fila.name, fecha: fila.start_date, config };
}

export function agrupaPorRonda(partidos) {
  const porRonda = new Map();
  for (const partido of partidos) {
    if (!porRonda.has(partido.round)) porRonda.set(partido.round, []);
    porRonda.get(partido.round).push(partido);
  }
  for (const lista of porRonda.values()) lista.sort((a, b) => a.court - b.court);
  return porRonda;
}

export async function leerPozo(eventId) {
  const evento = await eventoPozo(eventId);
  if (!evento) return null;
  const partidos = await partidosDelPozo(eventId);
  return {
    evento,
    partidos,
    clasificacion: clasificacion(partidos, evento.config.siembra, evento.config.puntos)
  };
}

// --- Validacion ----------------------------------------------------------

function enteroPositivo(valor) {
  const n = Number(valor);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function problemaDeLaConfig({ pistas, rondas, puntos, siembra }) {
  if (!Number.isInteger(pistas) || pistas < PISTAS_MIN || pistas > PISTAS_MAX) {
    return `El pozo va de ${PISTAS_MIN} a ${PISTAS_MAX} pistas.`;
  }
  if (!Number.isInteger(rondas) || rondas < RONDAS_MIN || rondas > RONDAS_MAX) {
    return `El pozo va de ${RONDAS_MIN} a ${RONDAS_MAX} rondas.`;
  }
  const hacenFalta = pistas * JUGADORES_POR_PISTA;
  if (!Array.isArray(siembra) || siembra.length !== hacenFalta) {
    return `Con ${pistas} pistas hacen falta ${hacenFalta} jugadores, ni uno más ni uno menos.`;
  }
  if (siembra.some((id) => enteroPositivo(id) === null)) return 'Hay un jugador sin identificar en la lista.';
  if (new Set(siembra).size !== siembra.length) return 'Hay un jugador repetido en la lista.';
  if (!Array.isArray(puntos) || puntos.length !== pistas) {
    return `La tabla de puntos tiene que tener una fila por pista: ${pistas}.`;
  }
  const malaFila = puntos.some((fila) => !Array.isArray(fila) || fila.length !== 2
    || fila.some((n) => !Number.isInteger(n) || n < 0));
  if (malaFila) return 'Cada fila de la tabla de puntos son dos números enteros: lo que vale ganar y lo que vale perder.';
  return null;
}

// --- Escritura -----------------------------------------------------------

async function insertarPartidos(eventId, fecha, partidos) {
  for (const partido of partidos) {
    await sql`
      INSERT INTO matches
        (date, format, event_id, round, court,
         player1a_id, player1b_id, player2a_id, player2b_id)
      VALUES
        (${fecha}, 'timed_games', ${eventId}, ${String(partido.round)}, ${partido.court},
         ${partido.team1[0]}, ${partido.team1[1]}, ${partido.team2[0]}, ${partido.team2[1]})`;
  }
}

export async function crearPozo({ nombre, fecha, pistas, rondas, puntos, siembra }) {
  const { rows } = await sql`
    INSERT INTO events (type, name, start_date, end_date)
    VALUES ('pozo', ${nombre}, ${fecha}, ${fecha})
    RETURNING id`;
  const eventId = rows[0].id;
  const config = { pistas, rondas, puntos, siembra };
  await sql`UPDATE events SET pozo_config = ${JSON.stringify(config)}::jsonb WHERE id = ${eventId}`;
  await insertarPartidos(eventId, fecha, rondaInicial(siembra, pistas));
  return eventId;
}

// Borra las rondas que ya no se pueden formar. Devuelve cuantos marcadores se
// han perdido, que no es lo mismo que cuantos partidos: los que estaban sin
// jugar no los echa nadie de menos.
export async function borrarDesdeLaRonda(partidos, desde) {
  const fuera = partidos.filter((p) => p.round >= desde);
  if (!fuera.length) return 0;
  await sql`DELETE FROM matches WHERE id = ANY(${fuera.map((p) => p.id)})`;
  return fuera.filter((p) => p.juegos1 !== null).length;
}

function mismosJugadores(partido, deseado) {
  return partido.team1[0] === deseado.team1[0]
    && partido.team1[1] === deseado.team1[1]
    && partido.team2[0] === deseado.team2[0]
    && partido.team2[1] === deseado.team2[1];
}

// Reescribe una ronda ya existente para que sea la que toca. Un partido cuyos
// cuatro jugadores no cambian conserva su marcador; el que cambia lo pierde,
// porque ya no es el mismo partido.
async function ajustarRonda(eventId, fecha, actuales, deseados) {
  const porPista = new Map(actuales.map((p) => [p.court, p]));
  let cambios = 0;
  let reiniciados = 0;

  for (const deseado of deseados) {
    const actual = porPista.get(deseado.court);
    if (!actual) continue;
    porPista.delete(deseado.court);
    if (mismosJugadores(actual, deseado)) continue;
    await sql`
      UPDATE matches SET
        player1a_id = ${deseado.team1[0]}, player1b_id = ${deseado.team1[1]},
        player2a_id = ${deseado.team2[0]}, player2b_id = ${deseado.team2[1]},
        set1_team1 = NULL, set1_team2 = NULL, tie_winner = NULL
      WHERE id = ${actual.id}`;
    if (actual.juegos1 !== null) reiniciados += 1;
    cambios += 1;
  }

  const nuevos = deseados.filter((d) => !actuales.some((a) => a.court === d.court));
  if (nuevos.length) await insertarPartidos(eventId, fecha, nuevos);
  const sobran = [...porPista.values()];
  if (sobran.length) await sql`DELETE FROM matches WHERE id = ANY(${sobran.map((p) => p.id)})`;

  return { cambios: cambios + nuevos.length + sobran.length, reiniciados };
}

// Despues de tocar cualquier marcador: encadena las rondas que ya se pueden
// formar y borra las que han dejado de poder formarse. Devuelve cuantos
// resultados posteriores se han perdido por el camino.
export async function sincronizarRondas(evento) {
  const { id: eventId, fecha, config } = evento;
  let partidos = await partidosDelPozo(eventId);
  let perdidos = 0;

  for (let r = 1; r < config.rondas; r++) {
    const porRonda = agrupaPorRonda(partidos);
    const esta = porRonda.get(r) || [];
    const siguiente = rondaSiguiente(esta, config.pistas, r + 1);
    if (!siguiente) {
      perdidos += await borrarDesdeLaRonda(partidos, r + 1);
      break;
    }
    const actuales = porRonda.get(r + 1) || [];
    const hecho = await ajustarRonda(eventId, fecha, actuales, siguiente);
    perdidos += hecho.reiniciados;
    if (hecho.cambios) partidos = await partidosDelPozo(eventId);
  }
  return perdidos;
}

export async function guardarMarcador(matchId, juegos1, juegos2, tieWinner) {
  await sql`
    UPDATE matches
    SET set1_team1 = ${juegos1}, set1_team2 = ${juegos2}, tie_winner = ${tieWinner}
    WHERE id = ${matchId}`;
}
