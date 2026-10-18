// Alta y baja de un dispositivo en los avisos push (avisos-push.js). Basta la
// sesion, sin ficha de jugador: los administradores sin ficha reciben las
// altas pendientes. Detalle: ai_context/avisos_push.md
import { sql } from '@vercel/postgres';
import { readBody } from './_db.js';
import { exigirSesion, sinCache } from './_auth.js';
import { ensurePushSchema, clavePublica, endpointValido } from './_push.js';

// Null si el servidor no tiene claves: la pagina entonces no ofrece nada.
async function clave(req, res) {
  res.status(200).json({ ok: true, clave: clavePublica() });
}

// La misma suscripcion puede llegar con otra cuenta (dos personas en un
// movil): se queda con la ultima, para no avisar a quien ya salio.
async function suscribir(req, res, user) {
  const data = await readBody(req);
  const endpoint = String(data?.endpoint || '');
  const p256dh = String(data?.keys?.p256dh || '');
  const auth = String(data?.keys?.auth || '');
  if (!endpointValido(endpoint) || !p256dh || !auth || p256dh.length > 200 || auth.length > 100) {
    res.status(400).json({ ok: false, error: 'bad_subscription' });
    return;
  }
  await sql`
    INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
    VALUES (${user.id}, ${endpoint}, ${p256dh}, ${auth})
    ON CONFLICT (endpoint) DO UPDATE SET
      user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth`;
  res.status(200).json({ ok: true });
}

// Al cerrar sesion (cuenta.html): ese movil deja de recibir los avisos.
async function baja(req, res, user) {
  const data = await readBody(req);
  await sql`DELETE FROM push_subscriptions WHERE endpoint = ${String(data?.endpoint || '')} AND user_id = ${user.id}`;
  res.status(200).json({ ok: true });
}

const ACCIONES = {
  clave: ['GET', clave],
  suscribir: ['POST', suscribir],
  baja: ['POST', baja]
};

export default async function handler(req, res) {
  const user = await exigirSesion(req, res);
  if (!user) return;
  const action = String(req.query?.action || '').trim();
  const entrada = Object.prototype.hasOwnProperty.call(ACCIONES, action) ? ACCIONES[action] : null;
  if (!entrada) {
    res.status(404).json({ ok: false, error: 'unknown_action' });
    return;
  }
  if (req.method !== entrada[0]) {
    res.setHeader('allow', entrada[0]);
    res.status(405).json({ ok: false, error: 'method_not_allowed' });
    return;
  }
  sinCache(res);
  try {
    await ensurePushSchema();
    await entrada[1](req, res, user);
  } catch (err) {
    console.error(`push:${action} error`, err);
    if (!res.headersSent) res.status(500).json({ ok: false, error: 'server_error' });
  }
}
