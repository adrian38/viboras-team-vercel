// Techos de tamano con trinquete: 60 lineas por funcion, 600 de JavaScript por
// fichero.
//
//   node tools/code-size.mjs            comprueba
//   node tools/code-size.mjs --write    aprieta el baseline (nunca lo afloja)
//
// No es estetica, es el coste de leer: una funcion de 60 lineas son ~700 tokens
// y tres caben en la ventana; por encima, cambiar tres lineas obliga a cargar
// todo.
//
// En un .html la medida es el JavaScript de sus <script> en linea, NO el total
// del fichero. El HTML y el CSS son presentacion, y trocear el HTML no es el
// trabajo: el numero que esta guarda vigila baja cuando el JavaScript sale a un
// fichero propio, que es el refactor que de verdad abarata la lectura.
//
// Lo que ya existia cuando se puso la guarda esta perdonado en
// code-size-baseline.json. Nada de eso hay que partirlo: la regla es para lo
// que se escriba a partir de ahora.
// Detalle: ai_context/tamano_del_codigo_y_trinquete.md
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const TECHO_FN = 60;
const TECHO_JS = 600;
const BASELINE = 'tools/code-size-baseline.json';
const IGNORAR = ['.git', 'node_modules', 'backups', '.claude', '.vercel', '.codebase-memory'];

const escribir = process.argv.includes('--write');

function recorrer(dir, base, out = []) {
  for (const e of readdirSync(dir ? join(base, dir) : base, { withFileTypes: true })) {
    if (IGNORAR.includes(e.name)) continue;
    const rel = dir ? `${dir}/${e.name}` : e.name;
    if (e.isDirectory()) recorrer(rel, base, out);
    else if (/\.(html|js|mjs)$/.test(e.name)) out.push(rel);
  }
  return out;
}

// Bloques <script> sin src. Devuelve el codigo y la linea en que empieza, para
// que el aviso apunte a la linea real del .html.
function bloquesEnLinea(src) {
  const out = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(src))) {
    if (/\bsrc\s*=/i.test(m[1])) continue;
    const hasta = src.slice(0, m.index + m[0].indexOf('>') + 1);
    out.push({ linea: hasta.split('\n').length, codigo: m[2] });
  }
  return out;
}

// Un '{' dentro de una cadena descuadra el conteo de llaves, y rating-parity.mjs
// tiene justamente eso. Asi que antes de medir se blanquea todo lo que no es
// codigo —cadenas, plantillas con sus ${}, comentarios y regex— conservando los
// saltos de linea para que las lineas sigan cuadrando.
const PALABRAS_ANTES_DE_REGEX = new Set([
  'return', 'typeof', 'case', 'in', 'of', 'new', 'delete', 'void', 'do', 'else',
  'yield', 'await', 'instanceof',
]);

function inicioDeRegex(codigo, i) {
  let k = i - 1;
  while (k >= 0 && /\s/.test(codigo[k])) k--;
  if (k < 0) return true;
  if ('(,=:[!&|?{};+-*%~^<>'.includes(codigo[k])) return true;
  let fin = k + 1;
  while (k >= 0 && /[\w$]/.test(codigo[k])) k--;
  return PALABRAS_ANTES_DE_REGEX.has(codigo.slice(k + 1, fin));
}

// Los cuatro reciben la posicion de su primer caracter y devuelven la posicion
// siguiente al constructo, o -1 si no empieza ahi.
function finDeComentario(codigo, i) {
  if (codigo[i] !== '/') return -1;
  if (codigo[i + 1] === '/') {
    const fin = codigo.indexOf('\n', i);
    return fin < 0 ? codigo.length : fin;
  }
  if (codigo[i + 1] === '*') {
    const fin = codigo.indexOf('*/', i + 2);
    return fin < 0 ? codigo.length : fin + 2;
  }
  return -1;
}

function finDeCadena(codigo, i) {
  const comilla = codigo[i];
  if (comilla !== '"' && comilla !== "'") return -1;
  let j = i + 1;
  while (j < codigo.length) {
    const e = codigo[j];
    if (e === '\\') { j += 2; continue; }
    if (e === comilla || e === '\n') break;
    j++;
  }
  return j + 1;
}

// La plantilla entera, incluidas sus ${}: las llaves de dentro estan
// equilibradas, asi que saltarlas no descuadra el conteo.
function finDePlantilla(codigo, i) {
  if (codigo[i] !== '`') return -1;
  let j = i + 1;
  let prof = 0;
  while (j < codigo.length) {
    const e = codigo[j];
    if (e === '\\') { j += 2; continue; }
    if (e === '$' && codigo[j + 1] === '{') { prof++; j += 2; continue; }
    if (prof > 0) {
      if (e === '{') prof++;
      else if (e === '}') prof--;
      j++;
      continue;
    }
    if (e === '`') break;
    j++;
  }
  return j + 1;
}

