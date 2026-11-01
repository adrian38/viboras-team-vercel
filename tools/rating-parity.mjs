// El motor de rating vive en un solo sitio. Esta guarda lo defiende.
//
//   node tools/rating-parity.mjs
//
// Hasta el 2026-10-31 el Glicko estaba pegado en tres paginas y esto
// comprobaba que las copias no se separaran. Ahora esta en vt-glicko.js y lo
// que hay que impedir es lo contrario: que una pagina vuelva a traerse la
// suya «para no depender del fichero». Pasaria igual de callado que la
// divergencia de antes, y el sintoma seria el mismo —un numero que cambia en
// /rating y no en /players—, asi que la guarda se queda, mirando al reves.
//
// Lo que comprueba:
//
//   1. vt-glicko.js define las primitivas y las exporta.
//   2. Ninguna pagina las define por su cuenta.
//   3. Las tres paginas cargan /front/vt-glicko.js y traen sus nombres al
//      ambito.
//
// No vigila calculateEngineRatings: el bucle de dias es de cada pagina y en
// rating-test diverge a proposito (extraDecayDays).
// Detalle: ai_context/motor_de_rating_duplicado.md
import { readFileSync } from 'node:fs';

// Vale a la vez como ruta en disco y, con una barra delante, como la URL que
// cargan las paginas. Por eso el movimiento a front/ se arregla aqui y nada
// mas abajo cambia.
const MOTOR = 'front/vt-glicko.js';
const PAGINAS = ['pantallas/rating.html', 'pantallas/players.html', 'pantallas/rating-test.html'];

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

for (const pagina of PAGINAS) {
  const src = readFileSync(pagina, 'utf8');
  const suyas = DEL_MOTOR.filter((fn) => defineFuncion(src, fn));
  if (suyas.length) {
    problemas.push(`${pagina} se ha traido su copia de: ${suyas.join(', ')}`);
  }
  if (!src.includes(`src="/${MOTOR}"`)) problemas.push(`${pagina} no carga /${MOTOR}`);
  if (!src.includes('window.vtGlicko')) problemas.push(`${pagina} no usa window.vtGlicko`);
}

if (problemas.length === 0) {
  console.log(`rating: un solo motor (${MOTOR}) y ${PAGINAS.length} paginas que lo usan.`);
  process.exit(0);
}

console.error('El motor de rating se ha vuelto a partir:');
for (const p of problemas) console.error(`  - ${p}`);
console.error('\nVer ai_context/motor_de_rating_duplicado.md antes de "arreglarlo".');
process.exit(1);
