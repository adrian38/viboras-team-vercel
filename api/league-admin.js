import { sql } from '@vercel/postgres';
import { ensureSchema, readBody } from './_db.js';
import { exigirSesion } from './_auth.js';
import { asInt, ensureValidDateText, normalizeDateToText, validatePhaseSchedule, buildEventName, normalizeSubstitutionGroupsInput, parseRows, parseCsvRows, parseCompasRows } from './_ligas.js';
const MAX_GROUPS = 20;
const MAX_PHASES = 10;

// Lo que ve el administrador cuando algo falla. Un nombre repetido sale de
// la base como "duplicate key value violates unique constraint".
function motivo(err, porDefecto) {
  if (err && err.code === '23505') return 'Ya hay un torneo o un grupo de liga con ese nombre.';
  return err && err.message ? err.message : porDefecto;
}

async function createLeague(req, res) {
  try {
    await ensureSchema();
    const data = await readBody(req);
    const name = String(data?.name || '').trim();
    const startDate = ensureValidDateText(normalizeDateToText(data?.start_date), 'inicio');
    const endDate = ensureValidDateText(normalizeDateToText(data?.end_date), 'fin');
    const groupCount = asInt(data?.group_count, 0);
    const phaseCount = asInt(data?.phase_count, 0);
    const groupNames = Array.isArray(data?.group_names) ? data.group_names : [];
    const phases = Array.isArray(data?.phases) ? data.phases : [];
    const substitutionGroups = normalizeSubstitutionGroupsInput(data?.substitution_groups);

    if (!name) {
      res.status(400).json({ ok: false, error: 'Falta el nombre de la liga' });
      return;
    }
    if (groupCount < 1 || groupCount > MAX_GROUPS) {
      res.status(400).json({ ok: false, error: `La cantidad de grupos debe estar entre 1 y ${MAX_GROUPS}` });
      return;
    }
    if (phaseCount < 1 || phaseCount > MAX_PHASES) {
      res.status(400).json({ ok: false, error: `La cantidad de fases debe estar entre 1 y ${MAX_PHASES}` });
      return;
    }
    if (groupNames.length !== groupCount) {
      res.status(400).json({ ok: false, error: 'El número de nombres de grupo no coincide con la cantidad indicada' });
      return;
    }
    if (phases.length !== phaseCount) {
      res.status(400).json({ ok: false, error: 'El número de fases no coincide con la cantidad indicada' });
      return;
    }

    const uniqueGroupNames = new Set();
    for (let i = 0; i < groupNames.length; i++) {
      const value = String(groupNames[i] ?? '').trim();
      if (!value) {
        res.status(400).json({ ok: false, error: `Falta el nombre del grupo ${i + 1}` });
        return;
      }
      if (uniqueGroupNames.has(value)) {
        res.status(400).json({ ok: false, error: 'Los nombres de los grupos deben ser únicos' });
        return;
      }
      uniqueGroupNames.add(value);
    }

    const phaseRecords = [];
    for (let i = 0; i < phases.length; i++) {
      const phase = phases[i];
      const phaseStart = ensureValidDateText(normalizeDateToText(phase?.start_date), `inicio de la fase ${i + 1}`);
      const phaseEnd = ensureValidDateText(normalizeDateToText(phase?.end_date), `fin de la fase ${i + 1}`);
      phaseRecords.push({ start_date: phaseStart, end_date: phaseEnd });
    }

    validatePhaseSchedule(startDate, endDate, phaseRecords);

    // Un evento por grupo y fase. La liga y sus eventos van en UNA sentencia:
    // un nombre repetido ya no deja la liga creada a medias (2026-10-17).
    const eventos = phaseRecords.flatMap((phase, i) => groupNames.map((g) => ({ ...phase, name: buildEventName(name, g, i + 1) })));
    const { rows } = await sql`
      WITH liga AS (
        INSERT INTO leagues (name, start_date, end_date, substitution_groups)
        VALUES (${name}, ${startDate}, ${endDate}, ${JSON.stringify(substitutionGroups)})
        RETURNING id
      ), ev AS (
        INSERT INTO events (type, name, start_date, end_date, league_id)
        SELECT 'grupo_liga', x.name, x.start_date, x.end_date, liga.id
        FROM liga, unnest(${eventos.map((e) => e.name)}::text[], ${eventos.map((e) => e.start_date)}::text[],
          ${eventos.map((e) => e.end_date)}::text[]) AS x(name, start_date, end_date)
        RETURNING id
      )
      SELECT (SELECT id FROM liga) AS id, (SELECT count(*) FROM ev)::int AS eventos`;
    res.status(200).json({ ok: true, leagueId: rows[0].id, groupCount, phaseCount, eventCount: rows[0].eventos });
  } catch (error) {
    console.error('league-admin:createLeague error', error);
    res.status(400).json({
      ok: false,
      error: motivo(error, 'Error al crear la liga')
    });
  }
}

