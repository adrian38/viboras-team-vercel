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

CREATE TABLE IF NOT EXISTS matches (
  id           SERIAL PRIMARY KEY,
  date         TEXT NOT NULL,
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
