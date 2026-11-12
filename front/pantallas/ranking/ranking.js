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
const PERIODO = { desde: '2026-09-01', hasta: '2026-11-30' };

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

function hoyIso() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

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

// El corte del «ahora»: hoy mientras el periodo siga abierto, y su ultimo dia
// si ya se cerro. Sin esto, un periodo pasado seguiria moviendose.
function corteActual() {
  const hoy = hoyIso();
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
function revelacionDelPeriodo(nombres, partidos, jugaron) {
  const deAntes = window.vtGlicko.calcularRatings(nombres, partidos, diaAnterior(PERIODO.desde));
  const deAhora = window.vtGlicko.calcularRatings(nombres, partidos, corteActual());
  const antes = new Map(deAntes.map((r) => [r.name, r.rating]));
  const filas = new Map();
  deAhora.forEach((r) => {
    if (!jugaron.has(r.name) || !antes.has(r.name)) return;
    filas.set(r.name, { inicio: antes.get(r.name), actual: r.rating });
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

// Los «buen rollo» del periodo. Si falla, fair play sale a cero y las otras
// dos categorias siguen funcionando.
function fetchFairPlay() {
  const url = `/api/read?action=getFairPlay&desde=${PERIODO.desde}&hasta=${PERIODO.hasta}&ts=${Date.now()}`;
  return fetch(url)
    .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then((j) => (j && j.fairplay) ? j.fairplay : [])
    .catch((e) => { console.error('Error cargando fair play', e); return []; });
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
    detalle: ['Partidos', 'Torneos'],
    celdas: (f) => [f.partidos, f.torneos],
    puntos: (f) => f.partidos + f.torneos,
    escribir: (v) => v.toLocaleString('es-ES'),
    vacio: 'Nadie ha jugado todavia en este periodo'
  },
  fairplay: {
    nombre: 'Fair play',
    detalle: ['Valoraciones'],
    celdas: (f) => [f.valoraciones],
    puntos: (f) => f.buenRollo,
    escribir: (v) => v.toLocaleString('es-ES'),
    vacio: 'Todavia no hay valoraciones en este periodo'
  },
  revelacion: {
    nombre: 'Revelación',
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
            <th class="points-col">${cat === CATEGORIAS.revelacion ? 'Nivel' : 'Puntos'}</th>
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

function fairPlayEnFilas(lista, activos) {
  const filas = new Map();
  lista.forEach((r) => {
    const n = String(r.jugador || '').trim();
    if (!n || !activos.has(n)) return;
    filas.set(n, { buenRollo: Number(r.buenRollo) || 0, valoraciones: Number(r.valoraciones) || 0 });
  });
  return filas;
}

async function init() {
  pintarPeriodo();
  try {
    const [nombres, partidos, fairplay] = await Promise.all([
      fetchActivePlayers(),
      window.vtGlicko.leerPartidos(),
      fetchFairPlay(),
      window.vtNivel.listo,
      window.vtInicial.listo
    ]);
    const activos = new Set(nombres.map((n) => String(n || '').trim()).filter(Boolean));

    const actividad = actividadDelPeriodo(partidos, activos);
    datos = {
      actividad: actividad,
      fairplay: fairPlayEnFilas(fairplay, activos),
      revelacion: revelacionDelPeriodo(Array.from(activos), partidos, new Set(actividad.keys()))
    };

    cambiarCategoria(categoriaActual);
  } catch (err) {
    console.error('Error al inicializar el ranking:', err);
    document.getElementById('rankingBody').innerHTML =
      '<tr><td colspan="5" class="muted" style="text-align:center; padding: 24px;">Error cargando los datos del ranking</td></tr>';
  }
}

vtCargando.arranque(init, 'Calculando el ranking');