async function createLeagueBracket(req, res) {
  try {
    await ensureSchema();
    const data = await readBody(req);
    const leagueId = data && data.league_id ? Number(data.league_id) : null;
    const csvText = String(data?.csv || '');
    if (!leagueId) { res.status(400).json({ ok: false, error: 'Falta league_id' }); return; }
    const rows = parseRows(csvText);

    const leagueQ = await sql`SELECT id, name FROM leagues WHERE id = ${leagueId}`;
    if (!leagueQ.rows || leagueQ.rows.length === 0) { res.status(400).json({ ok: false, error: 'Liga no encontrada' }); return; }
    const league = leagueQ.rows[0];

    const playersQ = await sql`SELECT id, name FROM players WHERE active = TRUE`;
    const activeNames = new Map(playersQ.rows.map((r) => [r.name, r.id]));

    for (let ri = 0; ri < rows.length; ri++) {
      const r = rows[ri];
      for (const name of [r.p1, r.p2, r.p3, r.p4]) {
        if (!activeNames.has(name)) {
          res.status(400).json({ ok: false, error: `Línea ${ri + 1}: No existe el jugador con nombre "${name}" o no está activo` });
          return;
        }
      }
    }

    const partidos = [];
    for (let ri = 0; ri < rows.length; ri++) {
      const r = rows[ri];
      const eventName = `${league.name}_${r.group}_Fase${r.phase}`;
      const evQ = await sql`SELECT id, start_date FROM events WHERE league_id = ${leagueId} AND name = ${eventName} LIMIT 1`;
      if (!evQ.rows || evQ.rows.length === 0) {
        res.status(400).json({ ok: false, error: `Línea ${ri + 1}: No existe el grupo ${r.group} y fase ${r.phase} para la liga seleccionada` });
        return;
      }
      const ev = evQ.rows[0];
      partidos.push({ date: ev.start_date, ev: ev.id, ids: [r.p1, r.p2, r.p3, r.p4].map((n) => activeNames.get(n)) });
    }

    // Todo el cuadro en UNA sentencia: o entran todos los partidos o ninguno.
    // Sin jugar llevan 0-0, que el rating ignora.
    const col = (f) => partidos.map(f);
    await sql`
      INSERT INTO matches (date, format, event_id, round, player1a_id, player1b_id, player2a_id, player2b_id, set1_team1, set1_team2)
      SELECT x.date, 'bo3_regular', x.ev, NULL, x.a, x.b, x.c, x.d, 0, 0
      FROM unnest(${col((p) => p.date)}::text[], ${col((p) => p.ev)}::int[], ${col((p) => p.ids[0])}::int[],
        ${col((p) => p.ids[1])}::int[], ${col((p) => p.ids[2])}::int[], ${col((p) => p.ids[3])}::int[]) AS x(date, ev, a, b, c, d)`;
    res.status(200).json({ ok: true, inserted: partidos.length });
  } catch (err) {
    console.error('league-admin:createLeagueBracket error', err);
    res.status(400).json({ ok: false, error: motivo(err, 'Error al crear el cuadro') });
  }
}

async function idsDeActivos() {
  const { rows } = await sql`SELECT id, name FROM players WHERE active = TRUE`;
  return new Map(rows.map((r) => [r.name, r.id]));
}

// El torneo y todos sus partidos en UNA sentencia: o entra todo o nada.
// Con el driver HTTP de Neon cada `sql` va suelto, y hasta el 2026-10-17 un
// fallo a mitad dejaba el evento creado con parte de sus partidos.
async function crearTorneo(t, partidos) {
  const col = (f) => partidos.map(f);
  const { rows } = await sql`
    WITH ev AS (
      INSERT INTO events (type, name, start_date, end_date)
      VALUES (${t.type}, ${t.name}, ${t.startDate}, ${t.endDate})
      RETURNING id
    ), m AS (
      INSERT INTO matches (date, format, event_id, round, player1a_id, player1b_id, player2a_id, player2b_id,
        set1_team1, set1_team2, set2_team1, set2_team2)
      SELECT ${t.startDate}, 'timed_games', ev.id, x.round, x.a, x.b, x.c, x.d, x.s11, x.s21, x.s12, x.s22
      FROM ev, unnest(${col((p) => p.round)}::text[], ${col((p) => p.ids[0])}::int[], ${col((p) => p.ids[1])}::int[],
        ${col((p) => p.ids[2])}::int[], ${col((p) => p.ids[3])}::int[], ${col((p) => p.s11)}::int[],
        ${col((p) => p.s21)}::int[], ${col((p) => p.s12)}::int[], ${col((p) => p.s22)}::int[])
        AS x(round, a, b, c, d, s11, s21, s12, s22)
    )
    SELECT id FROM ev`;
  return rows[0].id;
}

