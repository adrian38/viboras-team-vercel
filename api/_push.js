// Avisos push al movil (Web Push): lo mismo que la campanita, pero llega con la
// app cerrada. Cada dispositivo que acepta deja aqui su suscripcion, ligada a
// la cuenta y no al jugador, porque los administradores sin ficha tambien
// reciben avisos (las altas pendientes).
//
// Sin VAPID_PUBLIC_KEY y VAPID_PRIVATE_KEY no falla: no manda nada y el
// navegador no ofrece activarlos. Detalle: ai_context/avisos_push.md
import { sql } from '@vercel/postgres';
import webpush from 'web-push';
import { ensureAuthSchema } from './_auth.js';

let listo = null;

// Igual que avisos y match_feedback: fuera de ensureSchema, que esta en el
// techo de tamano (ai_context/tamano_del_codigo_y_trinquete.md).
async function crearTabla() {
  await ensureAuthSchema();
  await sql`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      endpoint TEXT NOT NULL UNIQUE,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
}

export function ensurePushSchema() {
  if (!listo) listo = crearTabla().catch((err) => { listo = null; throw err; });
  return listo;
}

export function clavePublica() {
  return process.env.VAPID_PUBLIC_KEY || null;
}

// Apple rechaza el envio si el asunto no es un mailto: o una https:// valida.
function asunto() {
  if (process.env.VAPID_SUBJECT) return process.env.VAPID_SUBJECT;
  const admin = String(process.env.ADMIN_EMAILS || '').split(',')[0].trim();
  return admin ? `mailto:${admin}` : 'mailto:admin@viboras.invalid';
}

let configurado = null;
function configurar() {
  if (configurado !== null) return configurado;
  configurado = Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
  if (configurado) webpush.setVapidDetails(asunto(), process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
  return configurado;
}

// El servidor hace un POST a la direccion que manda el navegador. Solo a los
// servicios de push de los navegadores: si no, cualquier miembro podria hacer
// que la funcion llamase a donde quisiera.
const SERVICIOS = ['.googleapis.com', '.push.apple.com', '.mozilla.com', '.notify.windows.com'];

export function endpointValido(texto) {
  let url;
  try { url = new URL(String(texto || '')); } catch { return false; }
  if (url.protocol !== 'https:' || url.href.length > 1000) return false;
  return SERVICIOS.some((s) => url.hostname.endsWith(s));
}

// 404 y 410 son el servicio diciendo que esa suscripcion ya no existe (app
// desinstalada, permiso retirado): se borra para no insistir.
async function mandarUno(s, cuerpo) {
  try {
    await webpush.sendNotification(
      { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
      cuerpo,
      { TTL: 60 * 60 * 24, timeout: 5000 }
    );
  } catch (err) {
    if (err.statusCode === 404 || err.statusCode === 410) {
      await sql`DELETE FROM push_subscriptions WHERE id = ${s.id}`;
    } else {
      console.error('push: envio fallido', err.statusCode || '', err.body || err.message);
    }
  }
}

// Nunca lanza: un push que no sale no puede tumbar el guardado de un partido.
// Se espera a que salgan todos: en Vercel la funcion se congela al responder.
async function mandar(consulta, aviso) {
  if (!configurar()) return;
  try {
    await ensurePushSchema();
    const { rows } = await consulta();
    const cuerpo = JSON.stringify({ title: 'Víboras Team', body: aviso.texto, url: aviso.enlace || '/' });
    await Promise.all(rows.map((s) => mandarUno(s, cuerpo)));
  } catch (err) {
    console.error('push: error', err);
  }
}

// A los dispositivos de las cuentas activas de esos jugadores.
export function pushAJugadores(playerIds, aviso) {
  const ids = [...new Set(playerIds.filter(Boolean))];
  if (!ids.length) return Promise.resolve();
  return mandar(() => sql`
    SELECT s.id, s.endpoint, s.p256dh, s.auth
    FROM push_subscriptions s JOIN users u ON u.id = s.user_id
    WHERE u.status = 'active' AND u.player_id = ANY(${ids}::int[])`, aviso);
}

export function pushAAdmins(aviso) {
  return mandar(() => sql`
    SELECT s.id, s.endpoint, s.p256dh, s.auth
    FROM push_subscriptions s JOIN users u ON u.id = s.user_id
    WHERE u.status = 'active' AND u.role = 'admin'`, aviso);
}
