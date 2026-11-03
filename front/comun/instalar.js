// Ofrecer la instalacion a quien entra por la web. Se pinta en el hueco
// #vtInstalar, que hoy solo tiene la portada.
//
// Lo que NO se puede hacer, y por eso aqui no esta: abrir la app instalada
// desde el navegador. Ningun navegador tiene API para lanzar su propia PWA, asi
// que un boton «Abrir en la app» prometeria algo que no ocurre. Lo que si se
// puede es que el enlace no llegue al navegador, y eso lo pide
// "handle_links": "preferred" en site.webmanifest.
//
// Dos ramas, porque los dos navegadores dan cosas distintas:
//
//   - Android/Chrome: el evento beforeinstallprompt, que Chrome no emite
//     cuando la app ya esta puesta. Guardado y disparado desde un clic,
//     instala en un toque, y la fila no se pinta hasta recibirlo.
//   - iPhone/Safari: no hay evento ni API que instale, solo Compartir y
//     «Anadir a pantalla de inicio», asi que la fila son instrucciones y se
//     pinta al cargar. Lo que NO se puede saber alli es si ya esta instalada:
//     la app tiene su propio almacenamiento, asi que ni localStorage ni una
//     cookie cruzan de una a otra, y getInstalledRelatedApps() no existe. Por
//     eso el titulo pregunta en vez de afirmar: a quien la tiene y entra por
//     Safari —el enlace de WhatsApp— la fila le sigue saliendo, y el aspa la
//     calla hasta la siguiente apertura.
//
// Detalle: ai_context/instalar_la_app.md
(function () {
  var hueco = document.getElementById('vtInstalar');
  if (!hueco) return;

  // Abierta desde el icono: no hay nada que ofrecer. La media query la
  // entiende Android; navigator.standalone es la de Safari en iOS.
  var instalada = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) ||
    navigator.standalone === true;
  if (instalada) return;

  // La misma deteccion que avisos-push.js: el iPad se declara MacIntel desde
  // iPadOS 13 y solo lo delata que tenga tactil.
  var esIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  // sessionStorage y no localStorage: el aspa calla la fila mientras dure esta
  // apertura y vuelve a la siguiente. Mientras no este instalada hay algo que
  // ofrecer, y un «no» de hace tres semanas no es la respuesta de hoy.
  var CLAVE = 'vt-instalar-cerrado';
  var evento = null;

  function cerradaAhora() {
    try { return sessionStorage.getItem(CLAVE) === '1'; } catch (e) { return false; }
  }

  function recordarCierre() {
    try { sessionStorage.setItem(CLAVE, '1'); } catch (e) { /* sin almacenamiento */ }
  }

  function quitar() {
    while (hueco.firstChild) hueco.firstChild.remove();
  }

  function simbolo(nombre) {
    var s = document.createElement('span');
    s.className = 'ms ms--sm notranslate';
    s.setAttribute('translate', 'no');
    s.setAttribute('aria-hidden', 'true');
    s.textContent = nombre;
    return s;
  }

  function fila(clase, hijo) {
    var el = document.createElement('span');
    el.className = clase;
    if (hijo) el.appendChild(hijo);
    return el;
  }

  // El aspa es «ahora no», no «nunca mas». En Android instalarla ya la calla
  // sola, porque entonces no vuelve a haber evento; en iPhone solo la calla
  // abrir la app desde su icono, que es cuando standalone es true.
  function botonCerrar() {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'vt-instalar__cerrar';
    b.setAttribute('aria-label', 'Ahora no');
    b.appendChild(simbolo('close'));
    b.addEventListener('click', function () { recordarCierre(); quitar(); });
    return b;
  }

  // El armazon que comparten las dos ramas: icono, titulo y subtitulo. El
  // aspa la pone cada una al final, que va detras del boton cuando lo hay.
  function tarjeta(titulo, sub) {
    var caja = document.createElement('div');
    caja.className = 'vt-instalar';
    caja.appendChild(fila('vt-instalar__icono', simbolo('install_mobile')));

    var texto = fila('vt-instalar__texto');
    var cabeza = fila('vt-instalar__titulo');
    cabeza.textContent = titulo;
    var detalle = fila('vt-instalar__sub');
    detalle.textContent = sub;
    texto.appendChild(cabeza);
    texto.appendChild(detalle);
    caja.appendChild(texto);
    hueco.appendChild(caja);
    return { caja: caja, detalle: detalle };
  }

  function tarjetaAndroid() {
    var t = tarjeta('Instala la app', 'Queda con su icono en el móvil y se abre sin las barras del navegador.');
    var boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'vt-btn vt-btn--sm vt-instalar__accion';
    boton.textContent = 'Instalar';
    boton.addEventListener('click', function () { instalar(boton, t.detalle); });
    t.caja.appendChild(boton);
    t.caja.appendChild(botonCerrar());
  }

  // Sin boton: en iOS ninguna API instala, el camino es el menu del sistema.
  // El titulo pregunta porque desde Safari no se sabe si ya esta instalada.
  function tarjetaIOS() {
    var t = tarjeta('¿Tienes la app en el móvil?',
      'Si aún no, pulsa Compartir y luego «Añadir a pantalla de inicio».');
    t.caja.appendChild(botonCerrar());
  }

  // El navegador solo da un beforeinstallprompt por carga: si dice que no, el
  // boton ya no serviria de nada y se va, con la via del menu en su sitio.
  function instalar(boton, detalle) {
    if (!evento) return;
    boton.disabled = true;
    evento.prompt();
    evento.userChoice.then(function (r) {
      evento = null;
      if (r.outcome === 'accepted') return; // de quitar la tarjeta va appinstalled
      boton.remove();
      detalle.textContent = 'Cuando quieras, está en el menú del navegador: «Instalar aplicación».';
    });
  }

  // iOS no emite beforeinstallprompt ni appinstalled: no hay nada que
  // esperar, se pinta al cargar y aqui se acaba el script.
  if (esIOS) {
    if (!cerradaAhora()) tarjetaIOS();
    return;
  }

  window.addEventListener('beforeinstallprompt', function (e) {
    // El aviso lo damos en la tarjeta, no la barra que pone Chrome.
    e.preventDefault();
    evento = e;
    if (cerradaAhora() || hueco.firstChild) return;
    tarjetaAndroid();
  });

  window.addEventListener('appinstalled', quitar);
})();
