// Lo que pinta /ranking.
//
// Tres clasificaciones independientes —Actividad, Fair play y Revelacion—,
// que son el sistema que describe /ranking-info desde el 2026-11-12. Antes
// habia una sola tabla: dos mejores torneos puntuados por puesto, una tabla
// de liga que no aplicaba nadie (ligasPts valia 0 siempre) y 2 puntos por
// partido con tope de 20.
// Detalle: ai_context/ranking_tres_categorias.md

// El periodo del ranking, escrito a mano: nadie reinicia nada solo, asi que
// al empezar un trimestre nuevo hay que cambiar estas dos fechas. Hasta el
// 2026-11-12 vivia en el HTML como adorno y no entraba en ningun calculo;
// lo que separaba periodos era excluir a mano los event_id 23 y 24.
//
// Es el trimestre natural desde el 2026-11-12, que es lo que promete
// /ranking-info («Cada trimestre natural, las puntuaciones se reinician»).
// Antes iba del 01/09 al 30/11 y no lo era. El siguiente es 01/01-31/03.
const PERIODO = { desde: '2026-10-01', hasta: '2026-12-31' };

// Los tipos de evento que cuentan como «un torneo» y no como sus partidos:
// el torneo entero vale un punto, se jueguen tres partidos o quince.
const TORNEOS = new Set(['pozo', 'compas', 'doble_ko']);

// Las tres tablas ya calculadas, y cual se esta viendo. Se llenan una sola
// vez en init: cambiar de pestana no vuelve a pedir nada.
let datos = {};
let categoriaActual = 'actividad';

// ============================================================================
// FECHAS
// ============================================================================

function diaAnterior(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d) - 24 * 60 * 60 * 1000);
  const mm = String(t.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(t.getUTCDate()).padStart(2, '0');
  return `${t.getUTCFullYear()}-${mm}-${dd}`;
}

