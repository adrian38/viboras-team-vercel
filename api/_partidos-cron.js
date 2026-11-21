// Los recordatorios de un partido previsto: cuando se abre la reserva de
// pista, cuando llega el dia y cuando toca meter el resultado.
//
// Son seis como mucho y van SOLO a los apuntados en el instante del envio,
// que se leen de la base en ese momento. Quien se apunta tarde recibe los que
// aun no han salido; quien se borra entre dos, no recibe el siguiente.
//
// | clave       | cuando (hora peninsular)                                  |
// | ----------- | --------------------------------------------------------- |
// | 48h         | 10:00 del dia en que se abre la reserva, SIEMPRE           |
// | reserva:1   | 30 min antes de abrirse la franja de la primera hora       |
// | reserva:2   | solo en los de 2 h: 30 min antes de la segunda franja      |
// | dia         | 10:00 del dia del partido, o las 18:00 del dia antes si    |
// |             | el partido es antes de las 10:00                           |
// | 2h          | 2 h antes de empezar                                       |
// | resultado   | 10:00 del dia siguiente, si nadie lo ha cerrado            |
//
// Con un partido temprano el `reserva:1` llega ANTES que el `48h`: partido el
// jueves a las 8:00 -> reserva:1 el martes a las 7:30 y 48h el martes a las
// 10:00. Es lo decidido, no un fallo, y por eso el texto del `48h` pregunta
// «¿ya la teneis?» en vez de dar por hecho que nadie ha reservado.
//
// La hora local sale de AT TIME ZONE 'Europe/Madrid' EN LA CONSULTA, no del
// horario del cron: Postgres conoce el cambio de hora y el cron solo decide
// cuando se mira.
//
// Detalle: ai_context/recordatorios_y_cron.md
import { sql } from '@vercel/postgres';
import { crearAviso } from './_avisos.js';
import { partidoDice, cuandoDice } from './_partidos-avisos.js';

// Mas alla de esto no se manda nada, solo se marca. Un cron parado medio dia,
// un despliegue tras una caida o una base restaurada de un volcado no pueden
// vomitar avisos viejos.
const VENTANA_HORAS = 6;

// Los seis instantes de un partido, calculados en SQL. `reserva:2` sale NULL
// en los de una hora: una sola franja que reservar, un solo aviso.
const INSTANTES = `
  CROSS JOIN LATERAL (VALUES
    ('48h', ((date_trunc('day', (p.empieza_at - interval '48 hours') AT TIME ZONE 'Europe/Madrid') + time '10:00') AT TIME ZONE 'Europe/Madrid')),
    ('reserva:1', p.empieza_at - interval '48 hours 30 minutes'),
    ('reserva:2', CASE WHEN p.duracion_min >= 120 THEN p.empieza_at - interval '47 hours 30 minutes' ELSE NULL::timestamptz END),
    ('dia', CASE WHEN (p.empieza_at AT TIME ZONE 'Europe/Madrid')::time < time '10:00'
        THEN ((date_trunc('day', p.empieza_at AT TIME ZONE 'Europe/Madrid') - interval '1 day' + time '18:00') AT TIME ZONE 'Europe/Madrid')
        ELSE ((date_trunc('day', p.empieza_at AT TIME ZONE 'Europe/Madrid') + time '10:00') AT TIME ZONE 'Europe/Madrid') END),
    ('2h', p.empieza_at - interval '2 hours'),
    ('resultado', ((date_trunc('day', p.empieza_at AT TIME ZONE 'Europe/Madrid') + interval '1 day' + time '10:00') AT TIME ZONE 'Europe/Madrid'))
  ) AS x(clave, cuando)`;

// Al crear o al mover un partido, los avisos cuyo instante ya paso nacen
// marcados como omitidos. No hay aviso de recuperacion: decir «hoy se abre la
// reserva» cuando se abrio hace dos dias seria mentir.
//
// Y no es un caso raro: todo partido convocado con menos de 48 h 30 min de
// antelacion nace sin los avisos de reserva. La pantalla lo dice al crearlo.
export async function sellarVencidos(partidoId) {
  await sql.query(`
    INSERT INTO partido_avisos (partido_id, clave, omitido)
    SELECT p.id, x.clave, TRUE
    FROM partidos_previstos p ${INSTANTES}
    WHERE p.id = $1 AND x.cuando IS NOT NULL AND x.cuando <= now()
    ON CONFLICT DO NOTHING`, [partidoId]);
}

