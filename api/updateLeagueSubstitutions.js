import { sql } from '@vercel/postgres';
import { ensureSchema, readBody } from './_db.js';

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
    console.error('updateLeagueSubstitutions error', error);
    res.status(400).json({
      ok: false,
      error: error && error.message ? error.message : 'Error al guardar sustituciones'
    });
  }
}
