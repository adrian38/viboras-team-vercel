// Los colores salen de theme.css. Esta guarda lo defiende.
//
//   node tools/palette.mjs
//
// El 2026-11-01 habia 95 usos de un color que no estaba en la paleta y 47 que
// escribian a mano un valor que si tenia token. Ninguno daba error: la app
// seguia siendo de carbono y oro, pero /comunidad era sepia, /valorar tenia
// cuatro oros y cinco grises propios, y cambiar --vt-muted no movia nada de
// eso. Un color suelto no se nota de uno en uno; se nota cuando ya son cien.
//
// Lo que comprueba, en los .html, .js y .css de CARPETAS:
//
//   1. Ningun color literal fuera de la lista de excepciones.
//   2. Ningun valor de la paleta escrito a mano en vez de su var(--vt-*).
//   3. Ningun var(--vt-...) que no exista en theme.css: la reserva ganaria
//      siempre y el token seria mentira (paso con --vt-outline).
//
// Lo que NO ve:
//
// - Los rgba(). Llevan alpha y CSS no deja meter una var() dentro de rgba(),
//   asi que ahi el literal es la unica via. Si el color base de uno se separa
//   de su token, esto no lo nota.
// - Lo que hay dentro de un comentario, que se borra antes de mirar: en los
//   comentarios se explican los colores y nombrarlos no es usarlos.
// - Una carpeta nueva de presentacion que nadie anada a CARPETAS. No recorre
//   el arbol: la lista es explicita y hay que mantenerla.
//
// Detalle: ai_context/sistema_visual_viper_strike.md
import { readFileSync, readdirSync } from 'node:fs';

const HOJA = 'front/theme.css';

// Donde vive la presentacion: las veinte paginas, el JavaScript y el CSS que
// comparten, y lo que queda en la raiz (sw.js). Hasta el 2026-11-01 esto era
// un readdirSync('.') y bastaba, porque todo estaba en la raiz.
//
// api/ se queda fuera a proposito: sus quince colores literales son el HTML
// de los correos (api/_correo.js), donde una var() no vale porque el cliente
// de correo no carga theme.css. Meterlos aqui serian quince excepciones que
// no defienden nada.
const CARPETAS = ['.', 'front', 'pantallas'];

// Lo que puede llevar un color literal, y por que.
const EXCEPCIONES = [
  { fichero: 'front/theme.css', color: '#000', motivo: 'iguala el negro de splash.mp4' },
  { fichero: 'pantallas/results.html', color: '#25d366', motivo: 'verde de WhatsApp' },
  { fichero: 'pantallas/results.html', color: '#1ebe5d', motivo: 'verde de WhatsApp, al pasar por encima' },
  { fichero: 'pantallas/results.html', color: '#07301a', motivo: 'texto sobre el verde de WhatsApp' }
];

const normalizar = (c) => {
  const v = c.toLowerCase();
  return /^#[0-9a-f]{3}$/.test(v) ? `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}` : v;
};

// Deja el comentario en blanco pero conserva sus saltos, para que los numeros
// de linea sigan siendo los del fichero.
const enBlanco = (t) => t.replace(/[^\n]/g, ' ');
const sinComentarios = (texto) => texto
  .replace(/\/\*[\s\S]*?\*\//g, enBlanco)
  .replace(/<!--[\s\S]*?-->/g, enBlanco)
  .replace(/(^|[^:])\/\/[^\n]*/g, (m, antes) => antes + enBlanco(m.slice(antes.length)));

const hoja = sinComentarios(readFileSync(HOJA, 'utf8'));
const desde = hoja.indexOf(':root{');
const root = hoja.slice(desde, hoja.indexOf('\n}', desde));

const tokens = new Map();      // --vt-x  -> valor
const porValor = new Map();    // #rrggbb -> --vt-x
for (const m of root.matchAll(/(--vt-[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
  const valor = m[2].trim();
  tokens.set(m[1], valor);
  if (valor.startsWith('#')) porValor.set(normalizar(valor), m[1]);
}
if (tokens.size === 0) {
  console.error(`No se ha podido leer el :root de ${HOJA}.`);
  process.exit(1);
}

const permitido = (fichero, color) => EXCEPCIONES.some(
  (e) => e.fichero === fichero && normalizar(e.color) === normalizar(color)
);

const problemas = [];
const ficheros = CARPETAS.flatMap((carpeta) => readdirSync(carpeta, { withFileTypes: true })
  .filter((e) => e.isFile() && /\.(html|css|js)$/.test(e.name))
  .map((e) => (carpeta === '.' ? e.name : `${carpeta}/${e.name}`))).sort();

for (const fichero of ficheros) {
  const lineas = sinComentarios(readFileSync(fichero, 'utf8')).split('\n');

  for (let i = 0; i < lineas.length; i++) {
    const linea = lineas[i];
    // El theme-color del <head> y los href no son colores de estilo. Y en
    // theme.css el bloque :root es justo donde deben estar los literales.
    if (/name="theme-color"|href=/.test(linea)) continue;
    const enRoot = fichero === HOJA && root.includes(linea) && /--vt-/.test(linea);

    if (!enRoot) {
      for (const m of linea.matchAll(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g)) {
        const color = normalizar(m[0]);
        if (permitido(fichero, color)) continue;
        const token = porValor.get(color);
        problemas.push(token
          ? `${fichero}:${i + 1} ${m[0]} es ${token}: usa var(${token})`
          : `${fichero}:${i + 1} ${m[0]} no esta en la paleta`);
      }
    }

    for (const m of linea.matchAll(/var\(\s*(--vt-[a-z0-9-]+)/g)) {
      if (!tokens.has(m[1])) problemas.push(`${fichero}:${i + 1} ${m[1]} no existe en ${HOJA}`);
    }
  }
}

if (problemas.length === 0) {
  console.log(`paleta: ${tokens.size} tokens y ningun color suelto en ${ficheros.length} ficheros.`);
  process.exit(0);
}

console.error('Hay colores fuera de la paleta:');
for (const p of problemas) console.error(`  - ${p}`);
console.error(`\nEl color se declara en ${HOJA} y se usa con var(--vt-*).`);
console.error('Si de verdad tiene que ser literal, va a EXCEPCIONES con su motivo.');
process.exit(1);
