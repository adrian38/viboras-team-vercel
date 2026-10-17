// Cuentas: registro, inicio de sesion y aprobacion.
//
// Dos diferencias deliberadas con read.js / write.js / league-admin.js:
//
//   - Aqui SI se comprueba el metodo HTTP. Una contrasena en la query string
//     acaba en los Runtime Logs de Vercel y en el log de docker/server.js.
//   - El `action` se lee solo de req.query, nunca del cuerpo: si no, un POST
//     podria invocar una accion de lectura y al reves.
//
// Es la unica puerta abierta: desde el 2026-10-16 read.js, write.js y
// league-admin.js responden 401 sin sesion. Aqui solo `config` y las dos
// entradas pueden usarse sin cookie (`players`, la lista de nombres para el
// alta, se quito el 2026-10-17 con la casilla «Soy antiguo pirata»).
// Detalle: ai_context/cuentas_y_sesiones.md
import { sql } from '@vercel/postgres';
import { ensureSchema, getOrCreatePlayerId, readBody, toInt } from './_db.js';
import {
  ensureAuthSchema, hashPassword, verifyPassword, gastarTiempoDeHash,
  crearSesion, cerrarSesionDeLaCookie, cerrarSesionesDe, limpiarSesionesCaducadas,
  usuarioDeLaPeticion, exigirAdmin, sinCache,
  normalizarCorreo, correoValido, passwordValida,
  anotarFallo, limpiarFallos, bloqueoPendiente, esCorreoDeAdmin
} from './_auth.js';
import { googleClientId, verificarCredencial, ErrorDeGoogle } from './_google.js';
import { crearEnlace, correoDeVerificacion, correoDeAprobacion, correoDeRechazo, problemaDeCorreo } from './_correo.js';
import { validarInscripcion, telefonoLibre, mensajeDeSolicitud } from './_inscripcion.js';

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

// Quien no esta en la lista pide un nombre. No se crea la ficha aqui: se
// guarda la peticion y la crea approveUser, para que un alta que nadie apruebe
// no deje un jugador suelto en las tablas.
//
// Se compara sin mayusculas, tildes ni espacios de mas: "adrian  c" es
// "Adrián C", y dejarlo pasar pondria a dos personas casi iguales en las tablas.
// Por eso se compara en JavaScript y no en SQL: LOWER() no quita tildes y
// unaccent es una extension que habria que instalar en Neon y en local.
const claveDeNombre = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/\s+/g, ' ').trim();

