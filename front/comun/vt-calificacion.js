// La calificacion de 1 a 5 de un jugador: las opiniones de buen rollo del
// grupo, pesadas por lo seguro que esta el motor de su ranking.
//
// Nadie puntua de 1 a 5: no existe esa pregunta. Es un calculo encima de la
// opinion de ambiente de /valorar. El 3 es el centro —sin fiabilidad el motor
// no sabe lo bastante para subir ni para bajar— y la fiabilidad multiplica en
// vez de sumar, que es lo que evita que dos opiniones den un 5 redondo.
// Detalle: ai_context/calificacion_de_estrellas.md
//
// Vive aqui desde el 2026-11-12. Estaba copiada en cuenta-perfil.js y en
// comunidad.js, identicas, y /ranking necesitaba una tercera para su
// categoria de fair play. Las tres paginas cargan vt-glicko.js antes que
// esto: MAX_RD y MIN_RD son del motor, no constantes de aqui.
(function () {
  // 0 cuando el motor no sabe nada de ti (RD 350) y 1 cuando esta todo lo
  // seguro que puede estar (RD 80).
  function fiabilidadDeRd(rd) {
    const t = (window.MAX_RD - rd) / (window.MAX_RD - window.MIN_RD);
    return Math.min(1, Math.max(0, t));
  }

  function calificacionDe(buenRollo, fiabilidad) {
    return Math.min(5, Math.max(1, 3 + 2 * fiabilidad * (2 * buenRollo - 1)));
  }

  // Las dos mitades juntas. null si no le ha votado nadie o si el motor
  // todavia no tiene su RD: sin una de las dos no hay calificacion que dar.
  function deJugador(buenRollo, rd) {
    if (buenRollo === null || buenRollo === undefined) return null;
    if (!Number.isFinite(rd)) return null;
    return calificacionDe(buenRollo, fiabilidadDeRd(rd));
  }

  window.vtCalificacion = {
    fiabilidadDeRd: fiabilidadDeRd,
    calificacionDe: calificacionDe,
    deJugador: deJugador
  };
})();
