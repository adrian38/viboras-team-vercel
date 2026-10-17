// Quien eres, para las paginas que lo preguntan.
//
// Vive en un fichero propio y no en linea dentro de index.html a proposito:
// tools/code-size-baseline.json tiene index.html clavado en 813 lineas de
// JavaScript y el trinquete solo deja encoger, asi que una sola linea en
// linea alli rompe `npm run check`. Un <script src> no se mide.
//
// La cookie es HttpOnly, asi que el navegador no puede leerla: la unica forma
// de saber quien eres es preguntarselo al API. Se pregunta UNA vez por carga y
// se reparte la promesa; con Neon en Frankfurt y arranques en frio, cada
// pregunta de mas se nota.
//
// Detalle: ai_context/cuentas_y_sesiones.md
(function () {
  // La contrasena que el alta recuerda (cuenta.html, guardarContrasena) caduca
  // a los 30 minutos; aqui se borra caducada en cualquier pagina, no solo si
  // se vuelve a /cuenta.
  try {
    var c = JSON.parse(localStorage.getItem('vt-alta-contrasena') || 'null');
    if (c && !(c.hasta > Date.now())) localStorage.removeItem('vt-alta-contrasena');
  } catch (e) { /* sin almacenamiento no hay nada que borrar */ }

  window.vtMe = fetch('/api/auth?action=me', { headers: { accept: 'application/json' } })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (j) { return (j && j.user) || null; })
    // Sin red el service worker sirve la pagina de cache y esto falla. No es
    // un error: es "no hay sesion".
    .catch(function () { return null; });

  function icono(glifo) {
    return '<span class="ms ms--sm notranslate" translate="no" aria-hidden="true">' + glifo + '</span>';
  }

  // En index.html el nombre se esconde por debajo de 400 px; el icono no.
  // Escapado: el nombre y el correo los escribe quien se registra.
  function nombre(texto) {
    var span = document.createElement('span');
    span.className = 'vt-chip__nombre';
    span.textContent = texto;
    return span.outerHTML;
  }

  function pintarChip(user) {
    var chip = document.getElementById('vtSession');
    if (!chip) return;
    if (!user) {
      chip.innerHTML = icono('login') + nombre('Entrar');
      return;
    }
    // Solo el nombre de pila: en la barra de index.html a 375 px no entra
    // "Adrián C" entero y se cortaba a mitad de palabra.
    var corto = (user.playerName || user.email).split(' ')[0];
    chip.innerHTML = icono('person') + nombre(corto);
    chip.classList.add('vt-chip--gold');
  }

  // Pone tu nombre en un <select> de jugadores. Se llama DESPUES de rellenarlo:
  // loadNames() es asincrona y hace sel.innerHTML = '', asi que cualquier valor
  // puesto antes se pierde.
  //
  // Si tu jugador esta dado de baja no sale en la lista, y asignar un valor que
  // no existe deja el <select> en cadena vacia sin dar error: el envio fallaria
  // despues con "missing data" y nadie sabria por que. Por eso se comprueba.
  window.vtPreseleccionarJugador = function (select) {
    return window.vtMe.then(function (user) {
      if (!user || !user.playerName) return false;
      var el = typeof select === 'string' ? document.getElementById(select) : select;
      if (!el) return false;
      var existe = Array.prototype.some.call(el.options, function (o) {
        return o.value === user.playerName;
      });
      if (!existe) return false;
      el.value = user.playerName;
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    });
  };

  // Sin sesion no se ve nada: desde el 2026-10-16 la app entera esta detras de
  // /cuenta.
  //
  // Esto es comodidad, NO seguridad. El HTML es estatico y cualquiera puede
  // descargarlo; lo que de verdad cierra la app es que read.js, write.js y
  // league-admin.js responden 401 sin cookie, asi que la pagina llegaria vacia
  // de todos modos. Esto solo evita que alguien se quede mirando tablas en
  // blanco sin saber por que.
  function exigirEntrar(user) {
    if (user) return;
    var donde = location.pathname;
    if (donde === '/cuenta' || donde === '/cuenta.html') return;
    // La normativa se lee ANTES de registrarse: el alta pide aceptarla. No
    // carga datos del API, asi que no ensena nada del grupo.
    if (donde === '/group-normativa' || donde === '/group-normativa.html') return;
    // El formulario de inscripcion tambien: se rellena antes de tener cuenta.
    if (donde === '/inscripcion' || donde === '/inscripcion.html') return;
    location.replace('/cuenta?volver=' + encodeURIComponent(donde + location.search));
  }

  // La campanita: solo en las paginas que tengan #vtCampana, y solo con sesion.
  // Todo con textContent: los avisos llevan nombres que escribio quien se
  // registro.
  function pintarAvisos(caja, items) {
    var num = caja.querySelector('.vt-campana__num');
    var panel = caja.querySelector('.vt-campana__panel');
    num.textContent = items.length > 9 ? '9+' : String(items.length);
    num.hidden = items.length === 0;
    panel.textContent = '';
    if (!items.length) {
      var vacio = document.createElement('div');
      vacio.className = 'vt-campana__vacio';
      vacio.textContent = 'No tienes avisos.';
      panel.appendChild(vacio);
    }
    items.forEach(function (it) {
      var a = document.createElement('a');
      a.className = 'vt-campana__item';
      a.href = it.enlace || '/cuenta';
      a.textContent = it.texto;
      // Los avisos guardados (los que traen id) se dan por vistos al pulsarlos.
      // sendBeacon sobrevive a la navegacion que dispara el propio enlace.
      if (it.id) {
        a.addEventListener('click', function () {
          navigator.sendBeacon('/api/avisos?action=visto&id=' + encodeURIComponent(it.id));
        });
      }
      panel.appendChild(a);
    });
  }

  function montarCampana(user) {
    var caja = document.getElementById('vtCampana');
    if (!caja || !user) return;
    var boton = caja.querySelector('button');
    var panel = caja.querySelector('.vt-campana__panel');
    caja.hidden = false;
    boton.addEventListener('click', function (ev) {
      ev.stopPropagation();
      panel.hidden = !panel.hidden;
      boton.setAttribute('aria-expanded', String(!panel.hidden));
    });
    document.addEventListener('click', function (ev) {
      if (panel.hidden || caja.contains(ev.target)) return;
      panel.hidden = true;
      boton.setAttribute('aria-expanded', 'false');
    });
    fetch('/api/auth?action=notifications', { headers: { accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { pintarAvisos(caja, (j && j.items) || []); })
      .catch(function () { pintarAvisos(caja, []); });
  }

  window.vtMe.then(function (user) {
    pintarChip(user);
    exigirEntrar(user);
    montarCampana(user);
  });
})();
