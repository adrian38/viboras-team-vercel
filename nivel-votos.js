// Los votos de «¿estaban en su nivel?» (/valorar) mueven la fiabilidad del
// rating. Regla de Adrian (2026-10-17): «en su nivel» o «por encima» suben la
// fiabilidad; «por debajo» la baja. El rating no se toca, solo el RD.
//
// Cada dia, despues de updatePeriod, el RD de quien jugo y recibio votos se
// multiplica por (1 - PASO * neto), con neto = votos a favor - votos en
// contra de ese dia. Tres votos a favor: RD x 0,91. Tres en contra: x 1,09.
// Siempre entre MIN_RD y MAX_RD, que son de la pagina.
//
// Lo cargan rating.html y players.html ANTES de su script: las dos esperan a
// `vtNivel.listo` junto a los partidos y llaman a `vtNivel.ajustar` en la
// misma linea que updatePeriod. Va aparte porque las dos funciones que lo
// llaman y players.html estan en el techo de tamano
// (tools/code-size-baseline.json). rating-test.html no lo usa: es un banco
// de pruebas con partidos escritos a mano.
// Detalle: ai_context/valoraciones_y_avisos.md
(function () {
  var PASO = 0.03;
  var porDia = new Map(); // 'AAAA-MM-DD|Nombre' -> neto

  // Nunca falla: sin votos el rating es exactamente el de antes.
  var listo = fetch('/api/read?action=getNivelVotos&ts=' + Date.now())
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (j) {
      ((j && j.votos) || []).forEach(function (v) {
        porDia.set(v.fecha + '|' + String(v.jugador).trim(), Number(v.neto) || 0);
      });
    })
    .catch(function (e) { console.warn('Sin votos de nivel', e); });

  function ajustar(playerMap, fecha, dayMatches) {
    if (!porDia.size) return;
    // El neto ya es del dia entero: quien jugo dos partidos ese dia sale dos
    // veces en dayMatches y se ajusta una sola.
    var vistos = new Set();
    dayMatches.forEach(function (m) {
      m.team1.concat(m.team2).forEach(function (nombre) {
        if (vistos.has(nombre)) return;
        vistos.add(nombre);
        var neto = porDia.get(fecha + '|' + nombre);
        var p = neto ? playerMap.get(nombre) : null;
        if (!p) return;
        var rd = Math.min(MAX_RD, Math.max(MIN_RD, p.rd * (1 - PASO * neto)));
        playerMap.set(nombre, new GlickoPlayer(p.rating, rd));
      });
    });
  }

  window.vtNivel = { listo: listo, ajustar: ajustar };
})();