async function createPozoTournament(req, res) {
  try {
    await ensureSchema();
    const data = await readBody(req);
    const name = String(data?.name || '').trim();
    const startDate = String(data?.start_date || '').trim();
    const endDate = String(data?.end_date || '').trim();
    const csvText = String(data?.csv || '');

    if (!name) {
      res.status(400).json({ ok: false, error: 'Falta el nombre del torneo' });
      return;
    }
    if (!startDate || !endDate) {
      res.status(400).json({ ok: false, error: 'Faltan las fechas del torneo' });
      return;
    }

    const rows = parseCsvRows(csvText);
    const ids = await idsDeActivos();

    for (const row of rows) {
      for (const playerName of [row.player1, row.player2, row.player3, row.player4]) {
        if (!ids.has(playerName)) {
          res.status(400).json({ ok: false, error: `El nombre "${playerName}" no existe en la tabla players` });
          return;
        }
      }
    }

    // El empate a juegos se decide con un "set 2" de 1-0 para quien lleva el '+'.
    const eventId = await crearTorneo({ type: 'pozo', name, startDate, endDate }, rows.map((row) => ({
      round: null, ids: [row.player1, row.player2, row.player3, row.player4].map((n) => ids.get(n)),
      s11: row.result1, s21: row.result2,
      s12: row.winnerForSet2 === 1 ? 1 : null, s22: row.winnerForSet2 === 2 ? 1 : null
    })));
    res.status(200).json({ ok: true, eventId });
  } catch (err) {
    console.error('league-admin:createPozoTournament error', err);
    res.status(400).json({
      ok: false,
      error: motivo(err, 'Error al crear el torneo')
    });
  }
}

async function createCompasTournament(req, res) {
  try {
    await ensureSchema();
    const data = await readBody(req);
    const name = String(data?.name || '').trim();
    const startDate = String(data?.start_date || '').trim();
    const endDate = String(data?.end_date || '').trim();
    const csvText = String(data?.csv || '');

    if (!name) { res.status(400).json({ ok: false, error: 'Falta el nombre del torneo' }); return; }
    if (!startDate || !endDate) { res.status(400).json({ ok: false, error: 'Faltan las fechas del torneo' }); return; }

    const rows = parseCompasRows(csvText);
    const ids = await idsDeActivos();

    for (const row of rows) {
      for (const playerName of [row.player1, row.player2, row.player3, row.player4]) {
        if (!ids.has(playerName)) { res.status(400).json({ ok: false, error: `El nombre "${playerName}" no existe en la tabla players` }); return; }
      }
    }

    const eventId = await crearTorneo({ type: 'compas', name, startDate, endDate }, rows.map((row) => ({
      round: `${row.ronda}-${row.bracket}`, ids: [row.player1, row.player2, row.player3, row.player4].map((n) => ids.get(n)),
      s11: row.g1, s21: row.g2, s12: null, s22: null
    })));
    res.status(200).json({ ok: true, eventId });
  } catch (err) {
    console.error('league-admin:createCompasTournament error', err);
    res.status(400).json({ ok: false, error: motivo(err, 'Error al crear el torneo') });
  }
}

async function updateLeagueSubstitutions(req, res) {
  try {
    await ensureSchema();
    const data = await readBody(req);
    const leagueId = Number(data?.league_id);
    const groups = normalizeSubstitutionGroupsInput(data?.substitution_groups);

    if (!Number.isFinite(leagueId) || leagueId <= 0) {
      res.status(400).json({ ok: false, error: 'Falta la liga' });
      return;
    }

    await sql`
      UPDATE leagues
      SET substitution_groups = ${JSON.stringify(groups)}
      WHERE id = ${leagueId}
    `;

    res.status(200).json({ ok: true, leagueId, substitution_groups: groups });
  } catch (error) {
    console.error('league-admin:updateLeagueSubstitutions error', error);
    res.status(400).json({
      ok: false,
      error: error && error.message ? error.message : 'Error al guardar sustituciones'
    });
  }
}

export default async function handler(req, res) {
  const user = await exigirSesion(req, res);
  if (!user) return;
  // Ligas y torneos los crean solo los administradores (2026-10-17). El panel
  // de la portada ya se escondia a los demas, pero eso no cerraba nada.
  if (user.role !== 'admin') {
    res.status(403).json({ ok: false, error: 'forbidden' });
    return;
  }
  const action = String(req.query?.action || req.body?.action || '').trim();
  switch (action) {
    case 'createLeague':
      return createLeague(req, res);
    case 'createLeagueBracket':
      return createLeagueBracket(req, res);
    case 'createPozoTournament':
      return createPozoTournament(req, res);
    case 'createCompasTournament':
      return createCompasTournament(req, res);
    case 'updateLeagueSubstitutions':
      return updateLeagueSubstitutions(req, res);
    default:
      res.status(404).json({ ok: false, error: 'unknown_action' });
      return;
  }
}
