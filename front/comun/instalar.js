// Ofrecer la instalacion a quien entra por la web. Se pinta en el hueco
// #vtInstalar, que hoy solo tiene la portada.
//
// Lo que NO se puede hacer, y por eso aqui no esta: abrir la app instalada
// desde el navegador. Ningun navegador tiene API para lanzar su propia PWA, asi
// que un boton «Abrir en la app» prometeria algo que no ocurre. Lo que si se
// puede es que el enlace no llegue al navegador, y eso lo pide
// "handle_links": "preferred" en site.webmanifest.
//
// Solo se ofrece donde el navegador deja saber que NO esta instalada, y eso
// hoy es Android/Chrome: el evento beforeinstallprompt, que Chrome no emite
// cuando la app ya esta puesta. Guardado y disparado desde un clic, instala en
// un toque.
//
// En iPhone no se ofrece nada. No es que no haya forma de instalar —Compartir
// y «Anadir a pantalla de inicio»—, es que Safari no dice si ya esta hecho:
// la app instalada tiene su propio almacenamiento, asi que ni localStorage ni
// una cookie cruzan de una a otra, y getInstalledRelatedApps() no existe alli.
// Ofrecerlo a ciegas seria ensenarle «instala la app» a quien ya la tiene.
// Quien entra por Safari sin instalarla sigue viendo como se hace en el
// dialogo de avisos (avisos-push.js, estado 'instalar'), que es donde importa:
// en iPhone sin instalar no hay push.
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

  // El aspa es «ahora no», no «nunca mas»: instalarla ya la calla sola, porque
  // entonces no vuelve a haber evento.
  function botonCerrar() {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'vt-instalar__cerrar';
    b.setAttribute('aria-label', 'Ahora no');
    b.appendChild(simbolo('close'));
    b.addEventListener('click', function () { recordarCierre(); quitar(); });
    return b;
  }

  function tarjeta() {
    var caja = document.createElement('div');
    caja.className = 'vt-instalar';
    caja.appendChild(fila('vt-instalar__icono', simbolo('install_mobile')));

    var texto = fila('vt-instalar__texto');
    var titulo = fila('vt-instalar__titulo');
    titulo.textContent = 'Instala la app';
    var detalle = fila('vt-instalar__sub');
    detalle.textContent = 'Queda con su icono en el móvil y se abre sin las barras del navegador.';
    texto.appendChild(titulo);
    texto.appendChild(detalle);
    caja.appendChild(texto);

    var boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'vt-btn vt-btn--sm vt-instalar__accion';
    boton.textContent = 'Instalar';
    boton.addEventListener('click', function () { instalar(boton, detalle); });
    caja.appendChild(boton);

    caja.appendChild(botonCerrar());
    hueco.appendChild(caja);
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

  window.addEventListener('beforeinstallprompt', function (e) {
    // El aviso lo damos en la tarjeta, no la barra que pone Chrome.
    e.preventDefault();
    evento = e;
    if (cerradaAhora() || hueco.firstChild) return;
    tarjeta();
  });

  window.addEventListener('appinstalled', quitar);
})();
