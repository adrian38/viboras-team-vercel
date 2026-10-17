// Auxiliares de api/league-admin.js: fechas de liga y fases, nombres de
// evento y lectura de los CSV de cuadros y torneos. Salieron de alli el
// 2026-10-17 sin cambiar nada, porque league-admin.js estaba en el techo de
// 600 lineas y hacia falta sitio para exigir rol de administrador.
// Detalle: ai_context/cuentas_y_sesiones.md

export function asInt(value, fallback) {
  const num = Number.parseInt(String(value ?? '').trim(), 10);
  if (!Number.isFinite(num)) return fallback;
  return num;
}

export function ensureValidDateText(value, fieldName) {
  const text = String(value ?? '').trim();
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(text)) {
    throw new Error(`La fecha de ${fieldName} debe tener formato dd/mm/yyyy`);
  }
  return text;
}

function parseDateText(value) {
  const text = String(value ?? '').trim();
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(text)) return null;
  const [day, month, year] = text.split('/');
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
}

function addDays(date, amount) {
  const output = new Date(date);
  output.setUTCDate(output.getUTCDate() + amount);
  return output;
}

export function normalizeDateToText(value) {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
    const [year, month, day] = String(value).split('-');
    return `${day}/${month}/${year}`;
  }
  return String(value).trim();
}

export function validatePhaseSchedule(leagueStartDate, leagueEndDate, phaseList) {
  const leagueStart = parseDateText(leagueStartDate);
  const leagueEnd = parseDateText(leagueEndDate);
  if (!leagueStart || !leagueEnd) {
    throw new Error('Las fechas de la liga deben tener formato dd/mm/yyyy');
  }
  if (leagueStart > leagueEnd) {
    throw new Error('La fecha de inicio de la liga no puede ser posterior a la de fin');
  }
  if (!Array.isArray(phaseList) || phaseList.length === 0) {
    throw new Error('La liga debe tener al menos una fase');
  }

  const firstPhase = phaseList[0];
  const lastPhase = phaseList[phaseList.length - 1];
  if (!firstPhase || !lastPhase) {
    throw new Error('La liga debe tener fases válidas');
  }

  const firstStart = parseDateText(firstPhase.start_date);
  const lastEnd = parseDateText(lastPhase.end_date);
  if (!firstStart || !lastEnd) {
    throw new Error('Las fases deben tener fechas válidas en formato dd/mm/yyyy');
  }

  if (firstStart.getTime() !== leagueStart.getTime()) {
    throw new Error('La primera fase debe empezar el mismo día que la liga');
  }
  if (lastEnd.getTime() !== leagueEnd.getTime()) {
    throw new Error('La última fase debe acabar el mismo día que la liga');
  }

  for (let i = 0; i < phaseList.length; i++) {
    const phase = phaseList[i];
    const phaseStart = parseDateText(phase?.start_date);
    const phaseEnd = parseDateText(phase?.end_date);
    if (!phaseStart || !phaseEnd) {
      throw new Error(`La fase ${i + 1} tiene fechas inválidas`);
    }
    if (phaseStart > phaseEnd) {
      throw new Error(`La fecha de inicio de la fase ${i + 1} no puede ser posterior a la de fin`);
    }
    if (i === 0 && phaseStart.getTime() !== leagueStart.getTime()) {
      throw new Error('La primera fase debe empezar el mismo día que la liga');
    }
    if (i > 0) {
      const previousPhase = phaseList[i - 1];
      const previousEnd = parseDateText(previousPhase?.end_date);
      if (!previousEnd) {
        throw new Error(`La fase ${i} tiene una fecha de fin inválida`);
      }
      const expectedStart = addDays(previousEnd, 1);
      if (phaseStart.getTime() !== expectedStart.getTime()) {
        throw new Error('Las fases deben ser consecutivas, sin dejar días en blanco ni solaparse');
      }
    }
  }
}

export function buildEventName(leagueName, groupName, phaseIndex) {
  const cleanLeague = String(leagueName || '').trim();
  const cleanGroup = String(groupName || '').trim();
  return `${cleanLeague}_${cleanGroup}_Fase${phaseIndex}`;
}

export function normalizeSubstitutionGroupsInput(value) {
  const source = Array.isArray(value) ? value : [];
  const groups = source.map((group) => {
    if (!Array.isArray(group)) return [];
    return group.map((player) => String(player ?? '').trim()).filter(Boolean);
  }).filter((group) => group.length > 0);

  const seen = new Set();
  const sanitized = [];
  for (const group of groups) {
    const uniqueNames = [];
    for (const player of group) {
      if (seen.has(player)) {
        throw new Error(`El jugador "${player}" no puede pertenecer a más de un grupo de sustitución`);
      }
      seen.add(player);
      uniqueNames.push(player);
    }
    sanitized.push(uniqueNames);
  }
  return sanitized;
}

