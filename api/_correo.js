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
import dns from 'node:dns/promises';
import nodemailer from 'nodemailer';
import { LOGO_PNG_BASE64 } from './_logo.js';

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

// El logo va adjunto e incrustado (cid), no enlazado a la web: asi se ve igual
// en local que en produccion y Gmail no lo esconde como imagen externa.
const LOGO = { filename: 'viboras-team.png', content: Buffer.from(LOGO_PNG_BASE64, 'base64'), cid: 'logo@viboras' };

export async function enviarCorreo(para, asunto, mensaje) {
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
    await transporte.sendMail({
      from: conf.from, to: para, subject: asunto,
      text: textoPlano(mensaje), html: plantilla(mensaje), attachments: [LOGO]
    });
    return true;
  } catch (err) {
    console.error('correo: fallo al enviar', asunto, err && err.message);
    return false;
  }
}

const sha256 = (t) => createHash('sha256').update(String(t)).digest('hex');

// Que el dominio del correo exista y reciba correo: caza "gmial.com" y
// dominios inventados en el alta, antes de que el enlace de confirmar se
// pierda. Solo dice "no" con una respuesta clara del DNS (el dominio no
// existe, o no tiene MX ni direccion). Si el DNS falla o tarda, deja pasar:
// no se bloquea a nadie por un problema que no es suyo.
const SIN_DOMINIO = new Set(['ENOTFOUND', 'ENODATA', 'NXDOMAIN']);

async function consultaDns(fn, dominio) {
  const limite = new Promise((resolve) => setTimeout(() => resolve('tiempo'), 3000));
  try {
    return await Promise.race([fn(dominio), limite]);
  } catch (err) {
    return SIN_DOMINIO.has(err && err.code) ? [] : 'tiempo';
  }
}

// El DNS no caza las erratas: "gmial.com" existe y tiene MX, como muchos
// dominios registrados justo para recoger el correo mal escrito. Lo que esta a
// una letra (o dos cambiadas de sitio) de un proveedor conocido, sin serlo, se
// toma por errata.
const PROVEEDORES = [
  'gmail.com', 'googlemail.com', 'hotmail.com', 'hotmail.es', 'outlook.com', 'outlook.es',
  'live.com', 'live.es', 'msn.com', 'yahoo.com', 'yahoo.es', 'ymail.com', 'icloud.com',
  'me.com', 'mail.com', 'gmx.com', 'gmx.es', 'protonmail.com', 'proton.me', 'telefonica.net'
];

// Distancia de edicion con trasposiciones (OSA), cortada en 2.
function distancia(a, b) {
  if (Math.abs(a.length - b.length) > 1) return 2;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const coste = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + coste);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

// El motivo por el que ese correo no vale, o null si vale.
export async function problemaDeCorreo(email) {
  const dominio = String(email || '').split('@')[1] || '';
  if (!PROVEEDORES.includes(dominio)) {
    const parecido = PROVEEDORES.find((p) => distancia(dominio, p) === 1);
    if (parecido) return `¿Querías decir @${parecido}? Revisa lo que va detrás de la @.`;
  }
  if (!await dominioRecibeCorreo(dominio)) return 'Ese correo no existe: revisa lo que va detrás de la @.';
  return null;
}

async function dominioRecibeCorreo(dominio) {
  if (!dominio) return false;
  const mx = await consultaDns(dns.resolveMx, dominio);
  if (mx === 'tiempo') return true;
  // Un MX "." (RFC 7505) es el dominio diciendo que no recibe correo.
  if (mx.some((r) => r.exchange && r.exchange !== '.')) return true;
  if (mx.length) return false;
  // Sin MX, el correo va a la direccion del dominio (RFC 5321).
  const ip = await consultaDns(dns.resolve4, dominio);
  if (ip === 'tiempo' || ip.length) return true;
  const ip6 = await consultaDns(dns.resolve6, dominio);
  return ip6 === 'tiempo' || ip6.length > 0;
}

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

// Un mensaje es { titulo, parrafos[], boton: { texto, url }, nota }. De ahi
// salen las dos versiones: HTML para quien lo ve y texto para quien no.

const escapar = (t) => String(t).replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));

function textoPlano({ titulo, parrafos, boton, nota }) {
  return [titulo, ...parrafos, `${boton.texto}: ${boton.url}`, nota, '— Víboras Team']
    .filter(Boolean).join('\n\n');
}

