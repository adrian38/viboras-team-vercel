// Lo que pinta /rating-test.
//
// Hasta el 2026-11-01 estas lineas vivian dentro de rating-test.html. Salen
// aqui sin tocar una coma; el <script> de la pagina las carga en el mismo
// sitio y sin defer, para que el orden de ejecucion no cambie.

// ============================================================================
// GLICKO ENGINE (copiado literalmente de rating.html)
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

// Aqui un jugador nuevo nace en blanco, no con el rating de partida de su
// nivel BK: este es el banco de pruebas del motor, se le pegan partidos a
// mano y no tiene la tabla de jugadores detras. Es la UNICA diferencia de
// motor entre esta pagina y /rating, y antes estaba escondida dentro de una
// copia de getPlayerOrCreate que parecia igual que las otras dos.
window.vtGlicko.usarJugadorNuevo(() => new GlickoPlayer());
// Y tampoco se aplican los votos de nivel: aqui no hay votos de nadie, los
// partidos se pegan a mano. En /rating esto mueve el RD al cerrar cada dia.
window.vtGlicko.usarAjustePorNivel(() => {});

// El bucle de dias tambien vive en /front/vt-glicko.js: era el mismo en las dos
// paginas salvo tres lineas, que ahora son dos ganchos y un parametro.
const calculateEngineRatings = window.vtGlicko.calcularRatings;

// ============================================================================
// DATA FETCHING & UI RENDER (copia literal de rating.html)
// ============================================================================

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

// ============================================================================
// PARSER + UI PARA EL TEST
// ============================================================================

function parseNumericSet(token) {
  const raw = String(token || '').trim();
  if (!raw) return null;

  const isSuperTiebreak = /^\[(.*)\]$/.test(raw);
  const clean = isSuperTiebreak ? raw.slice(1, -1).trim() : raw;
  const match = clean.match(/^\s*(\d+)\s*-\s*(\d+)\s*$/);
  if (!match) return null;

  const g1 = Number(match[1]);
  const g2 = Number(match[2]);
  if (!Number.isFinite(g1) || !Number.isFinite(g2)) return null;

  return { g1, g2, isSuperTiebreak };
}

function parseTestResults(rawText) {
  const lines = String(rawText || '').split(/\r?\n/);
  const allMatches = [];
  const baseDate = new Date(Date.UTC(2026, 8, 1));

  let dayCursor = 0;
  let currentDayMatches = [];
  let currentMatchId = 1;
  let maxMatchDayIndex = -1;

  function finalizeDay(dayIndex) {
    if (currentDayMatches.length === 0) return;

    const dayDate = new Date(baseDate.getTime() + dayIndex * 24 * 60 * 60 * 1000);
    const iso = dayDate.toISOString().split('T')[0];

    for (const match of currentDayMatches) {
      match.date = iso;
      match.id = currentMatchId++;
      allMatches.push(match);
    }

    currentDayMatches = [];
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      if (currentDayMatches.length > 0) {
        finalizeDay(dayCursor);
      }
      dayCursor += 1;
      continue;
    }

    const parts = line.split(',').map(p => p.trim());
    if (parts.length < 6) continue;

    const team1a = parts[0];
    const team1b = parts[1];
    const team2a = parts[2];
    const team2b = parts[3];
    const w1Raw = parts[4];
    const setTokens = parts.slice(5);

    let setsWon1 = 0;
    let setsWon2 = 0;
    let totalGames1 = 0;
    let totalGames2 = 0;

    for (let i = 0; i < setTokens.length; i++) {
      const parsedSet = parseNumericSet(setTokens[i]);
      if (!parsedSet) continue;

      const { g1, g2, isSuperTiebreak } = parsedSet;

      if (isSuperTiebreak && i === 2) {
        if (g1 > g2) {
          setsWon1++;
          totalGames1 += 1;
        } else if (g2 > g1) {
          setsWon2++;
          totalGames2 += 1;
        }
        continue;
      }

      totalGames1 += g1;
      totalGames2 += g2;

      if (g1 > g2) setsWon1++;
      else if (g2 > g1) setsWon2++;
    }

    const totalGames = totalGames1 + totalGames2;
    if (totalGames === 0 || setsWon1 === setsWon2) continue;

    const winnerIsTeam1 = setsWon1 > setsWon2;
    const score = winnerIsTeam1 ? 1.0 : 0.0;
    const w1 = Number(w1Raw);
    const winnerGames = winnerIsTeam1 ? totalGames1 : totalGames2;
    const x = winnerGames / totalGames;

    function f_x(xValue) {
      const k = 10;
      const xx = Number(xValue);
      if (!Number.isFinite(xx)) return 0.0001;
      return 0.5 + 1.0 / (1.0 + Math.exp(-k * (xx - 0.60)));
    }

    let w2 = f_x(x);
    if (!Number.isFinite(w2) || w2 <= 0) w2 = 0.0001;

    const weight = (Number.isFinite(w1) ? w1 : 1.0) * w2;

    currentDayMatches.push({
      id: 0,
      date: '',
      team1: [team1a, team1b],
      team2: [team2a, team2b],
      score,
      weight,
      event_type: 'manual_test',
      event_id: null
    });
    maxMatchDayIndex = Math.max(maxMatchDayIndex, dayCursor);
  }

  if (currentDayMatches.length > 0) {
    finalizeDay(dayCursor);
  }

  const extraDecayDays = Math.max(0, dayCursor - maxMatchDayIndex);
  return { matches: allMatches, extraDecayDays };
}

