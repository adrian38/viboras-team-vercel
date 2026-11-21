// Partidos previstos (/partidos): los que aun no se han jugado. Convocar,
// apuntarse, compartir por WhatsApp y recibir los avisos de la reserva.
//
// Por que una tabla propia y no una fila de `matches` sin marcador: un partido
// organizado y sin jugar guardado en `matches` es la trampa que describe
// ai_context/contar_partidos_de_un_jugador.md, y la pagan cinco lecturas
// distintas (perfil, comunidad, ranking, rating, estadisticas). `matches`
// registra lo que ya paso; esto convoca lo que va a pasar.
//
// Detalle: ai_context/partidos_previstos.md
import { sql } from '@vercel/postgres';
import { ensureSchema } from './_db.js';

// Los polideportivos de Bilbao Kirolak con pista de padel, comprobados ficha a
// ficha en bilbaokirolak.eus el 2026-11-21. Son los tres unicos de los once
// que listan pistas de padel en su listado de instalaciones. Atxuri, San
// Mames, Miribilla y La Pena mencionan «padel» en el texto generico de
// accesibilidad, pero no en su listado: quedan fuera a proposito.
//
// La clave es lo que se guarda y el nombre lo que se ve. Manda el servidor:
// una clave que no este aqui se rechaza. El numero de pistas no se guarda, es
// solo para pintar «San Inazio · 8 pistas cubiertas».
//
// Esta es la unica copia. La pagina no escribe los <option> en su HTML: se los
// construye con lo que venga en la respuesta del API. No cabe un fichero
// compartido entre front y api sin bundler.
export const SEDES = {
  san_inazio: { nombre: 'San Inazio', pistas: '8 pistas cubiertas' },
  artxanda: { nombre: 'Artxanda', pistas: '4 cubiertas y 2 descubiertas' },
  zorrotza: { nombre: 'Zorrotza', pistas: '2 pistas cubiertas' },
  otro: { nombre: 'Otro sitio', pistas: '' }
};
export const SEDE_POR_DEFECTO = 'san_inazio';

export const DURACIONES = [60, 120];
export const COMENTARIO_MAXIMO = 140;
export const SEDE_LIBRE_MAXIMA = 60;
// Margen contra el pasado. Ni 0 ni una hora: para dentro de diez minutos no da
// tiempo a que nadie lo vea y se apunte, que es para lo que existe la
// pantalla, pero «hoy mas tarde» es el caso normal del grupo. Ademas absorbe
// el desfase de reloj entre el movil, que valida el formulario, y Neon, que
// valida de verdad.
export const MARGEN_MINUTOS = 15;
export const DIAS_MAXIMOS = 120;
// Partidos creados por cuenta y dia: cada uno es una cadena de pushes.
export const POR_DIA = 5;

let listo = null;

async function crearTablas() {
  await ensureSchema();
  await sql`
    CREATE TABLE IF NOT EXISTS partidos_previstos (
      id SERIAL PRIMARY KEY,
      empieza_at TIMESTAMPTZ NOT NULL,
      duracion_min SMALLINT NOT NULL,
      sede TEXT NOT NULL,
      sede_libre TEXT,
      comentario TEXT,
      creador_player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      cancelado_at TIMESTAMPTZ,
      cerrado_at TIMESTAMPTZ,
      match_id INTEGER REFERENCES matches(id) ON DELETE SET NULL
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS partidos_previstos_empieza_idx ON partidos_previstos(empieza_at)`;
  await sql`
    CREATE TABLE IF NOT EXISTS partido_plazas (
      partido_id INTEGER NOT NULL REFERENCES partidos_previstos(id) ON DELETE CASCADE,
      puesto SMALLINT NOT NULL CHECK (puesto BETWEEN 1 AND 4),
      player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      apuntado_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (partido_id, puesto),
      UNIQUE (partido_id, player_id)
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS partido_plazas_player_idx ON partido_plazas(player_id)`;
  // Las marcas de «este aviso ya esta resuelto», en tabla hija y no en
  // columnas: el juego de avisos depende de la duracion (cinco con 1 h, seis
  // con 2 h, porque hay dos franjas que reservar). Con columnas habria una que
  // para la mitad de los partidos no significa nada.
  //
  // `omitido` separa «mandado» de «no se mandara»: un partido creado con menos
  // de 48 h de margen nace con los avisos de reserva omitidos, y asi se puede
  // responder con un SELECT a quien pregunte por que no le llego.
  await sql`
    CREATE TABLE IF NOT EXISTS partido_avisos (
      partido_id INTEGER NOT NULL REFERENCES partidos_previstos(id) ON DELETE CASCADE,
      clave TEXT NOT NULL,
      resuelto_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      omitido BOOLEAN NOT NULL DEFAULT FALSE,
      PRIMARY KEY (partido_id, clave)
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS partido_espera (
      partido_id INTEGER NOT NULL REFERENCES partidos_previstos(id) ON DELETE CASCADE,
      player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      apuntado_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (partido_id, player_id)
    )
  `;
}