// Lo que vence en esta pasada: sin resolver, dentro de la ventana, y del lado
// correcto del partido —`resultado` mira a los ya jugados y los otros cinco a
// los que aun no han empezado—.
async function vencidos() {
  const { rows } = await sql.query(`
    SELECT p.id, p.empieza_at, p.duracion_min, p.sede, p.sede_libre, x.clave, x.cuando
    FROM partidos_previstos p ${INSTANTES}
    WHERE p.cancelado_at IS NULL AND p.cerrado_at IS NULL
      AND x.cuando IS NOT NULL
      AND x.cuando <= now() AND x.cuando > now() - interval '${VENTANA_HORAS} hours'
      AND (CASE WHEN x.clave = 'resultado' THEN p.empieza_at < now() ELSE p.empieza_at > now() END)
      AND NOT EXISTS (SELECT 1 FROM partido_avisos a WHERE a.partido_id = p.id AND a.clave = x.clave)
    ORDER BY p.id, x.cuando`);
  return rows;
}

// Marcar es tambien el candado: cero filas significa que otra pasada se
// adelanto, y entonces no se manda nada. Se marca ANTES de avisar, igual que
// marcarProcesado en _buzon.js. El precio es que un fallo de web-push pierde
// ese aviso, que aqui es lo correcto: mejor perder uno que mandar veinte.
async function marcar(partidoId, clave, omitido) {
  const { rows } = await sql`
    INSERT INTO partido_avisos (partido_id, clave, omitido)
    VALUES (${partidoId}, ${clave}, ${omitido})
    ON CONFLICT DO NOTHING
    RETURNING partido_id`;
  return rows.length > 0;
}

const horaDe = (fila, desplazamiento) => new Date(
  new Date(fila.empieza_at).getTime() + desplazamiento
).toLocaleTimeString('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' });

// Cada aviso dice lo suyo y se sostiene aunque llegue fuera de orden.
function textoDe(clave, fila) {
  if (clave === '48h') {
    return `Hoy se abre la reserva de pista para vuestro partido del ${partidoDice(fila)}. ¿Ya la tenéis?`;
  }
  if (clave === 'reserva:1') {
    return `Dentro de 30 min se abre la reserva de la franja de las ${horaDe(fila, 0)} para vuestro partido del ${cuandoDice(fila)}.`;
  }
  if (clave === 'reserva:2') {
    return `Dentro de 30 min se abre la segunda franja, la de las ${horaDe(fila, 3600000)}, de vuestro partido del ${cuandoDice(fila)}.`;
  }
  if (clave === 'dia') {
    const hoy = new Date(fila.empieza_at).toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' })
      === new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' });
    return `${hoy ? 'Hoy' : 'Mañana'} jugáis: ${partidoDice(fila)}.`;
  }
  if (clave === '2h') return `En 2 horas: ${partidoDice(fila)}.`;
  return `¿Qué tal ayer? Meted el resultado del partido del ${partidoDice(fila)}.`;
}

async function apuntadosDe(partidoId) {
  const { rows } = await sql`
    SELECT player_id FROM partido_plazas WHERE partido_id = ${partidoId} ORDER BY puesto`;
  return rows.map((r) => r.player_id);
}

const enlaceDe = (clave, id) => (clave === 'resultado' ? '/partidos' : `/partido?id=${id}`);

// Manda uno. Si no queda nadie apuntado se marca consumido y no se manda
// nada: el aviso existia para ellos. El de `resultado` ademas exige los
// cuatro, porque un partido que se quedo a tres no se jugo.
async function mandar(fila) {
  if (!await marcar(fila.id, fila.clave, false)) return false;
  const jugadores = await apuntadosDe(fila.id);
  if (!jugadores.length) return false;
  if (fila.clave === 'resultado' && jugadores.length < 4) return false;
  await crearAviso(jugadores, textoDe(fila.clave, fila), enlaceDe(fila.clave, fila.id));
  return true;
}

// Una pasada entera.
//
// Si a un mismo partido le vencen dos avisos a la vez se manda solo el de
// instante mas tardio —el mas inminente, y el que contiene al anterior— y los
// otros se marcan omitidos. Dos pushes del mismo partido en el mismo minuto
// son ruido.
export async function pasada() {
  const filas = await vencidos();
  const porPartido = new Map();
  for (const f of filas) {
    const previo = porPartido.get(f.id);
    if (!previo || new Date(f.cuando) > new Date(previo.cuando)) porPartido.set(f.id, f);
  }
  let mandados = 0;
  let omitidos = 0;
  for (const f of filas) {
    const elegido = porPartido.get(f.id);
    if (f.clave === elegido.clave) {
      if (await mandar(f)) mandados += 1; else omitidos += 1;
    } else if (await marcar(f.id, f.clave, true)) {
      omitidos += 1;
    }
  }
  return { mirados: filas.length, mandados, omitidos };
}
