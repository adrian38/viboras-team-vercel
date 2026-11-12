// La barra de pestanas esta escrita en todas las paginas. Esta guarda
// defiende que sigan diciendo lo mismo.
//
//   node tools/barra-navegacion.mjs
//
// Por que esta copiada y no la monta un script: tiene que existir en el primer
// pintado del documento. Montada con `defer` llegaba despues, y entre el
// primer pintado y el script la barra no estaba: un parpadeo, mas largo cuanto
// mas grande la pagina —la portada era la peor—. Y con el fundido del
// navegador es peor todavia, porque la instantanea de la pantalla que entra se
// toma antes de que corra el script, asi que la barra se desvanecia.
//
// El precio es el de siempre en este repositorio: una copia por pagina de un
// marcado que cambia a la vez, y quitar una pestana en todas menos una no da
// error. Por eso esto es una guarda y no un consejo.
//
// Comprueba tres cosas:
//
//   1. Todas las paginas tienen su <nav class="vt-nav">.
//   2. Todas lo tienen IGUAL, byte a byte, salvo el aria-current.
//   3. El aria-current de cada una es el que le toca por su ruta.
//
// Detalle: ai_context/barra_de_navegacion.md
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = 'front/pantallas';

// La misma tabla que la nota: a donde lleva cada pestana y que paginas la
// encienden. La portada es `index`, que es la carpeta `portada`.
const SECCIONES = {
  '/': ['portada'],
  '/history': ['history', 'results', 'submit-result', 'tournaments', 'day', 'pozo'],
  '/tablon': ['tablon'],
  '/comunidad': ['comunidad', 'valorar'],
  '/cuenta': ['cuenta']
};

const pestanaDe = (pagina) => {
  for (const [ruta, paginas] of Object.entries(SECCIONES)) {
    if (paginas.includes(pagina)) return ruta;
  }
  // rating y sus seis hermanas, buzon, group-normativa, inscripcion y las dos
  // satelites del pozo (pozo-info y pozo-nuevo): se llega a ellas desde las
  // tarjetas de la portada o desde /pozo, no desde la barra.
  return null;
};

const paginas = readdirSync(BASE).sort();
const problemas = [];
const marcados = new Map();

for (const pagina of paginas) {
  const texto = readFileSync(join(BASE, pagina, 'index.html'), 'utf8');
  const trozo = texto.match(/<nav class="vt-nav"[\s\S]*?<\/nav>/);
  if (!trozo) { problemas.push(`${pagina}: no tiene la barra`); continue; }

  const marcado = trozo[0];
  const esperada = pestanaDe(pagina);
  const encendidas = [...marcado.matchAll(/<a class="vt-nav__item" href="([^"]+)" aria-current="page"/g)].map((m) => m[1]);

  if (encendidas.length > 1) {
    problemas.push(`${pagina}: ${encendidas.length} pestanas encendidas (${encendidas.join(', ')})`);
  } else if ((encendidas[0] || null) !== esperada) {
    problemas.push(`${pagina}: enciende ${encendidas[0] || 'ninguna'} y le toca ${esperada || 'ninguna'}`);
  }

  // Sin el aria-current, las veinte copias tienen que ser identicas.
  //
  // Y sin el \r: once de estos ficheros estan en CRLF y nueve en LF desde
  // antes de que existiera la barra. Eso no es una diferencia de la barra, y
  // uniformarlo reescribiria once ficheros enteros por nada.
  marcados.set(pagina, marcado.replace(/ aria-current="page"/g, '').replace(/\r/g, ''));
}

const copias = new Map();
for (const [pagina, marcado] of marcados) {
  if (!copias.has(marcado)) copias.set(marcado, []);
  copias.get(marcado).push(pagina);
}

if (copias.size > 1) {
  const grupos = [...copias.values()].sort((a, b) => b.length - a.length);
  problemas.push(`la barra no es la misma en todas: ${grupos.length} versiones distintas`);
  for (const g of grupos) problemas.push(`  ${g.length}: ${g.join(', ')}`);
}

if (problemas.length === 0) {
  console.log(`barra: la misma en ${marcados.size} paginas, y cada una enciende la suya.`);
  process.exit(0);
}

console.error('La barra de pestanas no cuadra:');
for (const p of problemas) console.error(`  - ${p}`);
process.exit(1);