function finDeRegex(codigo, i) {
  if (codigo[i] !== '/' || !inicioDeRegex(codigo, i)) return -1;
  let j = i + 1;
  let clase = false;
  while (j < codigo.length) {
    const e = codigo[j];
    if (e === '\\') { j += 2; continue; }
    // Sin cerrar en su linea no era una regex, era una division.
    if (e === '\n') return -1;
    if (clase) { if (e === ']') clase = false; j++; continue; }
    if (e === '[') { clase = true; j++; continue; }
    if (e === '/') return j + 1;
    j++;
  }
  return -1;
}

function enmascarar(codigo) {
  const out = codigo.split('');
  let i = 0;
  while (i < codigo.length) {
    const fin = [finDeComentario, finDeCadena, finDePlantilla, finDeRegex]
      .reduce((f, buscar) => (f < 0 ? buscar(codigo, i) : f), -1);
    if (fin < 0) { i++; continue; }
    for (let k = i; k < fin && k < out.length; k++) {
      if (out[k] !== '\n') out[k] = ' ';
    }
    i = fin;
  }
  return out.join('');
}

// Ve `function f(`, `const f = (...) =>` y `const f = function(`. NO ve metodos
// de objeto ni funciones anonimas, y no mira dentro de las plantillas: un
// resultado vacio no prueba que no haya codigo, igual que con el grafo
// (AGENTS.md).
const DECLARACION = /(?:^|\n)[ \t]*(?:export\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)\s*\(/g;
const ASIGNACION = /(?:^|\n)[ \t]*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function\s*\*?\s*[A-Za-z_$]*\s*\(|\([^)]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>)/g;

function funciones(codigo, linea0, fichero, rotas) {
  const mascara = enmascarar(codigo);
  const out = [];
  for (const re of [DECLARACION, ASIGNACION]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(mascara))) {
      const abre = mascara.indexOf('{', m.index);
      if (abre < 0) continue;
      let prof = 0;
      let j = abre;
      for (; j < mascara.length; j++) {
        if (mascara[j] === '{') prof++;
        else if (mascara[j] === '}') {
          prof--;
          if (prof === 0) { j++; break; }
        }
      }
      // Llaves sin cerrar: el conteo seria mentira. Se dice en vez de perdonar.
      if (prof !== 0) {
        rotas.push(`${fichero}: no se pudo medir ${m[1]} (llaves sin cerrar)`);
        continue;
      }
      out.push({
        nombre: m[1],
        lineas: codigo.slice(m.index, j).trim().split('\n').length,
        linea: linea0 + codigo.slice(0, m.index).split('\n').length - 1,
      });
    }
  }
  return out;
}

const raiz = process.cwd();
const rotas = [];
const fns = [];
const ficheros = [];

for (const f of recorrer('', raiz).sort()) {
  const src = readFileSync(join(raiz, f), 'utf8');
  if (f.endsWith('.html')) {
    let js = 0;
    for (const b of bloquesEnLinea(src)) {
      js += b.codigo.split('\n').length - 1;
      fns.push(...funciones(b.codigo, b.linea, f, rotas).map((x) => ({ ...x, f })));
    }
    if (js > 0) ficheros.push({ f, lineas: js });
  } else {
    ficheros.push({ f, lineas: src.split('\n').length });
    fns.push(...funciones(src, 1, f, rotas).map((x) => ({ ...x, f })));
  }
}

// Mismo nombre dos veces en un fichero: se queda la mas larga, que es la que
// tiene que caber bajo el techo.
const medidoFn = new Map();
for (const x of fns) {
  const k = `${x.f}:${x.nombre}`;
  if (!medidoFn.has(k) || medidoFn.get(k).lineas < x.lineas) medidoFn.set(k, x);
}
const medidoFich = new Map(ficheros.map((x) => [x.f, x]));

let baseline = null;
try {
  baseline = JSON.parse(readFileSync(join(raiz, BASELINE), 'utf8'));
} catch {
  if (!escribir) {
    console.error(`Falta ${BASELINE}. Generarlo con: node tools/code-size.mjs --write`);
    process.exit(1);
  }
}

const perdonadasFn = baseline?.funciones ?? {};
const perdonadosFich = baseline?.ficheros ?? {};

