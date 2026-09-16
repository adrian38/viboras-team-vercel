import { sql } from '@vercel/postgres';
import { ensureSchema, readBody } from './_db.js';

const MAX_GROUPS = 20;
const MAX_PHASES = 10;

function asInt(value, fallback) {
  const num = Number.parseInt(String(value ?? '').trim(), 10);
  if (!Number.isFinite(num)) return fallback;
  return num;
}

function ensureValidDateText(value, fieldName) {
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

function normalizeDateToText(value) {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
    const [year, month, day] = String(value).split('-');
    return `${day}/${month}/${year}`;
  }
  return String(value).trim();
}

function validatePhaseSchedule(leagueStartDate, leagueEndDate, phaseList) {
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

function buildEventName(leagueName, groupName, phaseIndex) {
  const cleanLeague = String(leagueName || '').trim();
  const cleanGroup = String(groupName || '').trim();
  return `${cleanLeague}_${cleanGroup}_Fase${phaseIndex}`;
}

function normalizeSubstitutionGroupsInput(value) {
  const source = Array.isArray(value) ? value : [];
  const groups = source
    .map((group) => {
      if (!Array.isArray(group)) return [];
      return group
        .map((player) => String(player ?? '').trim())
        .filter(Boolean);
    })
    .filter((group) => group.length > 0);

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

export default async function handler(req, res) {
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
    console.error('createLeague error', error);
    res.status(400).json({
      ok: false,
      error: error && error.message ? error.message : 'Error al crear la liga'
    });
  }
}
