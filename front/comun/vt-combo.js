// Un <select> de nombres no se puede buscar con el teclado: en el movil abre
// la lista nativa y hay que recorrer a dedo los cuarenta jugadores. Esto le
// pone delante un campo de texto que filtra segun se escribe.
//
// El <select> no se va: se queda oculto y sigue siendo EL VALOR. Lo que lee
// submitResult() con .value y lo que recorre vtPreseleccionarJugador con
// .options funcionan igual que antes, y por lo mismo aqui no se puede guardar
// un nombre que no este en la lista: lo escrito en el campo es solo lo que se
// ve, y al salir se descarta si no cuadra con ninguna opcion.
//
// Va SIN defer en las paginas que lo usen: ellas cargan su script al final del
// <body> tambien sin defer, y eso corre antes que cualquier deferido.
//
//   vtCombo.montar(select)   despues de rellenar sus <option>.
//                            Volver a llamarlo relee la lista.
//
// La pinta esta en theme.css, igual que la de vt-cargando.
window.vtCombo = (function () {
  var cuenta = 0;

  // Buscar «adrian» tiene que encontrar «Adrián»: fuera tildes y mayusculas.
  function normalizar(texto) {
    return String(texto).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  function nombresDe(select) {
    var fuera = [];
    Array.prototype.forEach.call(select.options, function (o) {
      if (o.value !== '') fuera.push(o.value);
    });
    return fuera;
  }

  // La primera opcion sin valor es el texto guia del select: «-- Nombre --».
  function textoGuia(select) {
    var primera = select.options[0];
    return (primera && primera.value === '') ? primera.textContent : 'Buscar';
  }

  // Lo que se escribe es casi siempre el principio de un nombre, asi que
  // «i» tiene que sacar a Iñigo antes que a Alicia. Tres grados: empieza por
  // ahi, empieza por ahi un apellido, o lo lleva dentro. -1 es que no cuadra.
  function grado(nombre, buscado) {
    var plano = normalizar(nombre);
    var donde = plano.indexOf(buscado);
    if (donde === -1) return -1;
    if (donde === 0) return 0;
    while (donde !== -1) {
      if (plano.charAt(donde - 1) === ' ') return 1;
      donde = plano.indexOf(buscado, donde + 1);
    }
    return 2;
  }

  // Dentro de cada grado se conserva el orden alfabetico con el que llegan.
  function coincidencias(c, escrito) {
    var buscado = normalizar(escrito).trim();
    if (buscado === '') return c.nombres.slice();
    var grados = [[], [], []];
    c.nombres.forEach(function (n) {
      var cual = grado(n, buscado);
      if (cual !== -1) grados[cual].push(n);
    });
    return grados[0].concat(grados[1], grados[2]);
  }

  // El campo de texto hereda las clases del select para que cada pagina lo
  // pinte como a sus demas campos; theme.css solo le anade el hueco de la lupa.
  function construir(select, idLista) {
    var caja = document.createElement('div');
    caja.className = 'vt-combo';
    var marco = document.createElement('div');
    marco.className = 'vt-combo__caja';

    var campo = document.createElement('input');
    campo.type = 'text';
    campo.className = ('vt-combo__campo ' + select.className).trim();
    campo.placeholder = textoGuia(select);
    campo.autocomplete = 'off';
    campo.spellcheck = false;
    campo.setAttribute('role', 'combobox');
    campo.setAttribute('aria-autocomplete', 'list');
    campo.setAttribute('aria-expanded', 'false');
    campo.setAttribute('aria-controls', idLista);
    campo.setAttribute('enterkeyhint', 'done');

    var lupa = document.createElement('span');
    lupa.className = 'ms ms--sm notranslate vt-combo__lupa';
    lupa.setAttribute('translate', 'no');
    lupa.setAttribute('aria-hidden', 'true');
    lupa.textContent = 'search';

    var lista = document.createElement('ul');
    lista.className = 'vt-combo__lista';
    lista.id = idLista;
    lista.setAttribute('role', 'listbox');

    select.parentNode.insertBefore(caja, select);
    marco.appendChild(campo);
    marco.appendChild(lupa);
    caja.appendChild(marco);
    caja.appendChild(lista);
    caja.appendChild(select);
    select.classList.add('vt-combo__fuente');
    select.setAttribute('tabindex', '-1');
    select.setAttribute('aria-hidden', 'true');

    return { caja: caja, campo: campo, lista: lista };
  }

  function marcar(c, i, traer) {
    var filas = c.lista.querySelectorAll('.vt-combo__opcion');
    c.activo = (i >= 0 && i < filas.length) ? i : -1;
    for (var k = 0; k < filas.length; k++) {
      filas[k].classList.toggle('vt-combo__opcion--activa', k === c.activo);
    }
    if (c.activo < 0) { c.campo.removeAttribute('aria-activedescendant'); return; }
    c.campo.setAttribute('aria-activedescendant', filas[c.activo].id);
    if (traer) filas[c.activo].scrollIntoView({ block: 'nearest' });
  }

  function pintar(c, escrito) {
    c.filtradas = coincidencias(c, escrito);
    c.lista.innerHTML = '';
    if (c.filtradas.length === 0) {
      var nada = document.createElement('li');
      nada.className = 'vt-combo__vacio';
      nada.textContent = 'Ningún jugador se llama así';
      c.lista.appendChild(nada);
      marcar(c, -1, false);
      return;
    }
    c.filtradas.forEach(function (n, i) {
      var elegida = n === c.select.value;
      var fila = document.createElement('li');
      fila.className = 'vt-combo__opcion' + (elegida ? ' vt-combo__opcion--elegida' : '');
      fila.id = c.lista.id + '-' + i;
      fila.setAttribute('role', 'option');
      fila.setAttribute('aria-selected', elegida ? 'true' : 'false');
      fila.dataset.nombre = n;
      fila.textContent = n;
      c.lista.appendChild(fila);
    });
    // Escribiendo, el primero de la lista queda listo para el Enter; con la
    // lista entera delante, lo que queda marcado es el nombre ya elegido.
    var buscando = normalizar(escrito).trim() !== '';
    marcar(c, buscando ? 0 : c.filtradas.indexOf(c.select.value), false);
  }

  function abrir(c) {
    if (c.abierta) return;
    c.abierta = true;
    c.caja.classList.add('vt-combo--abierto');
    c.campo.setAttribute('aria-expanded', 'true');
    pintar(c, '');
  }

  function cerrar(c) {
    if (!c.abierta) return;
    c.abierta = false;
    c.caja.classList.remove('vt-combo--abierto');
    c.campo.setAttribute('aria-expanded', 'false');
    marcar(c, -1, false);
  }

  function elegir(c, nombre) {
    c.select.value = nombre;
    c.campo.value = nombre;
    cerrar(c);
    c.select.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function mover(c, paso) {
    if (!c.abierta) { abrir(c); return; }
    if (c.filtradas.length === 0) return;
    var siguiente = c.activo + paso;
    if (siguiente < 0) siguiente = c.filtradas.length - 1;
    if (siguiente >= c.filtradas.length) siguiente = 0;
    marcar(c, siguiente, true);
  }

  // Al salir del campo, lo escrito a medias no es un nombre. Si solo cuadra
  // con uno se elige ese —escribir «adri» y salir es elegir a Adrián—; si
  // cuadra con varios o con ninguno, el campo vuelve a lo que diga el select.
  function alSalir(c) {
    var escrito = c.campo.value.trim();
    if (escrito !== '' && escrito !== c.select.value) {
      var candidatas = coincidencias(c, escrito);
      if (candidatas.length === 1) { elegir(c, candidatas[0]); return; }
    }
    cerrar(c);
    c.campo.value = c.select.value;
  }

  function enTecla(c, ev) {
    if (ev.key === 'ArrowDown') { ev.preventDefault(); mover(c, 1); return; }
    if (ev.key === 'ArrowUp') { ev.preventDefault(); mover(c, -1); return; }
    if (ev.key === 'Enter') {
      if (c.abierta && c.filtradas[c.activo]) { ev.preventDefault(); elegir(c, c.filtradas[c.activo]); }
      return;
    }
    if (ev.key === 'Escape' && c.abierta) {
      ev.preventDefault();
      cerrar(c);
      c.campo.value = c.select.value;
    }
  }

  function enlazar(c) {
    c.campo.addEventListener('focus', function () { c.campo.select(); abrir(c); });
    c.campo.addEventListener('click', function () { abrir(c); });
    c.campo.addEventListener('input', function () { abrir(c); pintar(c, c.campo.value); });
    c.campo.addEventListener('keydown', function (ev) { enTecla(c, ev); });
    c.campo.addEventListener('blur', function () { alSalir(c); });
    // El raton no puede quitarle el foco al campo antes de que llegue el clic:
    // el blur cerraria la lista y el clic caeria en el hueco que deja.
    c.lista.addEventListener('mousedown', function (ev) { ev.preventDefault(); });
    c.lista.addEventListener('click', function (ev) {
      var fila = ev.target.closest('.vt-combo__opcion');
      if (fila) elegir(c, fila.dataset.nombre);
    });
    // Quien cambie el <select> por su cuenta —vtPreseleccionarJugador— avisa
    // con un change, y el campo tiene que ensenar lo que ya vale.
    c.select.addEventListener('change', function () { c.campo.value = c.select.value; });
  }

  function nacer(select) {
    cuenta += 1;
    var piezas = construir(select, 'vt-combo-lista-' + cuenta);
    var c = {
      select: select, campo: piezas.campo, caja: piezas.caja, lista: piezas.lista,
      nombres: nombresDe(select), filtradas: [], activo: -1, abierta: false
    };
    enlazar(c);
    c.campo.value = select.value;
    select.vtCombo = {
      refrescar: function () { c.nombres = nombresDe(select); c.campo.value = select.value; },
      abrir: function () { abrir(c); }
    };
    // El select oculto no puede recibir el foco: submitResult() hace
    // el.focus() sobre el campo que falta y el navegador no haria nada. Se
    // redirige al campo de texto, que es lo que la persona ve.
    select.focus = function () { c.campo.focus(); };
    return select.vtCombo;
  }

  function montar(select) {
    if (!select) return null;
    if (select.vtCombo) { select.vtCombo.refrescar(); return select.vtCombo; }
    return nacer(select);
  }

  return { montar: montar };
})();
