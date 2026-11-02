// La transicion entre pantallas: un velo del color del fondo que se va al
// llegar a una pagina y vuelve a ponerse al salir hacia la siguiente. Con la
// barra de pestanas abajo, cambiar de pestana deja de ser un parpadeo en
// blanco y negro y pasa a ser un fundido.
//
// Hecho a mano y no con `@view-transition`, que es una regla de CSS y una
// linea, porque esa todavia no la entienden todos los navegadores: Firefox
// la ignora entera. Esto es opacidad y una clase, asi que funciona en los
// mismos navegadores que el resto de la aplicacion.
//
// Va SIN defer y en el <head> de las veinte paginas, igual que splash.js y
// vt-cargando.js, y por la misma razon: la clase que tapa tiene que estar
// puesta antes del primer pintado, o la pagina asomaria un instante antes
// del velo. Su pinta son las reglas `.vt-transicion` de theme.css.
//
// Lo que NO hace, y conviene saberlo antes de buscar el fallo:
//
//   - Solo intercepta el clic en un enlace de la propia web. Un salto hecho
//     por codigo (`location.href = ...`, un formulario que se envia, el boton
//     atras del navegador) no se funde al salir: la pagina se va de golpe y
//     la siguiente si entra con su fundido.
//   - No sobrevive a la pagina. Son dos documentos distintos, asi que no hay
//     forma de mover un elemento de una pantalla a la otra; el fundido es al
//     color del fondo, no de una pantalla a la siguiente.
//   - Con «reducir movimiento» no se activa, y con el splash del arranque
//     tampoco: ese ya tapa la pagina con su propio negro.
//
// Detalle: ai_context/transicion_entre_pantallas.md
(function () {
  // Los mismos 160 ms que la `transition` de theme.css. Si cambia uno, el
  // otro tambien: si aqui fuera menos, la pagina se iria a medio fundido.
  var DURACION = 160;
  // Red de seguridad, como la de vt-cargando.js: si algo se rompe antes de
  // destapar, el velo se va solo. Nunca se queda la pantalla tapada.
  //
  // 350 ms y no mas, porque la espera de dos cuadros de abajo depende de que
  // el navegador este pintando, y no siempre lo esta: en una pestana que no
  // se ve, requestAnimationFrame no corre aunque `document.hidden` diga que
  // la pagina es visible (medido el 2026-11-02 con el panel del navegador
  // oculto). Si en 350 ms no ha habido dos cuadros, no hay fundido que
  // perder: se destapa y la pagina aparece como aparecia antes.
  var RESCATE = 350;
  // Y si el salto no llega a ocurrir —un `beforeunload` que lo cancela, un
  // enlace que no carga—, la pagina se destapa y se puede seguir usando.
  var VUELTA = 2500;

  var raiz = document.documentElement;
  var reducido = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reducido || raiz.classList.contains('vt-splash')) return;

  var saliendo = false;

  raiz.classList.add('vt-transicion');
  raiz.classList.add('vt-transicion--tapa');

  function tapado(si) {
    raiz.classList.toggle('vt-transicion--tapa', si);
  }

  // Dos cuadros antes de destapar: el navegador necesita haber pintado el
  // velo opaco una vez para que quitarlo sea una transicion y no un corte.
  // Es el mismo recurso que vt-cargando.js usa al montar el suyo.
  function entrar() {
    // En una pestana de fondo requestAnimationFrame no corre, asi que el
    // velo se quedaria puesto hasta el RESCATE. Alli no hay fundido que ver:
    // se destapa y listo. Medido el 2026-11-02 con la pestana oculta.
    if (document.hidden) { tapado(false); return; }
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { if (!saliendo) tapado(false); });
    });
  }

  function salir(destino) {
    if (saliendo) return;
    saliendo = true;
    tapado(true);
    setTimeout(function () { window.location.href = destino; }, DURACION);
    setTimeout(function () { saliendo = false; tapado(false); }, VUELTA);
  }

  // El destino si el clic es un cambio de pagina nuestro, y null si no lo es.
  // Todo lo que devuelve null se queda como estaba: el navegador hace lo que
  // hacia antes de que este fichero existiera.
  function destinoDelClic(ev) {
    if (ev.defaultPrevented || ev.button !== 0) return null;
    if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return null;
    var nodo = ev.target;
    var enlace = nodo && nodo.closest ? nodo.closest('a[href]') : null;
    if (!enlace) return null;
    // Otra pestana, una descarga o un enlace marcado como externo: suyo es.
    var donde = enlace.getAttribute('target');
    if (donde && donde !== '_self') return null;
    if (enlace.hasAttribute('download')) return null;
    if ((enlace.getAttribute('rel') || '').indexOf('external') >= 0) return null;

    var url;
    try { url = new URL(enlace.href, window.location.href); } catch (e) { return null; }
    // mailto:, tel:, javascript: y cualquier cosa que no sea cargar una
    // pagina de esta web.
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (url.origin !== window.location.origin) return null;
    // Un ancla de la misma pagina no navega a ningun sitio, y la misma URL
    // otra vez es recargar: fundir cualquiera de las dos solo estorba.
    var misma = url.pathname === window.location.pathname && url.search === window.location.search;
    if (misma && url.hash) return null;
    if (url.href === window.location.href) return null;
    return url.href;
  }

  document.addEventListener('click', function (ev) {
    var destino = destinoDelClic(ev);
    if (!destino) return;
    ev.preventDefault();
    salir(destino);
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', entrar);
  else entrar();
  setTimeout(function () { if (!saliendo) tapado(false); }, RESCATE);

  // Volver con el boton atras devuelve la pagina tal como se dejo, velo
  // incluido: hay que quitarlo o la pantalla se queda del color del fondo.
  window.addEventListener('pageshow', function (ev) {
    if (!ev.persisted) return;
    saliendo = false;
    tapado(false);
  });
})();
