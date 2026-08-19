import { sql } from '@vercel/postgres';
import { ensureSchema, getPlayerId, readBody } from './_db.js';

function normalizeCsvText(text) {
  return String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function parseCsvRows(csvText) {
  const normalized = normalizeCsvText(csvText).trim();
  if (!normalized) throw new Error('El CSV está vacío');

  const lines = normalized.split('\n').filter((line) => line.trim() !== '');
  if (lines.length === 0) throw new Error('El CSV está vacío');

  const rows = [];
  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i].trim();
    const cells = rawLine.split(';').map((cell) => cell.trim());

    if (cells.length !== 6) {
      throw new Error(`Línea ${i + 1}: formato inválido. Debe tener 6 columnas: jugador1;jugador2;jugador3;jugador4;resultado_pareja1;resultado_pareja2`);
    }

    const [player1, player2, player3, player4, result1Raw, result2Raw] = cells;
    if (!player1 || !player2 || !player3 || !player4) {
      throw new Error(`Línea ${i + 1}: faltan nombres de jugadores`);
    }

    // aceptar un '+' al final para indicar ganador en caso de empate
    if (!/^\d+\+?$/.test(result1Raw) || !/^\d+\+?$/.test(result2Raw)) {
      throw new Error(`Línea ${i + 1}: los resultados deben ser números enteros, opcionalmente con '+' para indicar ganador en caso de empate`);
    }

    const hasPlus1 = result1Raw.endsWith('+');
    const hasPlus2 = result2Raw.endsWith('+');
    const result1 = parseInt(result1Raw.replace('+', ''), 10);
    const result2 = parseInt(result2Raw.replace('+', ''), 10);

    // Si hay empate a juegos en set1, es obligatorio marcar el ganador con '+' en una de las columnas
    if (result1 === result2) {
      if (hasPlus1 === hasPlus2) {
        // ambos true o ambos false -> inválido
        throw new Error(`Línea ${i + 1}: empate a juegos pero no se ha indicado claramente el ganador con '+'`);
      }
    }

    // winnerForSet2: 1 para pareja1, 2 para pareja2, null si no aplica
    let winnerForSet2 = null;
    if (result1 === result2) {
      winnerForSet2 = hasPlus1 ? 1 : 2;
    }

    rows.push({
      player1,
      player2,
      player3,
      player4,
      result1,
      result2,
      winnerForSet2
    });
  }

  return rows;
}

export default async function handler(req, res) {
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

    const existingNames = new Set(
      (await sql`SELECT name FROM players WHERE active = TRUE`).rows.map((r) => r.name)
    );

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
      const p1aId = await getPlayerId(row.player1);
      const p1bId = await getPlayerId(row.player2);
      const p2aId = await getPlayerId(row.player3);
      const p2bId = await getPlayerId(row.player4);

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
    console.error('createPozoTournament error', err);
    res.status(400).json({
      ok: false,
      error: err && err.message ? err.message : 'Error al crear el torneo'
    });
  }
}
