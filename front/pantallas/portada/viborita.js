// Viborita: una serpiente dorada que anda por la portada mientras nadie toca.
//
// Es adorno y nada mas. No lleva texto, no responde al toque, y el lienzo va
// con pointer-events:none, asi que nunca se come un toque a las tarjetas.
// Sale de una maqueta de Stitch, a la que se le quitaron los bocadillos, la
// pelota, el boton de invocarla y la huida al tocarla.
//
// Va encadenando cosas, y cada una espera a QUIETO_MS sin tocar la pantalla
// (tocar, desplazar o teclear reinicia la cuenta). La primera vez sigue un
// guion: entra y se cuelga del logo, cae a la primera tarjeta y se va.
// Despues varia: colgarse de una tarjeta, de un icono o del logo, caer a lo
// que tenga debajo, cambiarse de sitio, cruzar en zigzag, asomarse por
// detras de la barra o irse.
//
// Como se mueve: andando, solo se gobierna la cabeza y los segmentos la
// siguen a distancia fija (cada uno a LARGO del anterior, en la direccion en
// que ya estaba); la ondulacion es un seno que empuja la cabeza en
// perpendicular a su rumbo. Colgada, la cabeza hace de pendulo y el cuerpo
// tiene dos puntos sujetos (FABRIK); la cola se acomoda al contorno de lo que
// la sujeta.
//
// Lo que cuida para no gastar:
// - La velocidad va por tiempo y no por fotogramas: a 120 Hz no va al doble.
//   Las constantes de velocidad estan expresadas por fotograma de 60 Hz.
// - El bucle solo corre mientras hay serpiente o chispas en pantalla; fuera
//   de ella no hay requestAnimationFrame.
// - Con la pestana oculta se para y no programa nada.
// - Con «reducir movimiento» no aparece.
//
// Los colores se leen de theme.css al arrancar; aqui no hay ninguno escrito.
// El pintado esta en viborita-dibujo.js.
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
  // Sin tocar la pantalla durante esto, hace lo siguiente.
  var QUIETO_MS = 2000;
  // Colgada mas de esto, se mueve aunque se siga tocando: si no, el bucle no
  // pararia nunca mientras alguien usa la portada.
  var COLGADA_MAX_MS = 20000;
  // Colgadas seguidas antes de irse por fuerza.
  var SEGUIDAS_MAX = 4;
  // Tope de un tramo andando o cayendo, por si alguno no llegara.
  var MAX_MS = 15000;
  // Segmentos que quedan colgando; el resto se acomoda sobre la percha.
  var COLGANDO = 20;
  var PERCHAS = '.site .block, .site .block-icon, .site .block-marca, .hero img';
  var LOGO = '.hero img';
  var TARJETA = '.site .block';

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
  var ultimaAccion = 0;
  // La primera vez: del logo, a la primera tarjeta, y fuera.
  var guion = ['logo', 'primera', 'irse'];
  var v = {
    activa: false, rutina: '', fase: '', ms: 0, entro: false, seguidas: 0,
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

  function alTocar() {
    ultimaAccion = performance.now();
  }

  function quieto() {
    return performance.now() - ultimaAccion >= QUIETO_MS;
  }

  // ------------------------------------------------------------- perchas --

  function techoDeLaBarra() {
    var barra = document.querySelector('.vt-nav');
    return barra ? barra.getBoundingClientRect().top : alto;
  }

  function alAzar(lista) {
    return lista[Math.floor(Math.random() * lista.length)];
  }

  // Se ve de ancho entero, con el borde de abajo a la vista y sitio debajo
  // para el cuerpo antes de la barra.
  function cabe(r, techo) {
    return r.width > 0 && r.left >= 0 && r.right <= ancho &&
      r.bottom > 40 && r.bottom + COLGANDO * LARGO + 70 < techo;
  }

  // Donde puede colgarse: tarjetas, sus dos iconos y el logo.
  function perchas(techo) {
    return [].slice.call(document.querySelectorAll(PERCHAS))
      .map(function (e) { return e.getBoundingClientRect(); })
      .filter(function (r) { return cabe(r, techo); });
  }

  function perchaDe(selector) {
    var e = document.querySelector(selector);
    var r = e && e.getBoundingClientRect();
    return r && cabe(r, techoDeLaBarra()) ? r : null;
  }

  // dir: hacia donde avanza por el borde al llegar (1, derecha); la cola
  // queda del otro lado. El enganche, 4 px por encima del borde: asi el
  // cuerpo queda apoyado sobre el, no pegado por debajo (medido).
  function fijarPercha(r, x, dir) {
    v.dir = dir;
    v.anclaX = x;
    v.borde = r.bottom - 4;
    v.percha = { L: r.left - 1, T: r.top - 1, R: r.right + 1, B: r.bottom - 1 };
  }

  function puntoDelBorde(r, margen) {
    return r.left + margen + Math.random() * (r.width - 2 * margen);
  }

  // Por el borde de abajo de la percha, en un sentido u otro, hasta un punto
  // al azar, y de ahi abajo.
  function puntosParaColgarse(r, dir) {
    var x = puntoDelBorde(r, r.width * (r.width > 80 ? 0.25 : 0.4));
    fijarPercha(r, x, dir || (Math.random() < 0.5 ? 1 : -1));
    return [
      { x: x - v.dir * 70, y: v.borde },
      { x: x, y: v.borde },
      { x: x + v.dir * 8, y: v.borde + COLGANDO * LARGO + 35, colgarse: true }
    ];
  }

  // Donde va el segmento a distancia d del enganche: hacia la cola, por el
  // contorno de la percha. En una tarjeta cae a lo largo del borde de abajo;
  // en un icono da la vuelta a la esquina y lo rodea.
  function enLaPercha(d) {
    return F.contorno(v.percha, v.anclaX, v.dir, d);
  }

  // -------------------------------------------------------------- entrar --

  function empezar(rutina, velocidad, amplitud, frecuencia) {
    v.activa = true;
    v.rutina = rutina;
    v.ms = 0;
    v.entro = false;
    v.velocidad = velocidad;
    v.olaAmp = amplitud;
    v.olaFreq = frecuencia;
  }

  function nuevaVuelta() {
    v.fase = '';
    v.cola = null;
    v.punto = 0;
    v.scroll = scrollY;
    v.seguidas = 0;
  }

  function tarjetasVisibles(techo) {
    return [].slice.call(document.querySelectorAll(TARJETA))
      .map(function (b) { return b.getBoundingClientRect(); })
      .filter(function (r) { return r.bottom > 0 && r.top < techo; })
      .slice(0, 2);
  }

  function enTarjeta(r, f) {
    return r.left + r.width * (v.espejo ? 1 - f : f);
  }

  // Zigzag por los bordes de las dos primeras tarjetas que se vean, a veces
  // en espejo, y sale por el lado contrario al que entro. Sin tarjetas a la
  // vista, un zigzag por la pantalla.
  function puntosEntreTarjetas() {
    var techo = techoDeLaBarra();
    var e = v.espejo;
    var puntos = [];
    tarjetasVisibles(techo).forEach(function (r, n) {
      puntos.push({ x: enTarjeta(r, n ? 0.75 : 0.7), y: r.top + (n ? 30 : -8) });
      puntos.push({ x: enTarjeta(r, n ? 0.15 : 0.25), y: r.bottom + (n ? 25 : 12) });
    });
    if (!puntos.length) {
      puntos = [{ x: ancho * (e ? 0.3 : 0.7), y: alto * 0.3 }, { x: ancho * (e ? 0.75 : 0.25), y: alto * 0.5 }];
    }
    puntos.forEach(function (p) { p.y = Math.max(30, Math.min(techo - 30, p.y)); });
    puntos.push({ x: e ? ancho + 120 : -120, y: puntos[puntos.length - 1].y + 25 });
    return puntos;
  }

  function empezarEntreTarjetas() {
    nuevaVuelta();
    v.espejo = Math.random() < 0.5;
    v.puntos = puntosEntreTarjetas();
    F.colocar(cuerpo, LARGO, v.espejo ? -60 : ancho + 60, v.puntos[0].y - 7, v.espejo ? -1 : 1, 0);
    empezar('tarjetas', 5.2, 14, 0.22);
  }

  // Entra por un lado a la altura del borde de la percha y se cuelga.
  function entrarYColgarse(r) {
    var dir = Math.random() < 0.5 ? 1 : -1;
    nuevaVuelta();
    v.puntos = puntosParaColgarse(r, dir);
    F.colocar(cuerpo, LARGO, dir > 0 ? -60 : ancho + 60, v.borde, -dir, 0);
    empezar('tarjetas', 5.2, 14, 0.22);
  }

  // Sube desde detras de la barra, mira un momento y vuelve a esconderse.
  // A un lado del centro, que es donde esta la pestana elevada.
  function empezarAsomo() {
    var techo = techoDeLaBarra();
    if (techo >= alto) return empezarEntreTarjetas();
    nuevaVuelta();
    v.asomoX = ancho * (Math.random() < 0.5 ? 0.3 : 0.7) + (Math.random() * 40 - 20);
    v.asomoArriba = techo - 46;
    v.asomoAbajo = techo + 70;
    v.fase = 'sube';
    v.mirando = 0;
    F.colocar(cuerpo, LARGO, v.asomoX, v.asomoAbajo, 0, 1);
    empezar('asomo', 3.6, 8, 0.16);
  }

  // La primera vez, al logo (si se ve y cabe debajo); despues, al azar.
  function entrar() {
    if (guion[0] === 'logo') {
      guion.shift();
      var logo = perchaDe(LOGO);
      if (logo) return entrarYColgarse(logo);
      guion = [];
    }
    var donde = perchas(techoDeLaBarra());
    var azar = Math.random();
    if (donde.length && azar < 0.5) return entrarYColgarse(alAzar(donde));
    if (azar < 0.75) return empezarEntreTarjetas();
    empezarAsomo();
  }

  // ---------------------------------------------------------- movimiento --

  function moverAndando(k, onda) {
    var cabeza = cuerpo[0];
    var p = v.puntos[v.punto];
    // Sin mas puntos, sigue recta por donde iba hasta salir entera.
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

  // Llegando andando: se engancha por el primer segmento (desde la cabeza)
  // que aun esta sobre el borde.
  function colgarse() {
    var fijo = COLGANDO;
    for (var n = 1; n < SEGMENTOS; n++) {
      if (cuerpo[n].y <= v.borde + 4) { fijo = n; break; }
    }
    engancharse(Math.max(8, Math.min(SEGMENTOS - 4, fijo)), 0);
  }

  // De `fijo` hacia la cabeza cuelga; de `fijo` a la cola se acomoda al
  // contorno de la percha. `golpe` balancea de mas al principio (al caer).
  function engancharse(fijo, golpe) {
    v.fijo = fijo;
    v.cola = [];
    for (var n = fijo; n < SEGMENTOS; n++) v.cola.push(enLaPercha((n - fijo) * LARGO));
    v.fase = 'colgada';
    v.colgadaMs = 0;
    v.ms = 0;
    v.seguidas++;
    v.calma = 0.2 + Math.random() * 0.25;
    v.amplitud = v.calma + golpe;
    v.ritmo = 1.8 + Math.random();
    v.desfase = Math.random() * Math.PI * 2;
  }

  function acomodarCola(k) {
    for (var n = v.fijo; n < SEGMENTOS; n++) {
      var o = v.cola[n - v.fijo];
      cuerpo[n].x = suavizar(cuerpo[n].x, o.x, 0.12, k);
      cuerpo[n].y = suavizar(cuerpo[n].y, o.y, 0.12, k);
    }
  }

  // Pendulo: la cabeza va hacia un punto que oscila bajo el enganche, a algo
  // menos que el largo de lo que cuelga para que el cuerpo haga curva. Dos
  // senos de ritmo distinto para que no parezca un metronomo.
  function moverColgada(k, dt) {
    v.colgadaMs += dt;
    if (v.colgadaMs > QUIETO_MS && (quieto() || v.colgadaMs > COLGADA_MAX_MS)) return siguiente();
    acomodarCola(k);
    v.amplitud = suavizar(v.amplitud, v.calma, 0.02, k);
    var ancla = cuerpo[v.fijo];
    var radio = v.fijo * LARGO * 0.92;
    var s = v.colgadaMs / 1000;
    var angulo = v.amplitud * Math.sin(s * v.ritmo + v.desfase) + 0.12 * Math.sin(s * 0.7 + v.desfase * 2);
    var cabeza = cuerpo[0];
    cabeza.x = suavizar(cabeza.x, ancla.x + Math.sin(angulo) * radio, 0.15, k);
    cabeza.y = suavizar(cabeza.y, ancla.y + Math.cos(angulo) * radio, 0.15, k);
    F.tensar(cuerpo, v.fijo, LARGO);
  }

  // Lo siguiente estando colgada. Primero el guion (del logo cae a la
  // primera tarjeta, y de ahi se va); despues, al azar entre caer a lo que
  // tenga debajo, cambiarse a otra percha o irse.
  function siguiente() {
    var paso = guion.shift();
    var p = v.percha;
    var todas = perchas(techoDeLaBarra());
    var debajo = todas.filter(function (r) { return r.bottom > p.B + 30; });
    var otras = todas.filter(function (r) { return Math.abs(r.bottom - 1 - p.B) > 2 || Math.abs(r.left - 1 - p.L) > 2; });
    if (paso === 'primera') {
      var t = perchaDe(TARJETA);
      if (t && t.bottom > p.B + 30) return caer(t);
    }
    var azar = Math.random();
    if (paso === 'irse' || v.seguidas >= SEGUIDAS_MAX) return soltarse();
    if (debajo.length && azar < 0.4) return caer(alAzar(debajo));
    if (otras.length && azar < 0.75) return mudarse(alAzar(otras));
    soltarse();
  }

  // Se suelta y cae a plomo hasta el borde de una percha de mas abajo. Si la
  // percha es estrecha, se va corriendo hacia ella mientras cae.
  function caer(r) {
    var margen = r.width * (r.width > 80 ? 0.15 : 0.4);
    var x = Math.max(r.left + margen, Math.min(r.right - margen, cuerpo[v.fijo].x));
    fijarPercha(r, x, Math.random() < 0.5 ? 1 : -1);
    v.fase = 'cae';
    v.cola = null;
    v.vy = 0;
    v.ms = 0;
  }

  function moverCayendo(k) {
    var ancla = cuerpo[v.fijo];
    v.vy += 0.5 * k;
    var dy = Math.min(v.vy * k, v.percha.B - ancla.y);
    var dx = (v.anclaX - ancla.x) * (1 - Math.pow(0.85, k));
    cuerpo.forEach(function (s) { s.x += dx; s.y += dy; });
    if (ancla.y >= v.percha.B - 0.5) engancharse(v.fijo, 0.25);
  }

  // Trepa por el lado libre (el contrario a la cola) hasta encima del borde.
  function trepar() {
    var a = cuerpo[v.fijo];
    var d = v.dir;
    v.fase = '';
    v.cola = null;
    v.punto = 0;
    v.ms = 0;
    return [{ x: a.x + d * 28, y: a.y + 20 }, { x: a.x + d * 40, y: a.y - 14 }];
  }

  // Trepa y se va por ese mismo lado.
  function soltarse() {
    var puntos = trepar();
    v.puntos = puntos.concat({ x: v.dir > 0 ? ancho + 120 : -120, y: puntos[1].y });
  }

  // Trepa y se va andando a colgarse de otra percha.
  function mudarse(r) {
    v.puntos = trepar().concat(puntosParaColgarse(r));
  }

  // Si se desplaza la pagina, la serpiente se mueve con las tarjetas: el
  // lienzo es fijo y, sin esto, se quedaria colgando del aire.
  function seguirElScroll() {
    var d = scrollY - v.scroll;
    v.scroll = scrollY;
    if (!d) return;
    function bajar(p) { p.y -= d; }
    cuerpo.forEach(bajar);
    v.puntos.forEach(bajar);
    if (v.cola) v.cola.forEach(bajar);
    if (v.percha) { v.percha.T -= d; v.percha.B -= d; }
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

  function moverSerpiente(k, dt) {
    if (v.rutina === 'asomo') {
      moverAsomo(k);
      F.arrastrar(cuerpo, LARGO);
      return;
    }
    seguirElScroll();
    if (v.fase === 'colgada') moverColgada(k, dt);
    else if (v.fase === 'cae') moverCayendo(k);
    else {
      moverAndando(k, Math.sin(v.ola) * v.olaAmp);
      F.arrastrar(cuerpo, LARGO);
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
    moverSerpiente(k, dt);
    var fuera = F.fuera(cuerpo, ancho, alto);
    if (!fuera) v.entro = true;
    if ((fuera && v.entro) || (v.fase !== 'colgada' && v.ms > MAX_MS)) v.activa = false;
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
    programar(QUIETO_MS);
  }

  // Solo si lleva QUIETO_MS sin tocar; si no, espera lo que falte.
  function aparecer() {
    espera = 0;
    if (document.hidden || raf) return;
    var falta = QUIETO_MS - (performance.now() - ultimaAccion);
    if (falta > 0) return programar(falta + 50);
    entrar();
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
    ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'].forEach(function (e) {
      addEventListener(e, alTocar, { passive: true, capture: true });
    });
    programar(PRIMERA_MS);
  }

  trasSplash(arrancar);
})();
