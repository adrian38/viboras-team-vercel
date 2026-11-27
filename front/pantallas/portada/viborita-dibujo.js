// Dibujo de la viborita de la portada. Lo mueve viborita.js; aqui solo se
// pinta un fotograma a partir de su estado. Partido de alli el 2026-11-27
// para no pasar de las 600 lineas por fichero.
//
// Los colores llegan ya leidos de theme.css; aqui no hay ninguno escrito.
// Detalle: ai_context/viborita_de_la_portada.md
(function () {
  'use strict';

  var ctx = null;
  var color = {};
  var cuerpo = [];
  var chispas = [];
  var v = {};

  // rgba() a partir de un token #rrggbb: el canvas no entiende var().
  function conAlfa(hex, alfa) {
    var n = parseInt(hex.slice(1), 16);
    return 'rgba(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + alfa + ')';
  }

  function circulo(x, y, r, estilo) {
    ctx.fillStyle = estilo;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  function segmento(a, b, grosor, estilo) {
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineWidth = grosor;
    ctx.strokeStyle = estilo;
    ctx.stroke();
  }

  function dibujarChispas() {
    chispas.forEach(function (c) {
      ctx.globalAlpha = c.vida * 0.9;
      circulo(c.x, c.y, c.tam, color.gold);
    });
    ctx.globalAlpha = 1;
  }

  // Sombra en dos pasadas, ancha y tenue y luego estrecha: el blur de la
  // maqueta costaba un filtro entero en cada fotograma.
  function dibujarSombra() {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = color['surface-deep'];
    [[24, 0.18], [15, 0.3]].forEach(function (pasada) {
      ctx.beginPath();
      cuerpo.forEach(function (s, n) { ctx[n ? 'lineTo' : 'moveTo'](s.x + 4, s.y + 10); });
      ctx.lineWidth = pasada[0];
      ctx.globalAlpha = pasada[1];
      ctx.stroke();
    });
    ctx.restore();
  }

  // Base oscura, franjas de oro alternas y un reflejo fino por el lomo.
  function dibujarCuerpo() {
    ctx.lineCap = 'round';
    for (var n = cuerpo.length - 1; n >= 1; n--) {
      var b = cuerpo[n];
      var a = cuerpo[n - 1];
      segmento(a, b, a.grosor, color.surface);
      if (n % 2 === 0) segmento(a, b, a.grosor * 0.72, n % 4 === 0 ? color['gold-light'] : color.gold);
      segmento(a, b, Math.max(1, a.grosor * 0.2), color['gold-soft']);
    }
  }

  // Mini pala de padel en la punta de la cola, apuntando hacia fuera.
  function dibujarPala() {
    var cola = cuerpo[cuerpo.length - 1];
    var antes = cuerpo[cuerpo.length - 2];
    ctx.save();
    ctx.translate(cola.x, cola.y);
    ctx.rotate(Math.atan2(cola.y - antes.y, cola.x - antes.x) - Math.PI / 2);
    ctx.fillStyle = color.text;
    ctx.fillRect(-2, 0, 4, 11);
    ctx.fillStyle = color.bg;
    ctx.strokeStyle = color.gold;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.ellipse(0, 19, 7.5, 9.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    [[-2.5, 16], [2.5, 16], [-2.5, 21], [2.5, 21], [0, 18.5]].forEach(function (h) {
      circulo(h[0], h[1], 0.9, color.gold);
    });
    ctx.restore();
  }

  function dibujarLengua() {
    var largo = 14 * v.lengua;
    ctx.strokeStyle = color.lengua;
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(12, 0);
    ctx.lineTo(12 + largo, 0);
    ctx.lineTo(17 + largo, -3.5);
    ctx.moveTo(12 + largo, 0);
    ctx.lineTo(17 + largo, 3.5);
    ctx.stroke();
  }

  function dibujarCraneo() {
    ctx.save();
    ctx.shadowColor = conAlfa(color.gold, 0.45);
    ctx.shadowBlur = 10;
    ctx.fillStyle = color['surface-2'];
    ctx.strokeStyle = color.gold;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(15, 0);
    ctx.quadraticCurveTo(8, -12, -4, -11);
    ctx.quadraticCurveTo(-14, -8, -14, 0);
    ctx.quadraticCurveTo(-14, 8, -4, 11);
    ctx.quadraticCurveTo(8, 12, 15, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = color['gold-light'];
    ctx.beginPath();
    ctx.ellipse(0, 0, 7.5, 5.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = color.gold;
    ctx.lineWidth = 3.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(-2, 0, 9.5, -Math.PI * 0.42, Math.PI * 0.42);
    ctx.stroke();
  }

  function dibujarOjo(y) {
    ctx.save();
    ctx.translate(4, y);
    ctx.scale(1, v.parpadeo);
    circulo(0, 0, 3.2, color.yellow);
    ctx.fillStyle = color['surface-deep'];
    ctx.beginPath();
    ctx.ellipse(0.5, 0, 1.28, 2.88, 0, 0, Math.PI * 2);
    ctx.fill();
    circulo(1.1, -1, 0.9, color['text-strong']);
    ctx.restore();
  }

  function dibujarCabeza() {
    var c = cuerpo[0];
    var s = cuerpo[1];
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(Math.atan2(c.y - s.y, c.x - s.x));
    if (v.lengua > 0.05) dibujarLengua();
    dibujarCraneo();
    dibujarOjo(-6.2);
    dibujarOjo(6.2);
    circulo(2, -7.5, 2.2, conAlfa(color.lengua, 0.4));
    circulo(2, 7.5, 2.2, conAlfa(color.lengua, 0.4));
    ctx.restore();
  }

  // Un fotograma entero: borra y pinta chispas y, si esta activa, la serpiente.
  window.vtViboritaDibujo = function (escena) {
    ctx = escena.ctx;
    color = escena.color;
    cuerpo = escena.cuerpo;
    chispas = escena.chispas;
    v = escena.v;
    ctx.clearRect(0, 0, escena.ancho, escena.alto);
    dibujarChispas();
    if (!v.activa) return;
    dibujarSombra();
    dibujarCuerpo();
    dibujarPala();
    dibujarCabeza();
  };
})();
