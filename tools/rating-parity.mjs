// Paridad del motor de rating entre las paginas que lo implementan.
//
//   node tools/rating-parity.mjs
//
// El Glicko esta pegado tres veces (ai_context/motor_de_rating_duplicado.md).
// Esta guarda vigila las PRIMITIVAS, que tienen que ser identicas. No vigila
// calculateEngineRatings: ahi la divergencia es intencionada, porque
// rating-test.html anade extraDecayDays.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const PAGINAS = ['rating.html', 'players.html', 'rating-test.html'];
const PRIMITIVAS = ['g', 'expected', 'getEffectiveObservationRd', 'getReliabilityWeight'];

// Extrae el cuerpo de una funcion equilibrando llaves, y lo normaliza para que
// la indentacion distinta de cada pagina no cuente como divergencia.
function extraer(src, nombre) {
  const m = src.match(new RegExp('function\\s+' + nombre + '\\s*\\('));
  if (!m) return null;
  let prof = 0;
  let j = src.indexOf('{', m.index);
  for (; j < src.length; j++) {
    if (src[j] === '{') prof++;
    else if (src[j] === '}') {
      prof--;
      if (prof === 0) { j++; break; }
    }
  }
  return src.slice(m.index, j).replace(/\s+/g, ' ').trim();
}

const huella = (texto) => createHash('md5').update(texto).digest('hex').slice(0, 8);

const fuentes = Object.fromEntries(PAGINAS.map((p) => [p, readFileSync(p, 'utf8')]));
const problemas = [];

for (const fn of PRIMITIVAS) {
  const huellas = PAGINAS.map((p) => {
    const cuerpo = extraer(fuentes[p], fn);
    return { pagina: p, huella: cuerpo ? huella(cuerpo) : null };
  });

  const ausentes = huellas.filter((h) => h.huella === null);
  if (ausentes.length) {
    problemas.push(`${fn}: no existe en ${ausentes.map((a) => a.pagina).join(', ')}`);
    continue;
  }

  const distintas = new Set(huellas.map((h) => h.huella));
  if (distintas.size > 1) {
    problemas.push(
      `${fn}: divergente -> ` + huellas.map((h) => `${h.pagina}=${h.huella}`).join('  ')
    );
  }
}

if (problemas.length === 0) {
  console.log(`rating: ${PRIMITIVAS.length} primitivas identicas en ${PAGINAS.length} paginas.`);
  process.exit(0);
}

console.error('Las copias del motor de rating no coinciden:');
for (const p of problemas) console.error(`  - ${p}`);
console.error('\nVer ai_context/motor_de_rating_duplicado.md antes de "arreglarlo".');
process.exit(1);
