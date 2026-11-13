// Saca a Excel y CSV lo que hay en la base sobre las valoraciones de partido
// («encuestas»): quien vota a quien, con que, y en que partido.
//
// Esta carpeta se puede copiar a otro ordenador tal cual: solo necesita Node
// 18 o posterior (`node --version`). No hay que instalar nada.
//
//   exportar.bat                  doble clic en Windows
//   node exportar.mjs             lo mismo desde una consola
//   node exportar.mjs <cadena>    con la cadena de conexion a mano
//
// Sin argumento busca la cadena en `conexion.txt` (al lado de este fichero),
// luego en la variable POSTGRES_URL_NON_POOLING, y luego en el `.env.local`
// del proyecto, si la carpeta sigue dentro de el.
//
// SOLO LEE: ver neon.mjs. Deja los ficheros en `salida/`.
//
// Detalle: ai_context/exportar_encuestas_desde_el_escritorio.md
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { consultarSoloLectura, comprobarSoloLectura } from './neon.mjs';
import { CONSULTAS } from './consultas.mjs';
import { escribirLibro } from './xlsx.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
const CLAVE = 'POSTGRES_URL_NON_POOLING';

const AYUDA = `
No encuentro la cadena de conexion a la base. Tres maneras de darsela:

  1. Crear un fichero "conexion.txt" en esta misma carpeta, con la cadena
     dentro y nada mas. Empieza por postgres:// y la da quien lleva la base.
  2. Ejecutar:  node exportar.mjs "postgres://usuario:clave@host/neondb"
  3. Dejar la carpeta dentro del proyecto, que tiene su .env.local.
`;

function deFichero(ruta, clave) {
  if (!existsSync(ruta)) return '';
  const texto = readFileSync(ruta, 'utf8');
  if (!clave) return texto.split(/\r?\n/).map((l) => l.trim()).find((l) => l.startsWith('postgres')) || '';
  const linea = texto.split(/\r?\n/).find((l) => l.trim().startsWith(`${clave}=`));
  return linea ? linea.trim().slice(clave.length + 1).replace(/^["']|["']$/g, '') : '';
}

function buscarConexion() {
  const conexion = (process.argv[2] || '').trim()
    || deFichero(join(AQUI, 'conexion.txt'), '')
    || (process.env[CLAVE] || '').trim()
    || deFichero(join(AQUI, '..', '.env.local'), CLAVE);
  if (!conexion) throw new Error(AYUDA);
  if (!/^postgres(ql)?:\/\//.test(conexion)) {
    throw new Error('La cadena de conexion tiene que empezar por postgres://');
  }
  return conexion;
}

function csv(filas) {
  const texto = filas.map((fila) => fila.map((v) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[";\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }).join(';')).join('\r\n');
  return '﻿' + texto + '\r\n';
}

// int2/int4/int8, float4/float8 y numeric: los OID con que Postgres declara
// sus tipos numericos, que vienen en los `campos` de cada respuesta.
const OID_NUMERICOS = new Set([20, 21, 23, 700, 701, 1700]);

// Neon manda todos los valores como texto. Lo que la base declara numerico
// vuelve a ser numero, para que en Excel se pueda sumar y ordenar.
function aFilas({ filas, campos }) {
  if (!filas.length) return [['sin datos']];
  const cabecera = Object.keys(filas[0]);
  const numericas = new Set(campos.filter((c) => OID_NUMERICOS.has(c.dataTypeID)).map((c) => c.name));
  return [cabecera, ...filas.map((f) => cabecera.map((k) => {
    const v = f[k];
    if (v === null || v === undefined || v === '') return '';
    if (numericas.has(k) && Number.isFinite(Number(v))) return Number(v);
    return v;
  }))];
}

function carpetaDeSalida() {
  const ahora = new Date();
  const dos = (n) => String(n).padStart(2, '0');
  const sello = `${ahora.getFullYear()}-${dos(ahora.getMonth() + 1)}-${dos(ahora.getDate())}`
    + `-${dos(ahora.getHours())}${dos(ahora.getMinutes())}`;
  const carpeta = join(AQUI, 'salida', `encuestas-${sello}`);
  mkdirSync(carpeta, { recursive: true });
  return { carpeta, sello };
}

async function main() {
  const conexion = buscarConexion();
  const base = await comprobarSoloLectura(conexion);
  console.log(`Leyendo de la base "${base}" en modo SOLO LECTURA.`);

  const respuestas = await consultarSoloLectura(conexion, CONSULTAS.map(([, sql]) => sql));
  const hojas = CONSULTAS.map(([nombre], i) => ({
    nombre, filas: aFilas(respuestas[i]), cuantas: respuestas[i].filas.length
  }));

  const { carpeta, sello } = carpetaDeSalida();
  for (const h of hojas) {
    writeFileSync(join(carpeta, `${h.nombre.toLowerCase()}.csv`), csv(h.filas), 'utf8');
  }
  escribirLibro(join(carpeta, `viboras-encuestas-${sello}.xlsx`), hojas);

  console.log(hojas.map((h) => `  ${h.nombre}: ${h.cuantas} filas`).join('\n'));
  console.log(`\nListo. Los ficheros estan en:\n  ${carpeta}`);
}

main().catch((err) => {
  console.error(`\nNo se pudo exportar.\n${err.message}\n`);
  process.exit(1);
});
