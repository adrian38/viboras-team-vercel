// El rating con el que arranca cada jugador en el motor. Las altas nuevas
// parten del nivel BK de su inscripcion (Iniciacion 1200, Intermedio 1400,
// Avanzado 1800, Entreno 2000,01: api/_inscripcion.js, RATING_DE_PARTIDA);
// los que ya jugaban, de 1500 como siempre. La fiabilidad arranca en 0 para
// todos: RD 350, el de cualquier GlickoPlayer nuevo.
//
// Lo cargan rating.html y players.html ANTES de su script, igual que
// nivel-votos.js y por lo mismo: las funciones que crean jugadores estan en
// el techo de tamano y se tocaron sin anadir lineas. rating-test.html no lo
// usa. Detalle: ai_context/valoraciones_y_avisos.md
(function () {
  var porNombre = new Map();

  // Nunca falla: sin datos, todos parten de 1500 como antes.
  var listo = fetch('/api/read?action=getRatingsDePartida&ts=' + Date.now())
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (j) {
      ((j && j.ratings) || []).forEach(function (r) {
        if (Number.isFinite(r.rating)) porNombre.set(String(r.jugador).trim(), r.rating);
      });
    })
    .catch(function (e) { console.warn('Sin ratings de partida', e); });

  function crear(nombre) {
    var r = porNombre.get(String(nombre || '').trim());
    return r === undefined ? new GlickoPlayer() : new GlickoPlayer(r);
  }

  window.vtInicial = { listo: listo, crear: crear };
})();
