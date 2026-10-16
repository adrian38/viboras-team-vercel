// Lo que va por correo: restablecer una contrasena olvidada y verificar el
// correo. Un endpoint aparte de auth.js porque auth.js esta a pocas lineas del
// techo de 600 (ai_context/tamano_del_codigo_y_trinquete.md).
//
// Abierto sin sesion, como auth.js: quien olvido la contrasena no la tiene.
// Las mismas dos reglas que alli: el metodo se comprueba (una contrasena en la
// query string acabaria en los logs) y el `action` solo sale de req.query.
//
// Detalle: ai_context/cuentas_y_sesiones.md
import { sql } from '@vercel/postgres';
import { ensureSchema, readBody } from './_db.js';
import {
  ensureAuthSchema, sinCache, normalizarCorreo, passwordValida, hashPassword,
  limpiarFallos, cerrarSesionesDe
} from './_auth.js';
import {
  crearEnlace, gastarEnlace, enlaceReciente, correoDeRestablecer
} from './_correo.js';

// La misma respuesta exista o no la cuenta: si no, este formulario serviria
// para averiguar que correos son del grupo.
const ENVIADO = {
  ok: true,
  message: 'Si ese correo tiene cuenta, te hemos enviado un enlace para restablecer la contraseña. Mira también en spam.'
};

async function requestReset(req, res) {
  const data = await readBody(req);
  const email = normalizarCorreo(data?.email);
  const { rows } = await sql`SELECT id, status FROM users WHERE email = ${email}`;
  const user = rows[0];
  if (user && user.status !== 'blocked' && !await enlaceReciente(user.id, 'reset')) {
    const token = await crearEnlace(user.id, 'reset', 60);
    await correoDeRestablecer(email, token);
  }
  res.status(200).json(ENVIADO);
}

// Abrir el enlace demuestra que el correo es suyo, asi que tambien lo marca
// verificado. Cierra todas sus sesiones: si alguien entro con la contrasena
// vieja, deja de estar dentro.
async function resetPassword(req, res) {
  const data = await readBody(req);
  const password = String(data?.password || '');
  if (!passwordValida(password)) {
    res.status(400).json({ ok: false, error: 'weak_password', message: 'La contraseña tiene que tener al menos 6 caracteres.' });
    return;
  }
  const userId = await gastarEnlace(data?.token, 'reset');
  if (!userId) {
    res.status(400).json({ ok: false, error: 'bad_token', message: 'El enlace ha caducado o ya se usó. Pide otro.' });
    return;
  }
  const hash = await hashPassword(password);
  await sql`
    UPDATE users SET password_hash = ${hash}, email_verified_at = COALESCE(email_verified_at, now())
    WHERE id = ${userId}
  `;
  await limpiarFallos(userId);
  await cerrarSesionesDe(userId);
  res.status(200).json({ ok: true, message: 'Contraseña cambiada. Ya puedes entrar con ella.' });
}

async function verifyEmail(req, res) {
  const data = await readBody(req);
  const userId = await gastarEnlace(data?.token, 'verify');
  if (!userId) {
    res.status(400).json({ ok: false, error: 'bad_token', message: 'El enlace ha caducado o ya se usó.' });
    return;
  }
  await sql`UPDATE users SET email_verified_at = COALESCE(email_verified_at, now()) WHERE id = ${userId}`;
  res.status(200).json({ ok: true, message: 'Correo confirmado. Gracias.' });
}

const ACCIONES = { requestReset, resetPassword, verifyEmail };

export default async function handler(req, res) {
  const action = String(req.query?.action || '').trim();
  const accion = Object.prototype.hasOwnProperty.call(ACCIONES, action) ? ACCIONES[action] : null;
  if (!accion) {
    res.status(404).json({ ok: false, error: 'unknown_action' });
    return;
  }
  if (req.method !== 'POST') {
    res.setHeader('allow', 'POST');
    res.status(405).json({ ok: false, error: 'method_not_allowed' });
    return;
  }
  sinCache(res);
  try {
    await ensureSchema();
    await ensureAuthSchema();
    await accion(req, res);
  } catch (err) {
    console.error(`correo:${action} error`, err);
    if (!res.headersSent) res.status(500).json({ ok: false, error: 'server_error' });
  }
}
