// Cuentas: registro, inicio de sesion y aprobacion.
//
// Dos diferencias deliberadas con read.js / write.js / league-admin.js:
//
//   - Aqui SI se comprueba el metodo HTTP. Una contrasena en la query string
//     acaba en los Runtime Logs de Vercel y en el log de docker/server.js.
//   - El `action` se lee solo de req.query, nunca del cuerpo: si no, un POST
//     podria invocar una accion de lectura y al reves.
//
// Esto NO protege ningun endpoint existente: subir un resultado y votar siguen
// abiertos, igual que antes. La sesion solo dice quien eres.
// Detalle: ai_context/cuentas_y_sesiones.md
import { sql } from '@vercel/postgres';
import { ensureSchema, readBody, toInt } from './_db.js';
import {
  ensureAuthSchema, hashPassword, verifyPassword, gastarTiempoDeHash,
  crearSesion, cerrarSesionDeLaCookie, cerrarSesionesDe, limpiarSesionesCaducadas,
  usuarioDeLaPeticion, exigirAdmin, sinCache,
  normalizarCorreo, correoValido, passwordValida,
  anotarFallo, limpiarFallos, bloqueoPendiente
} from './_auth.js';

const CREDENCIALES_MAL = {
  ok: false,
  error: 'bad_credentials',
  message: 'Correo o contraseña incorrectos.'
};

async function filaDeJugador(nombre) {
  const limpio = String(nombre || '').trim();
  if (!limpio) return null;
  const { rows } = await sql`SELECT id, active FROM players WHERE name = ${limpio}`;
  return rows.length ? rows[0] : null;
}

// Lo que comparten el alta con contrasena y el alta con Google. Devuelve
// { playerId } o { error, message }.
async function comprobarAlta(email, playerName) {
  if (!correoValido(email)) {
    return { error: 'invalid_email', message: 'Ese correo no parece válido.' };
  }
  const player = await filaDeJugador(playerName);
  if (!player) {
    return { error: 'unknown_player', message: 'Elige tu nombre de la lista de jugadores.' };
  }
  if (player.active === false) {
    return { error: 'inactive_player', message: 'Ese jugador está dado de baja. Habla con un administrador.' };
  }
  const ocupado = await sql`SELECT 1 FROM users WHERE player_id = ${player.id} AND status = 'active'`;
  if (ocupado.rows.length) {
    return { error: 'player_taken', message: 'Ese jugador ya tiene una cuenta.' };
  }
  const repetido = await sql`SELECT 1 FROM users WHERE email = ${email}`;
  if (repetido.rows.length) {
    return { error: 'email_taken', message: 'Ya hay una cuenta con ese correo.' };
  }
  return { playerId: player.id };
}

async function register(req, res) {
  const data = await readBody(req);
  const email = normalizarCorreo(data?.email);
  const password = String(data?.password || '');
  if (!passwordValida(password)) {
    res.status(400).json({
      ok: false,
      error: 'weak_password',
      message: 'La contraseña tiene que tener al menos 10 caracteres.'
    });
    return;
  }
  const alta = await comprobarAlta(email, data?.playerName);
  if (alta.error) {
    res.status(400).json({ ok: false, ...alta });
    return;
  }
  const hash = await hashPassword(password);
  await sql`
    INSERT INTO users (email, password_hash, player_id)
    VALUES (${email}, ${hash}, ${alta.playerId})
  `;
  res.status(200).json({ ok: true, status: 'pending' });
}

function respuestaPorEstado(res, status) {
  if (status === 'pending') {
    res.status(403).json({
      ok: false,
      error: 'pending',
      message: 'Tu cuenta está pendiente de que un administrador la apruebe.'
    });
    return;
  }
  res.status(403).json({
    ok: false,
    error: 'blocked',
    message: 'Esta cuenta está bloqueada. Habla con un administrador.'
  });
}

async function login(req, res) {
  const data = await readBody(req);
  const email = normalizarCorreo(data?.email);
  const password = String(data?.password || '');
  const { rows } = await sql`
    SELECT id, password_hash, status, failed_attempts, locked_until
    FROM users WHERE email = ${email}
  `;
  const user = rows[0];
  if (!user || !user.password_hash) {
    await gastarTiempoDeHash(password);
    res.status(401).json(CREDENCIALES_MAL);
    return;
  }
  const espera = await bloqueoPendiente(user);
  if (espera > 0) {
    res.status(429).json({
      ok: false,
      error: 'locked',
      message: `Demasiados intentos fallidos. Prueba otra vez en ${Math.ceil(espera / 60)} minutos.`
    });
    return;
  }
  if (!await verifyPassword(password, user.password_hash)) {
    await anotarFallo(user.id);
    res.status(401).json(CREDENCIALES_MAL);
    return;
  }
  if (user.status !== 'active') {
    respuestaPorEstado(res, user.status);
    return;
  }
  await limpiarFallos(user.id);
  await abrirSesion(req, res, user.id);
  res.status(200).json({ ok: true });
}

// Token nuevo en cada entrada, y la sesion anterior de esta misma cookie se
// borra. El Set-Cookie de crearSesion reemplaza al de cerrarSesionDeLaCookie.
async function abrirSesion(req, res, userId) {
  await limpiarSesionesCaducadas();
  await cerrarSesionDeLaCookie(req, res);
  await crearSesion(req, res, userId);
}

async function logout(req, res) {
  await cerrarSesionDeLaCookie(req, res);
  res.status(200).json({ ok: true });
}

async function me(req, res) {
  const user = await usuarioDeLaPeticion(req);
  if (!user) {
    res.status(200).json({ ok: true, user: null });
    return;
  }
  res.status(200).json({
    ok: true,
    user: {
      email: user.email,
      role: user.role,
      playerName: user.player_name || null,
      playerActive: user.player_active === true
    }
  });
}

