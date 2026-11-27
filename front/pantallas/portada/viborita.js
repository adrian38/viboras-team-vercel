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

  var F = window.vtViboritaCuerpo;
  var suavizar = F.suavizar;

  if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var SEGMENTOS = 32;
  var LARGO = 6.2;
  var FOTOGRAMA_MS = 1000 / 60;
  var PRIMERA_MS = 2500;
  var ENTRE_MIN_MS = 10000;
  var ENTRE_MAX_MS = 15000;
  // Tope de un recorrido, por si alguno no llegara a salir de la pantalla.
  // Cabe uno con parada colgada: unos 5 s de zigzag, hasta 11 colgada y 3
  // de salida.
  var MAX_MS = 30000;
  // Colgarse del borde de una tarjeta: cuantas veces, cuanto rato, y cuantos
  // segmentos quedan colgando (el resto se queda tendido sobre el borde).
  var COLGAR_PROB = 0.4;
  var COLGADA_MIN_MS = 7000;
  var COLGADA_MAX_MS = 11000;
  var COLGANDO = 20;

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

  function tarjetasVisibles(techo) {
    return [].slice.call(document.querySelectorAll('.site .block'))
      .map(function (b) { return b.getBoundingClientRect(); })
      .filter(function (r) { return r.bottom > 0 && r.top < techo; })
      .slice(0, 2);
  }

  // El borde de abajo de una tarjeta del recorrido con sitio debajo para el
  // cuerpo antes de la barra. La ultima que valga, o ninguna.
  function bordeParaColgarse(tarjetas, techo) {
    var validas = tarjetas.filter(function (r) {
      return r.bottom > 40 && r.bottom + COLGANDO * LARGO + 70 < techo;
    });
    return validas.length ? validas[validas.length - 1] : null;
  }

  // Zigzag por los bordes de las dos primeras tarjetas que se vean. Sin
  // tarjetas a la vista, un zigzag por la pantalla. Al final, o sale por la
  // izquierda, o recorre el borde de abajo de una tarjeta y se descuelga.
  function puntosEntreTarjetas(colgar) {
    var techo = techoDeLaBarra();
    var tarjetas = tarjetasVisibles(techo);
    var borde = colgar && bordeParaColgarse(tarjetas, techo);
    var puntos = [];
    tarjetas.forEach(function (r, n) {
      puntos.push({ x: r.left + r.width * (n ? 0.75 : 0.7), y: r.top + (n ? 30 : -8) });
      puntos.push({ x: r.left + r.width * (n ? 0.15 : 0.25), y: r.bottom + (n ? 25 : 12) });
    });
    if (!puntos.length) puntos = [{ x: ancho * 0.7, y: alto * 0.3 }, { x: ancho * 0.25, y: alto * 0.5 }];
    puntos.forEach(function (p) { p.y = Math.max(30, Math.min(techo - 30, p.y)); });
    if (!borde) {
      puntos.push({ x: -120, y: puntos[puntos.length - 1].y + 25 });
      return puntos;
    }
    // 4 px por encima del borde: asi el cuerpo queda apoyado sobre el, no
    // pegado por debajo (medido: con el borde exacto quedaba 4 px bajo).
    var x = borde.left + borde.width * 0.55;
    v.borde = borde.bottom - 4;
    puntos.push({ x: borde.left + borde.width * 0.1, y: v.borde });
    puntos.push({ x: x, y: v.borde });
    puntos.push({ x: x, y: v.borde + COLGANDO * LARGO + 35, colgarse: true });
    return puntos;
  }

  function empezarEntreTarjetas() {
    v.fase = '';
    v.puntos = puntosEntreTarjetas(Math.random() < COLGAR_PROB);
    v.punto = 0;
    v.scroll = scrollY;
    F.colocar(cuerpo, LARGO, ancho + 60, v.puntos[0].y - 7, 1, 0);
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
    F.colocar(cuerpo, LARGO, v.asomoX, v.asomoAbajo, 0, 1);
    empezar('asomo', 3.6, 8, 0.16);
  }

  // ---------------------------------------------------------- movimiento --

  function moverEntreTarjetas(k, onda) {
    var cabeza = cuerpo[0];
    var p = v.puntos[v.punto];
    // Sin mas puntos, sigue recta por donde iba hasta salir entera: la
    // salida puede ser por la izquierda o, tras colgarse, por la derecha.
    if (!p) {
      cabeza.x += Math.cos(v.rumbo) * v.velocidad * k;
      cabeza.y += Math.sin(v.rumbo) * v.velocidad * k;
      return;
    }
    var dx = p.x - cabeza.x;
    var dy = p.y - cabeza.y;
    var a = v.rumbo = Math.atan2(dy, dx);
    var perp = a + Math.PI / 2;
    cabeza.x += (Math.cos(a) * v.velocidad + Math.cos(perp) * onda * 0.35) * k;
    cabeza.y += (Math.sin(a) * v.velocidad + Math.sin(perp) * onda * 0.35) * k;
    if (Math.hypot(dx, dy) >= 35) return;
    v.punto++;
    if (p.colgarse) colgarse();
  }

  // Se engancha por el primer segmento (desde la cabeza) que aun esta sobre
  // el borde: de ahi hacia la cola queda tendida, de ahi hacia la cabeza
  // cuelga.
  function colgarse() {
    var fijo = COLGANDO;
    for (var n = 1; n < SEGMENTOS; n++) {
      if (cuerpo[n].y <= v.borde + 4) { fijo = n; break; }
    }
    v.fijo = Math.max(8, Math.min(SEGMENTOS - 4, fijo));
    v.fase = 'colgada';
    v.colgadaMs = 0;
    v.colgadaHasta = COLGADA_MIN_MS + Math.random() * (COLGADA_MAX_MS - COLGADA_MIN_MS);
  }

  // Pendulo: la cabeza va hacia un punto que oscila bajo el enganche, a algo
  // menos que el largo de lo que cuelga para que el cuerpo haga curva.
  function moverColgada(k, dt) {
    v.colgadaMs += dt;
    if (v.colgadaMs > v.colgadaHasta) return soltarse();
    var ancla = cuerpo[v.fijo];
    var radio = v.fijo * LARGO * 0.92;
    var angulo = Math.sin(v.colgadaMs / 1000 * 2.4) * 0.35;
    var cabeza = cuerpo[0];
    cabeza.x = suavizar(cabeza.x, ancla.x + Math.sin(angulo) * radio, 0.15, k);
    cabeza.y = suavizar(cabeza.y, ancla.y + Math.cos(angulo) * radio, 0.15, k);
    F.tensar(cuerpo, v.fijo, LARGO);
  }

  // Sube por un lado de su propio cuerpo y se va por la derecha, por encima
  // del borde. La cola tendida se arrastra detras.
  function soltarse() {
    var a = cuerpo[v.fijo];
    v.fase = '';
    v.punto = 0;
    v.puntos = [
      { x: a.x + 28, y: a.y + 20 },
      { x: a.x + 40, y: a.y - 14 },
      { x: ancho + 120, y: a.y - 14 }
    ];
  }

  // Si se desplaza la pagina, la serpiente se mueve con las tarjetas: el
  // lienzo es fijo y, sin esto, se quedaria colgando del aire.
  function seguirElScroll() {
    var d = scrollY - v.scroll;
    v.scroll = scrollY;
    if (!d) return;
    cuerpo.forEach(function (s) { s.y -= d; });
    v.puntos.forEach(function (p) { p.y -= d; });
    v.borde -= d;
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

  function gestos(k) {
    v.parpadeo = Math.random() < 0.015 * k ? 0.1 : suavizar(v.parpadeo, 1, 0.25, k);
    v.faseLengua += 0.22 * k;
    var s = Math.sin(v.faseLengua);
    v.lengua = s > 0.5 ? (s - 0.5) * 2 : 0;
  }

  function soltarChispa(k) {
    if (!v.activa || v.fase === 'colgada' || Math.random() > 0.45 * k) return;
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
    if (v.rutina === 'asomo') {
      moverAsomo(k);
      F.arrastrar(cuerpo, LARGO);
    } else {
      seguirElScroll();
      if (v.fase === 'colgada') moverColgada(k, dt);
      else {
        moverEntreTarjetas(k, Math.sin(v.ola) * v.olaAmp);
        F.arrastrar(cuerpo, LARGO);
      }
    }
    var fuera = F.fuera(cuerpo, ancho, alto);
    if (!fuera) v.entro = true;
    if ((fuera && v.entro) || v.ms > MAX_MS) v.activa = false;
  }

  // ------------------------------------------------------------- dibujo --

  // El pintado vive en viborita-dibujo.js, que se carga antes que este.
  function dibujar() {
    window.vtViboritaDibujo({ ctx: ctx, ancho: ancho, alto: alto, color: color, cuerpo: cuerpo, chispas: chispas, v: v });
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
