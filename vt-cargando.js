// El velo de «cargando» que comparten las paginas que piden datos al API o
// calculan antes de tener algo que ensenar. La pinta esta en theme.css.
//
//   vtCargando.mostrar('Calculando el rating')   // texto opcional
//   vtCargando.ocultar()
//   await vtCargando.mientras(() => cargar(), 'Cargando tu perfil')
//
// Tres cosas que no son adorno:
//
//   - Cuenta las llamadas. Dos cargas a la vez (el perfil y los avisos) no se
//     tapan la una a la otra: el velo se va cuando termina la ultima.
//   - No aparece antes de 250 ms. Una respuesta rapida no debe producir un
//     parpadeo; si llega a tiempo, el velo no llega a montarse.
//   - Una vez visible, se queda 400 ms como minimo. Si no, lo que tarda 260 ms
//     da un fogonazo que se lee peor que no poner nada.
//
// No bloquea el teclado ni roba el foco: lo que hay debajo sigue siendo la
// pagina, y si la carga falla, quien la llamo ensena su propio error.
//
// Va SIN defer en las trece paginas que lo usan, igual que splash.js. Casi
// todas arrancan su carga desde un <script> en linea que corre mientras se
// parsea la pagina, y con defer este fichero todavia no ha corrido:
// `vtCargando` seria undefined justo donde hace falta. No toca el DOM al
// cargarse y pesa unos 3 KB, asi que bloquear ahi no cuesta nada.
window.vtCargando = (function () {
  var ESPERA = 250;
  var MINIMO = 400;

  var pendientes = 0;
  var capa = null;
  var temporizador = null;
  var desde = 0;

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

  function quitar() {
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
      if (pendientes > 0) montar(texto);
    }, ESPERA);
  }

  function ocultar() {
    pendientes = Math.max(0, pendientes - 1);
    if (pendientes > 0) return;
    if (temporizador) {
      clearTimeout(temporizador);
      temporizador = null;
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

  return { mostrar: mostrar, ocultar: ocultar, mientras: mientras };
})();