// HTML de correo: tablas y estilos en linea, que es lo unico que respetan
// Gmail y Outlook. Cabecera oscura y oro como la app; cuerpo claro, que se
// lee bien en cualquier cliente.
function plantilla({ titulo, parrafos, boton, nota }) {
  const p = (t) => `<p style="margin:0 0 16px;font-size:15px;line-height:24px;color:#33343a">${escapar(t)}</p>`;
  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapar(titulo)}</title></head>
<body style="margin:0;padding:0;background:#ececee">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ececee;padding:24px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;border-radius:14px;overflow:hidden;font-family:Arial,Helvetica,sans-serif">
<tr><td align="center" style="background:#121316;padding:28px 24px 22px;border-bottom:3px solid #f59e0b">
<img src="cid:${LOGO.cid}" width="72" height="72" alt="Víboras Team" style="display:block;border:0;border-radius:12px">
<div style="margin-top:12px;font-size:20px;font-weight:800;letter-spacing:2px;color:#ffffff">VÍBORAS <span style="color:#f59e0b">TEAM</span></div>
</td></tr>
<tr><td style="background:#ffffff;padding:32px 32px 16px">
<h1 style="margin:0 0 20px;font-size:22px;line-height:30px;color:#121316">${escapar(titulo)}</h1>
${parrafos.map(p).join('\n')}
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px"><tr>
<td style="background:#f59e0b;border-radius:10px">
<a href="${escapar(boton.url)}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:700;color:#121316;text-decoration:none">${escapar(boton.texto)}</a>
</td></tr></table>
${nota ? `<p style="margin:0 0 16px;font-size:13px;line-height:20px;color:#6b6d75">${escapar(nota)}</p>` : ''}
</td></tr>
<tr><td style="background:#f6f6f7;padding:18px 32px;font-size:12px;line-height:18px;color:#8a8c93">
Si el botón no funciona, copia este enlace en el navegador:<br>
<a href="${escapar(boton.url)}" style="color:#b7791f;word-break:break-all">${escapar(boton.url)}</a>
<div style="margin-top:12px">Víboras Team · grupo de pádel</div>
</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

export function correoDeAprobacion(email) {
  return enviarCorreo(email, 'Tu cuenta de Víboras Team está aprobada', {
    titulo: '¡Ya estás dentro!',
    parrafos: ['Un administrador ha aprobado tu cuenta. Ya puedes entrar en la app del grupo: resultados, rating, ligas y torneos.'],
    boton: { texto: 'Entrar en Víboras Team', url: `${urlDeLaApp()}/cuenta` }
  });
}

// Al rechazar, la cuenta se borra entera (api/auth.js, rejectUser), con su
// formulario de inscripcion: por eso la nota lo dice.
export function correoDeRechazo(email) {
  return enviarCorreo(email, 'Tu solicitud en Víboras Team', {
    titulo: 'Tu solicitud no ha sido aprobada',
    parrafos: [
      'Gracias por tu interés en Víboras Team. Un administrador ha revisado tu solicitud y, por ahora, no ha sido aprobada.',
      'Si crees que es un error o quieres saber más, habla con un administrador del grupo.'
    ],
    boton: { texto: 'Ver la normativa del grupo', url: `${urlDeLaApp()}/group-normativa` },
    nota: 'Hemos borrado tu cuenta y los datos de tu formulario de inscripción.'
  });
}

export function correoDeRestablecer(email, token) {
  return enviarCorreo(email, 'Restablecer tu contraseña de Víboras Team', {
    titulo: 'Restablecer tu contraseña',
    parrafos: ['Alguien ha pedido una contraseña nueva para esta cuenta. Si has sido tú, pulsa el botón y elígela.'],
    boton: { texto: 'Elegir contraseña nueva', url: `${urlDeLaApp()}/cuenta?restablecer=${token}` },
    nota: 'El enlace vale una hora y se puede usar una sola vez. Si no lo has pedido tú, ignora este correo: tu contraseña no cambia.'
  });
}

export function correoDeVerificacion(email, token) {
  return enviarCorreo(email, 'Confirma tu correo en Víboras Team', {
    titulo: 'Confirma tu correo',
    parrafos: [
      'Gracias por registrarte en Víboras Team.',
      'Pulsa el botón para confirmar que este correo es tuyo. Tu cuenta seguirá pendiente hasta que un administrador la apruebe; te avisaremos por aquí.'
    ],
    boton: { texto: 'Confirmar mi correo', url: `${urlDeLaApp()}/cuenta?verificar=${token}` },
    nota: 'El enlace vale 7 días. Si no te has registrado tú, ignora este correo.'
  });
}
