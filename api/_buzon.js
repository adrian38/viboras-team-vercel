// Buzon de quejas y sugerencias (/buzon): cualquier miembro escribe, solo los
// administradores leen. Cada mensaje nuevo avisa a los administradores en la
// campanita y por push. Detalle: ai_context/buzon_de_quejas.md
import { sql } from '@vercel/postgres';
import { ensureAuthSchema } from './_auth.js';
import { pushAAdmins, pushAJugadores } from './_push.js';
import { ensureAvisosSchema } from './_avisos.js';

export const TIPOS = { queja: 'Queja', sugerencia: 'Sugerencia' };
export const LARGO_MAXIMO = 2000;
// Mensajes por cuenta y hora: cada uno es un push a todos los administradores.
export const POR_HORA = 5;

let listo = null;

// Fuera de ensureSchema, que esta en el techo de tamano, como avisos y
// push_subscriptions. `tipo` sin CHECK: CREATE TABLE IF NOT EXISTS no migraria
// uno nuevo; lo valida la funcion. Lo leido es por administrador: que uno lo
// lea no se lo quita de la campanita a los demas.
async function crearTablas() {
  await ensureAuthSchema();
  await sql`
    CREATE TABLE IF NOT EXISTS buzon (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      tipo TEXT NOT NULL,
      texto TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS buzon_leidos (
      mensaje_id INTEGER NOT NULL REFERENCES buzon(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      leido_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (mensaje_id, user_id)
    )
  `;
  // Desde el 2026-10-19: un administrador lo marca procesado y al autor le
  // llega un aviso. ALTER y no columnas en el CREATE: la tabla ya existe.
  await sql`ALTER TABLE buzon ADD COLUMN IF NOT EXISTS procesado_at TIMESTAMPTZ`;
  await sql`ALTER TABLE buzon ADD COLUMN IF NOT EXISTS procesado_por INTEGER REFERENCES users(id) ON DELETE SET NULL`;
}

export function ensureBuzonSchema() {
  if (!listo) listo = crearTablas().catch((err) => { listo = null; throw err; });
  return listo;
}

function quienEscribe(user) {
  return user.player_name || user.email;
}

// El push no lleva el texto: saldria en la pantalla bloqueada del movil.
export async function guardarMensaje(user, tipo, texto) {
  await ensureBuzonSchema();
  await sql`INSERT INTO buzon (user_id, tipo, texto) VALUES (${user.id}, ${tipo}, ${texto})`;
  await pushAAdmins({ texto: `${TIPOS[tipo]} nueva de ${quienEscribe(user)} en el buzón`, enlace: '/buzon' });
}

export async function enviadosEnLaUltimaHora(userId) {
  await ensureBuzonSchema();
  const { rows } = await sql`
    SELECT count(*)::int AS n FROM buzon
    WHERE user_id = ${userId} AND created_at > now() - interval '1 hour'`;
  return rows[0].n;
}

// Todo el buzon, lo mas nuevo arriba, con `nuevo` si este administrador aun
// no lo habia visto.
export async function mensajesParaAdmin(adminId) {
  await ensureBuzonSchema();
  const { rows } = await sql`
    SELECT b.id, b.tipo, b.texto, b.created_at, b.procesado_at,
      COALESCE(p.name, u.requested_player_name, u.email, 'Cuenta borrada') AS quien,
      COALESCE(pp.name, up.email) AS procesado_por,
      l.mensaje_id IS NULL AS nuevo
    FROM buzon b
    LEFT JOIN users u ON u.id = b.user_id
    LEFT JOIN players p ON p.id = u.player_id
    LEFT JOIN users up ON up.id = b.procesado_por
    LEFT JOIN players pp ON pp.id = up.player_id
    LEFT JOIN buzon_leidos l ON l.mensaje_id = b.id AND l.user_id = ${adminId}
    ORDER BY b.created_at DESC, b.id DESC
    LIMIT 200`;
  return rows.map((r) => ({
    id: r.id, tipo: r.tipo, texto: r.texto, cuando: r.created_at, quien: r.quien, nuevo: r.nuevo,
    procesado: r.procesado_at, procesadoPor: r.procesado_por
  }));
}

// Lo marca procesado y da las gracias al autor: campanita y push. Solo la
// primera vez: dos administradores a la vez no mandan dos avisos. Devuelve
// false si ya lo estaba o no existe. El aviso no lleva el texto del mensaje,
// como el push a los administradores.
export async function marcarProcesado(adminId, mensajeId) {
  await ensureBuzonSchema();
  const { rows } = await sql`
    UPDATE buzon SET procesado_at = now(), procesado_por = ${adminId}
    WHERE id = ${mensajeId} AND procesado_at IS NULL
    RETURNING tipo, created_at, (SELECT player_id FROM users WHERE id = buzon.user_id) AS player_id`;
  if (!rows.length) return false;
  const { tipo, created_at: cuando, player_id: playerId } = rows[0];
  if (!playerId) return true;
  const dia = new Date(cuando).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', timeZone: 'Europe/Madrid' });
  const cual = tipo === 'queja' ? 'tu queja' : 'tu sugerencia';
  const texto = `Gracias por ${cual} del ${dia}: ya la hemos procesado.`;
  await ensureAvisosSchema();
  await sql`INSERT INTO avisos (player_id, texto, enlace) VALUES (${playerId}, ${texto}, '/buzon')`;
  await pushAJugadores([playerId], { texto, enlace: '/buzon' });
  return true;
}

// Hasta un id y no «todo»: lo que llegue mientras la pagina esta abierta
// sigue nuevo.
export async function marcarLeidos(adminId, hasta) {
  await ensureBuzonSchema();
  await sql`
    INSERT INTO buzon_leidos (mensaje_id, user_id)
    SELECT id, ${adminId} FROM buzon WHERE id <= ${hasta}
    ON CONFLICT DO NOTHING`;
}

// Para la campanita de un administrador: lo que el no ha leido y nadie ha
// procesado. Procesado por uno, sale de la campanita de todos (2026-10-19).
export async function avisosDelBuzon(adminId) {
  await ensureBuzonSchema();
  const { rows } = await sql`
    SELECT b.tipo, b.created_at, COALESCE(p.name, u.email, 'alguien') AS quien
    FROM buzon b
    LEFT JOIN users u ON u.id = b.user_id
    LEFT JOIN players p ON p.id = u.player_id
    WHERE NOT EXISTS (SELECT 1 FROM buzon_leidos l WHERE l.mensaje_id = b.id AND l.user_id = ${adminId})
      AND b.procesado_at IS NULL
      AND b.created_at > now() - interval '30 days'
    ORDER BY b.created_at DESC LIMIT 20`;
  return rows.map((r) => ({
    tipo: 'buzon', texto: `${TIPOS[r.tipo] || 'Mensaje'} de ${r.quien} en el buzón`, cuando: r.created_at, enlace: '/buzon'
  }));
}
