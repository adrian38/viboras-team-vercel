-- Padel app schema (Vercel Postgres)

CREATE TABLE IF NOT EXISTS players (
  id     SERIAL PRIMARY KEY,
  name   TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS availability (
  id         SERIAL PRIMARY KEY,
  player_id  INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  date       TEXT    NOT NULL,
  hour       TEXT    NOT NULL,
  UNIQUE (player_id, date, hour)
);

CREATE INDEX IF NOT EXISTS availability_date_idx ON availability(date);

CREATE TABLE IF NOT EXISTS leagues (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
  id SERIAL PRIMARY KEY,
  type TEXT NOT NULL CHECK (
    type IN (
      'pozo',
      'doble_ko',
      'grupo_liga',
      'ranked',
      'unranked'
    )
  ),
  name TEXT NOT NULL UNIQUE,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  league_id INTEGER REFERENCES leagues(id) ON DELETE SET NULL
);

-- Ensure a default event with id = 1 exists for migrated/submitted matches
INSERT INTO events (id, type, name, start_date, end_date, league_id)
VALUES (1, 'unranked', 'Default', '2000-01-01', '2099-12-31', NULL)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS matches (
  id           SERIAL PRIMARY KEY,
  date         TEXT NOT NULL,

  format       TEXT NOT NULL CHECK (
    format IN (
      'bo3_regular',
      'bo3_stb',
      'bo1_regular',
      'timed_games'
    )
  ),

  event_id     INTEGER NOT NULL REFERENCES events(id) ON DELETE RESTRICT,

  round        TEXT,

  player1a_id  INTEGER REFERENCES players(id) ON DELETE RESTRICT,
  player1b_id  INTEGER REFERENCES players(id) ON DELETE RESTRICT,
  player2a_id  INTEGER REFERENCES players(id) ON DELETE RESTRICT,
  player2b_id  INTEGER REFERENCES players(id) ON DELETE RESTRICT,
  set1_team1   INTEGER,
  set1_team2   INTEGER,
  set2_team1   INTEGER,
  set2_team2   INTEGER,
  set3_team1   INTEGER,
  set3_team2   INTEGER
);

CREATE INDEX IF NOT EXISTS matches_date_idx ON matches(date);
CREATE INDEX IF NOT EXISTS matches_event_idx ON matches(event_id);