function normalizeCsvText(text) {
  return String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

export function parseRows(csvText) {
  const normalized = normalizeCsvText(csvText).trim();
  if (!normalized) throw new Error('El CSV está vacío');
  const lines = normalized.split('\n').filter((line) => line.trim() !== '');
  if (lines.length === 0) throw new Error('El CSV está vacío');

  const rows = [];
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].trim();
    const cells = raw.split(';').map((cell) => cell.trim());
    if (cells.length !== 6) {
      throw new Error(`Línea ${i + 1}: formato inválido. Debe tener 6 columnas: nombre_grupo;numero_fase;jugador1;jugador2;jugador3;jugador4`);
    }
    const [group, phaseRaw, p1, p2, p3, p4] = cells;
    if (!group) throw new Error(`Línea ${i + 1}: falta nombre de grupo`);
    if (!phaseRaw || !/^\d+$/.test(phaseRaw)) throw new Error(`Línea ${i + 1}: número de fase inválido`);
    const phase = parseInt(phaseRaw, 10);
    if (!p1) throw new Error(`Línea ${i + 1}: falta jugador 1`);
    if (!p2) throw new Error(`Línea ${i + 1}: falta jugador 2`);
    if (!p3) throw new Error(`Línea ${i + 1}: falta jugador 3`);
    if (!p4) throw new Error(`Línea ${i + 1}: falta jugador 4`);
    rows.push({ group, phase, p1, p2, p3, p4 });
  }
  return rows;
}

export function parseCsvRows(csvText) {
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

    if (!/^\d+\+?$/.test(result1Raw) || !/^\d+\+?$/.test(result2Raw)) {
      throw new Error(`Línea ${i + 1}: los resultados deben ser números enteros, opcionalmente con '+' para indicar ganador en caso de empate`);
    }

    const hasPlus1 = result1Raw.endsWith('+');
    const hasPlus2 = result2Raw.endsWith('+');
    const result1 = parseInt(result1Raw.replace('+', ''), 10);
    const result2 = parseInt(result2Raw.replace('+', ''), 10);

    if (result1 === result2) {
      if (hasPlus1 === hasPlus2) {
        throw new Error(`Línea ${i + 1}: empate a juegos pero no se ha indicado claramente el ganador con '+'`);
      }
    }

    let winnerForSet2 = null;
    if (result1 === result2) {
      winnerForSet2 = hasPlus1 ? 1 : 2;
    }

    rows.push({ player1, player2, player3, player4, result1, result2, winnerForSet2 });
  }
  return rows;
}

export function parseCompasRows(csvText) {
  const normalized = normalizeCsvText(csvText).trim();
  if (!normalized) throw new Error('El CSV está vacío');

  const lines = normalized.split('\n').filter((line) => line.trim() !== '');
  if (lines.length === 0) throw new Error('El CSV está vacío');

  const allowedBrackets = new Set(['E','W','N','S','NE','SE','NW','SW']);

  const rows = [];
  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i].trim();
    const cells = rawLine.split(';').map((cell) => cell.trim());
    if (cells.length !== 8) {
      throw new Error(`Línea ${i + 1}: formato inválido. Debe tener 8 columnas: ronda;bracket;jugador1;jugador2;jugador3;jugador4;juegos_pareja1;juegos_pareja2`);
    }

    const [rondaRaw, bracketRaw, player1, player2, player3, player4, g1Raw, g2Raw] = cells;
    if (!rondaRaw || !/^\d+$/.test(rondaRaw)) throw new Error(`Línea ${i + 1}: ronda inválida`);
    const ronda = parseInt(rondaRaw, 10);

    const bracket = String(bracketRaw || '').toUpperCase();
    if (!allowedBrackets.has(bracket)) throw new Error(`Línea ${i + 1}: bracket inválido ('${bracketRaw}')`);

    if (!player1 || !player2 || !player3 || !player4) throw new Error(`Línea ${i + 1}: faltan nombres de jugadores`);

    if (!/^\d+$/.test(g1Raw) || !/^\d+$/.test(g2Raw)) throw new Error(`Línea ${i + 1}: los juegos deben ser números enteros`);
    const g1 = parseInt(g1Raw, 10);
    const g2 = parseInt(g2Raw, 10);

    rows.push({ ronda, bracket, player1, player2, player3, player4, g1, g2 });
  }
  return rows;
}
