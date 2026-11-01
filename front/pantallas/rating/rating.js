// Lo que pinta /rating.
//
// Hasta el 2026-11-01 estas lineas vivian dentro de rating.html. Salen
// aqui sin tocar una coma; el <script> de la pagina las carga en el mismo
// sitio y sin defer, para que el orden de ejecucion no cambie.

// A donde lleva «Atrás»: lo dice quien trajo aqui, con ?volver= (lo pone
// /cuenta, que enlaza a esta pagina desde dos sitios). Solo rutas de este
// sitio —una que empiece por // o por http seria un redirect abierto—, la
// misma regla que `goBack()` en day.html. Sin ese parametro, a la portada,
// que es de donde se llega desde el menu.
function volverAtras(){
  const v = new URLSearchParams(location.search).get('volver') || '/'
  window.location = (v.startsWith('/') && !v.startsWith('//')) ? v : '/'
}

// ============================================================================
// GLICKO ENGINE
// ============================================================================

// El motor vive en /front/vt-glicko.js, uno solo para las tres paginas que lo
// usan. Se traen sus nombres a este ambito para que el resto del fichero
// siga leyendose igual que cuando el motor estaba pegado aqui.
const {
  Q,
  C_DAILY,
  INITIAL_RATING,
  INITIAL_RD,
  MIN_RD,
  MAX_RD,
  GlickoPlayer,
  g,
  expected,
  decayAllPlayersOneDay,
  getPlayerOrCreate,
  getTeamState,
  getEffectiveObservationR,
  getEffectiveObservationRd,
  clamp,
  getReliabilityWeight,
  updatePeriod
} = window.vtGlicko;

// El bucle de dias tambien vive en /front/vt-glicko.js: era el mismo en las dos
// paginas salvo tres lineas, que ahora son dos ganchos y un parametro.
const calculateEngineRatings = window.vtGlicko.calcularRatings;

// ============================================================================
// DATA FETCHING & UI RENDER
// ============================================================================

let cachedEntries = [];

// Leer los partidos del API tambien vive en /front/vt-glicko.js.
const fetchMatches = window.vtGlicko.leerPartidos;

function buildDateOptionsFromMatches(matches) {
  const isoToday = new Date().toISOString().split('T')[0];
  if (!matches || matches.length === 0) return [isoToday];

  const dates = Array.from(new Set(
    (matches || []).map(m => m && m.date).filter(Boolean)
  )).filter(date => date <= isoToday).sort();

  if (dates.length === 0) return [isoToday];

  const first = dates[0];
  let last = dates[dates.length - 1];
  if (last < isoToday) last = isoToday;

  const [y1,m1,d1] = first.split('-').map(Number);
  const [y2,m2,d2] = last.split('-').map(Number);
  let cur = Date.UTC(y1, m1 - 1, d1);
  const end = Date.UTC(y2, m2 - 1, d2);
  const ONE_DAY = 24 * 60 * 60 * 1000;
  const temp = [];
  while (cur <= end) {
    const dt = new Date(cur);
    const yyyy = dt.getUTCFullYear();
    const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(dt.getUTCDate()).padStart(2, '0');
    temp.push(`${yyyy}-${mm}-${dd}`);
    cur += ONE_DAY;
  }
  return temp.reverse();
}

function populateDateDropdown(matches) {
  const sel = document.getElementById('ratingDate');
  if (!sel) return;
  const opts = buildDateOptionsFromMatches(matches);
  sel.innerHTML = '';
  const isoToday = new Date().toISOString().split('T')[0];
  const threshold = '2026-09-01';
  for (const v of opts) {
    const o = document.createElement('option');
    o.value = v;
    const parts = v.split('-');
    const display = `${parts[2]}/${parts[1]}/${parts[0]}`;
    let label = display;
    if (v === isoToday) label += ' (Actual)';
    if (v === threshold) label += ' (Nuevo comienzo)';
    o.textContent = label;
    sel.appendChild(o);
  }
  if (opts.includes(isoToday)) sel.value = isoToday;
  else if (opts.length > 0) sel.value = opts[0];
}

function filterMatchesForCutoff(allMatches, cutoffIso) {
  if (!allMatches) return [];
  let cutoff = cutoffIso;
  if (!cutoff) {
    const dates = allMatches.map(m => m.date).filter(Boolean).sort();
    cutoff = dates.length ? dates[dates.length - 1] : new Date().toISOString().split('T')[0];
  }

  const threshold = '2026-09-01';

  return allMatches.filter(m => {
    if (!m || !m.date) return false;
    if (m.date > cutoff) return false;

    const et = (m.event_type || '').toString().toLowerCase();
    const eid = (m.event_id !== undefined && m.event_id !== null) ? Number(m.event_id) : null;

    if (cutoff >= threshold) {
      if (!['ranked','grupo_liga','pozo','compas','doble_ko'].includes(et)) return false;
      if (eid === 23 || eid === 24) return false;
      return true;
    } else {
      if (et === 'legacy') return true;
      if (et === 'pozo') return (eid === 23 || eid === 24);
      if (['ranked','grupo_liga','compas','doble_ko'].includes(et)) return true;
      return false;
    }
  });
}

