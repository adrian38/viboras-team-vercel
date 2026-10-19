// Lo que pinta la campanita (auth-client.js). Una lista generica para que
// quepan otros avisos: los del propio jugador (_avisos.js: partidos por
// valorar, resultados editados) y, para administradores, las altas
// pendientes y el buzon. Vivia en `notifications` de api/auth.js, que llego al
// techo de 600 lineas. Detalle: ai_context/valoraciones_y_avisos.md
import { sql } from '@vercel/postgres';
import { ensureAuthSchema } from './_auth.js';
import { avisosDeJugador } from './_avisos.js';
import { avisosDelBuzon } from './_buzon.js';

let listo = null;

// «Limpiar todas» (2026-10-19): las claves de lo que habia en la campanita al
// pulsar. Cada aviso tiene una (`aviso:12`, `valorar:345`, `alta:7`,
// `buzon:3`), asi que lo que llegue despues vuelve a salir. No toca nada mas:
// el partido sigue por valorar en /valorar y el alta pendiente en /cuenta.
async function crearTabla() {
  await ensureAuthSchema();
  await sql`
    CREATE TABLE IF NOT EXISTS campana_descartes (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      clave TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, clave)
    )
  `;
}

function ensureCampanaSchema() {
  if (!listo) listo = crearTabla().catch((err) => { listo = null; throw err; });
  return listo;
}

async function altasPendientes() {
  const { rows } = await sql`
    SELECT u.id, COALESCE(p.name, u.requested_player_name, u.email) AS quien, u.created_at
    FROM users u LEFT JOIN players p ON p.id = u.player_id
    WHERE u.status = 'pending'
    ORDER BY u.created_at DESC
    LIMIT 20
  `;
  return rows.map((r) => ({ tipo: 'alta', clave: `alta:${r.id}`, texto: `${r.quien} pide entrar`, cuando: r.created_at, enlace: '/cuenta' }));
}

async function todos(user) {
  const items = await avisosDeJugador(user.player_id);
  if (user.role !== 'admin') return items;
  items.push(...await altasPendientes());
  items.push(...await avisosDelBuzon(user.id).catch((err) => { console.error('auth: buzon', err); return []; }));
  return items;
}

export async function avisosDeCampana(user) {
  await ensureCampanaSchema();
  const { rows } = await sql`SELECT clave FROM campana_descartes WHERE user_id = ${user.id}`;
  const descartados = new Set(rows.map((r) => r.clave));
  return (await todos(user)).filter((it) => !descartados.has(it.clave));
}

// Los avisos caducan a los 30 dias y los partidos se valoran 14: un descarte
// de mas de 60 ya no tapa nada.
export async function limpiarCampana(user) {
  await ensureCampanaSchema();
  const claves = (await todos(user)).map((it) => it.clave);
  await sql`
    INSERT INTO campana_descartes (user_id, clave)
    SELECT ${user.id}, unnest(${claves}::text[])
    ON CONFLICT DO NOTHING`;
  await sql`DELETE FROM campana_descartes WHERE user_id = ${user.id} AND created_at < now() - interval '60 days'`;
}
