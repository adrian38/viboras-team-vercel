// Ofrecer la instalacion a quien entra por la web. Se pinta en el hueco
// #vtInstalar, que hoy solo tiene la portada.
//
// Lo que NO se puede hacer, y por eso aqui no esta: abrir la app instalada
// desde el navegador. Ningun navegador tiene API para lanzar su propia PWA, asi
// que un boton «Abrir en la app» prometeria algo que no ocurre. Lo que si se
// puede es que el enlace no llegue al navegador, y eso lo pide
// "handle_links": "preferred" en site.webmanifest.
//
// Dos ramas, porque los dos moviles del grupo no se parecen en esto:
//   - Android/Chrome: el evento beforeinstallprompt. Guardado y disparado desde
//     un clic, instala en un toque.
//   - iPhone: no hay API ninguna. Solo se puede decir donde esta la opcion,
//     igual que ya hace avisos-push.js en su estado 'instalar'.
//
// Que beforeinstallprompt NO llegue es la senal de que ya esta instalada:
// Chrome no lo emite cuando la app ya esta puesta. Por eso en Android no se
// pinta nada hasta recibirlo y nadie recibe la oferta dos veces.
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

  var esIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  var CLAVE = 'vt-instalar-no-ofrecer-v1';
  var evento = null;

  function rechazada() {
    try { return localStorage.getItem(CLAVE) === '1'; } catch (e) { return false; }
  }

  function noOfrecerMas() {
    try { localStorage.setItem(CLAVE, '1'); } catch (e) { /* sin almacenamiento */ }
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

  // El aspa guarda la decision: en el iPhone es la unica forma de silenciarlo,
  // porque alli no hay evento que deje de llegar.
  function botonCerrar() {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'vt-instalar__cerrar';
    b.setAttribute('aria-label', 'No volver a ofrecer la instalación');
    b.appendChild(simbolo('close'));
    b.addEventListener('click', function () { noOfrecerMas(); quitar(); });
    return b;
  }

  function tarjeta(sub, alPulsar) {
    var caja = document.createElement('div');
    caja.className = 'vt-instalar';
    caja.appendChild(fila('vt-instalar__icono', simbolo('install_mobile')));

    var texto = fila('vt-instalar__texto');
    var titulo = fila('vt-instalar__titulo');
    titulo.textContent = 'Instala la app';
    var detalle = fila('vt-instalar__sub');
    detalle.textContent = sub;
    texto.appendChild(titulo);
    texto.appendChild(detalle);
    caja.appendChild(texto);

    if (alPulsar) {
      var boton = document.createElement('button');
      boton.type = 'button';
      boton.className = 'vt-btn vt-btn--sm vt-instalar__accion';
      boton.textContent = 'Instalar';
      boton.addEventListener('click', function () { alPulsar(boton, detalle); });
      caja.appendChild(boton);
    }

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

  if (esIOS) {
    if (!rechazada()) {
      tarjeta('Pulsa Compartir y luego «Añadir a pantalla de inicio». En el iPhone es además el único modo de recibir avisos.', null);
    }
  } else {
    window.addEventListener('beforeinstallprompt', function (e) {
      // El aviso lo damos en la tarjeta, no la barra que pone Chrome.
      e.preventDefault();
      evento = e;
      if (rechazada() || hueco.firstChild) return;
      tarjeta('Queda con su icono en el móvil y se abre sin las barras del navegador.', instalar);
    });
  }

  window.addEventListener('appinstalled', quitar);
})();