function comoDdMmAaaa(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function enPeriodo(iso) {
  return !!iso && iso >= PERIODO.desde && iso <= PERIODO.hasta;
}

// El corte de revelacion: hoy mientras el periodo siga abierto, y su ultimo
// dia si ya se cerro. Sin esto, un periodo pasado seguiria moviendose.
//
// Fair play NO usa este corte sino hoy a secas, porque es la calificacion
// actual del jugador y tiene que ser la misma que ve en /cuenta. Mientras el
// periodo esta abierto las dos fechas coinciden y basta una pasada.
function corteActual() {
  const hoy = window.vtGlicko.hoyIso();
  return hoy < PERIODO.hasta ? hoy : PERIODO.hasta;
}

// ============================================================================
// LAS TRES CATEGORIAS
// ============================================================================

// Un punto por partido competitivo jugado y un punto por torneo jugado. Los
// partidos de dentro de un torneo no suman de uno en uno; por eso los torneos
// se cuentan por event_id y no por partido.
//
// Un partido organizado y sin jugar no llega hasta aqui: partidoDelApi
// (vt-glicko.js) descarta los que no tienen juegos.
function actividadDelPeriodo(partidos, activos) {
  const filas = new Map();
  const torneosDe = new Map();

  const fila = (n) => {
    if (!filas.has(n)) filas.set(n, { partidos: 0, torneos: 0 });
    return filas.get(n);
  };

  partidos.forEach((m) => {
    if (!enPeriodo(m.date)) return;
    const esTorneo = TORNEOS.has(m.event_type);
    m.team1.concat(m.team2).forEach((nombre) => {
      const n = String(nombre || '').trim();
      if (!n || !activos.has(n)) return;
      if (!esTorneo) { fila(n).partidos += 1; return; }
      if (!torneosDe.has(n)) torneosDe.set(n, new Set());
      torneosDe.get(n).add(m.event_id);
    });
  });

  torneosDe.forEach((ids, n) => { fila(n).torneos = ids.size; });
  return filas;
}

// Cuanto ha cambiado el nivel dentro del periodo: el rating de hoy menos el
// de la vispera del primer dia. Son dos pasadas del mismo motor con distinta
// fecha de corte; quien no jugo antes del periodo arranca de su rating de
// partida (rating-inicial.js), que es justo lo que dice el reglamento.
//
// Solo sale quien ha jugado dentro del periodo: sin partidos la diferencia es
// cero exacto, y cuarenta ceros no son una clasificacion.
function revelacionDelPeriodo(deAhora, deAntes, jugaron) {
  const antes = new Map(deAntes.map((r) => [r.name, r.rating]));
  const filas = new Map();
  deAhora.forEach((r) => {
    if (!jugaron.has(r.name) || !antes.has(r.name)) return;
    filas.set(r.name, { inicio: antes.get(r.name), actual: r.rating });
  });
  return filas;
}

// Fair play es la calificacion de 1 a 5 del jugador, la misma que enseñan
// /cuenta y /comunidad: las opiniones de ambiente pesadas por la fiabilidad
// de su ranking (ai_context/calificacion_de_estrellas.md).
//
// Es el valor ACTUAL, no el del periodo: la calificacion se calcula sobre
// todas las opiniones recibidas y sobre el RD de hoy. Por eso esta categoria
// no se pone a cero al empezar un trimestre, a diferencia de las otras dos.
//
// Sale quien tenga calificacion: sin una sola opinion de ambiente no hay nada
// que puntuar, y un 3 de oficio seria un dato inventado.
function fairPlayAhora(comunidad, deAhora, activos) {
  const rd = new Map(deAhora.map((r) => [r.name, r.rd]));
  const filas = new Map();
  comunidad.forEach((j) => {
    const n = String(j.nombre || '').trim();
    if (!n || !activos.has(n)) return;
    const calificacion = window.vtCalificacion.deJugador(j.buenRollo, rd.get(n));
    if (calificacion === null) return;
    filas.set(n, {
      calificacion: calificacion,
      votos: j.votos,
      fiabilidad: window.vtCalificacion.fiabilidadDeRd(rd.get(n))
    });
  });
  return filas;
}

// ============================================================================
// FETCH
// ============================================================================

function fetchActivePlayers() {
  return fetch('/api/read?action=getNames')
    .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then((db) => (db && db.names) ? db.names : [])
    .catch((e) => { console.error('Error cargando jugadores', e); return []; });
}

// Las opiniones de ambiente de cada jugador, que es la mitad de su
// calificacion; la otra mitad, el RD, la pone el motor. Es el mismo endpoint
// que usa /comunidad, asi que las dos pantallas ensenan el mismo numero.
// Si falla, fair play sale vacio y las otras dos categorias siguen.
function fetchComunidad() {
  return fetch('/api/read?action=getComunidad&ts=' + Date.now())
    .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then((j) => (j && j.jugadores) ? j.jugadores : [])
    .catch((e) => { console.error('Error cargando las opiniones', e); return []; });
}

// ============================================================================
// LAS TABLAS
// ============================================================================

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function conSigno(n) {
  const r = Math.round(n);
  return (r > 0 ? '+' : '') + r.toLocaleString('es-ES');
}

// Cada categoria dice como se llama, que columnas de detalle ensena, como
// saca sus puntos de la fila y como se escriben.
const CATEGORIAS = {
  actividad: {
    nombre: 'Actividad',
    columna: 'Puntos',
    detalle: ['Partidos', 'Torneos'],
    celdas: (f) => [f.partidos, f.torneos],
    puntos: (f) => f.partidos + f.torneos,
    escribir: (v) => v.toLocaleString('es-ES'),
    vacio: 'Nadie ha jugado todavia en este periodo'
  },
  fairplay: {
    nombre: 'Fair play',
    columna: 'Calificación',
    detalle: ['Opiniones', 'Fiabilidad'],
    celdas: (f) => [f.votos, Math.round(f.fiabilidad * 100) + '%'],
    puntos: (f) => f.calificacion,
    escribir: (v) => v.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
    vacio: 'Todavía no hay opiniones de ambiente'
  },
  revelacion: {
    nombre: 'Revelación',
    columna: 'Nivel',
    detalle: ['Inicio', 'Actual'],
    celdas: (f) => [Math.round(f.inicio), Math.round(f.actual)],
    puntos: (f) => f.actual - f.inicio,
    escribir: conSigno,
    vacio: 'Todavia no hay niveles que comparar'
  }
};

// Empate: mismo puesto para todos, y el siguiente salta. Con dos segundos no
// hay tercero, asi que el puesto no se puede contar por filas.
function ordenar(filas, cat) {
  return Array.from(filas.entries())
    .map(([name, f]) => ({ name, celdas: cat.celdas(f), puntos: cat.puntos(f) }))
    .sort((a, b) => {
      if (b.puntos !== a.puntos) return b.puntos - a.puntos;
      return a.name.localeCompare(b.name, 'es', { sensitivity: 'base', numeric: true });
    });
}

function filaHtml(row, puesto, cat) {
  const medalla = puesto <= 3 ? puesto : 'x';
  const detalle = row.celdas.map((c) => `<td class="detail-col">${c}</td>`).join('');
  return `
      <tr>
        <td class="rank-col"><span class="pos-badge pos-${medalla}">${puesto}</span></td>
        <td class="name-col">${escapeHtml(row.name)}</td>
        ${detalle}
        <td class="points-col">${cat.escribir(row.puntos)}</td>
      </tr>`;
}

function pintarCabecera(cat) {
  const detalle = cat.detalle.map((t) => `<th class="detail-col">${t}</th>`).join('');
  document.getElementById('rankingHead').innerHTML = `
          <tr>
            <th class="rank-col">Pos</th>
            <th>Jugador</th>
            ${detalle}
            <th class="points-col">${cat.columna}</th>
          </tr>`;
}

function pintarCategoria(clave) {
  const cat = CATEGORIAS[clave];
  const tbody = document.getElementById('rankingBody');
  const columnas = cat.detalle.length + 3;
  pintarCabecera(cat);

  const filas = ordenar(datos[clave] || new Map(), cat);
  if (!filas.length) {
    tbody.innerHTML = `<tr><td colspan="${columnas}" class="muted" style="text-align:center; padding:24px;">${cat.vacio}</td></tr>`;
    return;
  }

  let puesto = 1;
  tbody.innerHTML = filas.map((row, i) => {
    if (i > 0 && row.puntos < filas[i - 1].puntos) puesto = i + 1;
    return filaHtml(row, puesto, cat);
  }).join('');
}

// ============================================================================
// PANTALLA
// ============================================================================

function toggleColumns() {
  const table = document.getElementById('rankingTable');
  const marcado = document.getElementById('toggleDetail').checked;
  table.classList.toggle('hide-detail', !marcado);
}

function cambiarCategoria(clave) {
  categoriaActual = clave;
  document.querySelectorAll('.cat-tab').forEach((b) => {
    const suya = b.dataset.cat === clave;
    b.classList.toggle('is-active', suya);
    b.setAttribute('aria-selected', suya ? 'true' : 'false');
  });
  pintarCategoria(clave);
}

function pintarPeriodo() {
  document.getElementById('periodo').textContent =
    `Periodo actual: ${comoDdMmAaaa(PERIODO.desde)} - ${comoDdMmAaaa(PERIODO.hasta)}`;
}

async function init() {
  pintarPeriodo();
  try {
    const [nombres, partidos, comunidad] = await Promise.all([
      fetchActivePlayers(),
      window.vtGlicko.leerPartidos(),
      fetchComunidad(),
      window.vtNivel.listo,
      window.vtInicial.listo
    ]);
    const activos = new Set(nombres.map((n) => String(n || '').trim()).filter(Boolean));
    const lista = Array.from(activos);

    // Recorrer el historico no es gratis, asi que se hace lo justo: con el
    // periodo abierto, el corte de revelacion y el de hoy son el mismo dia y
    // una sola pasada vale para las dos categorias.
    const hoy = window.vtGlicko.hoyIso();
    const corte = corteActual();
    const deAhora = window.vtGlicko.calcularRatings(lista, partidos, corte);
    const deAntes = window.vtGlicko.calcularRatings(lista, partidos, diaAnterior(PERIODO.desde));
    const deHoy = corte === hoy ? deAhora : window.vtGlicko.calcularRatings(lista, partidos, hoy);

    const actividad = actividadDelPeriodo(partidos, activos);
    datos = {
      actividad: actividad,
      fairplay: fairPlayAhora(comunidad, deHoy, activos),
      revelacion: revelacionDelPeriodo(deAhora, deAntes, new Set(actividad.keys()))
    };

    cambiarCategoria(categoriaActual);
  } catch (err) {
    console.error('Error al inicializar el ranking:', err);
    document.getElementById('rankingBody').innerHTML =
      '<tr><td colspan="5" class="muted" style="text-align:center; padding: 24px;">Error cargando los datos del ranking</td></tr>';
  }
}

vtCargando.arranque(init, 'Calculando el ranking');
