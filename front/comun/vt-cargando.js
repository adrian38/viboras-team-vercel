// La pantalla de carga que comparten las paginas que piden datos al API o
// calculan antes de tener algo que ensenar. La pinta esta en theme.css.
//
// Dos usos, y la diferencia importa:
//
//   vtCargando.arranque(cargar, 'Calculando el rating')
//     La carga con la que nace la pagina. El velo esta puesto desde el primer
//     momento y la pagina no se ve hasta que termina: primero el cargado, y
//     con todo pintado, la pagina. Sin retardo ninguno, porque aqui no hay
//     nada que parpadee: lo que habria debajo esta tapado igualmente.
//
//   vtCargando.mientras(refrescar, 'Actualizando')
//     Una carga posterior, con la pagina ya delante: pulsar «Actualizar»,
//     cambiar de mes. Aqui el velo SI espera 250 ms antes de aparecer, porque
//     tapar lo que ya se esta leyendo para 80 ms es peor que no hacer nada.
//
// Va SIN defer en las trece paginas que lo usan, igual que splash.js, y por
// la misma razon: tiene que correr antes de que se pinte nada. Al cargarse
// tapa la pagina (clase `vt-cargando-pagina` en el <html>), y si al final
// nadie llama a `arranque` la destapa sola, para que incluirlo no pueda
// dejar una pagina en blanco.
//
// Tres cosas mas que no son adorno:
//
//   - Cuenta las llamadas. Dos cargas a la vez no se tapan la una a la otra:
//     el velo se va cuando termina la ultima.
//   - Una vez visible, se queda 400 ms como minimo. Si no, lo que tarda
//     260 ms da un fogonazo que se lee peor que no poner nada.
//   - No bloquea el teclado ni roba el foco, y si la carga falla, quien la
//     llamo ensena su propio error con la pagina ya a la vista.
window.vtCargando = (function () {
  var ESPERA = 250;
  var MINIMO = 400;
  var RESCATE = 2000;

  var pendientes = 0;
  var capa = null;
  var temporizador = null;
  var desde = 0;
  var tapada = false;
  var reclamada = false;

  function raiz() {
    return document.documentElement;
  }

  function tapar() {
    if (tapada) return;
    tapada = true;
    raiz().classList.add('vt-cargando-pagina');
  }

  function destapar() {
    if (!tapada) return;
    tapada = false;
    raiz().classList.remove('vt-cargando-pagina');
  }

  function montar(texto) {
    capa = document.createElement('div');
    capa.className = 'vt-cargando';
    capa.setAttribute('role', 'status');
    capa.setAttribute('aria-live', 'polite');
    var rueda = document.createElement('div');
    rueda.className = 'vt-cargando__rueda';
    var letra = document.createElement('div');
    letra.className = 'vt-cargando__texto';
    letra.textContent = texto || 'Cargando';
    capa.appendChild(rueda);
    capa.appendChild(letra);
    document.body.appendChild(capa);
    // Dos cuadros: el primero monta el velo transparente y el segundo lanza
    // la transicion. En el mismo cuadro el navegador no la ve.
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        if (capa) capa.classList.add('vt-cargando--visible');
      });
    });
    desde = Date.now();
  }

  // El velo se monta en el <body>, que en el <head> todavia no existe.
  function montarCuandoSePueda(texto) {
    if (document.body) montar(texto);
    else document.addEventListener('DOMContentLoaded', function () { montar(texto); });
  }

  function quitar() {
    destapar();
    if (!capa) return;
    var fuera = capa;
    capa = null;
    fuera.classList.remove('vt-cargando--visible');
    setTimeout(function () { fuera.remove(); }, 200);
  }

  function mostrar(texto) {
    pendientes += 1;
    if (pendientes > 1 || temporizador || capa) return;
    temporizador = setTimeout(function () {
      temporizador = null;
      if (pendientes > 0) montarCuandoSePueda(texto);
    }, ESPERA);
  }

  function ocultar() {
    pendientes = Math.max(0, pendientes - 1);
    if (pendientes > 0) return;
    if (temporizador) {
      clearTimeout(temporizador);
      temporizador = null;
      quitar();
      return;
    }
    var visto = Date.now() - desde;
    if (visto >= MINIMO) quitar();
    else setTimeout(quitar, MINIMO - visto);
  }

  // Envuelve una promesa: el velo se va tanto si sale bien como si falla.
  function mientras(tarea, texto) {
    mostrar(texto);
    return Promise.resolve().then(tarea).finally(ocultar);
  }

  // La carga de arranque: el velo ya esta, solo hay que ponerle su texto y
  // esperar. Si la pagina llama a esto dos veces, la segunda es una carga
  // normal; solo la primera manda sobre la pagina tapada.
  function arranque(tarea, texto) {
    if (reclamada) return mientras(tarea, texto);
    reclamada = true;
    pendientes += 1;
    montarCuandoSePueda(texto);
    return Promise.resolve().then(tarea).finally(ocultar);
  }

  tapar();
  // Red de seguridad: si la pagina incluye el fichero y no llama a `arranque`
  // —o se rompe antes de llegar—, la pagina se destapa sola. Nunca se queda
  // en blanco por culpa de esto.
  document.addEventListener('DOMContentLoaded', function () {
    setTimeout(function () { if (!reclamada) destapar(); }, RESCATE);
  });

  return { mostrar: mostrar, ocultar: ocultar, mientras: mientras, arranque: arranque };
})();