export function ensurePartidosSchema() {
  if (!listo) listo = crearTablas().catch((err) => { listo = null; throw err; });
  return listo;
}

export function sedeValida(clave) {
  return Object.prototype.hasOwnProperty.call(SEDES, clave);
}

// Lo que se ensena de la sede, en un solo sitio, para que ninguna pantalla ni
// ningun aviso lo componga por su cuenta.
export function nombreDeSede(fila) {
  if (fila.sede === 'otro') return fila.sede_libre || 'Otro sitio';
  const s = SEDES[fila.sede];
  return s ? s.nombre : fila.sede;
}

export function pistasDeSede(fila) {
  if (fila.sede === 'otro') return '';
  const s = SEDES[fila.sede];
  return s ? s.pistas : '';
}

// Las sedes tal y como las pide la pagina para montar su <select>.
export function sedesParaLaPagina() {
  return {
    lista: Object.entries(SEDES).map(([clave, s]) => ({ clave, nombre: s.nombre, pistas: s.pistas })),
    porDefecto: SEDE_POR_DEFECTO
  };
}

// El instante del partido y si cae fuera de las dos fronteras, resuelto en la
// base y no en Node: el reloj que manda es el de Neon, y ademas aqui es donde
// se sabe si una fecha como el 31 de febrero existe.
export async function instanteDe(fecha, hora) {
  const { rows } = await sql`
    SELECT ((${fecha}::date + ${hora}::time) AT TIME ZONE 'Europe/Madrid') AS t,
      ((${fecha}::date + ${hora}::time) AT TIME ZONE 'Europe/Madrid')
        < now() + (${MARGEN_MINUTOS} * interval '1 minute') AS pronto,
      ((${fecha}::date + ${hora}::time) AT TIME ZONE 'Europe/Madrid')
        > now() + (${DIAS_MAXIMOS} * interval '1 day') AS lejos`;
  return rows[0];
}

// Otro partido vivo mio que se pise con este rato. Dos partidos pegados
// (uno acaba a las 20:00 y el otro empieza a las 20:00) no se pisan: el
// intervalo es abierto por arriba.
export async function partidoQueSePisa(playerId, empieza, duracion, exceptoId) {
  const { rows } = await sql`
    SELECT p.id, p.empieza_at
    FROM partidos_previstos p JOIN partido_plazas pl ON pl.partido_id = p.id
    WHERE pl.player_id = ${playerId}
      AND p.cancelado_at IS NULL AND p.cerrado_at IS NULL
      AND p.id <> ${exceptoId || 0}
      AND p.empieza_at < (${empieza}::timestamptz + (${duracion} * interval '1 minute'))
      AND (p.empieza_at + (p.duracion_min * interval '1 minute')) > ${empieza}::timestamptz
    LIMIT 1`;
  return rows.length ? rows[0] : null;
}

export async function creadosHoy(playerId) {
  const { rows } = await sql`
    SELECT count(*)::int AS n FROM partidos_previstos
    WHERE creador_player_id = ${playerId} AND created_at > now() - interval '1 day'`;
  return rows[0].n;
}

