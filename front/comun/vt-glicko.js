// El motor de rating (Glicko) del grupo, en un solo sitio.
//
// Hasta el 2026-10-31 este bloque estaba pegado en rating.html, players.html y
// rating-test.html, y habia una guarda (tools/rating-parity.mjs) comprobando
// que las copias no se separaran. Ahora hay una sola y la guarda vigila que
// ninguna pagina vuelva a traerse la suya.
//
// Lo que NO esta aqui es calculateEngineRatings: el bucle de dias es distinto
// en cada pagina a proposito (rating-test anade extraDecayDays), y juntarlos
// seria el cambio de comportamiento que este fichero no quiere ser.
// Detalle: ai_context/motor_de_rating_duplicado.md
//
// Va sin defer, como splash.js: las paginas lo usan desde un <script> en
// linea que corre mientras se parsea.
window.vtGlicko = (function () {

// La ficha con la que nace un jugador que aparece por primera vez. Por
// defecto, la del rating de partida segun su nivel BK (rating-inicial.js),
// que es lo que hacen /rating y /players. /rating-test la cambia por un
// GlickoPlayer en blanco: es un banco de pruebas y no tiene esa tabla.
let nuevoJugador = (nombre) => window.vtInicial.crear(nombre);

function usarJugadorNuevo(fn) {
  nuevoJugador = fn;
}

// Los votos de «¿estaban en su nivel?» mueven el RD al cerrar cada dia
// (nivel-votos.js). /rating y /cuenta los aplican; /rating-test no, porque
// ahi los partidos se pegan a mano y no hay votos de nadie.
let ajustarPorNivel = (playerMap, dateStr, dayMatches) => window.vtNivel.ajustar(playerMap, dateStr, dayMatches);

function usarAjustePorNivel(fn) {
  ajustarPorNivel = fn;
}

// Sumar dias a una fecha ISO, para el decaimiento extra del banco de pruebas.
function addDaysToIso(iso, days) {
  if (!iso || !Number.isFinite(days) || days <= 0) return iso;
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().split('T')[0];
}

// La fecha de corte de «ahora». Importa que sea una sola: el RD sube cada dia
// que pasa sin jugar, asi que cortar en el ultimo partido y cortar hoy dan
// fiabilidades distintas, y con ellas calificaciones distintas. Hasta el
// 2026-11-12 /comunidad cortaba en el ultimo partido y /cuenta hoy, y el
// mismo jugador salia con una decima de diferencia en cada pantalla.
function hoyIso() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

const Q = Math.LN10 / 400.0;
const C_DAILY = 15.0; // Daily decay constant
const INITIAL_RATING = 1500.0;
const INITIAL_RD = 350.0;
const MIN_RD = 80.0;
const MAX_RD = 350.0;

class GlickoPlayer {
  constructor(rating = INITIAL_RATING, rd = INITIAL_RD) {
    this.rating = rating;
    this.rd = rd;
  }
}

function g(rd) {
  return 1.0 / Math.sqrt(1.0 + (3.0 * Q * Q * rd * rd) / (Math.PI * Math.PI));
}

function expected(r, oppR, oppRd) {
  const gRd = g(oppRd);
  return 1.0 / (1.0 + Math.pow(10, (-gRd * (r - oppR)) / 400.0));
}

function decayAllPlayersOneDay(playerMap, activePlayersToday = new Set()) {
  playerMap.forEach((player, key) => {
    if (activePlayersToday.has(key)) return;
    const newRd = Math.min(Math.sqrt(player.rd * player.rd + C_DAILY * C_DAILY), MAX_RD);
    playerMap.set(key, new GlickoPlayer(player.rating, newRd));
  });
}

function getPlayerOrCreate(playerMap, name) {
  const trimmed = (name || '').trim();
  if (!trimmed) return new GlickoPlayer();
  if (!playerMap.has(trimmed)) {
    playerMap.set(trimmed, nuevoJugador(trimmed));
  }
  return playerMap.get(trimmed);
}

function getTeamState(p1Key, p2Key, playerMap) {
  const p1 = getPlayerOrCreate(playerMap, p1Key);
  const p2 = getPlayerOrCreate(playerMap, p2Key);

  const teamR = (p1.rating + p2.rating) / 2.0;
  const teamRd = Math.sqrt(p1.rd * p1.rd + p2.rd * p2.rd) / 2.0;
  return { rating: teamR, rd: teamRd };
}

function getEffectiveObservationR(playerR, teamR, opponentTeamR) {
  return opponentTeamR + (playerR - teamR);
}

function getEffectiveObservationRd(opponentTeamRd, teammateRd) {
  const safeOpp = Number.isFinite(opponentTeamRd) ? opponentTeamRd : 0;
  const safeTeammate = Number.isFinite(teammateRd) ? teammateRd : 0;
  return Math.hypot(safeOpp, safeTeammate / 2);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getReliabilityWeight(rdObs) {
  const RD_DISCOUNT_START = 110.56;
  const RD_ALL_FRESH = Math.sqrt(3.0) * MAX_RD / 2.0;
  const MIN_RELIABILITY_WEIGHT = 0.50;
  const CURVE = 1.0;

  const t = clamp(
    (rdObs - RD_DISCOUNT_START) / (RD_ALL_FRESH - RD_DISCOUNT_START),
    0.0,
    1.0
  );

  return 1.0 - (1.0 - MIN_RELIABILITY_WEIGHT) * Math.pow(t, CURVE);
}

// Las dos mitades de updatePeriod, partidas al sacar el motor a este fichero
// porque juntas pasaban de 60 lineas. El codigo es el mismo, linea a linea:
// primero se recoge lo que cada jugador «observo» ese dia y despues se aplica
// todo de golpe. Que sean dos pasos no es un detalle de estilo: las dos
// mitades leen `starting`, la foto de antes del dia, para que el orden de los
// partidos dentro del dia no cambie el resultado.
function observacionesDelPeriodo(starting, periodMatches) {
  const observations = new Map();

  for (const m of periodMatches) {
    const t1State = getTeamState(m.team1[0], m.team1[1], starting);
    const t2State = getTeamState(m.team2[0], m.team2[1], starting);

    const scoreT1 = m.score;
    const scoreT2 = 1.0 - m.score;

    m.team1.forEach((p, idx) => {
      const teammate = m.team1[1 - idx] || p;
      const teammateRd = getPlayerOrCreate(starting, teammate).rd;
      const teammateR = getPlayerOrCreate(starting, teammate).rating;
      const playerR = getPlayerOrCreate(starting, p).rating;
      const effectiveObservationR = getEffectiveObservationR(playerR, (playerR + teammateR) / 2.0, t2State.rating);
      if (!observations.has(p)) observations.set(p, []);
      observations.get(p).push({ oppR: effectiveObservationR, oppRd: t2State.rd, teammateRd, score: scoreT1, weight: m.weight });
    });

    m.team2.forEach((p, idx) => {
      const teammate = m.team2[1 - idx] || p;
      const teammateRd = getPlayerOrCreate(starting, teammate).rd;
      const teammateR = getPlayerOrCreate(starting, teammate).rating;
      const playerR = getPlayerOrCreate(starting, p).rating;
      const effectiveObservationR = getEffectiveObservationR(playerR, (playerR + teammateR) / 2.0, t1State.rating);
      if (!observations.has(p)) observations.set(p, []);
      observations.get(p).push({ oppR: effectiveObservationR, oppRd: t1State.rd, teammateRd, score: scoreT2, weight: m.weight });
    });
  }

  return observations;
}

function aplicarObservaciones(playerMap, starting, observations) {
  observations.forEach((obsList, pName) => {
    const player = getPlayerOrCreate(starting, pName);
    const r = player.rating;
    const rd = player.rd;

    let d2Inv = 0.0;
    let sumDelta = 0.0;

    for (const obs of obsList) {
      const effectiveObservationRd = getEffectiveObservationRd(obs.oppRd, obs.teammateRd);
      const gRd = g(effectiveObservationRd);
      const eVal = expected(r, obs.oppR, effectiveObservationRd);

      const w3 = getReliabilityWeight(effectiveObservationRd);
      const effectiveWeight = obs.weight * w3;

      d2Inv += effectiveWeight * Q * Q * gRd * gRd * eVal * (1.0 - eVal);
      sumDelta += effectiveWeight * gRd * (obs.score - eVal);
    }

    if (d2Inv <= 0) return;

    let newRd = 1.0 / Math.sqrt((1.0 / (rd * rd)) + d2Inv);
    newRd = Math.max(newRd, MIN_RD);

    const newR = r + (Q / ((1.0 / (rd * rd)) + d2Inv)) * sumDelta;

    playerMap.set(pName, new GlickoPlayer(newR, newRd));
  });
}

function updatePeriod(playerMap, periodMatches) {
  const starting = new Map();
  playerMap.forEach((p, name) => {
    starting.set(name, new GlickoPlayer(p.rating, p.rd));
  });
  aplicarObservaciones(playerMap, starting, observacionesDelPeriodo(starting, periodMatches));
}

// El bucle de dias: el historico entero, dia a dia, con su decaimiento.
// Hasta el 2026-10-31 estaba en rating.html y en rating-test.html, y las
// dos copias se diferenciaban en tres lineas: con que ficha nace un jugador
// nuevo, si se aplican los votos de nivel, y los dias de decaimiento extra
// del banco de pruebas. Las dos primeras son ganchos y la tercera un
// parametro, asi que una sola funcion sirve para las dos paginas.
// Lo que sale de aqui: una fila por jugador, no el Map.
function salida(playerMap) {
  return Array.from(playerMap.entries()).map(([name, p]) => ({
    name,
    rating: p.rating,
    rd: p.rd
  }));
}

// Los partidos agrupados por dia, en el orden en que se jugaron. El desempate
// por id no es adorno: dos partidos del mismo dia tienen que entrar al motor
// siempre en el mismo orden o el resultado baila.
function porDia(matches) {
  matches.sort((a, b) => {
    const dComp = a.date.localeCompare(b.date);
    return dComp !== 0 ? dComp : (a.id - b.id);
  });

  const byDate = new Map();
  matches.forEach(m => {
    if (!byDate.has(m.date)) byDate.set(m.date, []);
    byDate.get(m.date).push(m);
  });
  return byDate;
}

// Del primer dia al ultimo, uno por uno, aunque no se jugara: los dias
// vacios son los que hacen subir el RD de quien no aparece.
function correrDias(playerMap, byDate, desdeIso, hastaIso) {
  const [startY, startM, startD] = desdeIso.split('-').map(Number);
  const [endY, endM, endD] = hastaIso.split('-').map(Number);

  let curTime = Date.UTC(startY, startM - 1, startD);
  const endTime = Date.UTC(endY, endM - 1, endD);
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;

  while (curTime <= endTime) {
    const d = new Date(curTime);
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    const dateStr = `${yyyy}-${mm}-${dd}`;

    const dayMatches = byDate.get(dateStr) || [];
    const activeToday = new Set();

    dayMatches.forEach(m => {
      m.team1.concat(m.team2).forEach(p => {
        if (p && p.trim()) activeToday.add(p.trim());
      });
    });

    decayAllPlayersOneDay(playerMap, activeToday);

    if (dayMatches.length > 0) {
      updatePeriod(playerMap, dayMatches);
      ajustarPorNivel(playerMap, dateStr, dayMatches);
    }

    curTime += ONE_DAY_MS;
  }
}

function calcularRatings(names, matches, cutoffDateIso, extraDecayDays = 0) {
  const playerMap = new Map();
  names.forEach(n => {
    if (n && n.trim()) playerMap.set(n.trim(), nuevoJugador(n));
  });

  if (!matches || matches.length === 0) return salida(playerMap);

  matches.forEach(m => {
    m.team1.concat(m.team2).forEach(pName => {
      getPlayerOrCreate(playerMap, pName);
    });
  });

  const byDate = porDia(matches);
  const baseEndIso = (cutoffDateIso && typeof cutoffDateIso === 'string') ? cutoffDateIso : matches[matches.length - 1].date;
  correrDias(playerMap, byDate, matches[0].date, addDaysToIso(baseEndIso, extraDecayDays));
  return salida(playerMap);
}

// Los partidos del API tal y como los quiere el motor: fecha normalizada,
// quien gano y cuanto pesa el partido. El peso sale del formato (los de
// torneo pesan menos) y de lo ajustado que fue, por f_x.
//
// Vive aqui desde el 2026-10-31 por lo mismo que el resto: estaba pegado en
// rating.html y en rating-test.html, y la unica diferencia era que la
// segunda arrastraba los marcadores en crudo para su exportacion. Se queda
// esa version: los campos de mas no los mira nadie mas.
// `matches.date` llega en dos formatos, DD/MM/AAAA y AAAA-MM-DD.
function toIsoDate(s){
  if(!s) return null;
  if(/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const parts = String(s).split('/');
  if(parts.length===3){
    const d = String(parts[0]).padStart(2,'0');
    const m = String(parts[1]).padStart(2,'0');
    const y = String(parts[2]);
    return `${y}-${m}-${d}`;
  }
  const dt = new Date(s);
  if(isNaN(dt.getTime())) return null;
  return dt.toISOString().split('T')[0];
}

// Cuanto pesa un partido por lo ajustado que fue: un 6-0 6-0 pesa mas que un
// 7-6 7-6, porque dice mas del nivel de cada uno.
function f_x(x){
  const k = 10;
  const xx = Number(x);
  if (!Number.isFinite(xx)) return 0.0001;
  return 0.5 + 1.0 / (1.0 + Math.exp(-k * (xx - 0.60)));
}

// Un partido del API en lo que el motor necesita, o null si no sirve: sin
// marcador, o empatado a sets, no dice quien gano.
// Sets y juegos de cada pareja. El tercer set de un bo3_stb es un super
// tie-break: cuenta como set ganado, pero como UN juego, porque sus puntos no
// son juegos y sumarlos tal cual lo volveria el set mas importante del
// partido.
function contarSets(s1, s2, fmtLow) {
        let setsWon1 = 0;
        let setsWon2 = 0;
        let totalGames1 = 0;
        let totalGames2 = 0;

        for (let i = 0; i < 3; i++) {
          const g1 = s1[i];
          const g2 = s2[i];

          if (g1 === null || g2 === null) continue;

          if (i === 2 && fmtLow.includes('bo3_stb')) {
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

  return { setsWon1, setsWon2, totalGames1, totalGames2 };
}

// Lo que pesa el partido: por su formato —los de torneo cuentan menos, que se
// juegan a tiempo— y por lo ajustado que fue.
function pesoDelPartido(fmtLow, winnerGames, totalGames) {
        let w1 = 1.0;
        if (fmtLow.includes('timed_games_long')) {
          w1 = 0.6;
        } else if (fmtLow.includes('timed') || fmtLow.includes('timed_games')) {
          w1 = 0.3;
        }

        const x = winnerGames / totalGames;
        let w2 = f_x(x);
        if (!Number.isFinite(w2) || w2 <= 0) w2 = 0.0001;

        return w1 * w2;
}

function partidoDelApi(m, idx) {
        const dateIso = toIsoDate(m.date) || toIsoDate(m.start_date) || new Date().toISOString().split('T')[0];

        const p1a = (m.p1a || '').trim();
        const p1b = (m.p1b || '').trim();
        const p2a = (m.p2a || '').trim();
        const p2b = (m.p2b || '').trim();

        const s1 = [m.s11, m.s12, m.s13].map(x => { const v = parseInt(String(x||'').trim(),10); return Number.isFinite(v) ? v : null; });
        const s2 = [m.s21, m.s22, m.s23].map(x => { const v = parseInt(String(x||'').trim(),10); return Number.isFinite(v) ? v : null; });

        const fmtLow = String(m.format || '').toLowerCase();
        const { setsWon1, setsWon2, totalGames1, totalGames2 } = contarSets(s1, s2, fmtLow);

        const totalGames = totalGames1 + totalGames2;
        if (totalGames === 0 || setsWon1 === setsWon2) return null;

        const winnerIsTeam1 = setsWon1 > setsWon2;
        const score = winnerIsTeam1 ? 1.0 : 0.0;
        const weight = pesoDelPartido(fmtLow, winnerIsTeam1 ? totalGames1 : totalGames2, totalGames);

        return {
          id: (m.id !== undefined && m.id !== null) ? m.id : idx,
          date: dateIso,
          team1: [p1a, p1b],
          team2: [p2a, p2b],
          score: score,
          weight: weight,
          event_type: (m.event_type || '').toString().toLowerCase(),
          event_id: (m.event_id !== undefined && m.event_id !== null) ? Number(m.event_id) : null,
          format: m.format,
          s11: m.s11,
          s12: m.s12,
          s13: m.s13,
          s21: m.s21,
          s22: m.s22,
          s23: m.s23
        };
}

// Todos los partidos que cuentan para el rating. Si falla, lista vacia: la
// pagina ensena lo que pueda en vez de quedarse en blanco.
function leerPartidos() {
  return fetch(`/api/read?action=getResults&eventType=ranked,grupo_liga,pozo,compas,doble_ko,legacy&ts=${Date.now()}`)
    .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(db => {
      const raw = (db && db.matches) ? db.matches : [];
      return raw.map(partidoDelApi)
        .filter(m => m && m.date && m.team1[0] && m.team1[1] && m.team2[0] && m.team2[1]);
    })
    .catch(e => { console.error('Could not load matches', e); return []; });
}

// Los acompanantes del motor —nivel-votos.js, rating-inicial.js,
// players-aportes.js— usan estos nombres a pelo, contando con que sean
// globales. Lo eran cuando el motor estaba pegado en cada pagina; dentro de
// esta funcion ya no, asi que se publican. Sin esto, una pagina que use el
// motor sin traerse los nombres al ambito revienta con «X is not defined» en
// cuanto entra uno de esos ficheros, que es justo lo que paso en /cuenta.
window.GlickoPlayer = GlickoPlayer;
window.MAX_RD = MAX_RD;
window.MIN_RD = MIN_RD;
window.Q = Q;
window.expected = expected;
window.getReliabilityWeight = getReliabilityWeight;

return {
  Q, C_DAILY, INITIAL_RATING, INITIAL_RD, MIN_RD, MAX_RD,
  GlickoPlayer, g, expected, decayAllPlayersOneDay, getPlayerOrCreate,
  getTeamState, getEffectiveObservationR, getEffectiveObservationRd, clamp,
  getReliabilityWeight, updatePeriod, calcularRatings, leerPartidos,
  usarJugadorNuevo, usarAjustePorNivel, hoyIso
};

})();
