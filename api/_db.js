import { sql } from '@vercel/postgres';

// Los tipos de `events` que son un torneo: tienen pantalla propia y reglas
// propias. Vive aqui porque lo leen tres ficheros y tener tres copias es
// tener tres listas que se separan: `write.js` veta por el la edicion suelta
// de sus partidos (`vetadoPorTorneo`), `read.js` lista con el los torneos del
// panel y `league-admin.js` solo borra eventos de estos tipos.
export const EVENTOS_DE_TORNEO = ['pozo', 'compas', 'doble_ko'];

let schemaReady = null;

export async function ensureSchema() {
  if (schemaReady) return schemaReady;

  schemaReady = (async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS players (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        active BOOLEAN NOT NULL DEFAULT TRUE
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS leagues (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        substitution_groups TEXT NOT NULL DEFAULT '[]'
      )
    `;

    await sql`
      ALTER TABLE leagues
      ADD COLUMN IF NOT EXISTS substitution_groups TEXT NOT NULL DEFAULT '[]'
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS events (
        id SERIAL PRIMARY KEY,
        type TEXT NOT NULL CHECK (
          type IN (
            'pozo',
            'compas',
            'doble_ko',
            'grupo_liga',
            'ranked',
            'unranked',
            'legacy'
          )
        ),
        name TEXT NOT NULL UNIQUE,
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        league_id INTEGER REFERENCES leagues(id) ON DELETE SET NULL
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS availability (
        id SERIAL PRIMARY KEY,
        player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
        date TEXT NOT NULL,
        hour TEXT NOT NULL,
        UNIQUE (player_id, date, hour)
      )
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS availability_date_idx
      ON availability(date)
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS matches (
        id SERIAL PRIMARY KEY,
        date TEXT NOT NULL,
        format TEXT NOT NULL CHECK (
          format IN (
            'bo3_regular',
            'bo3_stb',
            'bo1_regular',
            'timed_games',
            'timed_games_long'
          )
        ),
        event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE RESTRICT,
        round TEXT,
        player1a_id INTEGER REFERENCES players(id) ON DELETE RESTRICT,
        player1b_id INTEGER REFERENCES players(id) ON DELETE RESTRICT,
        player2a_id INTEGER REFERENCES players(id) ON DELETE RESTRICT,
        player2b_id INTEGER REFERENCES players(id) ON DELETE RESTRICT,
        set1_team1 INTEGER,
        set1_team2 INTEGER,
        set2_team1 INTEGER,
        set2_team2 INTEGER,
        set3_team1 INTEGER,
        set3_team2 INTEGER
      )
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS matches_date_idx
      ON matches(date)
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS matches_event_idx
      ON matches(event_id)
    `;

    await sql`
      INSERT INTO events (id, type, name, start_date, end_date, league_id)
      VALUES (1, 'ranked', 'Partidos Competitivos', '01/01/2000', '31/12/2099', NULL)
      ON CONFLICT (id) DO NOTHING
    `;

    await sql`
      INSERT INTO events (id, type, name, start_date, end_date, league_id)
      VALUES (2, 'unranked', 'Partidos Amistosos', '01/01/2000', '31/12/2099', NULL)
      ON CONFLICT (id) DO NOTHING
    `;

    await sql`
      INSERT INTO events (id, type, name, start_date, end_date, league_id)
      VALUES (3, 'legacy', 'Partidos Antiguos', '01/01/2026', '31/08/2026', NULL)
      ON CONFLICT (id) DO NOTHING
    `;
  })();

  return schemaReady;
}

// Una fila insertada con su `id` puesto a mano no mueve la secuencia del
// SERIAL. ensureSchema() siembra asi los eventos 1, 2 y 3, de modo que en una
// base recien creada la secuencia se queda en 1 y los TRES primeros INSERT
// que no ponen id chocan contra la clave primaria. El error es un 23505, el
// mismo codigo que un nombre repetido, y por eso el pozo lo contaba como «ya
// hay un torneo con ese nombre» con un nombre que no existia. Le pasa igual a
// cualquier tabla restaurada de un volcado, que trae los ids puestos.
//
// Poner la secuencia en max(id) es idempotente: donde ya esta bien, la deja
// donde estaba. De momento solo lo llama el pozo (ensurePozoSchema); los demas
// sitios que crean eventos o partidos no, y por eso siguen expuestos.
export async function sincronizarSecuencias() {
  await sql`SELECT setval(pg_get_serial_sequence('events', 'id'), GREATEST((SELECT max(id) FROM events), 1))`;
  await sql`SELECT setval(pg_get_serial_sequence('matches', 'id'), GREATEST((SELECT max(id) FROM matches), 1))`;
}

// Las paginas pintan los nombres con innerHTML: con < > " ' ` o & un nombre
// seria codigo ejecutandose para todo el grupo. La misma regla que el alta
// (comprobarNombreNuevo en auth.js), para cualquier ficha que se cree.
export function nombreDeJugadorValido(nombre) {
  return nombre.length >= 2 && nombre.length <= 60 && !/[<>"'`&]/.test(nombre);
}

// Un jugador que ya existe se devuelve aunque su nombre no cumpla la regla,
// que es de 2026-10-17: las fichas anteriores siguen sirviendo.
export async function getOrCreatePlayerId(name) {
  const trimmed = String(name || '').trim();
  if (!trimmed) return null;
  const existente = await getPlayerId(trimmed);
  if (existente || !nombreDeJugadorValido(trimmed)) return existente;
  await sql`INSERT INTO players (name, active) VALUES (${trimmed}, TRUE) ON CONFLICT (name) DO NOTHING`;
  return getPlayerId(trimmed);
}

export async function getPlayerId(name) {
  const trimmed = String(name || '').trim();
  if (!trimmed) return null;
  const { rows } = await sql`SELECT id FROM players WHERE name = ${trimmed}`;
  return rows.length ? rows[0].id : null;
}

export function toInt(v) {
  if (v === undefined || v === null || v === '') return null;
  const s = String(v).trim();
  if (!/^-?\d+$/.test(s)) return null;
  return parseInt(s, 10);
}

export function formatSet(n) {
  return (n === null || n === undefined) ? '' : String(n);
}

export async function readBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  const raw = await new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => { data += c; });
    req.on('end', () => resolve(data));
    req.on('error', () => resolve(''));
  });
  try { return raw ? JSON.parse(raw) : {}; } catch { return {}; }
}
