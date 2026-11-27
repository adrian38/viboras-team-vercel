// Viborita: una serpiente dorada que cruza la portada de vez en cuando.
//
// Es adorno y nada mas. No lleva texto, no responde al toque, y el lienzo va
// con pointer-events:none, asi que nunca se come un toque a las tarjetas.
// Sale de una maqueta de Stitch, a la que se le quitaron los bocadillos, la
// pelota, el boton de invocarla y la huida al tocarla.
//
// Como se mueve: solo se gobierna la cabeza. Los segmentos del cuerpo la
// siguen a distancia fija (cada uno se pone a LARGO del anterior, en la
// direccion en que ya estaba), y la ondulacion es un seno que empuja la
// cabeza en perpendicular a su rumbo y que el cuerpo va heredando.
//
// Lo que cuida para no gastar:
// - La velocidad va por tiempo y no por fotogramas: a 120 Hz no va al doble.
//   Las constantes de velocidad estan expresadas por fotograma de 60 Hz.
// - El bucle solo corre mientras hay serpiente o chispas en pantalla; entre
//   una aparicion y la siguiente no hay requestAnimationFrame.
// - Con la pestana oculta se para y no programa nada.
// - Con «reducir movimiento» no aparece.
//
// Los colores se leen de theme.css al arrancar; aqui no hay ninguno escrito.
// Detalle: ai_context/viborita_de_la_portada.md
(function () {
  'use strict';

  if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var SEGMENTOS = 32;
  var LARGO = 6.2;
  var FOTOGRAMA_MS = 1000 / 60;
  var PRIMERA_MS = 2500;
  var ENTRE_MIN_MS = 10000;
  var ENTRE_MAX_MS = 15000;
  // Tope de un recorrido, por si alguno no llegara a salir de la pantalla.
  var MAX_MS = 15000;

  var lienzo = null;
  var ctx = null;
  var ancho = 0;
  var alto = 0;
  var color = {};
  var cuerpo = [];
  var chispas = [];
  var raf = 0;
  var ultimo = 0;
  var espera = 0;
  var v = {
    activa: false, rutina: '', ms: 0, entro: false,
    velocidad: 0, ola: 0, olaFreq: 0, olaAmp: 0,
    lengua: 0, faseLengua: 0, parpadeo: 1
  };

  for (var i = 0; i < SEGMENTOS; i++) {
    cuerpo.push({ x: -200, y: -200, grosor: Math.max(3, (1 - Math.pow(i / SEGMENTOS, 1.4)) * 17) });
  }

  // ------------------------------------------------------------ preparar --

  function leerColores() {
    var css = getComputedStyle(document.documentElement);
    ['bg', 'surface', 'surface-2', 'surface-deep', 'gold', 'gold-light', 'gold-soft',
      'yellow', 'text', 'text-strong', 'lengua'].forEach(function (n) {
      color[n] = css.getPropertyValue('--vt-' + n).trim();
    });
  }

  // rgba() a partir de un token #rrggbb: el canvas no entiende var().
  function conAlfa(hex, alfa) {
    var n = parseInt(hex.slice(1), 16);
    return 'rgba(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + alfa + ')';
  }

  // Por encima del contenido y por debajo de la barra de pestanas (que va en
  // --vt-z-flotante): asi puede asomarse desde detras de ella.
  function crearLienzo() {
    lienzo = document.createElement('canvas');
    lienzo.setAttribute('aria-hidden', 'true');
    lienzo.style.cssText = 'position:fixed;left:0;top:0;pointer-events:none;' +
      'z-index:calc(var(--vt-z-flotante) - 1)';
    document.body.appendChild(lienzo);
    ctx = lienzo.getContext('2d');
    medir();
    addEventListener('resize', medir);
  }

  function medir() {
    var dpr = window.devicePixelRatio || 1;
    ancho = innerWidth;
    alto = innerHeight;
    lienzo.width = Math.round(ancho * dpr);
    lienzo.height = Math.round(alto * dpr);
    lienzo.style.width = ancho + 'px';
    lienzo.style.height = alto + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // ------------------------------------------------------------ rutinas --

  // Cabeza en (x, y) y el cuerpo estirado detras, en la direccion (dx, dy).
  function colocar(x, y, dx, dy) {
    cuerpo.forEach(function (s, n) {
      s.x = x + dx * n * LARGO;
      s.y = y + dy * n * LARGO;
    });
  }

  function empezar(rutina, velocidad, amplitud, frecuencia) {
    v.activa = true;
    v.rutina = rutina;
    v.ms = 0;
    v.entro = false;
    v.velocidad = velocidad;
    v.olaAmp = amplitud;
    v.olaFreq = frecuencia;
  }

  function techoDeLaBarra() {
    var barra = document.querySelector('.vt-nav');
    return barra ? barra.getBoundingClientRect().top : alto;
  }

  // Zigzag por los bordes de las dos primeras tarjetas que se vean, y salida
  // por la izquierda. Sin tarjetas a la vista, un zigzag por la pantalla.
  function puntosEntreTarjetas() {
    var techo = techoDeLaBarra();
    var puntos = [];
    [].slice.call(document.querySelectorAll('.site .block'))
      .map(function (b) { return b.getBoundingClientRect(); })
      .filter(function (r) { return r.bottom > 0 && r.top < techo; })
      .slice(0, 2)
      .forEach(function (r, n) {
        puntos.push({ x: r.left + r.width * (n ? 0.75 : 0.7), y: r.top + (n ? 30 : -8) });
        puntos.push({ x: r.left + r.width * (n ? 0.15 : 0.25), y: r.bottom + (n ? 25 : 12) });
      });
    if (!puntos.length) puntos = [{ x: ancho * 0.7, y: alto * 0.3 }, { x: ancho * 0.25, y: alto * 0.5 }];
    puntos.push({ x: -120, y: puntos[puntos.length - 1].y + 25 });
    puntos.forEach(function (p) { p.y = Math.max(30, Math.min(techo - 30, p.y)); });
    return puntos;
  }

  function empezarEntreTarjetas() {
    v.puntos = puntosEntreTarjetas();
    v.punto = 0;
    colocar(ancho + 60, v.puntos[0].y - 7, 1, 0);
    empezar('tarjetas', 5.2, 14, 0.22);
  }

  // Sube desde detras de la barra, mira un momento y vuelve a esconderse.
  // A un lado del centro, que es donde esta la pestana elevada.
  function empezarAsomo() {
    var techo = techoDeLaBarra();
    if (techo >= alto) return empezarEntreTarjetas();
    v.asomoX = ancho * (Math.random() < 0.5 ? 0.3 : 0.7) + (Math.random() * 40 - 20);
    v.asomoArriba = techo - 46;
    v.asomoAbajo = techo + 70;
    v.fase = 'sube';
    v.mirando = 0;
    colocar(v.asomoX, v.asomoAbajo, 0, 1);
    empezar('asomo', 3.6, 8, 0.16);
  }

  // ---------------------------------------------------------- movimiento --

  // Acercamiento exponencial independiente de los fotogramas.
  function suavizar(desde, hasta, factor, k) {
    return desde + (hasta - desde) * (1 - Math.pow(1 - factor, k));
  }

  function moverEntreTarjetas(k, onda) {
    var cabeza = cuerpo[0];
    var p = v.puntos[v.punto];
    if (!p) { cabeza.x -= v.velocidad * k; return; }
    var dx = p.x - cabeza.x;
    var dy = p.y - cabeza.y;
    var a = Math.atan2(dy, dx);
    var perp = a + Math.PI / 2;
    cabeza.x += (Math.cos(a) * v.velocidad + Math.cos(perp) * onda * 0.35) * k;
    cabeza.y += (Math.sin(a) * v.velocidad + Math.sin(perp) * onda * 0.35) * k;
    if (Math.hypot(dx, dy) < 35) v.punto++;
  }

  function moverAsomo(k) {
    var cabeza = cuerpo[0];
    if (v.fase === 'sube') {
      cabeza.y = suavizar(cabeza.y, v.asomoArriba, 0.08, k);
      cabeza.x = v.asomoX + Math.sin(v.ola * 0.7) * 4;
      if (Math.abs(cabeza.y - v.asomoArriba) < 3) v.fase = 'mira';
    } else if (v.fase === 'mira') {
      v.mirando += k;
      cabeza.x = v.asomoX + Math.sin(v.ola * 0.5) * 6;
      cabeza.y = v.asomoArriba + Math.cos(v.ola * 0.6) * 3;
      if (v.mirando > 70) v.fase = 'baja';
    } else {
      cabeza.y = suavizar(cabeza.y, v.asomoAbajo, 0.12, k);
      if (Math.abs(cabeza.y - v.asomoAbajo) < 5) v.activa = false;
    }
  }

  function arrastrarCuerpo() {
    for (var n = 1; n < SEGMENTOS; n++) {
      var antes = cuerpo[n - 1];
      var s = cuerpo[n];
      var a = Math.atan2(antes.y - s.y, antes.x - s.x);
      s.x = antes.x - Math.cos(a) * LARGO;
      s.y = antes.y - Math.sin(a) * LARGO;
    }
  }

  // Entera fuera, cola incluida: acabar con la cabeza fuera la cortaba a
  // medio cuerpo.
  function fueraDePantalla() {
    return cuerpo.every(function (s) {
      return s.x < -30 || s.x > ancho + 30 || s.y < -30 || s.y > alto + 30;
    });
  }

  function gestos(k) {
    v.parpadeo = Math.random() < 0.015 * k ? 0.1 : suavizar(v.parpadeo, 1, 0.25, k);
    v.faseLengua += 0.22 * k;
    var s = Math.sin(v.faseLengua);
    v.lengua = s > 0.5 ? (s - 0.5) * 2 : 0;
  }

  function soltarChispa(k) {
    if (!v.activa || Math.random() > 0.45 * k) return;
    var s = cuerpo[Math.floor(SEGMENTOS * 0.4)];
    chispas.push({
      x: s.x + (Math.random() - 0.5) * 8, y: s.y + (Math.random() - 0.5) * 8,
      vx: (Math.random() - 0.5) * 0.8, vy: (Math.random() - 0.5) * 0.8,
      vida: 0.8, tam: 1.5 + Math.random() * 2
    });
  }

  function moverChispas(k) {
    for (var n = chispas.length - 1; n >= 0; n--) {
      var c = chispas[n];
      c.x += c.vx * k;
      c.y += c.vy * k;
      c.vida -= 0.04 * k;
      if (c.vida <= 0) chispas.splice(n, 1);
    }
  }

  // k: cuantos fotogramas de 60 Hz han pasado. dt: milisegundos.
  function actualizar(k, dt) {
    gestos(k);
    soltarChispa(k);
    moverChispas(k);
    if (!v.activa) return;
    v.ms += dt;
    v.ola += v.olaFreq * k;
    if (v.rutina === 'tarjetas') moverEntreTarjetas(k, Math.sin(v.ola) * v.olaAmp);
    else moverAsomo(k);
    arrastrarCuerpo();
    var fuera = fueraDePantalla();
    if (!fuera) v.entro = true;
    if ((fuera && v.entro) || v.ms > MAX_MS) v.activa = false;
  }

  // -------------------------------------------------------------- dibujo --

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
    for (var n = SEGMENTOS - 1; n >= 1; n--) {
      var b = cuerpo[n];
      var a = cuerpo[n - 1];
      segmento(a, b, a.grosor, color.surface);
      if (n % 2 === 0) segmento(a, b, a.grosor * 0.72, n % 4 === 0 ? color['gold-light'] : color.gold);
      segmento(a, b, Math.max(1, a.grosor * 0.2), color['gold-soft']);
    }
  }

  // Mini pala de padel en la punta de la cola, apuntando hacia fuera.
  function dibujarPala() {
    var cola = cuerpo[SEGMENTOS - 1];
    var antes = cuerpo[SEGMENTOS - 2];
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

  function dibujar() {
    ctx.clearRect(0, 0, ancho, alto);
    dibujarChispas();
    if (!v.activa) return;
    dibujarSombra();
    dibujarCuerpo();
    dibujarPala();
    dibujarCabeza();
  }

  // --------------------------------------------------------------- bucle --

  function fotograma(ahora) {
    // Tope de 50 ms: tras un tiron no da un salto de media pantalla.
    var dt = Math.min(Math.max(ahora - ultimo, 0), 50);
    ultimo = ahora;
    actualizar(dt / FOTOGRAMA_MS, dt);
    dibujar();
    if (v.activa || chispas.length) {
      raf = requestAnimationFrame(fotograma);
      return;
    }
    raf = 0;
    programar(ENTRE_MIN_MS + Math.random() * (ENTRE_MAX_MS - ENTRE_MIN_MS));
  }

  function aparecer() {
    espera = 0;
    if (document.hidden || raf) return;
    if (Math.random() < 0.7) empezarEntreTarjetas();
    else empezarAsomo();
    ultimo = performance.now();
    raf = requestAnimationFrame(fotograma);
  }

  function programar(ms) {
    clearTimeout(espera);
    espera = setTimeout(aparecer, ms);
  }

  function alCambiarVisibilidad() {
    if (!document.hidden) {
      if (!raf) programar(PRIMERA_MS);
      return;
    }
    clearTimeout(espera);
    espera = 0;
    cancelAnimationFrame(raf);
    raf = 0;
    v.activa = false;
    chispas.length = 0;
    ctx.clearRect(0, 0, ancho, alto);
  }

  // Despues de la pantalla de bienvenida (splash.js), que tapa la pagina.
  // Mismo criterio que avisos-push.js.
  function trasSplash(hacer) {
    var raiz = document.documentElement;
    if (!raiz.classList.contains('vt-splash')) return hacer();
    var obs = new MutationObserver(function () {
      if (raiz.classList.contains('vt-splash')) return;
      obs.disconnect();
      hacer();
    });
    obs.observe(raiz, { attributes: true, attributeFilter: ['class'] });
  }

  function arrancar() {
    leerColores();
    crearLienzo();
    document.addEventListener('visibilitychange', alCambiarVisibilidad);
    programar(PRIMERA_MS);
  }

  trasSplash(arrancar);
})();
