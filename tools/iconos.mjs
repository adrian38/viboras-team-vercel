// Los iconos salen de la lista `icon_names=` de theme.css. Esta guarda lo
// defiende.
//
//   node tools/iconos.mjs
//
// La fuente Material Symbols entera son ~300 KB, asi que el @import de
// theme.css pide solo los glifos de una lista y devuelve 5,6 KB. El precio es
// que un icono que no este en la lista **no da error**: el navegador no
// encuentra el glifo y pinta el nombre escrito en texto, dentro del boton,
// empujando lo que haya al lado.
//
// Ha pasado cuatro veces: `install_mobile` y `close` al poner el aviso de
// instalar, `home` al cambiar la barra, y `save` y `sort` el 2026-11-12. El
// sintoma no se parece a un fallo —es una palabra en minusculas donde iba un
// dibujo— y solo se ve abriendo esa pantalla.
//
// Lo que comprueba, en los .html y .js de front/ y de la raiz: que todo
// nombre de icono que se escriba esta en la lista.
//
// Lo que NO ve:
//
// - Un icono cuyo nombre sea una variable: `icono(nombre)` con el nombre
//   venido de una tabla de datos. Hoy no hay ninguno; si lo hubiera, su
//   nombre no se leeria aqui.
// - Un ayudante nuevo que monte un `.ms` de otra manera. Se reconocen los que
//   ponen la clase y escriben el texto en el mismo cuerpo, que son los dos de
//   hoy: `icono()` y `simbolo()`.
// - Que el icono exista en Material Symbols. Un nombre inventado entra en la
//   lista, Google lo ignora y el navegador lo pinta como palabra igual. Eso
//   se ve abriendo la pantalla.
//
// Detalle: ai_context/sistema_visual_viper_strike.md
import { readFileSync, readdirSync } from 'node:fs';

const HOJA = 'front/comun/theme.css';
const ARBOLES = ['front'];
const RAIZ_SUELTA = '.';

function esDeInteres(nombre) {
  return /\.(html|js)$/.test(nombre);
}

function recorrer(dir, acc = []) {
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const ruta = `${dir}/${entrada.name}`;
    if (entrada.isDirectory()) recorrer(ruta, acc);
    else if (esDeInteres(entrada.name)) acc.push(ruta);
  }
  return acc;
}

// La lista del @import, tal cual: `...&icon_names=a,b,c&display=block`.
function listaDeclarada() {
  const hoja = readFileSync(HOJA, 'utf8');
  const m = /icon_names=([a-z_,]+)/.exec(hoja);
  if (!m) {
    console.error(`No encuentro icon_names= en ${HOJA}.`);
    process.exit(1);
  }
  return m[1].split(',').filter(Boolean);
}

// Un `<span class="ms ...">nombre</span>`, lo escriba un .html o una plantilla
// de JavaScript. La clase puede llevar mas cosas (ms--sm, notranslate).
const SPAN = /class\s*=\s*(["'])([^"']*\bms\b[^"']*)\1[^>]*>\s*([a-z][a-z0-9_]*)\s*</g;

// Un ayudante que monte el icono: pone la clase `ms` y escribe el texto en el
// mismo cuerpo. Hoy son `icono()` de las pantallas del pozo y `simbolo()` de
// instalar.js. Se buscan asi, y no por su nombre, para que uno nuevo no se
// quede fuera sin que nadie se entere.
const DEFINE = /function\s+([a-zA-Z_$][\w$]*)\s*\(/g;

function ayudantesDe(texto) {
  const nombres = new Set();
  for (const m of texto.matchAll(DEFINE)) {
    const cuerpo = texto.slice(m.index, m.index + 600);
    const ponenClase = /(className\s*=|class\s*:)\s*['"][^'"]*\bms\b/.test(cuerpo);
    if (ponenClase && /textContent\s*=/.test(cuerpo)) nombres.add(m[1]);
  }
  return nombres;
}

function usosEn(texto, ayudantes) {
  const usos = [];
  for (const m of texto.matchAll(SPAN)) usos.push(m[3]);
  for (const nombre of ayudantes) {
    const llamada = new RegExp(`\\b${nombre}\\(\\s*['"]([a-z][a-z0-9_]*)['"]`, 'g');
    for (const m of texto.matchAll(llamada)) usos.push(m[1]);
  }
  return usos;
}

const declarados = new Set(listaDeclarada());
const ficheros = [
  ...ARBOLES.flatMap((d) => recorrer(d)),
  ...readdirSync(RAIZ_SUELTA, { withFileTypes: true })
    .filter((e) => e.isFile() && esDeInteres(e.name)).map((e) => e.name)
].sort();

// Los ayudantes se buscan en todo el arbol antes de mirar los usos: `icono()`
// se define en pozo.js y se llama alli mismo, pero nada impide que manana se
// defina en front/comun/ y se use en otra pantalla.
const ayudantes = new Set();
const textos = new Map();
for (const fichero of ficheros) {
  const texto = readFileSync(fichero, 'utf8');
  textos.set(fichero, texto);
  for (const nombre of ayudantesDe(texto)) ayudantes.add(nombre);
}

const usados = new Map();
const problemas = [];
for (const [fichero, texto] of textos) {
  for (const nombre of usosEn(texto, ayudantes)) {
    if (!usados.has(nombre)) usados.set(nombre, new Set());
    usados.get(nombre).add(fichero);
  }
}
for (const [nombre, donde] of usados) {
  if (!declarados.has(nombre)) problemas.push(`${nombre} -> ${[...donde].sort().join(', ')}`);
}

if (problemas.length === 0) {
  const sobran = [...declarados].filter((n) => !usados.has(n)).length;
  console.log(`iconos: ${usados.size} usados, los ${declarados.size} de la lista`
    + ` (${sobran} declarados sin uso visto) en ${ficheros.length} ficheros.`);
  process.exit(0);
}

console.error('Hay iconos que no estan en la lista de glifos y saldrian escritos en texto:');
for (const p of problemas.sort()) console.error(`  - ${p}`);
console.error(`\nSe anaden al icon_names= del @import de ${HOJA}, en orden alfabetico.`);
process.exit(1);
