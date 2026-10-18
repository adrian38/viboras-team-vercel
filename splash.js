// Pantalla de bienvenida: el video del grupo (splash.mp4). Las palas, la
// vibora que entra y se levanta entre ellas, «VIBORAS TEAM» y las chispas.
// Los estilos estan en theme.css (.vt-splash*).
//
// Una vez por sesion: al abrir la app instalada (cada arranque es una sesion
// nueva) o la web en una pestana nueva, no en cada cambio de pagina ni en una
// pestana que abre la propia app. Tocar la
// pantalla la salta. Con «reducir movimiento» sale el ultimo fotograma quieto
// y se va enseguida.
//
// Va SIN defer y en el <head> de las 16 paginas: tiene que decidir antes de
// que se pinte nada, o la pagina asomaria un instante antes del negro.
(function () {
  try {
    if (sessionStorage.getItem('vt-splash')) return;
    sessionStorage.setItem('vt-splash', '1');
  } catch (e) {
    return; // Sin sessionStorage saldria en cada pagina: mejor ninguna.
  }
  // Una pestana abierta desde una pagina nuestra estrena sessionStorage, pero
  // no es un arranque: el «Rellenar» del alta abre /inscripcion asi y salia
  // el video en mitad del registro (2026-10-18).
  if (document.referrer.indexOf(location.origin + '/') === 0) return;

  var raiz = document.documentElement;
  var reducido = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  raiz.classList.add('vt-splash');

  // muted y playsinline antes del src: sin ellos iOS no lo reproduce solo, o
  // lo abre a pantalla completa.
  function crearEscena() {
    var el = document.createElement(reducido ? 'img' : 'video');
    el.className = 'vt-splash__escena';
    if (reducido) {
      el.alt = '';
      el.src = '/splash-final.jpg';
      return el;
    }
    el.muted = true;
    el.setAttribute('muted', '');
    el.setAttribute('playsinline', '');
    el.preload = 'auto';
    el.src = '/splash.mp4';
    return el;
  }

  function montar() {
    var capa = document.createElement('div');
    capa.className = 'vt-splash__capa';
    capa.setAttribute('aria-hidden', 'true');
    var escena = crearEscena();
    capa.appendChild(escena);
    document.body.appendChild(capa);
    // La pagina ya puede pintarse: queda debajo de la capa.
    raiz.classList.add('vt-splash--lista');

    var cerrada = false;
    function cerrar() {
      if (cerrada) return;
      cerrada = true;
      capa.classList.add('vt-splash__capa--fuera');
      setTimeout(function () {
        capa.remove();
        raiz.classList.remove('vt-splash', 'vt-splash--lista');
      }, 400);
    }
    function mostrar() {
      capa.classList.add('vt-splash__capa--animando');
    }
    capa.addEventListener('click', cerrar);
    escena.addEventListener('error', cerrar);
    if (reducido) {
      mostrar();
      setTimeout(cerrar, 1000);
    } else {
      reproducir(escena, mostrar, cerrar);
    }
  }

  // El video dura 4,2 s. Si no ha empezado en 1,5 s (red lenta, sin
  // conexion, o iOS en ahorro de energia, que no deja reproducir solo) no se
  // espera mas: mejor sin bienvenida que mirando el negro.
  function reproducir(video, mostrar, cerrar) {
    var empezado = false;
    video.addEventListener('playing', function () {
      if (empezado) return;
      empezado = true;
      mostrar();
      setTimeout(cerrar, 5000); // por si nunca llega el 'ended'
    });
    // Un respiro sobre el ultimo fotograma y se funde (0,4 s mas).
    video.addEventListener('ended', function () { setTimeout(cerrar, 300); });
    setTimeout(function () { if (!empezado) cerrar(); }, 1500);
    var p = video.play();
    if (p && p.catch) p.catch(cerrar);
  }

  if (document.body) montar();
  else document.addEventListener('DOMContentLoaded', montar);
})();
