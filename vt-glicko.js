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

return {
  Q, C_DAILY, INITIAL_RATING, INITIAL_RD, MIN_RD, MAX_RD,
  GlickoPlayer, g, expected, decayAllPlayersOneDay, getPlayerOrCreate,
  getTeamState, getEffectiveObservationR, getEffectiveObservationRd, clamp,
  getReliabilityWeight, updatePeriod, usarJugadorNuevo
};

})();
