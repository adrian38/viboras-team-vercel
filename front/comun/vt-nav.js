// Barra de pestanas inferior, la de la maqueta de Stitch del 2026-11-02.
//
// Va en un fichero y no copiada en cada .html por lo que ya ensena el <head>:
// veinte copias de un marcado que cambia a la vez es el sitio mas caro del
// repositorio. Aqui el marcado es uno y las veinte paginas solo cargan esto.
//
// Su aspecto son las reglas `.vt-nav*` de theme.css, y el hueco que le deja
// la pagina es el `padding-bottom` del `body`, que esta ahi y no aqui: si lo
// pusiera el script, la pagina daria un salto al montarse la barra.
//
// Detalle: ai_context/barra_de_navegacion.md
(function () {
  // Cinco pestanas, las de la maqueta. `ruta` es a donde lleva; `seccion`,
  // las paginas que la encienden. Las que no estan en ninguna lista
  // —/cuenta, /tablon, /group-normativa, /inscripcion— no encienden ninguna,
  // que es la verdad: no son una de estas cinco.
  const PESTANAS = [
    { ruta: '/', icono: 'home', texto: 'Inicio', seccion: ['/'] },
    {
      ruta: '/history',
      icono: 'emoji_events',
      texto: 'Partidos',
      seccion: ['/history', '/results', '/submit-result', '/tournaments', '/day']
    },
    { ruta: '/comunidad', icono: 'group', texto: 'Comunidad', seccion: ['/comunidad', '/valorar'] },
    {
      ruta: '/rating',
      icono: 'query_stats',
      texto: 'Rendimiento',
      seccion: ['/rating', '/rating-info', '/rating-test', '/ranking', '/ranking-info', '/players', '/statistics']
    },
    { ruta: '/buzon', icono: 'feedback', texto: 'Buzón', seccion: ['/buzon'] }
  ];

  // La misma pagina se abre por tres caminos: la URL limpia que sirve Vercel
  // (`/rating`), la del fichero (`/rating.html`, que todavia escriben algunos
  // botones) y la ruta real del arbol (`/front/pantallas/rating`, que es lo
  // que se ve si se entra al fichero a pelo). Las tres son la misma pestana.
  function rutaActual() {
    let r = window.location.pathname.replace(/\/index\.html$/, '/').replace(/\.html$/, '');
    r = r.replace(/^\/front\/pantallas\/portada$/, '/').replace(/^\/front\/pantallas\//, '/');
    r = r.replace(/\/+$/, '');
    return r || '/';
  }

  function montar() {
    if (document.querySelector('.vt-nav')) return;
    const actual = rutaActual();
    const nav = document.createElement('nav');
    nav.className = 'vt-nav';
    nav.setAttribute('aria-label', 'Navegación principal');

    const lista = document.createElement('div');
    lista.className = 'vt-nav__lista';
    for (const p of PESTANAS) {
      const a = document.createElement('a');
      a.className = 'vt-nav__item';
      a.href = p.ruta;
      if (p.seccion.includes(actual)) a.setAttribute('aria-current', 'page');

      const caja = document.createElement('span');
      caja.className = 'vt-nav__icono';
      const icono = document.createElement('span');
      // notranslate y translate="no": los iconos se pintan por ligadura y un
      // traductor que reescriba "home" deja de pintar la casita.
      icono.className = 'ms notranslate';
      icono.setAttribute('translate', 'no');
      icono.setAttribute('aria-hidden', 'true');
      icono.textContent = p.icono;
      caja.appendChild(icono);

      const texto = document.createElement('span');
      texto.className = 'vt-nav__texto';
      texto.textContent = p.texto;

      a.append(caja, texto);
      lista.appendChild(a);
    }
    nav.appendChild(lista);
    document.body.appendChild(nav);
    // En la misma tarea que el appendChild, no en la siguiente: el velo del
    // fundido se recorta con esta clase, y si se pintara el recorte un cuadro
    // antes que la barra se veria la franja de fondo vacia.
    document.documentElement.classList.add('vt-nav-puesta');
  }

  // Se carga con defer, asi que el body ya existe; el if cubre que alguien lo
  // cargue de otra forma.
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montar);
  else montar();
})();