async function comprobarNombreNuevo(nombre) {
  const limpio = String(nombre || '').trim().replace(/\s+/g, ' ');
  if (limpio.length < 2 || limpio.length > 60) {
    return { error: 'bad_name', message: 'Escribe tu nombre, entre 2 y 60 caracteres.' };
  }
  // Al aprobar, este nombre pasa a las tablas de todas las paginas, que lo
  // pintan con innerHTML: con < o > seria codigo ejecutandose para todo el grupo.
  if (/[<>"'`&]/.test(limpio)) {
    return { error: 'bad_name', message: 'El nombre no puede llevar < > " \' ` ni &.' };
  }
  const clave = claveDeNombre(limpio);
  const { rows } = await sql`
    SELECT p.id, p.name, p.active,
      EXISTS (SELECT 1 FROM users u WHERE u.player_id = p.id AND u.status = 'active') AS con_cuenta
    FROM players p
  `;
  const igual = rows.find((r) => claveDeNombre(r.name) === clave);
  if (igual && igual.con_cuenta) {
    return { error: 'name_taken', message: `Ese nombre ya es de otro usuario (${igual.name}). Elige otro.` };
  }
  // Ya jugaba y aun no tiene cuenta: se enlaza con su ficha, y el admin decide
  // al aprobar. Sustituye a la casilla «Soy antiguo pirata» (2026-10-17).
  if (igual && igual.active === true) return { playerId: igual.id };
  if (igual) {
    return { error: 'name_inactive', message: 'Ese nombre existe pero está dado de baja. Habla con un administrador.' };
  }
  const pedidos = await sql`
    SELECT requested_player_name AS nombre FROM users
    WHERE requested_player_name IS NOT NULL AND status NOT IN ('blocked', 'rejected')
  `;
  if (pedidos.rows.some((r) => claveDeNombre(r.nombre) === clave)) {
    return { error: 'name_requested', message: 'Ya hay una cuenta esperando con ese nombre.' };
  }
  return { requestedName: limpio };
}

// Lo que comparten el alta con contrasena y el alta con Google. Devuelve
// { playerId, requestedName } o { error, message }.
async function comprobarAlta(email, playerName, newPlayerName, data) {
  if (data?.acceptRules !== true) return { error: 'rules_not_accepted', message: 'Tienes que aceptar la normativa del grupo.' };
  const insc = validarInscripcion(data?.signupForm);
  if (insc.error) return insc;
  if (!correoValido(email)) {
    return { error: 'invalid_email', message: 'Ese correo no parece válido.' };
  }
  const problema = await problemaDeCorreo(email);
  if (problema) return { error: 'invalid_email', message: problema };
  const repeChequeo = await correoLibre(email) || await telefonoLibre(insc.form);
  if (repeChequeo) return repeChequeo;
  if (!String(playerName || '').trim()) {
    const nuevo = await comprobarNombreNuevo(newPlayerName);
    return nuevo.error ? nuevo : { playerId: nuevo.playerId || null, requestedName: nuevo.requestedName || null, form: insc.form };
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
  return { playerId: player.id, requestedName: null, form: insc.form };
}

// Se comprueba antes que el jugador: si el correo ya tiene cuenta, el nombre
// da igual, y decirlo primero evita el mensaje equivocado.
async function correoLibre(email) {
  const { rows } = await sql`SELECT status FROM users WHERE email = ${email}`;
  return rows.length ? { error: 'email_taken', message: mensajeDeSolicitud('ese correo', rows[0].status) } : null;
}

async function register(req, res) {
  const data = await readBody(req);
  const email = normalizarCorreo(data?.email);
  const password = String(data?.password || '');
  if (!passwordValida(password)) {
    res.status(400).json({
      ok: false,
      error: 'weak_password',
      message: 'La contraseña tiene que tener al menos 6 caracteres.'
    });
    return;
  }
  const alta = await comprobarAlta(email, data?.playerName, data?.newPlayerName, data);
  if (alta.error) {
    res.status(400).json({ ok: false, ...alta });
    return;
  }
  const hash = await hashPassword(password);
  const { rows } = await sql`
    INSERT INTO users (email, password_hash, player_id, requested_player_name, rules_accepted_at, signup_form)
    VALUES (${email}, ${hash}, ${alta.playerId}, ${alta.requestedName}, now(), ${JSON.stringify(alta.form)}::jsonb) RETURNING id
  `;
  await correoDeVerificacion(email, await crearEnlace(rows[0].id, 'verify', 60 * 24 * 7));
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
  const rechazada = status === 'rejected';
  res.status(403).json({
    ok: false,
    error: rechazada ? 'rejected' : 'blocked',
    message: rechazada ? 'Tu solicitud no fue aprobada. Habla con un administrador.' : 'Esta cuenta está bloqueada. Habla con un administrador.'
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
      message: 'La contraseña tiene que tener al menos 6 caracteres.'
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

// Lo que pinta la campanita (auth-client.js). Una lista generica para que
// quepan otros avisos; hoy solo la llenan las altas pendientes, y solo para
// administradores. Sin sesion responde vacio, no 401: la campanita no es
// motivo para que una pagina falle.
async function notifications(req, res) {
  const user = await usuarioDeLaPeticion(req);
  const items = [];
  if (user && user.role === 'admin') {
    const { rows } = await sql`
      SELECT COALESCE(p.name, u.requested_player_name, u.email) AS quien, u.created_at
      FROM users u LEFT JOIN players p ON p.id = u.player_id
      WHERE u.status = 'pending'
      ORDER BY u.created_at DESC
      LIMIT 20
    `;
    for (const r of rows) {
      items.push({ tipo: 'alta', texto: `${r.quien} pide entrar`, cuando: r.created_at, enlace: '/cuenta' });
    }
  }
  res.status(200).json({ ok: true, items });
}

async function listPending(req, res) {
  if (!await exigirAdmin(req, res)) return;
  const { rows } = await sql`
    SELECT u.id, u.email, u.created_at, u.requested_player_name, u.email_verified_at, u.rules_accepted_at, u.signup_form,
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
    SELECT u.id, u.email, u.status, u.player_id, u.requested_player_name,
           p.active AS player_active
    FROM users u LEFT JOIN players p ON p.id = u.player_id
    WHERE u.id = ${id}
  `;
  let user = rows[0];
  if (!user || user.status !== 'pending') {
    res.status(404).json({ ok: false, error: 'not_pending', message: 'Esa cuenta ya no está pendiente.' });
    return;
  }
  user = await crearFichaSiHaceFalta(user);
  const fallo = await motivoParaNoAprobar(user);
  if (fallo) {
    res.status(409).json({ ok: false, ...fallo });
    return;
  }
  // Solo dos roles, y lo que no sea 'admin' es jugador: un valor raro no debe
  // poder colarse como un tercer rol que nadie comprueba.
  const role = data?.role === 'admin' ? 'admin' : 'member';
  await sql`
    UPDATE users SET status = 'active', role = ${role}, approved_at = now() WHERE id = ${user.id}
  `;
  await correoDeAprobacion(user.email);
  res.status(200).json({ ok: true, role });
}

// Aqui, y no al registrarse: un alta que nadie apruebe no debe dejar un
// jugador suelto en las tablas. Si entre medias alguien creo ese nombre a mano
// o subiendo un resultado, getOrCreatePlayerId devuelve el que ya existe y las
// comprobaciones de abajo deciden.
async function crearFichaSiHaceFalta(user) {
  if (user.player_id || !user.requested_player_name) return user;
  const playerId = await getOrCreatePlayerId(user.requested_player_name);
  if (!playerId) return user;
  const { rows } = await sql`
    UPDATE users SET player_id = ${playerId} WHERE id = ${user.id}
    RETURNING (SELECT active FROM players WHERE id = ${playerId}) AS player_active
  `;
  return { ...user, player_id: playerId, player_active: rows[0]?.player_active };
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
    res.status(400).json({ ok: false, error: 'self', message: 'No puedes rechazar tu propia cuenta.' });
    return;
  }
  // Se marca, no se borra (desde el 2026-10-17): sus datos salen en la
  // exportacion. No ocupa el jugador: el indice parcial solo cuenta 'active'.
  const hecho = await sql`
    UPDATE users SET status = 'rejected', rejected_at = now() WHERE id = ${id} AND status = 'pending' RETURNING email`;
  if (hecho.rowCount > 0) await correoDeRechazo(hecho.rows[0].email);
  res.status(200).json({ ok: true, rejected: hecho.rowCount > 0 });
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

// El sustituto del paso de build: aqui no hay forma de inyectar una variable
// de entorno en un .html estatico, asi que el navegador pregunta por el
// client_id. No es un secreto, el boton de Google lo publica igualmente.
async function config(req, res) {
  res.status(200).json({ ok: true, googleClientId: googleClientId() });
}

// Devuelve el usuario de ese Google, enlazandolo por correo la primera vez.
async function usuarioDeGoogle(dato) {
  const porIdentidad = await sql`
    SELECT u.id, u.email, u.status, u.role, u.player_id, p.active AS player_active
    FROM identities i
    JOIN users u ON u.id = i.user_id
    LEFT JOIN players p ON p.id = u.player_id
    WHERE i.provider = 'google' AND i.subject = ${dato.sub}
  `;
  if (porIdentidad.rows.length) return porIdentidad.rows[0];

  // Quien se registro con contrasena puede entrar luego con Google sin crear
  // una cuenta duplicada. El correo esta verificado por Google, que es la
  // unica razon por la que enlazar asi no es suplantar.
  const porCorreo = await sql`
    SELECT u.id, u.email, u.status, u.role, u.player_id, p.active AS player_active
    FROM users u LEFT JOIN players p ON p.id = u.player_id
    WHERE u.email = ${dato.email}
  `;
  if (!porCorreo.rows.length) return null;
  const user = porCorreo.rows[0];
  await sql`
    INSERT INTO identities (user_id, provider, subject)
    VALUES (${user.id}, 'google', ${dato.sub})
    ON CONFLICT (provider, subject) DO NOTHING
  `;
  return user;
}

// ADMIN_EMAILS solo cuenta por aqui: el alta con contrasena no verifica el
// correo, asi que por esa via bastaria con saber la direccion para hacerse
// administrador.
async function promocionarSiEsAdmin(user) {
  if (user.status === 'active' && user.role === 'admin') return user;
  if (!esCorreoDeAdmin(user.email)) return user;
  if (await motivoParaNoAprobar(user)) return user;
  await sql`
    UPDATE users
    SET status = 'active', role = 'admin', approved_at = COALESCE(approved_at, now())
    WHERE id = ${user.id}
  `;
  return { ...user, status: 'active', role: 'admin' };
}

function contarErrorDeGoogle(res, err) {
  if (!(err instanceof ErrorDeGoogle)) throw err;
  const codigo = err.codigo === 'google_no_configurado' ? 503 : 401;
  res.status(codigo).json({ ok: false, error: err.codigo, message: err.texto });
}

async function googleLogin(req, res) {
  const data = await readBody(req);
  let user;
  try {
    user = await usuarioDeGoogle(await verificarCredencial(data?.credential));
  } catch (err) {
    contarErrorDeGoogle(res, err);
    return;
  }
  if (!user) {
    res.status(404).json({
      ok: false,
      error: 'no_account',
      message: 'No hay ninguna cuenta con ese correo. Créala en «Crear cuenta».'
    });
    return;
  }
  user = await promocionarSiEsAdmin(user);
  if (user.status !== 'active') {
    respuestaPorEstado(res, user.status);
    return;
  }
  await abrirSesion(req, res, user.id);
  res.status(200).json({ ok: true });
}

async function googleRegister(req, res) {
  const data = await readBody(req);
  let dato;
  let existente;
  try {
    dato = await verificarCredencial(data?.credential);
    existente = await usuarioDeGoogle(dato);
  } catch (err) {
    contarErrorDeGoogle(res, err);
    return;
  }
  // Ya tenia cuenta: esto no es un alta, es una entrada.
  if (existente) {
    const user = await promocionarSiEsAdmin(existente);
    if (user.status !== 'active') {
      respuestaPorEstado(res, user.status);
      return;
    }
    await abrirSesion(req, res, user.id);
    res.status(200).json({ ok: true, status: 'active' });
    return;
  }
  const alta = await comprobarAlta(dato.email, data?.playerName, data?.newPlayerName, data);
  if (alta.error) {
    res.status(400).json({ ok: false, ...alta });
    return;
  }
  await crearCuentaDeGoogle(req, res, dato, alta);
}

async function crearCuentaDeGoogle(req, res, dato, alta) {
  const admin = esCorreoDeAdmin(dato.email);
  const { rows } = await sql`
    INSERT INTO users (email, player_id, requested_player_name, status, role, approved_at, email_verified_at, rules_accepted_at, signup_form)
    VALUES (
      ${dato.email}, ${alta.playerId}, ${alta.requestedName},
      ${admin ? 'active' : 'pending'}, ${admin ? 'admin' : 'member'},
      ${admin ? new Date().toISOString() : null}::timestamptz, now(), now(), ${JSON.stringify(alta.form)}::jsonb
    )
    RETURNING id
  `;
  const userId = rows[0].id;
  await sql`
    INSERT INTO identities (user_id, provider, subject)
    VALUES (${userId}, 'google', ${dato.sub})
  `;
  if (!admin) {
    res.status(200).json({ ok: true, status: 'pending' });
    return;
  }
  await abrirSesion(req, res, userId);
  res.status(200).json({ ok: true, status: 'active' });
}

const ACCIONES = {
  me,
  config,
  googleLogin,
  googleRegister,
  register,
  login,
  logout,
  changePassword,
  listPending,
  notifications,
  approveUser,
  rejectUser,
  blockUser
};

const DE_LECTURA = new Set(['me', 'config', 'listPending', 'notifications']);

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
