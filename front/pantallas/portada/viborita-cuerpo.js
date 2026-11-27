// Fisica del cuerpo de la viborita de la portada: funciones puras sobre la
// lista de segmentos ({x, y}), sin estado propio. Las usa viborita.js, que
// se carga despues; separadas de alli el 2026-11-27 para no pasar de las 600
// lineas por fichero.
// Detalle: ai_context/viborita_de_la_portada.md
(function () {
  'use strict';

  // Acercamiento exponencial independiente de los fotogramas: k es cuantos
  // fotogramas de 60 Hz han pasado.
  function suavizar(desde, hasta, factor, k) {
    return desde + (hasta - desde) * (1 - Math.pow(1 - factor, k));
  }

  // Cabeza en (x, y) y el cuerpo estirado detras, en la direccion (dx, dy).
  function colocar(cuerpo, largo, x, y, dx, dy) {
    cuerpo.forEach(function (s, n) {
      s.x = x + dx * n * largo;
      s.y = y + dy * n * largo;
    });
  }

  // Pone `s` a `largo` de `guia`, en la direccion en que ya estaba.
  function acercar(s, guia, largo) {
    var a = Math.atan2(guia.y - s.y, guia.x - s.x);
    s.x = guia.x - Math.cos(a) * largo;
    s.y = guia.y - Math.sin(a) * largo;
  }

  // Andando: cada segmento sigue al anterior desde la cabeza.
  function arrastrar(cuerpo, largo) {
    for (var n = 1; n < cuerpo.length; n++) acercar(cuerpo[n], cuerpo[n - 1], largo);
  }

  // Con dos puntos sujetos, la cabeza y el segmento `fijo`: una pasada desde
  // la cabeza y otra de vuelta desde el enganche (FABRIK). De `fijo` a la cola
  // no se toca: es lo que queda tendido sobre el borde.
  function tensar(cuerpo, fijo, largo) {
    var ancla = { x: cuerpo[fijo].x, y: cuerpo[fijo].y };
    for (var n = 1; n <= fijo; n++) acercar(cuerpo[n], cuerpo[n - 1], largo);
    cuerpo[fijo].x = ancla.x;
    cuerpo[fijo].y = ancla.y;
    for (n = fijo - 1; n >= 0; n--) acercar(cuerpo[n], cuerpo[n + 1], largo);
  }

  // Entera fuera, cola incluida: acabar con la cabeza fuera la cortaba a
  // medio cuerpo.
  function fuera(cuerpo, ancho, alto) {
    return cuerpo.every(function (s) {
      return s.x < -30 || s.x > ancho + 30 || s.y < -30 || s.y > alto + 30;
    });
  }

  // Punto a distancia d de (anclaX, p.B), por el contorno del rectangulo p
  // ({L, T, R, B}) hacia el lado contrario a dir. El contorno se recorre en
  // el sentido de las agujas del reloj desde la esquina de arriba a la
  // izquierda, asi que avanzar hacia la izquierda por abajo es sumar.
  function contorno(p, anclaX, dir, d) {
    var w = p.R - p.L;
    var h = p.B - p.T;
    var per = 2 * (w + h);
    var t = ((w + h + (p.R - anclaX) + dir * d) % per + per) % per;
    if (t < w) return { x: p.L + t, y: p.T };
    if (t < w + h) return { x: p.R, y: p.T + t - w };
    if (t < 2 * w + h) return { x: p.R - (t - w - h), y: p.B };
    return { x: p.L, y: p.B - (t - 2 * w - h) };
  }

  window.vtViboritaCuerpo = {
    contorno: contorno,
    suavizar: suavizar,
    colocar: colocar,
    arrastrar: arrastrar,
    tensar: tensar,
    fuera: fuera
  };
})();