function formatImportSet(score1, score2, isSuperTiebreak) {
  const token = `${score1}-${score2}`;
  return isSuperTiebreak ? `[${token}]` : token;
}

function buildRealImportText(matches) {
  if (!matches || matches.length === 0) return '';

  const sorted = [...matches].sort((a, b) => {
    const dateComp = String(a.date || '').localeCompare(String(b.date || ''));
    if (dateComp !== 0) return dateComp;
    return Number(a.id || 0) - Number(b.id || 0);
  });

  const byDate = new Map();
  sorted.forEach(m => {
    if (!byDate.has(m.date)) byDate.set(m.date, []);
    byDate.get(m.date).push(m);
  });

  const dateGroups = Array.from(byDate.entries()).sort(([d1], [d2]) => String(d1).localeCompare(String(d2)));
  const lines = [];

  dateGroups.forEach(([dateKey, dateMatches], dateIndex) => {
    const dayLines = [];

    dateMatches.forEach((m) => {
      const p1a = (m.team1 && m.team1[0]) ? String(m.team1[0]).trim() : '';
      const p1b = (m.team1 && m.team1[1]) ? String(m.team1[1]).trim() : '';
      const p2a = (m.team2 && m.team2[0]) ? String(m.team2[0]).trim() : '';
      const p2b = (m.team2 && m.team2[1]) ? String(m.team2[1]).trim() : '';

      if (!p1a || !p1b || !p2a || !p2b) return;

      const fmtLow = String(m.format || '').toLowerCase();
      const s1 = [m.s11, m.s12, m.s13].map(x => {
        const v = parseInt(String(x || '').trim(), 10);
        return Number.isFinite(v) ? v : null;
      });
      const s2 = [m.s21, m.s22, m.s23].map(x => {
        const v = parseInt(String(x || '').trim(), 10);
        return Number.isFinite(v) ? v : null;
      });

      const tokens = [];
      for (let i = 0; i < 3; i++) {
        const g1 = s1[i];
        const g2 = s2[i];
        if (g1 === null || g2 === null) continue;
        const isSuperTiebreak = i === 2 && fmtLow.includes('bo3_stb');
        tokens.push(formatImportSet(g1, g2, isSuperTiebreak));
      }

      if (tokens.length === 0) return;

      let w1 = 1.0;
      if (fmtLow.includes('timed_games_long')) {
        w1 = 0.6;
      } else if (fmtLow.includes('timed') || fmtLow.includes('timed_games')) {
        w1 = 0.3;
      }

      dayLines.push([p1a, p1b, p2a, p2b, String(w1), ...tokens].join(','));
    });

    if (dayLines.length === 0) return;

    if (dateIndex > 0) {
      const previousDate = dateGroups[dateIndex - 1][0];
      const currentDate = dateKey;
      const prev = new Date(`${previousDate}T00:00:00Z`);
      const curr = new Date(`${currentDate}T00:00:00Z`);
      const diffDays = Math.max(0, Math.round((curr.getTime() - prev.getTime()) / 86400000));
      for (let i = 0; i < diffDays; i++) {
        lines.push('');
      }
    }

    lines.push(...dayLines);
  });

  return lines.join('\n');
}

