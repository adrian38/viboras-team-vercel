// Las lecturas de los partidos previstos: mis partidos, los abiertos del
// grupo, el detalle de uno y el numero de la pestana. Separadas de
// _partidos.js para que ninguno de los dos se acerque al techo de 600 lineas.
//
// `mios` y `abiertos` son dos consultas y no una con dos listas: cada pantalla
// pide la suya y no paga por la otra.
//
// La lista de columnas esta repetida en las tres consultas a proposito: el
// `sql` de @vercel/postgres no compone fragmentos, cada ${} suyo es un
// parametro. Una constante con el SELECT dentro no pegaria texto, pasaria una
// cadena como valor y romperia la consulta.
//
// Detalle: ai_context/partidos_previstos.md
import { sql } from '@vercel/postgres';
import { ensurePartidosSchema, nombreDeSede, pistasDeSede, nivelesDice } from './_partidos.js';
import { ensureRatingSchema } from './_rating.js';

// Las cuatro plazas de un partido, siempre las cuatro: las libres salen con
// `playerId` nulo para que la pagina no tenga que inventarse los huecos.
//
// `categoria` es la que guardo el ultimo recalculo en `players` (ver
// api/_rating.js). Puede venir nula —quien no tiene partidos no tiene
// rating— y entonces la tarjeta no ensena nivel: no hay nivel que ensenar.
function plazasDe(filas, partidoId) {
  return [1, 2, 3, 4].map((puesto) => {
    const f = filas.find((p) => p.partido_id === partidoId && p.puesto === puesto);
    return f
      ? { puesto, playerId: f.player_id, nombre: f.nombre, categoria: f.categoria || null }
      : { puesto, playerId: null, nombre: null, categoria: null };
  });
}

// La fila cruda de la base, ya pintable. `empieza` va en ISO y la pagina lo
// pasa a hora peninsular: aqui no se compone ninguna fecha para ensenar.
function aPartido(fila, plazas, playerId) {
  const ocupadas = plazas.filter((p) => p.playerId);
  return {
    id: fila.id,
    empieza: fila.empieza_at,
    duracion: fila.duracion_min,
    sede: fila.sede,
    sedeNombre: nombreDeSede(fila),
    sedePistas: pistasDeSede(fila),
    niveles: fila.niveles || [],
    nivelesTexto: nivelesDice(fila.niveles),
    creadorId: fila.creador_player_id,
    creadorNombre: fila.creador_nombre,
    soyElCreador: fila.creador_player_id === playerId,
    estoyDentro: ocupadas.some((p) => p.playerId === playerId),
    enEspera: Boolean(fila.en_espera),
    plazas,
    libres: 4 - ocupadas.length,
    cancelado: Boolean(fila.cancelado_at),
    cerrado: Boolean(fila.cerrado_at),
    jugado: new Date(fila.termina_at).getTime() < Date.now()
  };
}

// `ensureRatingSchema` porque la consulta lee `players.categoria` y
// `players.rating_at`, que crea api/_rating.js y no `ensureSchema`. Esta
// memoizado y api/partidos.js ya importa ese modulo, asi que no cuesta.
async function conPlazas(filas, playerId) {
  if (!filas.length) return [];
  await ensureRatingSchema();
  const ids = filas.map((f) => f.id);
  const { rows } = await sql`
    SELECT pl.partido_id, pl.puesto, pl.player_id, j.name AS nombre,
      CASE WHEN j.rating_at IS NULL THEN NULL ELSE j.categoria END AS categoria
    FROM partido_plazas pl JOIN players j ON j.id = pl.player_id
    WHERE pl.partido_id = ANY(${ids}::int[])
    ORDER BY pl.puesto`;
  return filas.map((f) => aPartido(f, plazasDe(rows, f.id), playerId));
}

