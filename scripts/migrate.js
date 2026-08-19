// One-off migration: import legacy Netlify Blob JSON files into Vercel Postgres.
// Prerequisites:
//   1. POSTGRES_URL (or the standard vars) must be set in the environment
//      (e.g. via `vercel env pull .env.local` and running with dotenv).
//   2. Run  `node scripts/apply-schema.js`  first.
// Then run:  node scripts/migrate.js
//
// Reads:
//   ./data/names.json     -> { names: [ ... ] }
//   ./data/results.json   -> { matches: [ { date, p1a, p1b, p2a, p2b, s11, s21, s12, s22, s13, s23 } ] }
//   ./data/votes.json     -> { "YYYY-MM-DD": { "H:00": [name, ...], ... }, ... }

import { sql } from '@vercel/postgres';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const DATA_DIR = path.join(process.cwd(), 'data');

function loadJson(filename, fallback) {
  const p = path.join(DATA_DIR, filename);
  if (!existsSync(p)) {
    console.log(`(skip) ${filename} not found`);
    return fallback;
  }
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch (e) {
    console.warn(`Could not parse ${filename}:`, e.message);
    return fallback;
  }
}

async function getOrCreatePlayerId(name) {
  const trimmed = String(name || '').trim();
  if (!trimmed) return null;
  await sql`INSERT INTO players (name, active) VALUES (${trimmed}, true) ON CONFLICT (name) DO NOTHING`;
  const { rows } = await sql`SELECT id FROM players WHERE name = ${trimmed}`;
  return rows.length ? rows[0].id : null;
}

function toInt(v) {
  if (v === undefined || v === null || v === '') return null;
  const s = String(v).trim();
  if (!/^-?\d+$/.test(s)) return null;
  return parseInt(s, 10);
}

async function migrateNames() {
  const db = loadJson('names.json', { names: [] });
  const names = Array.isArray(db.names) ? db.names : [];
  let added = 0;
  for (const raw of names) {
    const name = String(raw || '').trim();
    if (!name) continue;
    const r = await sql`INSERT INTO players (name, active) VALUES (${name}, true) ON CONFLICT (name) DO NOTHING RETURNING id`;
    if (r.rowCount > 0) added++;
  }
  console.log(`players: ${added} new / ${names.length} total in file`);
}

async function migrateMatches() {
  const db = loadJson('results.json', { matches: [] });
  const matches = Array.isArray(db.matches) ? db.matches : [];
  let inserted = 0;
  for (const m of matches) {
    const p1a = await getOrCreatePlayerId(m.p1a);
    const p1b = await getOrCreatePlayerId(m.p1b);
    const p2a = await getOrCreatePlayerId(m.p2a);
    const p2b = await getOrCreatePlayerId(m.p2b);
    await sql`
      INSERT INTO matches (
        date, player1a_id, player1b_id, player2a_id, player2b_id,
        set1_team1, set1_team2, set2_team1, set2_team2, set3_team1, set3_team2,
        format, event_id, round
      ) VALUES (
        ${String(m.date || '').trim()},
        ${p1a}, ${p1b}, ${p2a}, ${p2b},
        ${toInt(m.s11)}, ${toInt(m.s21)},
        ${toInt(m.s12)}, ${toInt(m.s22)},
        ${toInt(m.s13)}, ${toInt(m.s23)},
        'bo3_regular', 1, NULL
      )`;
    inserted++;
  }
  console.log(`matches: ${inserted} inserted`);
}

async function migrateVotes() {
  const db = loadJson('votes.json', {});
  if (!db || typeof db !== 'object') {
    console.log('votes: nothing to migrate');
    return;
  }
  let inserted = 0;
  for (const date of Object.keys(db)) {
    const daySlots = db[date] || {};
    for (const hour of Object.keys(daySlots)) {
      const names = Array.isArray(daySlots[hour]) ? daySlots[hour] : [];
      for (const rawName of names) {
        const playerId = await getOrCreatePlayerId(rawName);
        if (!playerId) continue;
        const r = await sql`
          INSERT INTO availability (player_id, date, hour)
          VALUES (${playerId}, ${date}, ${hour})
          ON CONFLICT (player_id, date, hour) DO NOTHING
          RETURNING id`;
        if (r.rowCount > 0) inserted++;
      }
    }
  }
  console.log(`availability: ${inserted} rows inserted`);
}

async function main() {
  console.log('Starting migration...');
  await migrateNames();
  await migrateMatches();
  await migrateVotes();
  console.log('Migration complete.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
