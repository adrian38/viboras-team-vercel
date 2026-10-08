// Comprueba que el indice de ai_context/README.md menciona todas las notas.
//
//   node tools/ai-context-index.mjs
//
// Un indice a medias no falla solo: quien lo lea creera que ya ha visto lo que
// hay. Por eso esto es una guarda y no un consejo.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = 'ai_context';
const INDICE = join(DIR, 'README.md');

const notas = readdirSync(DIR)
  .filter((f) => f.endsWith('.md') && f !== 'README.md')
  .sort();

const indice = readFileSync(INDICE, 'utf8');

const faltan = notas.filter((n) => !indice.includes(n));

// Al reves: lineas del indice que apuntan a una nota que ya no existe.
const mencionadas = [...indice.matchAll(/`([a-z0-9_]+\.md)`/g)].map((m) => m[1]);
const huerfanas = [...new Set(mencionadas)].filter((m) => !notas.includes(m));

if (faltan.length === 0 && huerfanas.length === 0) {
  console.log(`ai_context: ${notas.length} notas, todas en el indice.`);
  process.exit(0);
}

if (faltan.length) {
  console.error(`Notas sin linea en ${INDICE} (${faltan.length}):`);
  for (const f of faltan) console.error(`  - ${f}`);
}
if (huerfanas.length) {
  console.error(`El indice menciona notas que no existen (${huerfanas.length}):`);
  for (const h of huerfanas) console.error(`  - ${h}`);
}
process.exit(1);
