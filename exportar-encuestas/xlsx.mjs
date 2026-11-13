// .xlsx de varias hojas sin librerias, para los scripts de Node. Es el mismo
// zip «store» de unos pocos XML que front/comun/excel-export.js, el que
// descarga el navegador, con dos diferencias: escribe un fichero en disco en
// vez de un Blob, y admite varias hojas en el mismo libro.
//
//   escribirLibro('ruta.xlsx', [{ nombre: 'Opiniones', filas: [cabecera, ...] }])
//
// Cada celda es un numero (sale como numero en Excel) o cualquier otra cosa,
// que sale como texto en `inlineStr`: un valor que empiece por = no se
// ejecuta como formula.
//
// Detalle: ai_context/exportar_encuestas_desde_el_escritorio.md
import { writeFileSync } from 'node:fs';

const TABLA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = TABLA_CRC[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function cabeceraZip(firma, campos) {
  const vista = new DataView(new ArrayBuffer(4 + campos.reduce((s, c) => s + c[1], 0)));
  vista.setUint32(0, firma, true);
  let pos = 4;
  for (const [valor, bytes] of campos) {
    if (bytes === 2) vista.setUint16(pos, valor, true); else vista.setUint32(pos, valor, true);
    pos += bytes;
  }
  return Buffer.from(vista.buffer);
}

// Zip «store»: sin comprimir, que Excel acepta y ahorra una libreria.
function zip(ficheros) {
  const partes = [], central = [];
  let offset = 0;
  for (const f of ficheros) {
    const nombre = Buffer.from(f.nombre, 'utf8');
    const datos = Buffer.from(f.texto, 'utf8');
    const comun = [[20, 2], [0x0800, 2], [0, 2], [0, 2], [0x21, 2], [crc32(datos), 4],
      [datos.length, 4], [datos.length, 4], [nombre.length, 2], [0, 2]];
    const local = cabeceraZip(0x04034b50, comun);
    partes.push(local, nombre, datos);
    central.push(cabeceraZip(0x02014b50, [[20, 2], ...comun, [0, 2], [0, 2], [0, 2], [0, 4], [offset, 4]]), nombre);
    offset += local.length + nombre.length + datos.length;
  }
  const tamCentral = central.reduce((s, p) => s + p.length, 0);
  const fin = cabeceraZip(0x06054b50,
    [[0, 2], [0, 2], [ficheros.length, 2], [ficheros.length, 2], [tamCentral, 4], [offset, 4], [0, 2]]);
  return Buffer.concat([...partes, ...central, fin]);
}

function xml(texto) {
  return String(texto)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function columna(i) {
  let s = '';
  for (i += 1; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + (i - 1) % 26) + s;
  return s;
}

// Estilos: 0 normal, 1 negrita (cabecera), 2 numero con dos decimales.
function celda(valor, ref, esCabecera) {
  if (typeof valor === 'number' && Number.isFinite(valor)) {
    const estilo = Number.isInteger(valor) ? '' : ' s="2"';
    return `<c r="${ref}"${estilo}><v>${valor}</v></c>`;
  }
  if (valor === undefined || valor === null || valor === '') return '';
  return `<c r="${ref}" t="inlineStr"${esCabecera ? ' s="1"' : ''}>` +
    `<is><t xml:space="preserve">${xml(valor)}</t></is></c>`;
}

function anchos(filas) {
  const max = [];
  for (const f of filas) {
    f.forEach((v, i) => {
      max[i] = Math.max(max[i] || 0, String(v === undefined || v === null ? '' : v).length);
    });
  }
  return '<cols>' + max.map((m, i) =>
    `<col min="${i + 1}" max="${i + 1}" width="${Math.min(Math.max(m + 2, 8), 50)}" customWidth="1"/>`
  ).join('') + '</cols>';
}

// Cabecera fija al desplazarse y con filtros, que es lo primero que se pide.
function hoja(filas) {
  const ultima = columna(Math.max(filas[0].length, 1) - 1) + filas.length;
  const cuerpo = filas.map((f, r) =>
    `<row r="${r + 1}">` + f.map((v, c) => celda(v, columna(c) + (r + 1), r === 0)).join('') + '</row>'
  ).join('');
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<sheetViews><sheetView workbookViewId="0">' +
    '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
    anchos(filas) + '<sheetData>' + cuerpo + '</sheetData>' +
    `<autoFilter ref="A1:${ultima}"/></worksheet>`;
}

const ESTILOS = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
  '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font>' +
  '<font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
  '<fills count="2"><fill><patternFill patternType="none"/></fill>' +
  '<fill><patternFill patternType="gray125"/></fill></fills>' +
  '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
  '<xf numFmtId="2" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs>' +
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
  '</styleSheet>';

const CAB = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const TIPO = 'application/vnd.openxmlformats-officedocument.spreadsheetml';

// Excel rechaza un nombre de hoja con : \ / ? * [ ] o de mas de 31 caracteres.
function nombreDeHoja(nombre, i) {
  const limpio = String(nombre || '').replace(/[:\\/?*[\]]/g, ' ').trim().slice(0, 31);
  return limpio || `Hoja${i + 1}`;
}

function partesDelLibro(hojas) {
  const tipos = hojas.map((_, i) =>
    `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="${TIPO}.worksheet+xml"/>`).join('');
  const sheets = hojas.map((h, i) =>
    `<sheet name="${xml(nombreDeHoja(h.nombre, i))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('');
  const rels = hojas.map((_, i) =>
    `<Relationship Id="rId${i + 1}" Type="${REL}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('');
  return { tipos, sheets, rels };
}

export function libro(hojas) {
  const { tipos, sheets, rels } = partesDelLibro(hojas);
  const estilos = `rId${hojas.length + 1}`;
  return [
    { nombre: '[Content_Types].xml', texto: CAB +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      `<Override PartName="/xl/workbook.xml" ContentType="${TIPO}.sheet.main+xml"/>` + tipos +
      `<Override PartName="/xl/styles.xml" ContentType="${TIPO}.styles+xml"/></Types>` },
    { nombre: '_rels/.rels', texto: CAB +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      `<Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { nombre: 'xl/workbook.xml', texto: CAB +
      `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${REL}">` +
      `<sheets>${sheets}</sheets></workbook>` },
    { nombre: 'xl/_rels/workbook.xml.rels', texto: CAB +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + rels +
      `<Relationship Id="${estilos}" Type="${REL}/styles" Target="styles.xml"/></Relationships>` },
    ...hojas.map((h, i) => ({ nombre: `xl/worksheets/sheet${i + 1}.xml`, texto: hoja(h.filas) })),
    { nombre: 'xl/styles.xml', texto: ESTILOS }
  ];
}

export function escribirLibro(ruta, hojas) {
  writeFileSync(ruta, zip(libro(hojas)));
}
