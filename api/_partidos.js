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

// Los niveles que el convocante deja jugar. Son los MISMOS cuatro que ya usa
// la aplicacion en dos sitios: las categorias de rating
// (front/comun/vt-categorias.js, TIER_DEFINITIONS) y el nivel de la prueba de
// Bilbao Kirolak que se declara en el alta (RATING_DE_PARTIDA en
// api/_inscripcion.js). No se inventa ninguna escala nueva.
//
// Ojo con lo que significa la coincidencia: son los mismos nombres, pero uno
// sale del rating de hoy y el otro de lo que dijo al apuntarse. Aqui es una
// declaracion del convocante («a este partido vienen intermedios y
// avanzados»), no un filtro: nadie comprueba el nivel de quien se apunta.
// Si algun dia filtra, hay que decidir cual de los dos manda.
//
// `niveles` a NULL quiere decir «todos», y es lo normal.
export const NIVELES = {
  iniciacion: 'Iniciación',
  intermedio: 'Intermedio',
  avanzado: 'Avanzado',
  entreno: 'Entreno'
};
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
      niveles TEXT[],
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

// Devuelve el array a guardar, o `false` si lo pedido no cuadra. Null es
// «todos»: ni una lista con los cuatro ni una vacia, para que haya una sola
// forma de decir lo mismo en la base.
export function nivelesParaGuardar(lista) {
  if (!Array.isArray(lista) || !lista.length) return null;
  const limpios = [...new Set(lista.map((n) => String(n)))];
  if (limpios.some((n) => !Object.prototype.hasOwnProperty.call(NIVELES, n))) return false;
  if (limpios.length === Object.keys(NIVELES).length) return null;
  // En el orden de la escalera, no en el que vinieran marcados.
  return Object.keys(NIVELES).filter((n) => limpios.includes(n));
}

