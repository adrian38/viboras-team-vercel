import { sql } from '@vercel/postgres';

let schemaReady = null;

export async function ensureSchema() {
  return true;
  // if (schemaReady) return schemaReady;

  // schemaReady = (async () => {
  //   // =====================================================
  //   // PLAYERS
  //   // =====================================================

  //   await sql`
  //     CREATE TABLE IF NOT EXISTS players (
  //       id SERIAL PRIMARY KEY,
  //       name TEXT NOT NULL UNIQUE
  //     )
  //   `;

  //   // =====================================================
  //   // LEAGUES
  //   // =====================================================

  //   await sql`
  //     CREATE TABLE IF NOT EXISTS leagues (
  //       id SERIAL PRIMARY KEY,
  //       name TEXT NOT NULL,
  //       start_date TEXT NOT NULL,
  //       end_date TEXT NOT NULL
  //     )
  //   `;

  //   // =====================================================
  //   // EVENTS
  //   // =====================================================

  //   await sql`
  //     CREATE TABLE IF NOT EXISTS events (
  //       id SERIAL PRIMARY KEY,
  //       type TEXT NOT NULL CHECK (
  //         type IN (
  //           'pozo',
  //           'doble_ko',
  //           'grupo_liga',
  //           'ranked',
  //           'unranked'
  //         )
  //       ),
  //       name TEXT NOT NULL UNIQUE,
  //       start_date TEXT NOT NULL,
  //       end_date TEXT NOT NULL,
  //       league_id INTEGER REFERENCES leagues(id) ON DELETE SET NULL
  //     )
  //   `;

  //   // =====================================================
  //   // AVAILABILITY
  //   // =====================================================

  //   await sql`
  //     CREATE TABLE IF NOT EXISTS availability (
  //       id SERIAL PRIMARY KEY,
  //       player_id INTEGER NOT NULL
  //         REFERENCES players(id) ON DELETE CASCADE,
  //       date TEXT NOT NULL,
  //       hour TEXT NOT NULL,
  //       UNIQUE (player_id, date, hour)
  //     )
  //   `;

  //   await sql`
  //     CREATE INDEX IF NOT EXISTS availability_date_idx
  //     ON availability(date)
  //   `;

  //   // =====================================================
  //   // MATCHES
  //   // =====================================================

  //   await sql`
  //     CREATE TABLE IF NOT EXISTS matches (
  //       id SERIAL PRIMARY KEY,

  //       date TEXT NOT NULL,

  //       format TEXT NOT NULL CHECK (
  //         format IN (
  //           'bo3_regular',
  //           'bo3_stb',
  //           'bo1_regular',
  //           'timed_games'
  //         )
  //       ),

  //       event_id INTEGER NOT NULL
  //         REFERENCES events(id) ON DELETE RESTRICT,

  //       round TEXT,

  //       player1a_id INTEGER NOT NULL
  //         REFERENCES players(id) ON DELETE RESTRICT,

  //       player1b_id INTEGER NOT NULL
  //         REFERENCES players(id) ON DELETE RESTRICT,

  //       player2a_id INTEGER NOT NULL
  //         REFERENCES players(id) ON DELETE RESTRICT,

  //       player2b_id INTEGER NOT NULL
  //         REFERENCES players(id) ON DELETE RESTRICT,

  //       set1_team1 INTEGER NOT NULL,
  //       set1_team2 INTEGER NOT NULL,

  //       set2_team1 INTEGER,
  //       set2_team2 INTEGER,

  //       set3_team1 INTEGER,
  //       set3_team2 INTEGER
  //     )
  //   `;

  //   await sql`
  //     CREATE INDEX IF NOT EXISTS matches_date_idx
  //     ON matches(date)
  //   `;

  //   await sql`
  //     CREATE INDEX IF NOT EXISTS matches_event_idx
  //     ON matches(event_id)
  //   `;

  //   // =====================================================
  //   // PERMANENT RANKED / UNRANKED EVENTS
  //   // =====================================================

  //   await sql`
  //     INSERT INTO events (
  //       type,
  //       name,
  //       start_date,
  //       end_date
  //     )
  //     VALUES (
  //       'ranked',
  //       'Ranked',
  //       '01/01/2000',
  //       '31/12/2099'
  //     )
  //     ON CONFLICT (name) DO NOTHING
  //   `;

  //   await sql`
  //     INSERT INTO events (
  //       type,
  //       name,
  //       start_date,
  //       end_date
  //     )
  //     VALUES (
  //       'unranked',
  //       'Unranked',
  //       '01/01/2000',
  //       '31/12/2099'
  //     )
  //     ON CONFLICT (name) DO NOTHING
  //   `;
  // })();

  // return schemaReady;
}

export async function getOrCreatePlayerId(name) {
  const trimmed = String(name || '').trim();
  if (!trimmed) return null;
  await sql`INSERT INTO players (name) VALUES (${trimmed}) ON CONFLICT (name) DO NOTHING`;
  const { rows } = await sql`SELECT id FROM players WHERE name = ${trimmed}`;
  return rows.length ? rows[0].id : null;
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
