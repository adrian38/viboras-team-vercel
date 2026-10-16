// Pantalla de bienvenida: una pelota de padel sube botando, al botar el logo
// sale de una onda dorada y un destello barre las letras. Los estilos y los
// tiempos estan en theme.css (.vt-splash*).
//
// Una vez por sesion: al abrir la app instalada (cada arranque es una sesion
// nueva) o la web en una pestana nueva, no en cada cambio de pagina. Tocar la
// pantalla la salta. Con «reducir movimiento» el logo sale quieto y se va
// enseguida.
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

  var raiz = document.documentElement;
  var reducido = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Con la app instalada en Android, el sistema ya ha ensenado antes su
  // pantalla de arranque (negro e icono), y no se puede ni quitar ni saber de
  // que tamano pinta el icono: depende del movil. Repetir el icono hacia que
  // saltase de tamano. Asi que ahi NO se repite: es la solucion habitual
  // (animar desde el color de fondo hacia la app). Negro, la pelota bota,
  // estalla y abre un agujero desde el centro que descubre la app.
  // ?splash=instalada fuerza esta variante para probarla en el navegador.
  var instalada = /[?&]splash=instalada\b/.test(location.search) ||
    (/Android/i.test(navigator.userAgent) && window.matchMedia &&
      matchMedia('(display-mode: standalone)').matches);
  raiz.classList.add('vt-splash');

  function div(clase) {
    var el = document.createElement('div');
    el.className = clase;
    return el;
  }

  // La onda y la pelota, centradas en la capa; el logo con su destello
  // encima, en una caja propia para que el destello no se salga de el.
  function crearCapa(logo) {
    var capa = div('vt-splash__capa');
    capa.setAttribute('aria-hidden', 'true');
    if (instalada) {
      capa.classList.add('vt-splash__capa--instalada');
      // El negro de esta variante: un circulo transparente con una sombra
      // negra enorme. Al crecer, la app aparece desde el centro.
      capa.appendChild(div('vt-splash__hueco'));
    }
    var caja = div('vt-splash__logo');
    caja.appendChild(logo);
    caja.appendChild(div('vt-splash__brillo'));
    capa.appendChild(div('vt-splash__onda'));
    capa.appendChild(caja);
    capa.appendChild(div('vt-splash__pelota'));
    return capa;
  }

  function montar() {
    var logo = document.createElement('img');
    logo.alt = '';
    logo.src = '/image.png';
    var capa = crearCapa(logo);
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
      // El brillo acaba a los 2,45 s; un respiro y se funde (0,4 s mas).
      // Instalada: el agujero acaba de abrirse a los 1,67 s.
      setTimeout(cerrar, reducido ? 700 : (instalada ? 1750 : 2800));
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
