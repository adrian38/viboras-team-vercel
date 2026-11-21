// El motor de rating, corriendo en el servidor.
//
// NO es una copia. Carga y ejecuta los MISMOS cuatro ficheros que cargan
// /rating y /players, dentro de un `vm` con un navegador de mentira. La
// invariante del proyecto es que haya un solo motor
// (tools/rating-parity.mjs lo vigila), y la sigue habiendo: esto es un
// segundo sitio que lo USA, no un segundo motor. Si alguien cambia el motor,
// esto cambia con el, que es justo lo que se quiere.
//
// Misma tecnica que el arnes con el que se prueba sw.js
// (ai_context/service_worker.md): `vm` mas dobles de lo que el fichero espera
// encontrar en el navegador.
//
// Por que hace falta: hasta ahora el rating solo existia mientras una
// pantalla lo calculaba, asi que no se le podia preguntar a la base «de que
// categoria es este jugador». Para que un partido pueda decir «solo
// avanzados», el servidor tiene que saberlo.
//
// Detalle: ai_context/rating_en_el_servidor.md
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { join } from 'node:path';

// El orden importa, y es el de /rating: el motor primero, porque sus dos
// acompanantes usan GlickoPlayer, MIN_RD y MAX_RD nada mas cargarse.
const FICHEROS = [
  'front/comun/vt-glicko.js',
  'front/comun/vt-categorias.js',
  'front/comun/rating-inicial.js',
  'front/comun/nivel-votos.js'
];

// Leidos una vez: lo que cuesta es el disco, no ejecutarlos.
let codigo = null;

// En Vercel el proceso arranca en la raiz del proyecto y en el contenedor
// local en /app; `process.cwd()` vale en los dos. Los cuatro ficheros viajan
// con la funcion porque vercel.json los declara en `includeFiles`: sin esa
// linea el despliegue no los empaqueta y esto revienta con ENOENT.
function leerCodigo() {
  if (!codigo) {
    codigo = FICHEROS.map((f) => ({ f, texto: readFileSync(join(process.cwd(), f), 'utf8') }));
  }
  return codigo;
}

// Los cuatro son scripts de navegador y esperan dos cosas: un `window` que
// ADEMAS sea el objeto global —`window.GlickoPlayer = ...` en uno y
// `GlickoPlayer` a secas en otro tienen que ser la misma variable— y un
// `fetch` que ya este puesto cuando se cargan, porque dos de ellos piden sus
// datos en la propia carga y guardan la promesa en `listo`.
function navegadorDeMentira(datos) {
  const ventana = {};
  ventana.window = ventana;
  ventana.console = console;
  ventana.fetch = async (url) => {
    const texto = String(url);
    if (texto.includes('getRatingsDePartida')) return respuesta({ ratings: datos.ratings || [] });
    if (texto.includes('getNivelVotos')) return respuesta({ votos: datos.votos || [] });
    if (texto.includes('getResults')) return respuesta({ matches: datos.matches || [] });
    throw new Error(`el motor pidio algo que no esperabamos: ${texto}`);
  };
  return createContext(ventana);
}

const respuesta = (cuerpo) => ({ ok: true, json: async () => cuerpo });

// Calcula el rating de todos con los mismos datos y el mismo codigo que usa
// /rating, y devuelve [{name, rating, rd, categoria}].
//
// `datos` son las filas CRUDAS de la base, tal y como las devuelve /api/read:
// el mapeo de columnas a partidos —las fechas en dos formatos, los sets, los
// formatos de torneo— lo hace el motor con su `leerPartidos`, para no
// escribirlo aqui otra vez.
export async function calcularRatings(datos) {
  const caja = navegadorDeMentira(datos);
  for (const { f, texto } of leerCodigo()) runInContext(texto, caja, { filename: f });
  const ventana = caja;
  if (!ventana.vtGlicko || !ventana.vtInicial || !ventana.vtNivel) {
    throw new Error('el motor no publico lo que se esperaba');
  }
  // Las dos esperas que hacen /rating y /players antes de calcular. Sin
  // ellas, los jugadores nuevos saldrian todos de 1500 y los votos de nivel
  // no moverian el RD: el numero no seria el de la pantalla.
  await ventana.vtInicial.listo;
  await ventana.vtNivel.listo;
  const partidos = await ventana.vtGlicko.leerPartidos();
  const salida = ventana.vtGlicko.calcularRatings(datos.nombres || [], partidos, null, 0);
  return salida.map((j) => ({ ...j, categoria: ventana.categoriaDeRating(j.rating) }));
}