async function changePassword(req, res) {
  const user = await usuarioDeLaPeticion(req);
  if (!user) {
    res.status(401).json({ ok: false, error: 'unauthorized' });
    return;
  }
  const data = await readBody(req);
  const nueva = String(data?.newPassword || '');
  if (!passwordValida(nueva)) {
    res.status(400).json({
      ok: false,
      error: 'weak_password',
      message: 'La contraseña tiene que tener al menos 10 caracteres.'
    });
    return;
  }
  const { rows } = await sql`SELECT password_hash FROM users WHERE id = ${user.id}`;
  const guardado = rows.length ? rows[0].password_hash : null;
  // Sin contrasena guardada la cuenta entra solo con Google: esto es ponerle
  // una, y la sesion abierta ya prueba quien es.
  if (guardado && !await verifyPassword(String(data?.currentPassword || ''), guardado)) {
    res.status(401).json({ ok: false, error: 'bad_credentials', message: 'La contraseña actual no es correcta.' });
    return;
  }
  await sql`UPDATE users SET password_hash = ${await hashPassword(nueva)} WHERE id = ${user.id}`;
  await cerrarSesionesDe(user.id);
  await crearSesion(req, res, user.id);
  res.status(200).json({ ok: true });
}

async function listPending(req, res) {
  if (!await exigirAdmin(req, res)) return;
  const { rows } = await sql`
    SELECT u.id, u.email, u.created_at,
           p.name AS player_name, p.active AS player_active
    FROM users u
    LEFT JOIN players p ON p.id = u.player_id
    WHERE u.status = 'pending'
    ORDER BY u.created_at
  `;
  res.status(200).json({ ok: true, pending: rows });
}

async function approveUser(req, res) {
  const admin = await exigirAdmin(req, res);
  if (!admin) return;
  const data = await readBody(req);
  const id = toInt(data?.id);
  const { rows } = await sql`
    SELECT u.id, u.status, u.player_id, p.active AS player_active
    FROM users u LEFT JOIN players p ON p.id = u.player_id
    WHERE u.id = ${id}
  `;
  const user = rows[0];
  if (!user || user.status !== 'pending') {
    res.status(404).json({ ok: false, error: 'not_pending', message: 'Esa cuenta ya no está pendiente.' });
    return;
  }
  const fallo = await motivoParaNoAprobar(user);
  if (fallo) {
    res.status(409).json({ ok: false, ...fallo });
    return;
  }
  await sql`UPDATE users SET status = 'active', approved_at = now() WHERE id = ${user.id}`;
  res.status(200).json({ ok: true });
}

// El indice unico parcial rechazaria el UPDATE igual, pero con un error de
// constraint ilegible. Esto dice por que.
async function motivoParaNoAprobar(user) {
  if (!user.player_id) {
    return { error: 'no_player', message: 'Esa cuenta no tiene jugador asignado.' };
  }
  if (user.player_active === false) {
    return { error: 'inactive_player', message: 'Ese jugador está dado de baja: reactívalo antes de aprobar la cuenta.' };
  }
  const ocupado = await sql`
    SELECT 1 FROM users WHERE player_id = ${user.player_id} AND status = 'active'
  `;
  if (ocupado.rows.length) {
    return { error: 'player_taken', message: 'Ese jugador ya tiene otra cuenta activa.' };
  }
  return null;
}

async function rejectUser(req, res) {
  const admin = await exigirAdmin(req, res);
  if (!admin) return;
  const data = await readBody(req);
  const id = toInt(data?.id);
  if (id === admin.id) {
    res.status(400).json({ ok: false, error: 'self', message: 'No puedes borrar tu propia cuenta.' });
    return;
  }
  // Se borra la fila, no se marca: marcada, el jugador quedaria ocupado para
  // siempre y nadie podria reclamarlo. La cascada se lleva sesiones e
  // identidades.
  const hecho = await sql`DELETE FROM users WHERE id = ${id} AND status = 'pending' RETURNING id`;
  res.status(200).json({ ok: true, deleted: hecho.rowCount > 0 });
}

async function blockUser(req, res) {
  const admin = await exigirAdmin(req, res);
  if (!admin) return;
  const data = await readBody(req);
  const id = toInt(data?.id);
  if (id === admin.id) {
    res.status(400).json({ ok: false, error: 'self', message: 'No puedes bloquear tu propia cuenta.' });
    return;
  }
  const hecho = await sql`
    UPDATE users SET status = 'blocked' WHERE id = ${id} RETURNING id
  `;
  if (hecho.rowCount > 0) await cerrarSesionesDe(id);
  res.status(200).json({ ok: true, blocked: hecho.rowCount > 0 });
}

const ACCIONES = {
  me,
  register,
  login,
  logout,
  changePassword,
  listPending,
  approveUser,
  rejectUser,
  blockUser
};

const DE_LECTURA = new Set(['me', 'listPending']);

export default async function handler(req, res) {
  const action = String(req.query?.action || '').trim();
  const accion = Object.prototype.hasOwnProperty.call(ACCIONES, action) ? ACCIONES[action] : null;
  if (!accion) {
    res.status(404).json({ ok: false, error: 'unknown_action' });
    return;
  }
  const metodo = DE_LECTURA.has(action) ? 'GET' : 'POST';
  if (req.method !== metodo) {
    res.setHeader('allow', metodo);
    res.status(405).json({ ok: false, error: 'method_not_allowed' });
    return;
  }
  sinCache(res);
  try {
    await ensureSchema();
    await ensureAuthSchema();
    await accion(req, res);
  } catch (err) {
    console.error(`auth:${action} error`, err);
    if (!res.headersSent) res.status(500).json({ ok: false, error: 'server_error' });
  }
}
