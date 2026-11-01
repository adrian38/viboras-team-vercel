// Descarga de una hoja de Excel (.xlsx) sin librerías: un .xlsx es un zip de
// unos pocos XML, y aquí se escribe a mano, sin comprimir. La usan «Descargar
// resultados» (history.html) y «Exportar jugadores» (rating-export.js).
//
//   vtExcel.descargar('resultados.xlsx', 'Resultados', [cabecera, ...filas])
//
// Cada celda es un número (sale como número en Excel) o cualquier otra cosa,
// que sale como texto. El texto nunca se interpreta como fórmula, así que un
// nombre que empiece por = no se ejecuta.
//
// Detalle: ai_context/exportar_jugadores.md
(function () {
  var TABLA_CRC = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) c = TABLA_CRC[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function cabeceraZip(firma, campos) {
    var vista = new DataView(new ArrayBuffer(4 + campos.reduce(function (s, c) { return s + c[1]; }, 0)));
    vista.setUint32(0, firma, true);
    var pos = 4;
    campos.forEach(function (c) {
      if (c[1] === 2) vista.setUint16(pos, c[0], true); else vista.setUint32(pos, c[0], true);
      pos += c[1];
    });
    return new Uint8Array(vista.buffer);
  }

  // Zip "store": sin compresión, que Excel acepta y evita una librería.
  function zip(ficheros) {
    var cod = new TextEncoder();
    var partes = [], central = [], offset = 0;
    ficheros.forEach(function (f) {
      var nombre = cod.encode(f.nombre), datos = cod.encode(f.texto), crc = crc32(datos);
      var comun = [[20, 2], [0x0800, 2], [0, 2], [0, 2], [0x21, 2], [crc, 4], [datos.length, 4], [datos.length, 4], [nombre.length, 2], [0, 2]];
      var local = cabeceraZip(0x04034b50, comun);
      partes.push(local, nombre, datos);
      central.push(cabeceraZip(0x02014b50, [[20, 2]].concat(comun, [[0, 2], [0, 2], [0, 2], [0, 4], [offset, 4]])), nombre);
      offset += local.length + nombre.length + datos.length;
    });
    var tamCentral = central.reduce(function (s, p) { return s + p.length; }, 0);
    var fin = cabeceraZip(0x06054b50, [[0, 2], [0, 2], [ficheros.length, 2], [ficheros.length, 2], [tamCentral, 4], [offset, 4], [0, 2]]);
    return new Blob(partes.concat(central, [fin]), { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  function xml(texto) {
    return String(texto)
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function columna(i) {
    var s = '';
    for (i += 1; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + (i - 1) % 26) + s;
    return s;
  }

  // Estilos: 0 normal, 1 negrita (cabecera), 2 número con dos decimales.
  function celda(valor, ref, esCabecera) {
    if (typeof valor === 'number' && Number.isFinite(valor)) {
      var estilo = Number.isInteger(valor) ? '' : ' s="2"';
      return '<c r="' + ref + '"' + estilo + '><v>' + valor + '</v></c>';
    }
    if (valor === undefined || valor === null || valor === '') return '';
    return '<c r="' + ref + '" t="inlineStr"' + (esCabecera ? ' s="1"' : '') + '><is><t xml:space="preserve">' + xml(valor) + '</t></is></c>';
  }

  function anchos(filas) {
    var max = [];
    filas.forEach(function (f) {
      f.forEach(function (v, i) { max[i] = Math.max(max[i] || 0, String(v === undefined || v === null ? '' : v).length); });
    });
    return '<cols>' + max.map(function (m, i) {
      return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + Math.min(Math.max(m + 2, 8), 50) + '" customWidth="1"/>';
    }).join('') + '</cols>';
  }

  // Cabecera fija al desplazarse y con filtros, que es lo primero que se pide.
  function hoja(filas) {
    var ultima = columna(Math.max(filas[0].length, 1) - 1) + filas.length;
    var cuerpo = filas.map(function (f, r) {
      return '<row r="' + (r + 1) + '">' + f.map(function (v, c) { return celda(v, columna(c) + (r + 1), r === 0); }).join('') + '</row>';
    }).join('');
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
      anchos(filas) + '<sheetData>' + cuerpo + '</sheetData><autoFilter ref="A1:' + ultima + '"/></worksheet>';
  }

  var ESTILOS = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
    '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
    '<xf numFmtId="2" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs>' +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
    '</styleSheet>';

  function libro(nombreHoja, filas) {
    var cab = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
    var rel = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
    var tipo = 'application/vnd.openxmlformats-officedocument.spreadsheetml';
    return [
      { nombre: '[Content_Types].xml', texto: cab + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="' + tipo + '.sheet.main+xml"/>' +
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="' + tipo + '.worksheet+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="' + tipo + '.styles+xml"/></Types>' },
      { nombre: '_rels/.rels', texto: cab + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="' + rel + '/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
      { nombre: 'xl/workbook.xml', texto: cab + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="' + rel + '">' +
        '<sheets><sheet name="' + xml(nombreHoja).slice(0, 31) + '" sheetId="1" r:id="rId1"/></sheets></workbook>' },
      { nombre: 'xl/_rels/workbook.xml.rels', texto: cab + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="' + rel + '/worksheet" Target="worksheets/sheet1.xml"/>' +
        '<Relationship Id="rId2" Type="' + rel + '/styles" Target="styles.xml"/></Relationships>' },
      { nombre: 'xl/worksheets/sheet1.xml', texto: hoja(filas) },
      { nombre: 'xl/styles.xml', texto: ESTILOS }
    ];
  }

  function descargar(nombreFichero, nombreHoja, filas) {
    var url = URL.createObjectURL(zip(libro(nombreHoja, filas)));
    var a = document.createElement('a');
    a.href = url;
    a.download = nombreFichero;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  window.vtExcel = { descargar: descargar, libro: libro, zip: zip };
})();
