# Padel App — Vercel + Vercel Postgres

Migrated from Netlify Functions + Netlify Blobs to **Vercel Functions** + **Vercel Postgres**.
Persistence layer replaced with a normalized SQL schema (no more JSON blob rewrites, no more race conditions).

The UI (HTML/CSS/JS) and all business logic are preserved. Only the fetch URLs changed:
`/.netlify/functions/<name>` → `/api/<name>`.

## Project layout

```
.
├── api/                       # Vercel serverless functions
│   ├── _db.js                 # Shared SQL helpers (schema bootstrap + player upsert)
│   ├── getNames.js            # GET  → { names: [...] }
│   ├── submitName.js          # POST { name } → { ok, added }
│   ├── deleteName.js          # POST { name, adminKey } → { ok, deleted }
│   ├── getResults.js          # GET  → { matches: [...] }
│   ├── submitResult.js        # POST { date, p1a..p2b, s11..s23, _original? } → { ok }
│   ├── deleteResult.js        # POST { date, p1a..p2b } → { ok }
│   ├── getSlots.js            # GET  ?date=YYYY-MM-DD → { "9:00": [names], ... }
│   └── submitVote.js          # POST { date, name, slots: [...] } → "ok"
├── scripts/
│   ├── schema.sql             # Canonical schema
│   ├── apply-schema.js        # Idempotent CREATE TABLE runner
│   └── migrate.js             # Imports names.json / results.json / votes.json
├── data/                      # Legacy JSON snapshots (used only by migrate.js)
│   ├── names.json
│   ├── results.json
│   └── votes.json
├── index.html, day.html, history.html, results.html,
├── statistics.html, submit-result.html, app.js, image.png
├── package.json               # depends on @vercel/postgres
├── vercel.json
└── README.md
```

## Database schema

```sql
CREATE TABLE players (
  id     SERIAL PRIMARY KEY,
  name   TEXT NOT NULL UNIQUE
);

CREATE TABLE availability (
  id         SERIAL PRIMARY KEY,
  player_id  INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  date       TEXT    NOT NULL,   -- ISO YYYY-MM-DD (from day.html)
  hour       TEXT    NOT NULL,   -- e.g. "9:00"
  UNIQUE (player_id, date, hour)
);

CREATE TABLE matches (
  id           SERIAL PRIMARY KEY,
  date         TEXT NOT NULL,     -- DD/MM/YYYY (from submit-result.html)
  player1a_id  INTEGER REFERENCES players(id) ON DELETE RESTRICT,
  player1b_id  INTEGER REFERENCES players(id) ON DELETE RESTRICT,
  player2a_id  INTEGER REFERENCES players(id) ON DELETE RESTRICT,
  player2b_id  INTEGER REFERENCES players(id) ON DELETE RESTRICT,
  set1_team1 INTEGER, set1_team2 INTEGER,
  set2_team1 INTEGER, set2_team2 INTEGER,
  set3_team1 INTEGER, set3_team2 INTEGER
);
```

Notes on FK behavior:
- `availability.player_id` cascades on player delete (availability is ephemeral).
- `matches.player*_id` uses `ON DELETE RESTRICT` to protect historical data.
  `deleteName` returns `{ ok: false, error: 'has_matches' }` if the player is
  referenced by any match — the existing frontend already surfaces this as
  "No se pudo eliminar", matching prior behavior semantics.
- All writes are single-row SQL operations. No read-modify-write of large JSON
  objects, eliminating the race conditions the blob approach was prone to.

## One-time setup

### 1. Create the project on Vercel

```bash
npm i -g vercel
vercel link                # create/link the project
```

### 2. Provision Vercel Postgres

In the Vercel dashboard: **Storage → Create Database → Postgres**, then attach
it to this project. Vercel will populate the following env vars automatically:

- `POSTGRES_URL`
- `POSTGRES_URL_NON_POOLING`
- `POSTGRES_USER`, `POSTGRES_HOST`, `POSTGRES_PASSWORD`, `POSTGRES_DATABASE`

Pull them locally:

```bash
vercel env pull .env.local
```

### 3. Install dependencies

```bash
yarn install     # (or npm install)
```

### 4. Apply the schema

```bash
node --env-file=.env.local scripts/apply-schema.js
```

### 5. Import legacy data

Ensure `data/names.json`, `data/results.json`, `data/votes.json` are present
(they are shipped with this project as a snapshot). Then run:

```bash
node --env-file=.env.local scripts/migrate.js
```

The migration:
- inserts every registered name into `players` (idempotent via `ON CONFLICT`);
- inserts every historical match, upserting any referenced player name that
  wasn't in the registered list so foreign keys resolve;
- inserts every past availability entry into `availability`.

Re-running the script is safe: duplicate players/availability rows are
skipped. Matches will be re-inserted if you re-run — clear the `matches`
table first if you need a clean re-import.

## Local development

```bash
vercel dev
```

Serves the static HTML from the project root and mounts the `/api/*` routes
using the same Postgres database configured above.

## Deployment

```bash
vercel deploy --prod
```

## What changed vs. the Netlify version

| Concern              | Before (Netlify)                             | After (Vercel)                              |
|----------------------|----------------------------------------------|---------------------------------------------|
| Hosting              | Netlify static + Netlify Functions           | Vercel static + Vercel Functions            |
| Storage              | Netlify Blobs (JSON blobs)                   | Vercel Postgres (normalized tables)         |
| Concurrency          | Read-modify-write blob → race conditions     | Single-statement SQL, unique constraints    |
| Frontend URLs        | `/.netlify/functions/<name>`                 | `/api/<name>`                               |
| Admin key            | `4F7K9Q2Z` (unchanged, in deleteName.js)     | `4F7K9Q2Z` (unchanged, in api/deleteName.js)|
| WhatsApp sharing     | Preserved                                    | Preserved                                   |
| Organizer flow       | Preserved                                    | Preserved                                   |
| History/edit/delete  | Preserved                                    | Preserved                                   |
| Statistics view      | Preserved                                    | Preserved                                   |

Removed dependency: `@netlify/blobs`.
Added dependency: `@vercel/postgres`.
