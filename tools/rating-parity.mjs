// El motor de rating vive en un solo sitio. Esta guarda lo defiende.
//
//   node tools/rating-parity.mjs
//
// Hasta el 2026-10-31 el Glicko estaba pegado en tres paginas y esto
// comprobaba que las copias no se separaran. Ahora esta en un solo fichero y lo
// que hay que impedir es lo contrario: que una pagina vuelva a traerse la
// suya «para no depender del fichero». Pasaria igual de callado que la
// divergencia de antes, y el sintoma seria el mismo —un numero que cambia en
// /rating y no en /players—, asi que la guarda se queda, mirando al reves.
//
// Lo que comprueba:
//
//   1. vt-glicko.js define las primitivas y las exporta.
//   2. Ninguna pagina las define por su cuenta.
//   3. Las tres pantallas cargan /front/comun/vt-glicko.js y traen sus
//      nombres al ambito.
//
// Una pantalla son dos ficheros: su index.html y el front/pantallas/<n>/<n>.js
// que salio de el. Hay que mirar los dos. Mirando solo el index.html, el dia
// que se extrajo players esta guarda dijo que la pagina no usaba
// window.vtGlicko, que era falso: el codigo estaba intacto, dos ficheros mas
// alla.
//
// No vigila calculateEngineRatings: el bucle de dias es de cada pagina y en
// rating-test diverge a proposito (extraDecayDays).
// Detalle: ai_context/motor_de_rating_duplicado.md
import { existsSync, readFileSync } from 'node:fs';

// Vale a la vez como ruta en disco y, con una barra delante, como la URL que
// cargan las paginas. Por eso un cambio de carpeta se arregla aqui y nada mas
// abajo cambia.
const MOTOR = 'front/comun/vt-glicko.js';

// Cada pantalla es una carpeta: su index.html y el fichero que salio de el.
// pozo-nuevo no calcula rating: solo pide el ranking para ordenar la lista
// del torneo. Esta aqui por lo mismo que las otras —si se trae su propio
// Glicko «para no depender del fichero», ordenaria por un numero que no es el
// que ve el grupo— y porque sin el <script> el boton de ordenar revienta.
const PANTALLAS = ['rating', 'players', 'rating-test', 'pozo-nuevo'].map((n) => ({
  pagina: `front/pantallas/${n}/index.html`,
  propio: `front/pantallas/${n}/${n}.js`
}));

// Las cuatro primitivas de siempre mas las que las acompanan: si una pagina
// se trae cualquiera de estas, se ha vuelto a partir el motor.
const DEL_MOTOR = [
  'g', 'expected', 'getEffectiveObservationRd', 'getReliabilityWeight',
  'decayAllPlayersOneDay', 'getPlayerOrCreate', 'getTeamState',
  'getEffectiveObservationR', 'clamp', 'updatePeriod'
];

const defineFuncion = (src, nombre) =>
  new RegExp('function\\s+' + nombre + '\\s*\\(').test(src);

const motor = readFileSync(MOTOR, 'utf8');
const problemas = [];

for (const fn of DEL_MOTOR) {
  if (!defineFuncion(motor, fn)) problemas.push(`${MOTOR} ya no define ${fn}()`);
  if (!new RegExp('\\b' + fn + '\\b').test(motor.slice(motor.lastIndexOf('return {')))) {
    problemas.push(`${MOTOR} no exporta ${fn}`);
  }
}

for (const { pagina, propio } of PANTALLAS) {
  const html = readFileSync(pagina, 'utf8');
  // El codigo de la pantalla, este donde este.
  const codigo = html + '\n' + (existsSync(propio) ? readFileSync(propio, 'utf8') : '');
  const suyas = DEL_MOTOR.filter((fn) => defineFuncion(codigo, fn));
  if (suyas.length) {
    problemas.push(`${pagina} se ha traido su copia de: ${suyas.join(', ')}`);
  }
  // El <script src> es del .html siempre: a su fichero propio no se le carga
  // el motor, se lo carga la pagina.
  if (!html.includes(`src="/${MOTOR}"`)) problemas.push(`${pagina} no carga /${MOTOR}`);
  if (!codigo.includes('window.vtGlicko')) problemas.push(`${pagina} no usa window.vtGlicko`);
}

if (problemas.length === 0) {
  console.log(`rating: un solo motor (${MOTOR}) y ${PANTALLAS.length} pantallas que lo usan.`);
  process.exit(0);
}

console.error('El motor de rating se ha vuelto a partir:');
for (const p of problemas) console.error(`  - ${p}`);
console.error('\nVer ai_context/motor_de_rating_duplicado.md antes de "arreglarlo".');
process.exit(1);
