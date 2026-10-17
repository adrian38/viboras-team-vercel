import { sql } from '@vercel/postgres';
import { ensureSchema, readBody } from './_db.js';
import { exigirSesion } from './_auth.js';
import { asInt, ensureValidDateText, normalizeDateToText, validatePhaseSchedule, buildEventName, normalizeSubstitutionGroupsInput, parseRows, parseCsvRows, parseCompasRows } from './_ligas.js';
const MAX_GROUPS = 20;
const MAX_PHASES = 10;

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

    const leagueInsert = await sql`
      INSERT INTO leagues (name, start_date, end_date, substitution_groups)
      VALUES (${name}, ${startDate}, ${endDate}, ${JSON.stringify(substitutionGroups)})
      RETURNING id
    `;
    const leagueId = leagueInsert.rows[0]?.id;
    if (!leagueId) {
      throw new Error('No se pudo crear la liga');
    }

    const eventInserts = [];
    for (let phaseIndex = 0; phaseIndex < phaseRecords.length; phaseIndex++) {
      const phase = phaseRecords[phaseIndex];
      for (let groupIndex = 0; groupIndex < groupNames.length; groupIndex++) {
        const groupName = groupNames[groupIndex];
        const eventName = buildEventName(name, groupName, phaseIndex + 1);
        eventInserts.push(sql`
          INSERT INTO events (type, name, start_date, end_date, league_id)
          VALUES ('grupo_liga', ${eventName}, ${phase.start_date}, ${phase.end_date}, ${leagueId})
        `);
      }
    }

    await Promise.all(eventInserts);
    res.status(200).json({ ok: true, leagueId, groupCount, phaseCount, eventCount: eventInserts.length });
  } catch (error) {
    console.error('league-admin:createLeague error', error);
    res.status(400).json({
      ok: false,
      error: error && error.message ? error.message : 'Error al crear la liga'
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

    const inserts = [];
    for (let ri = 0; ri < rows.length; ri++) {
      const r = rows[ri];
      const eventName = `${league.name}_${r.group}_Fase${r.phase}`;
      const evQ = await sql`SELECT id, start_date FROM events WHERE league_id = ${leagueId} AND name = ${eventName} LIMIT 1`;
      if (!evQ.rows || evQ.rows.length === 0) {
        res.status(400).json({ ok: false, error: `Línea ${ri + 1}: No existe el grupo ${r.group} y fase ${r.phase} para la liga seleccionada` });
        return;
      }
      const ev = evQ.rows[0];
      const p1id = activeNames.get(r.p1);
      const p2id = activeNames.get(r.p2);
      const p3id = activeNames.get(r.p3);
      const p4id = activeNames.get(r.p4);
      if (!p1id || !p2id || !p3id || !p4id) {
        throw new Error(`No se pudieron resolver ids de jugadores para la fila: ${JSON.stringify(r)}`);
      }

      inserts.push(sql`
        INSERT INTO matches (
          date, format, event_id, round,
          player1a_id, player1b_id, player2a_id, player2b_id,
          set1_team1, set1_team2, set2_team1, set2_team2, set3_team1, set3_team2
        ) VALUES (
          ${ev.start_date}, 'bo3_regular', ${ev.id}, NULL,
          ${p1id}, ${p2id}, ${p3id}, ${p4id},
          0, 0, NULL, NULL, NULL, NULL
        )
      `);
    }

    await Promise.all(inserts);
    res.status(200).json({ ok: true, inserted: inserts.length });
  } catch (err) {
    console.error('league-admin:createLeagueBracket error', err);
    res.status(400).json({ ok: false, error: err && err.message ? err.message : 'Error al crear el cuadro' });
  }
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
    const existingNames = new Set((await sql`SELECT name FROM players WHERE active = TRUE`).rows.map((r) => r.name));

    for (const row of rows) {
      for (const playerName of [row.player1, row.player2, row.player3, row.player4]) {
        if (!existingNames.has(playerName)) {
          res.status(400).json({ ok: false, error: `El nombre "${playerName}" no existe en la tabla players` });
          return;
        }
      }
    }

    const eventInsert = await sql`
      INSERT INTO events (type, name, start_date, end_date)
      VALUES ('pozo', ${name}, ${startDate}, ${endDate})
      RETURNING id
    `;
    const eventId = eventInsert.rows[0]?.id;
    if (!eventId) {
      throw new Error('No se pudo crear el evento');
    }

    const inserts = rows.map(async (row) => {
      const p1aId = (await sql`SELECT id FROM players WHERE name = ${row.player1}`).rows[0]?.id;
      const p1bId = (await sql`SELECT id FROM players WHERE name = ${row.player2}`).rows[0]?.id;
      const p2aId = (await sql`SELECT id FROM players WHERE name = ${row.player3}`).rows[0]?.id;
      const p2bId = (await sql`SELECT id FROM players WHERE name = ${row.player4}`).rows[0]?.id;

      if (!p1aId || !p1bId || !p2aId || !p2bId) {
        throw new Error(`No se pudieron resolver los ids de los jugadores en la fila: ${JSON.stringify(row)}`);
      }

      return sql`
        INSERT INTO matches (
          date,
          format,
          event_id,
          round,
          player1a_id,
          player1b_id,
          player2a_id,
          player2b_id,
          set1_team1,
          set1_team2,
          set2_team1,
          set2_team2,
          set3_team1,
          set3_team2
        ) VALUES (
          ${startDate},
          'timed_games',
          ${eventId},
          NULL,
          ${p1aId},
          ${p1bId},
          ${p2aId},
          ${p2bId},
          ${row.result1},
          ${row.result2},
          ${row.winnerForSet2 === 1 ? 1 : null},
          ${row.winnerForSet2 === 2 ? 1 : null},
          NULL,
          NULL
        )
      `;
    });

    await Promise.all(inserts);
    res.status(200).json({ ok: true, eventId });
  } catch (err) {
    console.error('league-admin:createPozoTournament error', err);
    res.status(400).json({
      ok: false,
      error: err && err.message ? err.message : 'Error al crear el torneo'
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
    const existingNames = new Set((await sql`SELECT name FROM players WHERE active = TRUE`).rows.map((r) => r.name));

    for (const row of rows) {
      for (const playerName of [row.player1, row.player2, row.player3, row.player4]) {
        if (!existingNames.has(playerName)) { res.status(400).json({ ok: false, error: `El nombre "${playerName}" no existe en la tabla players` }); return; }
      }
    }

    const eventInsert = await sql`
      INSERT INTO events (type, name, start_date, end_date)
      VALUES ('compas', ${name}, ${startDate}, ${endDate})
      RETURNING id
    `;
    const eventId = eventInsert.rows[0]?.id;
    if (!eventId) { throw new Error('No se pudo crear el evento'); }

    const inserts = rows.map(async (row) => {
      const p1aId = (await sql`SELECT id FROM players WHERE name = ${row.player1}`).rows[0]?.id;
      const p1bId = (await sql`SELECT id FROM players WHERE name = ${row.player2}`).rows[0]?.id;
      const p2aId = (await sql`SELECT id FROM players WHERE name = ${row.player3}`).rows[0]?.id;
      const p2bId = (await sql`SELECT id FROM players WHERE name = ${row.player4}`).rows[0]?.id;

      if (!p1aId || !p1bId || !p2aId || !p2bId) {
        throw new Error(`No se pudieron resolver los ids de los jugadores en la fila: ${JSON.stringify(row)}`);
      }

      const roundText = `${row.ronda}-${row.bracket}`;

      return sql`
        INSERT INTO matches (
          date,
          format,
          event_id,
          round,
          player1a_id,
          player1b_id,
          player2a_id,
          player2b_id,
          set1_team1,
          set1_team2,
          set2_team1,
          set2_team2,
          set3_team1,
          set3_team2
        ) VALUES (
          ${startDate},
          'timed_games',
          ${eventId},
          ${roundText},
          ${p1aId},
          ${p1bId},
          ${p2aId},
          ${p2bId},
          ${row.g1},
          ${row.g2},
          NULL,
          NULL,
          NULL,
          NULL
        )
      `;
    });

    await Promise.all(inserts);
    res.status(200).json({ ok: true, eventId });
  } catch (err) {
    console.error('league-admin:createCompasTournament error', err);
    res.status(400).json({ ok: false, error: err && err.message ? err.message : 'Error al crear el torneo' });
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