// Mis partidos pendientes: los que he creado, en los que tengo plaza o en cuya
// lista de espera estoy. No cancelados y sin cerrar. Los ya terminados y sin
// cerrar siguen saliendo: son los que esperan a que alguien meta el resultado.
export async function misPartidos(playerId) {
  await ensurePartidosSchema();
  const { rows } = await sql`
    SELECT p.id, p.empieza_at, p.duracion_min, p.sede, p.sede_libre, p.niveles,
      p.creador_player_id, p.cancelado_at, p.cerrado_at,
      p.empieza_at + (p.duracion_min * interval '1 minute') AS termina_at,
      c.name AS creador_nombre,
      EXISTS (SELECT 1 FROM partido_espera e WHERE e.partido_id = p.id AND e.player_id = ${playerId}) AS en_espera
    FROM partidos_previstos p JOIN players c ON c.id = p.creador_player_id
    WHERE p.cancelado_at IS NULL AND p.cerrado_at IS NULL
      AND (p.creador_player_id = ${playerId}
        OR EXISTS (SELECT 1 FROM partido_plazas pl WHERE pl.partido_id = p.id AND pl.player_id = ${playerId})
        OR EXISTS (SELECT 1 FROM partido_espera e2 WHERE e2.partido_id = p.id AND e2.player_id = ${playerId}))
    ORDER BY p.empieza_at ASC
    LIMIT 50`;
  return conPlazas(rows, playerId);
}

// Los del grupo a los que me puedo apuntar: futuros, vivos y sin plaza mia.
// Los completos tambien salen, para poder entrar en su lista de espera.
export async function partidosAbiertos(playerId) {
  await ensurePartidosSchema();
  const { rows } = await sql`
    SELECT p.id, p.empieza_at, p.duracion_min, p.sede, p.sede_libre, p.niveles,
      p.creador_player_id, p.cancelado_at, p.cerrado_at,
      p.empieza_at + (p.duracion_min * interval '1 minute') AS termina_at,
      c.name AS creador_nombre,
      EXISTS (SELECT 1 FROM partido_espera e WHERE e.partido_id = p.id AND e.player_id = ${playerId}) AS en_espera
    FROM partidos_previstos p JOIN players c ON c.id = p.creador_player_id
    WHERE p.cancelado_at IS NULL AND p.cerrado_at IS NULL
      AND p.empieza_at > now()
      AND p.creador_player_id <> ${playerId}
      AND NOT EXISTS (SELECT 1 FROM partido_plazas pl WHERE pl.partido_id = p.id AND pl.player_id = ${playerId})
    ORDER BY p.empieza_at ASC
    LIMIT 50`;
  return conPlazas(rows, playerId);
}

// El detalle de uno: lo que abre el enlace de WhatsApp. Un partido cancelado
// tambien se devuelve, con su marca, para poder decir «se canceló» en vez de
// un 404 a quien pulse un enlace que ya circula por el grupo.
export async function unPartido(id, playerId) {
  await ensurePartidosSchema();
  const { rows } = await sql`
    SELECT p.id, p.empieza_at, p.duracion_min, p.sede, p.sede_libre, p.niveles,
      p.creador_player_id, p.cancelado_at, p.cerrado_at,
      p.empieza_at + (p.duracion_min * interval '1 minute') AS termina_at,
      c.name AS creador_nombre,
      EXISTS (SELECT 1 FROM partido_espera e WHERE e.partido_id = p.id AND e.player_id = ${playerId}) AS en_espera
    FROM partidos_previstos p JOIN players c ON c.id = p.creador_player_id
    WHERE p.id = ${id}`;
  if (!rows.length) return null;
  return (await conPlazas(rows, playerId))[0];
}

// El numero de la pestana: partidos en los que tengo plaza, aun no jugados, de
// ahora al final del domingo de esta semana. `date_trunc('week')` en Postgres
// empieza en lunes, que es lo que queremos.
export async function partidosDeMiSemana(playerId) {
  await ensurePartidosSchema();
  const { rows } = await sql`
    SELECT count(*)::int AS n
    FROM partidos_previstos p JOIN partido_plazas pl ON pl.partido_id = p.id
    WHERE pl.player_id = ${playerId}
      AND p.cancelado_at IS NULL AND p.cerrado_at IS NULL
      AND p.empieza_at >= now()
      AND p.empieza_at < ((date_trunc('week', now() AT TIME ZONE 'Europe/Madrid') + interval '7 days') AT TIME ZONE 'Europe/Madrid')`;
  return rows[0].n;
}