function populateImportDateDropdown(matches) {
  const sel = document.getElementById('importDate');
  if (!sel || typeof sel.appendChild !== 'function') return;

  const opts = buildDateOptionsFromMatches(matches || []);
  sel.innerHTML = '';

  for (const v of opts) {
    const o = document.createElement('option');
    o.value = v;
    const [y, m, d] = v.split('-');
    o.textContent = `${d}/${m}/${y}`;
    sel.appendChild(o);
  }

  if (opts.length > 0) {
    sel.value = opts[0];
  }
}

function handleImportReal() {
  const dateSel = document.getElementById('importDate');
  const selected = dateSel ? dateSel.value : 'latest';
  const inputEl = document.getElementById('resultsInput');

  const allMatches = window._allMatches || [];
  const filtered = filterMatchesForCutoff(allMatches, selected);
  const text = buildRealImportText(filtered);

  if (inputEl) {
    inputEl.value = text;
  }
}

function renderTable(rows) {
  const box = document.getElementById('resultBox');
  if (!box) return;

  if (!rows || rows.length === 0) {
    box.innerHTML = '<p class="empty-state">No hay jugadores con resultados válidos.</p>';
    return;
  }

  const html = [
    '<table aria-label="Resultado del rating test">',
    '<thead><tr><th>Jugador</th><th>Rating</th><th>RD</th></tr></thead>',
    '<tbody>'
  ];

  for (const row of rows) {
    const rating = Number(row.rating);
    const rd = Number(row.rd);
    html.push(`
      <tr>
        <td class="name-cell">${String(row.name || '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]))}</td>
        <td>${Number.isFinite(rating) ? rating.toFixed(2).replace('.', ',') : '-'}</td>
        <td>${Number.isFinite(rd) ? rd.toFixed(2).replace('.', ',') : '-'}</td>
      </tr>
    `);
  }

  html.push('</tbody></table>');
  box.innerHTML = html.join('');
}

function handleCalculate() {
  const inputEl = document.getElementById('resultsInput');
  const rawText = inputEl ? inputEl.value : '';
  const parsed = parseTestResults(rawText);
  const matches = parsed && Array.isArray(parsed.matches) ? parsed.matches : [];
  const extraDecayDays = parsed && Number.isFinite(parsed.extraDecayDays) ? parsed.extraDecayDays : 0;

  if (!matches || matches.length === 0) {
    renderTable([]);
    return;
  }

  const names = Array.from(new Set(matches.flatMap(m => m.team1.concat(m.team2))));
  const calculated = calculateEngineRatings(names, matches, matches[matches.length - 1].date, extraDecayDays);

  const sorted = calculated.slice().sort((a, b) => {
    if (b.rating !== a.rating) return b.rating - a.rating;
    return String(a.name || '').localeCompare(String(b.name || ''), 'es', { sensitivity: 'base', numeric: true });
  });

  renderTable(sorted);
}

async function loadRealImportData() {
  try {
    const allMatches = await fetchMatches();
    window._allMatches = allMatches || [];
    populateImportDateDropdown(window._allMatches);

    const dateSelect = document.getElementById('importDate');
    const selected = dateSelect ? dateSelect.value : 'latest';
    const filtered = filterMatchesForCutoff(window._allMatches, selected);
    const text = buildRealImportText(filtered);
    const inputEl = document.getElementById('resultsInput');
    if (inputEl && !inputEl.value.trim()) {
      inputEl.value = text || inputEl.value;
    }
  } catch (error) {
    console.error('No se pudo importar partidos reales', error);
  }
}

function init() {
  const button = document.getElementById('calculateBtn');
  if (button) {
    button.addEventListener('click', handleCalculate);
  }

  const importButton = document.getElementById('importRealBtn');
  if (importButton) {
    importButton.addEventListener('click', handleImportReal);
  }

  const importDate = document.getElementById('importDate');
  if (importDate) {
    importDate.addEventListener('change', () => {
      const selected = importDate.value;
      const allMatches = window._allMatches || [];
      const filtered = filterMatchesForCutoff(allMatches, selected);
      const inputEl = document.getElementById('resultsInput');
      if (inputEl) {
        inputEl.value = buildRealImportText(filtered);
      }
    });
  }

  loadRealImportData();
}

vtCargando.arranque(init, 'Calculando el rating');
