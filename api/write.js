import { sql } from '@vercel/postgres';
import { ensureSchema, getOrCreatePlayerId, getPlayerId, readBody, toInt } from './_db.js';
import { validateBo3Score } from './_score.js';
import { exigirSesion } from './_auth.js';
import { validarInscripcion, telefonoLibre } from './_inscripcion.js';
import { avisarEdicion } from './_avisos.js';

async function submitName(req, res) {
  try {
    await ensureSchema();
    const data = await readBody(req);
    const name = data && data.name ? String(data.name).trim() : '';
    if (!name) {
      res.status(200).json({ ok: false, error: 'empty' });
      return;
    }
    const existing = await sql`SELECT id, active FROM players WHERE name = ${name}`;
    let added = false;
    if (existing.rows.length === 0) {
      const result = await sql`INSERT INTO players (name, active) VALUES (${name}, TRUE) RETURNING id`;
      added = result.rowCount > 0;
    } else if (existing.rows[0].active === false) {
      await sql`UPDATE players SET active = TRUE WHERE name = ${name}`;
      added = true;
    }
    res.status(200).json({ ok: true, added });
  } catch (err) {
    console.error('write:submitName error', err);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
}

// `_original` llega cuando se esta editando un partido que ya existe: la fila
// se busca por la fecha y los cuatro jugadores de antes. El `event_id` entra en
// la condicion solo si venia en la peticion; sin el, la fila se actualiza
// pertenezca al evento que pertenezca.
//
// Desde el 2026-10-17 solo editan los cuatro jugadores del partido (los de
// antes de la edicion) y los administradores; a los demas jugadores del
// partido les llega un aviso con el nombre de quien edito (_avisos.js).
// Devuelve 'forbidden', el id de la fila editada o null si no la encontro
// (y entonces submitResult responde 409, no inserta).
async function updateExistingMatch(original, m, user) {
  const o_p1a = await getPlayerId(original.p1a);
  const o_p1b = await getPlayerId(original.p1b);
  const o_p2a = await getPlayerId(original.p2a);
  const o_p2b = await getPlayerId(original.p2b);
  const o_date = String(original.date || '').trim();
  const o_event = original.event_id ? toInt(original.event_id) : null;
  const jugadores = [o_p1a, o_p1b, o_p2a, o_p2b, m.p1a_id, m.p1b_id, m.p2a_id, m.p2b_id];
  if (user.role !== 'admin' && !(user.player_id && jugadores.slice(0, 4).includes(user.player_id))) return 'forbidden';

  if (o_event !== null) {
    const conEvento = await sql`
      UPDATE matches SET
        date = ${m.date},
        format = ${m.format},
        player1a_id = ${m.p1a_id}, player1b_id = ${m.p1b_id},
        player2a_id = ${m.p2a_id}, player2b_id = ${m.p2b_id},
        set1_team1 = ${m.s11}, set1_team2 = ${m.s21},
        set2_team1 = ${m.s12}, set2_team2 = ${m.s22},
        set3_team1 = ${m.s13}, set3_team2 = ${m.s23}
      WHERE date = ${o_date}
        AND player1a_id IS NOT DISTINCT FROM ${o_p1a}
        AND player1b_id IS NOT DISTINCT FROM ${o_p1b}
        AND player2a_id IS NOT DISTINCT FROM ${o_p2a}
        AND player2b_id IS NOT DISTINCT FROM ${o_p2b}
        AND event_id IS NOT DISTINCT FROM ${o_event}
      RETURNING id`;
    return editado(conEvento, user, jugadores, m.date);
  }

  const upd = await sql`
    UPDATE matches SET
      date = ${m.date},
      format = ${m.format},
      player1a_id = ${m.p1a_id}, player1b_id = ${m.p1b_id},
      player2a_id = ${m.p2a_id}, player2b_id = ${m.p2b_id},
      set1_team1 = ${m.s11}, set1_team2 = ${m.s21},
      set2_team1 = ${m.s12}, set2_team2 = ${m.s22},
      set3_team1 = ${m.s13}, set3_team2 = ${m.s23}
    WHERE date = ${o_date}
      AND player1a_id IS NOT DISTINCT FROM ${o_p1a}
      AND player1b_id IS NOT DISTINCT FROM ${o_p1b}
      AND player2a_id IS NOT DISTINCT FROM ${o_p2a}
      AND player2b_id IS NOT DISTINCT FROM ${o_p2b}
    RETURNING id`;
  return editado(upd, user, jugadores, m.date);
}

async function editado(resultado, user, jugadores, fecha) {
  if (!resultado.rowCount) return null;
  await avisarEdicion(user, jugadores, fecha);
  return resultado.rows[0].id;
}

// El partido nuevo entra siempre en el evento 1, el de los partidos sueltos;
// los de liga y torneo los crea `league-admin`.
async function insertMatch(m) {
  await sql`
    INSERT INTO matches (
      date, player1a_id, player1b_id, player2a_id, player2b_id,
      set1_team1, set1_team2, set2_team1, set2_team2, set3_team1, set3_team2,
      format, event_id, round
    ) VALUES (
      ${m.date}, ${m.p1a_id}, ${m.p1b_id}, ${m.p2a_id}, ${m.p2b_id},
      ${m.s11}, ${m.s21}, ${m.s12}, ${m.s22}, ${m.s13}, ${m.s23},
      ${m.format}, 1, NULL
    )`;
}

async function submitResult(req, res, user) {
  try {
    await ensureSchema();
    const data = await readBody(req);
    if (!data || typeof data !== 'object') {
      res.status(400).json({ ok: false, error: 'Invalid request' });
      return;
    }

    // Antes de tocar la base, y antes de crear jugadores: un partido a medias
    // no se guarda ni se arregla en silencio, se devuelve el motivo.
    const scoreError = validateBo3Score(data);
    if (scoreError) {
      res.status(400).json({ ok: false, error: 'invalid_score', message: scoreError });
      return;
    }

    const m = {
      date: String(data.date || '').trim(),
      format: (String(data.format || '').trim() === 'bo3_stb') ? 'bo3_stb' : 'bo3_regular',
      p1a_id: await getOrCreatePlayerId(data.p1a),
      p1b_id: await getOrCreatePlayerId(data.p1b),
      p2a_id: await getOrCreatePlayerId(data.p2a),
      p2b_id: await getOrCreatePlayerId(data.p2b),
      s11: toInt(data.s11), s21: toInt(data.s21),
      s12: toInt(data.s12), s22: toInt(data.s22),
      s13: toInt(data.s13), s23: toInt(data.s23)
    };

    const original = data._original;
    const editada = (original && typeof original === 'object') ? await updateExistingMatch(original, m, user) : null;
    if (editada === 'forbidden') {
      res.status(403).json({ ok: false, error: 'forbidden', message: 'Solo pueden editar este partido sus jugadores y los administradores.' });
      return;
    }
    if (editada) {
      res.status(200).json({ ok: true });
      return;
    }
    // Una edicion que no encuentra su partido no se convierte en un partido
    // nuevo: casi siempre es que otro lo edito mientras tanto, y guardarlo
    // lo duplicaria.
    if (original && typeof original === 'object') {
      res.status(409).json({ ok: false, error: 'conflict', message: 'Alguien ha editado este partido mientras lo tenías abierto. Recarga y vuelve a intentarlo.' });
      return;
    }

    await insertMatch(m);
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('write:submitResult error', err);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
}

async function deleteResult(req, res) {
  try {
    await ensureSchema();
    const data = await readBody(req);
    const date = String(data.date || '').trim();
    const p1a_id = await getPlayerId(data.p1a);
    const p1b_id = await getPlayerId(data.p1b);
    const p2a_id = await getPlayerId(data.p2a);
    const p2b_id = await getPlayerId(data.p2b);

    await sql`
      DELETE FROM matches
      WHERE date = ${date}
        AND player1a_id IS NOT DISTINCT FROM ${p1a_id}
        AND player1b_id IS NOT DISTINCT FROM ${p1b_id}
        AND player2a_id IS NOT DISTINCT FROM ${p2a_id}
        AND player2b_id IS NOT DISTINCT FROM ${p2b_id}`;
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('write:deleteResult error', err);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
}

async function deleteName(req, res, user) {
  try {
    await ensureSchema();
    const data = await readBody(req);
    if (user.role !== 'admin') {
      res.status(403).json({ ok: false, error: 'forbidden' });
      return;
    }
    const name = data && data.name ? String(data.name).trim() : '';
    if (!name) {
      res.status(200).json({ ok: false, error: 'empty' });
      return;
    }
    const result = await sql`UPDATE players SET active = FALSE WHERE name = ${name} RETURNING id`;
    res.status(200).json({ ok: true, deleted: result.rowCount > 0 });
  } catch (err) {
    console.error('write:deleteName error', err);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
}

// «Editar» de la pantalla de jugadores (admin-jugadores.js). Desde el
// 2026-10-17. Detalle: ai_context/exportar_jugadores.md
// El estado de la cuenta no se edita aqui: aprobar y rechazar siguen en
// /cuenta, que crea la ficha y manda el correo, y «bloqueada» no tiene
// pantalla en la app.
const ROLES = ['member', 'admin'];

// Sin mayusculas, tildes ni espacios de mas, como claveDeNombre en auth.js.
const claveDeNombre = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/\s+/g, ' ').trim();

async function editarFicha(playerId, data) {
  const name = String(data.name || '').trim().replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > 60 || /[<>"'`&]/.test(name)) {
    return 'El nombre tiene que tener entre 2 y 60 caracteres, sin < > " \' ` ni &.';
  }
  const { rows } = await sql`SELECT id, name FROM players WHERE id <> ${playerId}`;
  const otro = rows.find((r) => claveDeNombre(r.name) === claveDeNombre(name));
  if (otro) return `Ya hay otro jugador con ese nombre (${otro.name}).`;
  const hecho = await sql`UPDATE players SET name = ${name}, active = ${data.active !== false} WHERE id = ${playerId}`;
  return hecho.rowCount ? null : 'Ese jugador ya no existe.';
}

// Las respuestas de la inscripcion, con las mismas reglas que el alta: todas
// las preguntas y un telefono que no este en otra cuenta.
async function inscripcionEditada(userId, datos) {
  if (!datos) return { form: undefined };
  const insc = validarInscripcion(datos);
  if (insc.error) return { fallo: insc.message.replace(' antes de crear la cuenta', '') };
  const repetido = await telefonoLibre(insc.form, userId);
  return repetido ? { fallo: 'Ese teléfono ya está en otra cuenta.' } : { form: insc.form };
}

async function editarCuenta(userId, data, admin) {
  const { rows } = await sql`SELECT role FROM users WHERE id = ${userId}`;
  if (!rows.length) return 'Esa cuenta ya no existe.';
  const role = String(data.role || rows[0].role);
  if (!ROLES.includes(role)) return 'Tipo de usuario no válido.';
  if (userId === admin.id && role !== rows[0].role) return 'No puedes cambiar el tipo de tu propia cuenta.';
  const { form, fallo } = await inscripcionEditada(userId, data.form);
  if (fallo) return fallo;
  await sql`
    UPDATE users SET role = ${role},
      signup_form = COALESCE(${form ? JSON.stringify(form) : null}::jsonb, signup_form)
    WHERE id = ${userId}`;
  return null;
}

async function updatePlayer(req, res, user) {
  if (user.role !== 'admin') {
    res.status(403).json({ ok: false, error: 'forbidden' });
    return;
  }
  try {
    await ensureSchema();
    const data = await readBody(req);
    const playerId = toInt(data && data.playerId);
    const userId = toInt(data && data.userId);
    const fallo = (playerId ? await editarFicha(playerId, data) : null)
      || (userId ? await editarCuenta(userId, data, user) : null);
    if (fallo) {
      res.status(400).json({ ok: false, error: 'bad_edit', message: fallo });
      return;
    }
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('write:updatePlayer error', err);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
}

async function submitVote(req, res) {
  try {
    await ensureSchema();
    const data = await readBody(req);
    const date = data && data.date ? String(data.date) : '';
    const name = data && data.name ? String(data.name) : '';
    const slots = Array.isArray(data && data.slots) ? data.slots : [];

    if (!date || !name) {
      res.status(400).send('missing data');
      return;
    }

    const playerId = await getOrCreatePlayerId(name);
    if (!playerId) {
      res.status(400).send('missing data');
      return;
    }

    await sql`DELETE FROM availability WHERE player_id = ${playerId} AND date = ${date}`;

    for (const slot of slots) {
      const hour = String(slot || '').trim();
      if (!hour) continue;
      await sql`INSERT INTO availability (player_id, date, hour)
        VALUES (${playerId}, ${date}, ${hour})
        ON CONFLICT (player_id, date, hour) DO NOTHING`;
    }

    res.status(200).send('ok');
  } catch (err) {
    console.error('write:submitVote error', err);
    res.status(500).send('error');
  }
}

export default async function handler(req, res) {
  // Desde el 2026-10-16 ninguna escritura es anonima:
  // ai_context/cuentas_y_sesiones.md
  const user = await exigirSesion(req, res);
  if (!user) return;
  const action = String(req.query?.action || req.body?.action || '').trim();

  switch (action) {
    case 'submitName':
      return submitName(req, res);
    case 'submitResult':
      return submitResult(req, res, user);
    case 'deleteResult':
      return deleteResult(req, res);
    case 'deleteName':
      return deleteName(req, res, user);
    case 'updatePlayer':
      return updatePlayer(req, res, user);
    case 'submitVote':
      return submitVote(req, res);
    default:
      res.status(404).json({ ok: false, error: 'unknown_action' });
      return;
  }
}