// Lo que se ensena: «Todos los niveles» o los nombres en orden.
export function nivelesDice(niveles) {
  if (!Array.isArray(niveles) || !niveles.length) return 'Todos los niveles';
  return Object.keys(NIVELES).filter((n) => niveles.includes(n)).map((n) => NIVELES[n]).join(', ');
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

// Los niveles tal y como los pide la pagina para montar sus casillas.
export function nivelesParaLaPagina() {
  return Object.entries(NIVELES).map(([clave, nombre]) => ({ clave, nombre }));
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

// Crea el partido y mete dentro al creador. No es atomico y no hace falta que
// lo sea: si la segunda sentencia fallara, quedaria un partido con cuatro
// plazas libres, que es un estado valido y del que su autor puede borrarse o
// al que puede volver a apuntarse.
//
// La plaza no es siempre la 1: sale de `intentarPlaza`, que mira el lado del
// creador. Con las cuatro libres eso es la 1 para drive o 'ambos' y la 2 para
// reves. Antes era la 1 fija y quien juega al reves empezaba siempre en el
// drive de su propio partido.
export async function crearPartido(datos) {
  const { playerId, empieza, duracion, sede, sedeLibre, niveles } = datos;
  const { rows } = await sql`
    INSERT INTO partidos_previstos
      (empieza_at, duracion_min, sede, sede_libre, niveles, creador_player_id)
    VALUES (${empieza}, ${duracion}, ${sede}, ${sedeLibre}, ${niveles}, ${playerId})
    RETURNING id`;
  const id = rows[0].id;
  await intentarPlaza(id, playerId, await ladoDe(playerId));
  return id;
}

// El lado de pista que el jugador eligio en /cuenta (`players.court_side`).
// Lo crea `ensureAuthSchema`, no `ensureSchema`, y el handler de partidos lo
// asegura al exigir la sesion. Cualquier cosa que no sea drive o reves —NULL,
// 'ambos', un valor viejo— vale como 'ambos': sin preferencia.
export async function ladoDe(playerId) {
  const { rows } = await sql`SELECT court_side FROM players WHERE id = ${playerId}`;
  const lado = rows.length ? rows[0].court_side : null;
  return lado === 'drive' || lado === 'reves' ? lado : 'ambos';
}

// El puesto que tomaria `intentarPlaza` si el jugador se apuntara ahora, para
// que /partido le proponga ESE hueco y no otro. Es la misma regla que el
// ORDER BY de abajo, escrita dos veces porque una es SQL y la otra no: si se
// cambia una, se cambia la otra. Null si no queda hueco.
export function puestoQueTomaria(plazas, lado) {
  const libres = plazas.filter((p) => !p.playerId).map((p) => p.puesto).sort((a, b) => a - b);
  const suyo = (n) => (lado === 'drive' && n % 2 === 1) || (lado === 'reves' && n % 2 === 0);
  return libres.find(suyo) || libres[0] || null;
}

// Toma una plaza libre en una sola sentencia: quien arbitra la carrera es la
// clave primaria (partido_id, puesto), no este codigo. Cero filas significa
// que no quedaba hueco.
//
// Cual de las libres depende del lado del jugador. Los puestos impares (1 y
// 3) son el drive de su pareja y los pares (2 y 4) el reves, que es como los
// pinta la tarjeta: Equipo 1 son el 1 y el 2, Equipo 2 el 3 y el 4. Se busca
// primero una del lado suyo y, si no queda ninguna, la libre mas baja: el
// lado es una preferencia y no puede dejar a nadie fuera de un partido con
// hueco. Con 'ambos' todas empatan y gana la mas baja, que es lo que se hacia
// antes de esto. `puestoQueTomaria` repite esta regla para la pantalla.
async function intentarPlaza(partidoId, playerId, lado) {
  const { rows } = await sql`
    INSERT INTO partido_plazas (partido_id, puesto, player_id)
    SELECT ${partidoId}, h.n, ${playerId}
      FROM generate_series(1, 4) AS h(n)
     WHERE NOT EXISTS (
       SELECT 1 FROM partido_plazas q WHERE q.partido_id = ${partidoId} AND q.puesto = h.n)
     ORDER BY CASE
       WHEN ${lado} = 'drive' AND h.n % 2 = 1 THEN 0
       WHEN ${lado} = 'reves' AND h.n % 2 = 0 THEN 0
       ELSE 1 END, h.n
     LIMIT 1
    RETURNING puesto`;
  return rows.length ? rows[0].puesto : null;
}

async function tienePlaza(partidoId, playerId) {
  const { rows } = await sql`
    SELECT 1 FROM partido_plazas WHERE partido_id = ${partidoId} AND player_id = ${playerId}`;
  return rows.length > 0;
}

// 'full' si no queda sitio, 'already_in' si ya estaba, o el puesto tomado.
// Recibe el playerId porque desde el 2026-11-22 el organizador tambien puede
// incorporar a otro; quien decide a quien es el handler, que comprueba que
// quien lo pide sea el organizador.
//
// Dos caminos llevan a 'already_in' y hacen falta los dos. Si el partido tiene
// hueco, el INSERT choca con la restriccion (partido_id, player_id) y el 23505
// lo dice; si esta lleno, no hay INSERT que chocar y el hueco que no hay
// contestaria 'full', que es verdad del partido pero mentira sobre ti. De ahi
// la comprobacion antes de rendirse.
//
// El otro 23505, el de la clave primaria, es la carrera de dos que se apuntan
// a la vez a la misma plaza: ese se reintenta una vez.
export async function tomarPlaza(partidoId, playerId) {
  const lado = await ladoDe(playerId);
  for (let intento = 0; intento < 2; intento += 1) {
    try {
      const puesto = await intentarPlaza(partidoId, playerId, lado);
      if (puesto === null) return await tienePlaza(partidoId, playerId) ? 'already_in' : 'full';
      await sql`DELETE FROM partido_espera WHERE partido_id = ${partidoId} AND player_id = ${playerId}`;
      return puesto;
    } catch (err) {
      if (err?.code !== '23505') throw err;
      if (String(err.constraint || '').includes('player')) return 'already_in';
    }
  }
  return 'full';
}

// El jugador al que el organizador quiere incorporar: tiene que existir,
// estar activo y tener cuenta activa. Sin cuenta no hay a quien avisar, y
// apuntar a alguien que no se va a enterar es peor que no apuntarlo.
export async function jugadorIncorporable(playerId) {
  const { rows } = await sql`
    SELECT p.id, p.name
    FROM players p
    WHERE p.id = ${playerId} AND p.active = TRUE
      AND EXISTS (SELECT 1 FROM users u WHERE u.player_id = p.id AND u.status = 'active')`;
  return rows.length ? rows[0] : null;
}

// Los que el organizador puede incorporar a ESTE partido: activos, con
// cuenta, y que no estan ya dentro.
export async function incorporables(partidoId) {
  const { rows } = await sql`
    SELECT p.id, p.name AS nombre
    FROM players p
    WHERE p.active = TRUE
      AND EXISTS (SELECT 1 FROM users u WHERE u.player_id = p.id AND u.status = 'active')
      AND NOT EXISTS (SELECT 1 FROM partido_plazas pl WHERE pl.partido_id = ${partidoId} AND pl.player_id = p.id)
    ORDER BY LOWER(p.name)`;
  return rows;
}

export async function soltarPlaza(partidoId, playerId) {
  const { rows } = await sql`
    DELETE FROM partido_plazas WHERE partido_id = ${partidoId} AND player_id = ${playerId}
    RETURNING puesto`;
  return rows.length > 0;
}

// Me cambio a otra plaza del mismo partido. El lado de /cuenta decide donde
// entra uno, pero no manda: un partido se monta entre cuatro conocidos y el
// que quiera cambiarse de lado o de pareja tiene que poder, sin borrarse y
// volver a apuntarse, que ademas le haria perder la plaza si entra alguien.
//
// Es un UPDATE sobre la fila que ya es mia y con el puesto destino libre, en
// una sola sentencia: si dos se mueven a la vez al mismo hueco, el segundo
// choca con la clave primaria (partido_id, puesto) y se queda donde estaba.
// Cero filas es «ese hueco ya no esta libre o tu no estas en el partido», que
// para quien lo pide es lo mismo: no te has movido.
//
// 'ocupada' y no un reintento como en `tomarPlaza`: alli el destino era
// cualquier hueco y reintentar encuentra otro; aqui el destino es el que ha
// elegido la persona, y moverla a uno distinto del que toco seria peor que
// decirle que no.
export async function cambiarDePlaza(partidoId, playerId, puesto) {
  try {
    const { rows } = await sql`
      UPDATE partido_plazas SET puesto = ${puesto}
       WHERE partido_id = ${partidoId} AND player_id = ${playerId}
         AND NOT EXISTS (
           SELECT 1 FROM partido_plazas q
            WHERE q.partido_id = ${partidoId} AND q.puesto = ${puesto})
      RETURNING puesto`;
    return rows.length ? 'ok' : 'ocupada';
  } catch (err) {
    if (err && err.code === '23505') return 'ocupada';
    throw err;
  }
}

// La fila cruda de un partido que todavia admite cambios. Null si no existe,
// si se cancelo, si ya se cerro o si ya empezo.
export async function partidoVivo(id) {
  const { rows } = await sql`
    SELECT id, empieza_at, duracion_min, sede, sede_libre, niveles, creador_player_id
    FROM partidos_previstos
    WHERE id = ${id} AND cancelado_at IS NULL AND cerrado_at IS NULL AND empieza_at > now()`;
  return rows.length ? rows[0] : null;
}

// Uno que ya empezo, sigue sin cerrar y no llego a cuatro: no se jugo ni
// puede tener resultado, y lo unico que cabe es quitarlo. Lo pide «Quitarlo
// de aqui» en /partidos, que `partidoVivo` rechazaba por haber empezado.
export async function partidoPasadoIncompleto(id) {
  const { rows } = await sql`
    SELECT p.id, p.empieza_at, p.duracion_min, p.sede, p.sede_libre, p.niveles, p.creador_player_id
    FROM partidos_previstos p
    WHERE p.id = ${id} AND p.cancelado_at IS NULL AND p.cerrado_at IS NULL AND p.empieza_at <= now()
      AND (SELECT count(*) FROM partido_plazas pl WHERE pl.partido_id = p.id) < 4`;
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

// Un apuntado de ESTE partido, con su nombre para los avisos. Null si no
// tiene plaza en el: a quien no esta no se le puede quitar.
export async function apuntadoEn(partidoId, playerId) {
  const { rows } = await sql`
    SELECT p.id, p.name FROM partido_plazas pl JOIN players p ON p.id = pl.player_id
    WHERE pl.partido_id = ${partidoId} AND pl.player_id = ${playerId}`;
  return rows.length ? rows[0] : null;
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
