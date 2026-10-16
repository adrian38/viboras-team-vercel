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
  raiz.classList.add('vt-splash');

  function montar() {
    var capa = document.createElement('div');
    capa.className = 'vt-splash__capa';
    capa.setAttribute('aria-hidden', 'true');
    // La onda y la pelota, centradas en la capa; el logo con su destello
    // encima, en una caja propia para que el destello no se salga de el.
    var onda = document.createElement('div');
    onda.className = 'vt-splash__onda';
    var caja = document.createElement('div');
    caja.className = 'vt-splash__logo';
    var logo = document.createElement('img');
    logo.alt = '';
    logo.src = '/image.png';
    var brillo = document.createElement('div');
    brillo.className = 'vt-splash__brillo';
    caja.appendChild(logo);
    caja.appendChild(brillo);
    var pelota = document.createElement('div');
    pelota.className = 'vt-splash__pelota';
    capa.appendChild(onda);
    capa.appendChild(caja);
    capa.appendChild(pelota);
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
      // El destello acaba a los 1,8 s; un respiro y se funde (0,4 s mas).
      setTimeout(cerrar, reducido ? 700 : 2100);
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
