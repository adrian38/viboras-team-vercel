// Cuanto aporto cada partido al cambio de rating del dia, en /players.
//
// El motor de players.html actualiza el rating UNA vez por dia, con todos los
// partidos del dia juntos (updatePeriod). Aun asi el cambio se reparte exacto:
//
//   cambio del dia = K * suma( peso * g * (resultado - esperado) )
//
// con un sumando por partido y K comun al dia. El aporte de un partido es
// K * su sumando, y los aportes del dia suman justo el cambio del dia.
//
// Va en un fichero aparte y ENVUELVE updatePeriod y buildMatchLineHtml en vez
// de tocarlos: players.html esta en el techo de tamano y updatePeriod tambien
// (tools/code-size-baseline.json), y el trinquete solo deja encoger.
//
// Repetir aqui el calculo es una copia mas del motor
// (ai_context/motor_de_rating_duplicado.md). Para que no pueda mentir, cada
// dia se comprueba contra el resultado real de updatePeriod: si los aportes
// no suman el cambio del dia, ese dia no se ensena nada y se avisa en consola.
(function () {
  if (typeof updatePeriod !== 'function' || typeof buildMatchLineHtml !== 'function' ||
      typeof buildDailyHistoricalSeries !== 'function') return;

  var aportesPorPartido = new Map(); // partido de allMatches -> Map(jugador -> aporte)
  var avisado = false;

  function firma(equipo1, equipo2) {
    return equipo1.join(' / ') + ' | ' + equipo2.join(' / ');
  }

  function firmaDePartido(m) {
    var t1 = [String(m.p1a || '').trim(), String(m.p1b || '').trim()].filter(Boolean);
    var t2 = [String(m.p2a || '').trim(), String(m.p2b || '').trim()].filter(Boolean);
    return firma(t1, t2);
  }

  function copiar(playerMap) {
    var copia = new Map();
    playerMap.forEach(function (p, nombre) { copia.set(nombre, new GlickoPlayer(p.rating, p.rd)); });
    return copia;
  }

  // Las observaciones de cada jugador, igual que updatePeriod: el rival es la
  // pareja contraria, vista desde el jugador y no desde su pareja.
  function observaciones(inicio, recs) {
    var obs = new Map();
    recs.forEach(function (m, i) {
      var estados = [getTeamState(m.team1[0], m.team1[1], inicio), getTeamState(m.team2[0], m.team2[1], inicio)];
      [m.team1, m.team2].forEach(function (equipo, lado) {
        var rival = estados[1 - lado];
        var resultado = lado === 0 ? m.score : 1.0 - m.score;
        equipo.forEach(function (p, idx) {
          var pareja = equipo[1 - idx] || p;
          var r = getPlayerOrCreate(inicio, p).rating;
          var rPareja = getPlayerOrCreate(inicio, pareja).rating;
          if (!obs.has(p)) obs.set(p, []);
          obs.get(p).push({
            rec: i, score: resultado, weight: m.weight, oppRd: rival.rd,
            teammateRd: getPlayerOrCreate(inicio, pareja).rd,
            oppR: getEffectiveObservationR(r, (r + rPareja) / 2.0, rival.rating)
          });
        });
      });
    });
    return obs;
  }

  // jugador -> [aporte del rec 0, del rec 1, ...] (0 si no jugo ese partido)
  function aportes(inicio, recs) {
    var salida = new Map();
    observaciones(inicio, recs).forEach(function (lista, nombre) {
      var jugador = getPlayerOrCreate(inicio, nombre);
      var d2Inv = 0.0;
      var sumandos = [];
      lista.forEach(function (o) {
        var rdObs = getEffectiveObservationRd(o.oppRd, o.teammateRd);
        var gRd = g(rdObs);
        var e = expected(jugador.rating, o.oppR, rdObs);
        var peso = o.weight * getReliabilityWeight(rdObs);
        d2Inv += peso * Q * Q * gRd * gRd * e * (1.0 - e);
        sumandos.push({ rec: o.rec, valor: peso * gRd * (o.score - e) });
      });
      if (d2Inv <= 0) return;
      var k = Q / ((1.0 / (jugador.rd * jugador.rd)) + d2Inv);
      var porRec = recs.map(function () { return 0; });
      sumandos.forEach(function (s) { porRec[s.rec] += k * s.valor; });
      salida.set(nombre, { porRec: porRec, total: porRec.reduce(function (a, b) { return a + b; }, 0) });
    });
    return salida;
  }

  // Que dia es este periodo. updatePeriod no lo recibe, pero el motor recorre
  // los dias en orden ascendente: es el primer dia, posterior al del periodo
  // anterior, en que se jugaron todos sus partidos. Sin esto, una pareja que
  // repite contra la misma pareja otro dia dejaria el periodo sin dia.
  var ultimoDia = '';

  function diaDelPeriodo(recs) {
    var dias = null;
    recs.forEach(function (rec) {
      var f = firma(rec.team1, rec.team2);
      var suyos = new Set();
      allMatches.forEach(function (m) {
        var d = toIsoDate(m.date) || toIsoDate(m.start_date);
        if (d && d > ultimoDia && firmaDePartido(m) === f) suyos.add(d);
      });
      dias = dias ? new Set(Array.from(dias).filter(function (d) { return suyos.has(d); })) : suyos;
    });
    var orden = dias ? Array.from(dias).sort() : [];
    if (!orden.length) return null;
    ultimoDia = orden[0];
    return orden[0];
  }

  // Cada rec con su partido de allMatches: mismo dia, mismas parejas y, si se
  // repiten, en el mismo orden (el motor los recorre en el orden de allMatches).
  // Si hay mas partidos que recs con esa firma (uno sin marcador valido), ese
  // emparejamiento no es seguro y no se usa.
  function emparejar(recs, dia) {
    var partidos = recs.map(function () { return null; });
    var porFirma = new Map();
    recs.forEach(function (rec, i) {
      var f = firma(rec.team1, rec.team2);
      if (!porFirma.has(f)) porFirma.set(f, []);
      porFirma.get(f).push(i);
    });
    porFirma.forEach(function (indices, f) {
      var candidatos = allMatches.filter(function (m) {
        return (toIsoDate(m.date) || toIsoDate(m.start_date)) === dia && firmaDePartido(m) === f;
      });
      if (candidatos.length !== indices.length) return;
      indices.forEach(function (i, n) { partidos[i] = candidatos[n]; });
    });
    return partidos;
  }

  function anotar(recs, inicio, despues) {
    var calculado = aportes(inicio, recs);
    var cuadra = true;
    calculado.forEach(function (a, nombre) {
      var real = getPlayerOrCreate(despues, nombre).rating - getPlayerOrCreate(inicio, nombre).rating;
      if (Math.abs(real - a.total) > 1e-6 * Math.max(1, Math.abs(real))) cuadra = false;
    });
    if (!cuadra) {
      if (!avisado) console.warn('players-aportes: los aportes no suman el cambio del día; ¿cambió updatePeriod? No se enseñan.');
      avisado = true;
      return;
    }
    var dia = diaDelPeriodo(recs);
    if (!dia) return;
    emparejar(recs, dia).forEach(function (m, i) {
      if (!m) return;
      var porJugador = new Map();
      calculado.forEach(function (a, nombre) { if (a.porRec[i] !== 0) porJugador.set(nombre, a.porRec[i]); });
      aportesPorPartido.set(m, porJugador);
    });
  }

  // Cada vez que se rehace la serie, se empieza de cero.
  var serieOriginal = buildDailyHistoricalSeries;
  buildDailyHistoricalSeries = function () {
    aportesPorPartido = new Map();
    ultimoDia = '';
    return serieOriginal.apply(this, arguments);
  };

  var updatePeriodOriginal = updatePeriod;
  updatePeriod = function (playerMap, periodMatches) {
    var inicio = copiar(playerMap);
    updatePeriodOriginal(playerMap, periodMatches);
    try {
      anotar(periodMatches, inicio, playerMap);
    } catch (err) {
      console.warn('players-aportes: no se pudo calcular', err);
    }
  };

  // El aporte va al lado del marcador, con la flecha y el color del total del dia.
  var lineaOriginal = buildMatchLineHtml;
  buildMatchLineHtml = function (match, playerName) {
    var html = lineaOriginal(match, playerName);
    var porJugador = aportesPorPartido.get(match);
    if (!html || !porJugador || !porJugador.has(playerName)) return html;
    var valor = porJugador.get(playerName);
    var sube = valor > 0;
    var marca = '<span class="match-delta ' + (sube ? 'sube' : 'baja') + '" title="Lo que aportó este partido al cambio del día">' +
      (sube ? '︽ ' : '︾ ') + formatRating(Math.abs(valor)) + '</span>';
    // Dentro del bloque del marcador, para que vaya en su misma linea: fuera
    // de el, en el movil, bajaba a una linea aparte.
    return html.replace(/<\/span><\/span><\/div>$/, '</span>' + marca + '</span></div>');
  };
})();