// Crea el partido y mete al creador en la plaza 1. No es atomico y no hace
// falta que lo sea: si la segunda sentencia fallara, quedaria un partido con
// cuatro plazas libres, que es un estado valido y del que su autor puede
// borrarse o al que puede volver a apuntarse.
export async function crearPartido(datos) {
  const { playerId, empieza, duracion, sede, sedeLibre, comentario } = datos;
  const { rows } = await sql`
    INSERT INTO partidos_previstos
      (empieza_at, duracion_min, sede, sede_libre, comentario, creador_player_id)
    VALUES (${empieza}, ${duracion}, ${sede}, ${sedeLibre}, ${comentario}, ${playerId})
    RETURNING id`;
  const id = rows[0].id;
  await sql`INSERT INTO partido_plazas (partido_id, puesto, player_id) VALUES (${id}, 1, ${playerId})`;
  return id;
}

// Toma la plaza libre mas baja en una sola sentencia: quien arbitra la carrera
// es la clave primaria (partido_id, puesto), no este codigo. Cero filas
// significa que no quedaba hueco.
async function intentarPlaza(partidoId, playerId) {
  const { rows } = await sql`
    INSERT INTO partido_plazas (partido_id, puesto, player_id)
    SELECT ${partidoId}, MIN(h.n), ${playerId}
      FROM generate_series(1, 4) AS h(n)
     WHERE NOT EXISTS (
       SELECT 1 FROM partido_plazas q WHERE q.partido_id = ${partidoId} AND q.puesto = h.n)
    HAVING MIN(h.n) IS NOT NULL
    RETURNING puesto`;
  return rows.length ? rows[0].puesto : null;
}

// 'full' si no queda sitio, 'already_in' si ya estabas, o el puesto tomado.
// El 23505 se distingue por el nombre de la restriccion: la primaria es la
// carrera de dos que se apuntan a la vez y se reintenta una vez; la de
// (partido_id, player_id) es que ya tenias plaza.
export async function tomarPlaza(partidoId, playerId) {
  for (let intento = 0; intento < 2; intento += 1) {
    try {
      const puesto = await intentarPlaza(partidoId, playerId);
      if (puesto === null) return 'full';
      await sql`DELETE FROM partido_espera WHERE partido_id = ${partidoId} AND player_id = ${playerId}`;
      return puesto;
    } catch (err) {
      if (err?.code !== '23505') throw err;
      if (String(err.constraint || '').includes('player')) return 'already_in';
    }
  }
  return 'full';
}

export async function soltarPlaza(partidoId, playerId) {
  const { rows } = await sql`
    DELETE FROM partido_plazas WHERE partido_id = ${partidoId} AND player_id = ${playerId}
    RETURNING puesto`;
  return rows.length > 0;
}

// La fila cruda de un partido que todavia admite cambios. Null si no existe,
// si se cancelo, si ya se cerro o si ya empezo.
export async function partidoVivo(id) {
  const { rows } = await sql`
    SELECT id, empieza_at, duracion_min, sede, sede_libre, comentario, creador_player_id
    FROM partidos_previstos
    WHERE id = ${id} AND cancelado_at IS NULL AND cerrado_at IS NULL AND empieza_at > now()`;
  return rows.length ? rows[0] : null;
}

export async function jugadoresDe(partidoId) {
  const { rows } = await sql`
    SELECT player_id FROM partido_plazas WHERE partido_id = ${partidoId} ORDER BY puesto`;
  return rows.map((r) => r.player_id);
}

export async function enEsperaDe(partidoId) {
  const { rows } = await sql`
    SELECT player_id FROM partido_espera WHERE partido_id = ${partidoId} ORDER BY apuntado_at`;
  return rows.map((r) => r.player_id);
}

export async function cancelarPartido(id) {
  const { rows } = await sql`
    UPDATE partidos_previstos SET cancelado_at = now()
    WHERE id = ${id} AND cancelado_at IS NULL RETURNING id`;
  return rows.length > 0;
}

// Lo llama /submit-result al guardar el resultado. No exige que el partido
// este vivo: por definicion se cierra uno que ya se jugo.
export async function cerrarPartido(id, matchId) {
  const { rows } = await sql`
    UPDATE partidos_previstos SET cerrado_at = now(), match_id = ${matchId}
    WHERE id = ${id} AND cerrado_at IS NULL RETURNING id`;
  return rows.length > 0;
}
