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
