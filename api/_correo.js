// Correo saliente: el aviso de cuenta aprobada, el enlace para restablecer la
// contrasena y el de verificar el correo.
//
// SMTP generico. En produccion es una cuenta de Gmail del grupo con
// contrasena de aplicacion (SMTP_USER, SMTP_PASS); en local, el buzon de
// pruebas de docker-compose (Mailpit), que no envia nada fuera.
//
// Sin configurar, NO falla: registra un aviso y devuelve false. El correo es
// un extra; aprobar una cuenta o registrarse no puede romperse porque Gmail no
// conteste.
//
// Detalle: ai_context/cuentas_y_sesiones.md
import { sql } from '@vercel/postgres';
import { randomBytes, createHash } from 'node:crypto';
import nodemailer from 'nodemailer';

let transporte = null;

function configuracion() {
  const user = process.env.SMTP_USER || '';
  const host = process.env.SMTP_HOST || (user ? 'smtp.gmail.com' : '');
  if (!host) return null;
  const port = Number(process.env.SMTP_PORT || 465);
  return {
    host,
    port,
    secure: port === 465,
    auth: user ? { user, pass: process.env.SMTP_PASS || '' } : undefined,
    from: process.env.MAIL_FROM || (user ? `Víboras Team <${user}>` : 'Víboras Team <no-responder@localhost>')
  };
}

// Los enlaces salen de una variable y NUNCA de la cabecera Host: con ella,
// cualquiera pediria un restablecimiento para otro con Host: su-dominio y el
// enlace con el token le llegaria a el.
export function urlDeLaApp() {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/+$/, '');
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return 'http://localhost:3000';
}

export async function enviarCorreo(para, asunto, texto) {
  const conf = configuracion();
  if (!conf) {
    console.warn(`correo: sin SMTP configurado, no se envia "${asunto}"`);
    return false;
  }
  try {
    if (!transporte) {
      const { from, ...opciones } = conf;
      transporte = nodemailer.createTransport(opciones);
    }
    await transporte.sendMail({ from: conf.from, to: para, subject: asunto, text: texto });
    return true;
  } catch (err) {
    console.error('correo: fallo al enviar', asunto, err && err.message);
    return false;
  }
}

const sha256 = (t) => createHash('sha256').update(String(t)).digest('hex');

// Un enlace nuevo invalida los anteriores del mismo tipo: si alguien pide dos
// veces restablecer, solo vale el ultimo correo.
export async function crearEnlace(userId, tipo, minutos) {
  const token = randomBytes(32).toString('base64url');
  await sql`DELETE FROM email_tokens WHERE user_id = ${userId} AND kind = ${tipo} AND used_at IS NULL`;
  await sql`
    INSERT INTO email_tokens (token_hash, user_id, kind, expires_at)
    VALUES (${sha256(token)}, ${userId}, ${tipo}, now() + make_interval(mins => ${minutos}))
  `;
  return token;
}

// Un solo UPDATE: dos peticiones con el mismo enlace a la vez no pueden
// gastarlo las dos. Devuelve el user_id, o null si no vale.
export async function gastarEnlace(token, tipo) {
  if (!token || typeof token !== 'string' || token.length > 100) return null;
  const { rows } = await sql`
    UPDATE email_tokens SET used_at = now()
    WHERE token_hash = ${sha256(token)} AND kind = ${tipo}
      AND used_at IS NULL AND expires_at > now()
    RETURNING user_id
  `;
  return rows.length ? rows[0].user_id : null;
}

// Para no mandar diez correos si alguien pulsa diez veces.
export async function enlaceReciente(userId, tipo) {
  const { rows } = await sql`
    SELECT 1 FROM email_tokens
    WHERE user_id = ${userId} AND kind = ${tipo} AND created_at > now() - interval '2 minutes'
  `;
  return rows.length > 0;
}

export function correoDeAprobacion(email) {
  return enviarCorreo(email, 'Tu cuenta de Víboras Team está aprobada', [
    'Hola,',
    '',
    'Un administrador ha aprobado tu cuenta. Ya puedes entrar:',
    `${urlDeLaApp()}/cuenta`,
    '',
    'Víboras Team'
  ].join('\n'));
}

export function correoDeRestablecer(email, token) {
  return enviarCorreo(email, 'Restablecer tu contraseña de Víboras Team', [
    'Hola,',
    '',
    'Alguien ha pedido restablecer la contraseña de esta cuenta. Si has sido tú,',
    'abre este enlace en la próxima hora:',
    `${urlDeLaApp()}/cuenta?restablecer=${token}`,
    '',
    'Si no lo has pedido tú, ignora este correo: tu contraseña no cambia.',
    '',
    'Víboras Team'
  ].join('\n'));
}

export function correoDeVerificacion(email, token) {
  return enviarCorreo(email, 'Confirma tu correo en Víboras Team', [
    'Hola,',
    '',
    'Para confirmar que este correo es tuyo, abre este enlace:',
    `${urlDeLaApp()}/cuenta?verificar=${token}`,
    '',
    'Tu cuenta sigue pendiente hasta que un administrador la apruebe.',
    '',
    'Víboras Team'
  ].join('\n'));
}
