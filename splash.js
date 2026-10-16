// Pantalla de bienvenida: el logo sale del negro dentro de un circulo que se
// abre, crece y se ilumina, como en el video del grupo (2026-10-13). Los
// estilos estan en theme.css (.vt-splash*).
//
// Una vez por sesion: al abrir la app instalada (cada arranque es una sesion
// nueva) o la web en una pestana nueva, no en cada cambio de pagina. Tocar la
// pantalla la salta. Con «reducir movimiento» el logo sale quieto y se va
// enseguida.
//
// Va SIN defer y en el <head> de las 18 paginas: tiene que decidir antes de
// que se pinte nada, o la pagina asomaria un instante antes del negro.
(function () {
  try {
    if (sessionStorage.getItem('vt-splash')) return;
    sessionStorage.setItem('vt-splash', '1');
  } catch (e) {
    return; // Sin sessionStorage saldria en cada pagina: mejor ninguna.
  }

  var raiz = document.documentElement;
  var reducido = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  raiz.classList.add('vt-splash');

  function montar() {
    var capa = document.createElement('div');
    capa.className = 'vt-splash__capa';
    capa.setAttribute('aria-hidden', 'true');
    var logo = document.createElement('img');
    logo.className = 'vt-splash__logo';
    logo.alt = '';
    logo.src = '/image.png';
    capa.appendChild(logo);
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

    // La animacion arranca cuando el logo esta cargado; si no, apareceria a
    // mitad de camino. Si tarda, arranca igual.
    var empezada = false;
    function empezar() {
      if (empezada) return;
      empezada = true;
      capa.classList.add('vt-splash__capa--animando');
      // Entra hasta los 2,1 s y se queda casi un segundo, como el video.
      setTimeout(cerrar, reducido ? 700 : 3000);
    }
    if (logo.complete) empezar();
    logo.addEventListener('load', empezar);
    logo.addEventListener('error', cerrar);
    setTimeout(empezar, 1200);
    capa.addEventListener('click', cerrar);
  }

  if (document.body) montar();
  else document.addEventListener('DOMContentLoaded', montar);
})();