function loadNames(){
  const url = '/api/read?action=getNames';
  return fetch(url)
    .then(r => { if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
    .then(db => { return (db && db.names) ? db.names : []; })
    .catch(e => { return []; });
}

function computeRatings(entries, includeInactive = false, minReliability = 'any') {
  const registered = (!includeInactive && window._registeredNames && window._registeredNames.size > 0) ? window._registeredNames : null;

  let filtered = registered
    ? entries.filter(e => registered.has(e.name))
    : entries;

  if (minReliability !== 'any') {
    filtered = filtered.filter(e => {
      const rd = Number(e.rd);
      if (!Number.isFinite(rd)) return false;

      if (minReliability === 'very_low') return rd < 350;
      if (minReliability === 'low') return rd < 250;
      if (minReliability === 'medium') return rd < 190;
      if (minReliability === 'high') return rd < 140;
      return true;
    });
  }

  filtered.sort((a, b) => {
    if (b.rating !== a.rating) return b.rating - a.rating;
    return String(a.name || '').localeCompare(String(b.name || ''), 'es', { sensitivity: 'base', numeric: true });
  });

  const out = [];
  for (let i = 0; i < filtered.length; i++) {
    const e = filtered[i];
    let rank;
    if (i === 0) rank = 1;
    else if (filtered[i].rating === filtered[i - 1].rating) rank = out[i - 1].rank;
    else rank = i + 1;
    out.push({ rank, rating: e.rating, name: e.name, rd: e.rd });
  }
  return out;
}

// getFiabilidadConfig y TIER_DEFINITIONS viven en /front/vt-categorias.js, que
// los publica como globales: los usan esta tabla, rating-export.js y la
// tarjeta de /cuenta (ai_context/categorias_de_rating.md).

function renderTable(rows) {
  if (!rows || rows.length === 0) {
    document.getElementById('ratingContainer').innerHTML = '<div class="muted">No hay jugadores que coincidan con los filtros</div>';
    return;
  }

  function formatRating(num) {
    if (num === undefined || num === null || !Number.isFinite(num)) return '-';
    return num.toFixed(2).replace('.', ',');
  }

  const html = [];

  for (const tier of TIER_DEFINITIONS) {
    const tierRows = rows.filter(r => r.rating > tier.min && r.rating <= tier.max);
    if (tierRows.length === 0) continue;

    html.push(`
      <div class="tier-section tier-${tier.key}">
        <div class="tier-title">
          <span>${tier.title}</span>
          <span class="tier-subtitle">${tier.rangeText}</span>
        </div>
        <table aria-label="Rating ${tier.title}">
          <thead>
            <tr>
              <th class="rank-col">Pos</th>
              <th>Jugador</th>
              <th class="rating-col">Rating</th>
              <th class="fiabilidad-col">Fiabilidad</th>
            </tr>
          </thead>
          <tbody>
    `);

    for (const r of tierRows) {
      const { bars, color, label } = getFiabilidadConfig(r.rd);
      const ratingFormatted = formatRating(r.rating);

      let segmentsHtml = '';
      for (let i = 1; i <= 5; i++) {
        const activeBg = i <= bars ? color : 'var(--vt-border-strong)';
        segmentsHtml += `<span class="progress-segment" style="background-color: ${activeBg};"></span>`;
      }

      const progressHtml = `
        <div class="progress-segmented" title="${label}">
          ${segmentsHtml}
        </div>
      `;

      const showRD = (document.getElementById('toggleShowRD') && document.getElementById('toggleShowRD').checked) ? true : false;
      let reliabilityHtml;
      if (showRD) {
        const rdVal = (r.rd === undefined || r.rd === null || !Number.isFinite(Number(r.rd))) ? '-' : Number(Number(r.rd)).toFixed(2).replace('.', ',');
        reliabilityHtml = `<div style="color:var(--vt-muted);font-weight:400;font-variant-numeric:tabular-nums">${rdVal}</div>`;
      } else {
        reliabilityHtml = progressHtml;
      }

      const playerLink = `/players?player=${encodeURIComponent(r.name)}`;

      html.push(`<tr>
        <td class="rank-col">${r.rank}</td>
        <td class="name-col"><a href="${playerLink}" style="color:inherit; text-decoration:none; cursor:pointer;">${escapeHtml(r.name)}</a></td>
        <td class="rating-col">${ratingFormatted}</td>
        <td class="fiabilidad-col">${reliabilityHtml}</td>
      </tr>`);
    }

    html.push(`
          </tbody>
        </table>
      </div>
    `);
  }

  document.getElementById('ratingContainer').innerHTML = html.join('');
}

function handleFilterChange() {
  const showInactive = document.getElementById('toggleInactive').checked;
  const minReliability = document.getElementById('minReliability').value;
  const dateSel = document.getElementById('ratingDate');
  const selected = dateSel ? dateSel.value : 'latest';

  const names = window._allNames || [];
  const allMatches = window._allMatches || [];
  const matchesForDate = filterMatchesForCutoff(allMatches, selected);

  cachedEntries = calculateEngineRatings(names, matchesForDate, selected);

  const ranked = computeRatings(cachedEntries, showInactive, minReliability);
  renderTable(ranked);
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, function(c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

async function init() {
  const [names, matches] = await Promise.all([
    loadNames(),
    fetchMatches(), window.vtNivel.listo, window.vtInicial.listo
  ]);

  window._registeredNames = new Set((names || []).map(n => String(n).trim()).filter(Boolean));
  window._allNames = names || [];
  window._allMatches = matches || [];

  populateDateDropdown(window._allMatches);

  handleFilterChange();
}

vtCargando.arranque(init, 'Calculando el rating');
