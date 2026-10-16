// Piezas de las cuentas: esquema, contrasenas, cookies y sesiones.
//
// Las tablas NO se crean dentro de ensureSchema() de _db.js, aunque sea "el
// esquema que corre". Dos motivos, y el segundo es el que manda:
//
//   1. Son de otra cosa. ensureSchema() monta el padel; esto monta las cuentas.
//   2. tools/code-size-baseline.json tiene clavada `api/_db.js:ensureSchema`
//      en 122 lineas y el trinquete solo deja encoger: una sola linea dentro
//      de su cuerpo rompe `npm run check`.
//
// Quien llame a ensureAuthSchema() tiene que haber llamado antes a
// ensureSchema(): users.player_id referencia players(id), y en una base virgen
// la clave ajena falla si players no existe todavia.
//
// Detalle: ai_context/cuentas_y_sesiones.md
import { sql } from '@vercel/postgres';
import { randomBytes, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { ensureSchema } from './_db.js';

const COOKIE = 'vt_session';
const DIAS_DE_SESION = 30;

// Ventana deslizante, no bloqueo duro: los correos del grupo son adivinables y
// un bloqueo permanente seria una forma trivial de dejar a alguien fuera.
const FALLOS_PARA_BLOQUEAR = 8;
const MINUTOS_DE_BLOQUEO = 15;

// 128 * N * r = 16 MB, por debajo del maxmem por defecto de 32 MB. Subir N a
// 32768 revienta con ERR_CRYPTO_INVALID_SCRYPT_PARAMS.
const SCRYPT = { N: 16384, r: 8, p: 1, bytes: 64 };

// Sal fija para quemar el mismo tiempo cuando el correo no existe. Sin esto,
// "no hay nadie con ese correo" se nota en el cronometro.
const SAL_DE_DESCARTE = Buffer.alloc(16, 7);

let authReady = null;

async function tablaUsuarios() {
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT,
      player_id INTEGER REFERENCES players(id) ON DELETE SET NULL,
      requested_player_name TEXT,
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'active', 'blocked')),
      role TEXT NOT NULL DEFAULT 'member'
        CHECK (role IN ('member', 'admin')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      approved_at TIMESTAMPTZ,
      failed_attempts INTEGER NOT NULL DEFAULT 0,
      locked_until TIMESTAMPTZ
    )
  `;

  // Quien se registra sin estar en la lista de jugadores deja aqui el nombre
  // que pide; la ficha no se crea hasta que un administrador aprueba, para que
  // un alta que nadie aprueba no ensucie `players`.
  //
  // El ALTER no sobra: CREATE TABLE IF NOT EXISTS no migra una tabla que ya
  // existe, asi que sin esto la columna no aparece donde la tabla ya estaba
  // creada. Mismo caso que leagues.substitution_groups en _db.js:27.
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS requested_player_name TEXT`;

  // Parcial y no UNIQUE a secas: con UNIQUE, cualquiera registra una cuenta
  // reclamando el jugador de otro y lo deja fuera para siempre, aunque su
  // cuenta no se apruebe nunca. Asi varios pendientes compiten y decide el
  // administrador.
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS users_player_activo_idx
    ON users(player_id) WHERE status = 'active'
  `;
}

async function tablaIdentidades() {
  // `provider` va sin CHECK a proposito: un CHECK queda congelado el dia del
  // primer despliegue (CREATE TABLE IF NOT EXISTS no migra lo que ya existe) y
  // anadir Apple manana exigiria un ALTER a mano contra produccion. Se valida
  // en JavaScript.
  await sql`
    CREATE TABLE IF NOT EXISTS identities (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      provider TEXT NOT NULL,
      subject TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (provider, subject)
    )
  `;
}

async function tablaSesiones() {
  // Se guarda el SHA-256 del token, no el token: quien lea la tabla no puede
  // hacerse pasar por nadie.
  await sql`
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_at TIMESTAMPTZ NOT NULL
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id)`;
}

async function crearTablas() {
  await tablaUsuarios();
  await tablaIdentidades();
  await tablaSesiones();
}

export function ensureAuthSchema() {
  if (!authReady) {
    // Dos lambdas frios a la vez ejecutando CREATE TABLE IF NOT EXISTS pueden
    // chocar en pg_type; un reintento lo cubre.
    authReady = crearTablas().catch((err) => {
      console.error('auth:ensureAuthSchema reintento', err);
      return crearTablas();
    });
    // Una promesa rechazada cacheada deja al lambda roto hasta que lo reciclen.
    authReady.catch(() => { authReady = null; });
  }
  return authReady;
}

function sha256(texto) {
  return createHash('sha256').update(String(texto)).digest('hex');
}

function derivar(password, salt, bytes, parametros) {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, bytes, parametros, (err, dk) => {
      if (err) reject(err); else resolve(dk);
    });
  });
}

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const dk = await derivar(String(password), salt, SCRYPT.bytes, SCRYPT);
  const cabecera = `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}`;
  return `${cabecera}$${salt.toString('base64')}$${dk.toString('base64')}`;
}

export async function verifyPassword(password, guardado) {
  const partes = String(guardado || '').split('$');
  if (partes.length !== 6 || partes[0] !== 'scrypt') return false;
  const N = Number(partes[1]);
  const r = Number(partes[2]);
  const p = Number(partes[3]);
  if (!N || !r || !p) return false;
  const salt = Buffer.from(partes[4], 'base64');
  const esperado = Buffer.from(partes[5], 'base64');
  if (!salt.length || !esperado.length) return false;
  let dk = null;
  try {
    dk = await derivar(String(password), salt, esperado.length, { N, r, p });
  } catch (err) {
    console.error('auth:verifyPassword scrypt', err);
    return false;
  }
  // timingSafeEqual lanza si los buffers miden distinto.
  if (dk.length !== esperado.length) return false;
  return timingSafeEqual(dk, esperado);
}

export async function gastarTiempoDeHash(password) {
  try {
    await derivar(String(password || ''), SAL_DE_DESCARTE, SCRYPT.bytes, SCRYPT);
  } catch { /* el tiempo ya se ha gastado, que es de lo que se trata */ }
}

export function leerCookies(req) {
  const crudo = String(req.headers?.cookie || '');
  const out = {};
  for (const trozo of crudo.split(';')) {
    const corte = trozo.indexOf('=');
    if (corte < 0) continue;
    const clave = trozo.slice(0, corte).trim();
    if (!clave) continue;
    try {
      out[clave] = decodeURIComponent(trozo.slice(corte + 1).trim());
    } catch {
      out[clave] = trozo.slice(corte + 1).trim();
    }
  }
  return out;
}

// Vercel siempre pone x-forwarded-proto; el express de docker/ no. Mirar el
// host buscando "localhost" fallaria con 127.0.0.1 y con 192.168.x.x:3000, que
// es justo como se prueba desde el movil.
function esHttps(req) {
  const xfp = String(req.headers?.['x-forwarded-proto'] || '').split(',')[0];
  return xfp.trim() === 'https';
}

function cabeceraDeCookie(req, valor, segundos) {
  const partes = [`${COOKIE}=${valor}`, 'Path=/', 'HttpOnly', 'SameSite=Lax'];
  partes.push(`Max-Age=${segundos}`);
  if (esHttps(req)) partes.push('Secure');
  return partes.join('; ');
}

export function sinCache(res) {
  res.setHeader('cache-control', 'no-store');
  res.setHeader('vary', 'Cookie');
}

export async function crearSesion(req, res, userId) {
  const token = randomBytes(32).toString('hex');
  const dias = `${DIAS_DE_SESION} days`;
  await sql`
    INSERT INTO sessions (token_hash, user_id, expires_at)
    VALUES (${sha256(token)}, ${userId}, now() + ${dias}::interval)
  `;
  const segundos = 60 * 60 * 24 * DIAS_DE_SESION;
  res.setHeader('Set-Cookie', cabeceraDeCookie(req, token, segundos));
}

export async function cerrarSesionDeLaCookie(req, res) {
  const token = leerCookies(req)[COOKIE];
  if (token) {
    await sql`DELETE FROM sessions WHERE token_hash = ${sha256(token)}`;
  }
  res.setHeader('Set-Cookie', cabeceraDeCookie(req, '', 0));
}

export async function cerrarSesionesDe(userId) {
  await sql`DELETE FROM sessions WHERE user_id = ${userId}`;
}

export async function limpiarSesionesCaducadas() {
  await sql`DELETE FROM sessions WHERE expires_at < now()`;
}

// El JOIN con users y el filtro por status no son adorno: sin ellos, bloquear
// a alguien no le cierra la sesion y su cookie de 30 dias sigue valiendo.
export async function usuarioDeLaPeticion(req) {
  const token = leerCookies(req)[COOKIE];
  if (!token) return null;
  const { rows } = await sql`
    SELECT u.id, u.email, u.role, u.player_id,
           p.name AS player_name, p.active AS player_active
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    LEFT JOIN players p ON p.id = u.player_id
    WHERE s.token_hash = ${sha256(token)}
      AND s.expires_at > now()
      AND u.status = 'active'
  `;
  return rows.length ? rows[0] : null;
}

// El guardia de toda la app desde el 2026-10-16. Lo llaman los handlers de
// read.js, write.js y league-admin.js antes de mirar el `action`, asi que crea
// el esquema el mismo: sus acciones lo hacian por dentro, despues del switch,
// y para entonces ya hace falta la tabla sessions. Las dos son memoizadas.
// No lanza nunca: los tres handlers que lo llaman no tienen try/catch propio
// —cada accion monta el suyo por dentro— y una excepcion aqui saldria como un
// 500 sin cuerpo. Devolver null en los dos casos deja la llamada en una linea,
// que es todo el presupuesto que hay en league-admin.js.
export async function exigirSesion(req, res) {
  try {
    await ensureSchema();
    await ensureAuthSchema();
    const user = await usuarioDeLaPeticion(req);
    if (user) return user;
    res.status(401).json({
      ok: false,
      error: 'unauthorized',
      message: 'Entra en /cuenta para usar la aplicación.'
    });
  } catch (err) {
    console.error('auth:exigirSesion error', err);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
  return null;
}

export async function exigirAdmin(req, res) {
  const user = await usuarioDeLaPeticion(req);
  if (!user) {
    res.status(401).json({ ok: false, error: 'unauthorized' });
    return null;
  }
  if (user.role !== 'admin') {
    res.status(403).json({ ok: false, error: 'forbidden' });
    return null;
  }
  return user;
}

export function normalizarCorreo(valor) {
  return String(valor || '').trim().toLowerCase();
}

export function correoValido(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) && email.length <= 180;
}

// Minimo 6 por decision del grupo (2026-10-16); antes era 10. Contra un
// ataque por diccionario queda el bloqueo por intentos fallidos.
export function passwordValida(password) {
  return typeof password === 'string' && password.length >= 6 && password.length <= 200;
}

// Quien esta en ADMIN_EMAILS nace administrador, pero solo por Google: el
// registro con contrasena no verifica el correo, asi que si valiese para esa
// via bastaria con saber la direccion para hacerse administrador.
export function esCorreoDeAdmin(email) {
  const lista = String(process.env.ADMIN_EMAILS || '').split(',');
  return lista.map((x) => normalizarCorreo(x)).filter(Boolean).includes(email);
}

export async function anotarFallo(userId) {
  const bloqueo = `${MINUTOS_DE_BLOQUEO} minutes`;
  await sql`
    UPDATE users
    SET failed_attempts = failed_attempts + 1,
        locked_until = CASE
          WHEN failed_attempts + 1 >= ${FALLOS_PARA_BLOQUEAR}
          THEN now() + ${bloqueo}::interval
          ELSE locked_until
        END
    WHERE id = ${userId}
  `;
}

export async function limpiarFallos(userId) {
  await sql`UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = ${userId}`;
}

// Segundos que faltan para poder reintentar, o 0. Si el bloqueo ya expiro lo
// borra: la ventana desliza sola y nadie tiene que desbloquear a mano.
export async function bloqueoPendiente(user) {
  if (!user.locked_until) return 0;
  const falta = new Date(user.locked_until).getTime() - Date.now();
  if (falta > 0) return Math.ceil(falta / 1000);
  await limpiarFallos(user.id);
  return 0;
}
