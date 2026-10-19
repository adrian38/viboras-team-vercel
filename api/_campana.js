// Lo que pinta la campanita (auth-client.js). Una lista generica para que
// quepan otros avisos: los del propio jugador (_avisos.js: partidos por
// valorar, resultados editados) y, para administradores, las altas
// pendientes y el buzon. Vivia en `notifications` de api/auth.js, que llego al
// techo de 600 lineas. Detalle: ai_context/valoraciones_y_avisos.md
import { sql } from '@vercel/postgres';
import { avisosDeJugador } from './_avisos.js';
import { avisosDelBuzon } from './_buzon.js';

async function altasPendientes() {
  const { rows } = await sql`
    SELECT COALESCE(p.name, u.requested_player_name, u.email) AS quien, u.created_at
    FROM users u LEFT JOIN players p ON p.id = u.player_id
    WHERE u.status = 'pending'
    ORDER BY u.created_at DESC
    LIMIT 20
  `;
  return rows.map((r) => ({ tipo: 'alta', texto: `${r.quien} pide entrar`, cuando: r.created_at, enlace: '/cuenta' }));
}

export async function avisosDeCampana(user) {
  const items = await avisosDeJugador(user.player_id);
  if (user.role !== 'admin') return items;
  items.push(...await altasPendientes());
  items.push(...await avisosDelBuzon(user.id).catch((err) => { console.error('auth: buzon', err); return []; }));
  return items;
}