const regresiones = [];
const nuevas = [];
const caducadas = [];

function revisar(medido, perdonados, techo, clase) {
  for (const [k, x] of medido) {
    const perdonado = perdonados[k];
    if (x.lineas <= techo) {
      if (perdonado !== undefined) caducadas.push(`${clase} ${k}: ya cumple (${x.lineas})`);
      continue;
    }
    if (perdonado === undefined) {
      const donde = x.linea ? ` -> ${x.f}:${x.linea}` : '';
      nuevas.push(`${clase} ${k}: ${x.lineas} lineas, techo ${techo}${donde}`);
    } else if (x.lineas > perdonado) {
      regresiones.push(`${clase} ${k}: ${perdonado} -> ${x.lineas} lineas`);
    } else if (x.lineas < perdonado) {
      caducadas.push(`${clase} ${k}: bajo de ${perdonado} a ${x.lineas}`);
    }
  }
  for (const k of Object.keys(perdonados)) {
    if (!medido.has(k)) caducadas.push(`${clase} ${k}: ya no existe`);
  }
}

revisar(medidoFn, perdonadasFn, TECHO_FN, 'funcion');
revisar(medidoFich, perdonadosFich, TECHO_JS, 'fichero');

if (escribir) {
  // El baseline SOLO encoge: nunca se anade una entrada nueva ni se sube una
  // existente, asi que --write no puede blanquear una regresion.
  const primeraVez = baseline === null;
  const apretar = (medido, perdonados, techo) => {
    if (primeraVez) {
      return Object.fromEntries(
        [...medido].filter(([, x]) => x.lineas > techo).map(([k, x]) => [k, x.lineas]),
      );
    }
    const out = {};
    for (const [k, v] of Object.entries(perdonados)) {
      const x = medido.get(k);
      if (!x || x.lineas <= techo) continue;
      out[k] = Math.min(x.lineas, v);
    }
    return out;
  };
  const nuevo = {
    _comentario:
      `Perdonados: lo que ya pasaba del techo (${TECHO_FN} lineas por funcion, ` +
      `${TECHO_JS} de JavaScript por fichero) cuando se puso la guarda. Esta ` +
      'lista solo encoge; --write nunca anade ni sube una entrada.',
    funciones: apretar(medidoFn, perdonadasFn, TECHO_FN),
    ficheros: apretar(medidoFich, perdonadosFich, TECHO_JS),
  };
  writeFileSync(join(raiz, BASELINE), `${JSON.stringify(nuevo, null, 2)}\n`);
  console.log(
    `${BASELINE}: ${Object.keys(nuevo.funciones).length} funciones y ` +
      `${Object.keys(nuevo.ficheros).length} ficheros perdonados.`,
  );
  // En la primera generacion todo lo que pasa del techo es, por definicion, lo
  // que se esta perdonando. Despues ya no: --write no silencia nada de esto.
  const pendientes = primeraVez ? rotas : [...rotas, ...nuevas, ...regresiones];
  if (pendientes.length) {
    console.error('\n--write no silencia esto, sigue ahi:');
    for (const x of pendientes) console.error(`  - ${x}`);
    process.exit(1);
  }
  process.exit(0);
}

if (rotas.length) {
  console.error(`No se pudo medir (${rotas.length}); revisar a mano, no dar por bueno:`);
  for (const r of rotas) console.error(`  - ${r}`);
}
if (nuevas.length) {
  console.error(`Codigo nuevo por encima del techo (${nuevas.length}):`);
  for (const n of nuevas) console.error(`  - ${n}`);
  console.error('Se parte. No se anade al baseline.');
}
if (regresiones.length) {
  console.error(`Regresiones sobre el baseline (${regresiones.length}):`);
  for (const r of regresiones) console.error(`  - ${r}`);
  console.error('Lo perdonado puede encoger, no crecer.');
}
if (caducadas.length) {
  console.error(`El baseline tiene ${caducadas.length} entradas caducadas:`);
  for (const c of caducadas) console.error(`  - ${c}`);
  console.error('Apretar con: node tools/code-size.mjs --write');
}

if (rotas.length || nuevas.length || regresiones.length || caducadas.length) {
  console.error('\nVer ai_context/tamano_del_codigo_y_trinquete.md');
  process.exit(1);
}

console.log(
  `tamano: ${medidoFn.size} funciones y ${medidoFich.size} ficheros medidos; ` +
    `${Object.keys(perdonadasFn).length} funciones y ` +
    `${Object.keys(perdonadosFich).length} ficheros perdonados.`,
);
process.exit(0);
