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

  // Tus avisos: solo en las paginas que tengan #vtAvisos (hoy /tablon), y solo
  // con sesion. Todo con textContent: los avisos llevan nombres que escribio
  // quien se registro.
  function pintarAvisos(caja, items) {
    var panel = caja.querySelector('.vt-avisos__lista');
    caja.hidden = false;
    panel.textContent = '';
    if (!items.length) {
      var vacio = document.createElement('div');
      vacio.className = 'vt-avisos__vacio';
      vacio.textContent = 'No tienes avisos.';
      panel.appendChild(vacio);
    }
    items.forEach(function (it) {
      var a = document.createElement('a');
      a.className = 'vt-avisos__item';
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
    if (items.length) panel.appendChild(botonLimpiar(caja));
    // Arriba, los botones de activar y probar los avisos push
    // (avisos-push.js), si toca.
    if (window.vtPush) window.vtPush.pintarEnLista(panel);
  }

  // El badge del icono de la app instalada (Badging API). Dice exactamente lo
  // mismo que la pestana Avisos: el icono de la pantalla de inicio no puede
  // contar una cosa y la barra de abajo otra.
  //
  // Donde no existe —Firefox, y Safari fuera de la app instalada— no se hace
  // nada y queda el numero de la pestana. El navegador tambien puede negarse
  // si la app no esta instalada: eso no es un error.
  function pintarBadgeDelIcono(cuantos) {
    if (!navigator.setAppBadge) return;
    var hecho = cuantos > 0 ? navigator.setAppBadge(cuantos) : navigator.clearAppBadge();
    if (hecho && hecho.catch) hecho.catch(function () { /* el sistema no lo admite */ });
  }

  // El numero de la pestana «Avisos» de la barra de abajo, en las veinte
  // paginas, y el badge del icono de la app. Cuentan lo mismo que la lista de
  // /tablon, que es a donde lleva esa pestana: el numero y su destino son la
  // misma cosa.
  function pintarNumero(items) {
    pintarBadgeDelIcono(items.length);
    var num = document.querySelector('.vt-nav__num');
    if (!num) return;
    num.textContent = items.length > 9 ? '9+' : String(items.length);
    num.hidden = items.length === 0;
    // El «1» suelto no lo lee un lector de pantalla: la pestana lo dice.
    var item = num.parentNode.parentNode;
    if (items.length) item.setAttribute('aria-label', 'Avisos, ' + items.length + ' sin leer');
    else item.removeAttribute('aria-label');
  }

  // Descarta lo que hay ahora; lo que llegue despues vuelve a salir
  // (api/_campana.js). Si falla, la lista se queda como estaba.
  function botonLimpiar(caja) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'vt-avisos__limpiar';
    b.textContent = 'Limpiar todas';
    b.addEventListener('click', function () {
      b.disabled = true;
      fetch('/api/auth?action=clearNotifications', { method: 'POST', headers: { accept: 'application/json' } })
        .then(function (r) { if (r.ok) { pintarAvisos(caja, []); pintarNumero([]); } else b.disabled = false; })
        .catch(function () { b.disabled = false; });
    });
    return b;
  }

  // Los avisos push solo tienen sentido con sesion. Se carga desde aqui para
  // no tocar el <head> de las 18 paginas.
  function cargarPush(user) {
    if (!user) return;
    var s = document.createElement('script');
    s.src = '/front/comun/avisos-push.js';
    s.defer = true;
    document.head.appendChild(s);
  }

  // Una sola peticion para las dos cosas: la lista, donde haya un #vtAvisos, y
  // el numero de la pestana, que esta en las veinte paginas. Si falla, la
  // pestana se queda sin numero —que es lo honrado— y la lista dice que no
  // hay avisos.
  function cargarAvisos(user) {
    if (!user) return;
    var caja = document.getElementById('vtAvisos');
    fetch('/api/auth?action=notifications', { headers: { accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { return (j && j.items) || []; })
      .catch(function () { return []; })
      .then(function (items) {
        if (caja) pintarAvisos(caja, items);
        pintarNumero(items);
      });
  }

  window.vtMe.then(function (user) {
    exigirEntrar(user);
    // Sin sesion no hay avisos de nadie: al cerrar sesion el icono se limpia.
    if (!user) pintarBadgeDelIcono(0);
    cargarAvisos(user);
    cargarPush(user);
  });
})();
