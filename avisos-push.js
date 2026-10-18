// Avisos push en el movil: lo que sale en la campanita, con la app cerrada.
//
// Lo carga auth-client.js solo cuando hay sesion, asi que las 18 paginas lo
// tienen sin tocar sus <head>. Hace tres cosas:
//   - La primera vez que una cuenta entra en un dispositivo, pregunta si
//     quiere avisos. Una sola vez por cuenta y dispositivo: si dice que no,
//     queda el boton de la campanita.
//   - Si ya los acepto, vuelve a mandar la suscripcion al servidor en cada
//     carga (puede haber cerrado sesion, o el navegador haberla renovado).
//   - window.vtPush: lo usan la campanita (auth-client.js) y cerrar sesion
//     (cuenta.html).
//
// El permiso se pide SIEMPRE desde un clic: iOS lo exige, y Chrome bloquea a
// las webs que lo piden al cargar. En iPhone, ademas, solo hay push con la app
// instalada en la pantalla de inicio. Detalle: ai_context/avisos_push.md
(function () {
  var soporta = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  var esIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var instalada = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;

  function api(action, cuerpo) {
    var opciones = cuerpo
      ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) }
      : { headers: { accept: 'application/json' } };
    return fetch('/api/push?action=' + action, opciones)
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });
  }

  // La clave publica VAPID llega en base64url; pushManager la quiere en bytes.
  function bytes(base64url) {
    var b64 = (base64url + '==='.slice((base64url.length + 3) % 4)).replace(/-/g, '+').replace(/_/g, '/');
    var raw = atob(b64);
    var out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }

  // Null si el servidor no tiene claves: entonces no se ofrece nada.
  var clave = api('clave').then(function (j) { return (j && j.clave) || null; });

  // 'activo', 'pendiente' (se puede pedir), 'bloqueado' (dijo que no en el
  // navegador), 'instalar' (iPhone sin instalar) o null (no hay nada que hacer).
  var estado = clave.then(function (k) {
    if (!k) return null;
    if (!soporta) return esIOS && !instalada ? 'instalar' : null;
    if (Notification.permission === 'denied') return 'bloqueado';
    return Notification.permission === 'granted' ? 'activo' : 'pendiente';
  });

  function suscribir() {
    return Promise.all([navigator.serviceWorker.ready, clave]).then(function (r) {
      var reg = r[0];
      return reg.pushManager.getSubscription().then(function (s) {
        return s || reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes(r[1]) });
      });
    }).then(function (s) {
      return api('suscribir', s.toJSON()).then(function (j) { return Boolean(j && j.ok); });
    }).catch(function (err) {
      console.warn('No se pudieron activar los avisos:', err);
      return false;
    });
  }

  function activar() {
    return Notification.requestPermission().then(function (p) {
      estado = Promise.resolve(p === 'granted' ? 'activo' : (p === 'denied' ? 'bloqueado' : 'pendiente'));
      return p === 'granted' ? suscribir() : false;
    });
  }

  // Cerrar sesion: este dispositivo deja de recibir los avisos de esa cuenta.
  function baja() {
    if (!soporta) return Promise.resolve();
    return navigator.serviceWorker.getRegistration()
      .then(function (reg) { return reg && reg.pushManager.getSubscription(); })
      .then(function (s) {
        if (!s) return null;
        return api('baja', { endpoint: s.endpoint }).then(function () { return s.unsubscribe(); });
      })
      .catch(function () { return null; });
  }

  // 'activo' tambien se dice: sin esa linea, avisos activos y un servidor sin
  // claves dejaban la campanita igual y no se distinguian.
  var TEXTOS = {
    activo: 'Avisos activados en este dispositivo.',
    pendiente: 'Activar avisos en este dispositivo',
    instalar: 'Para recibir avisos en el iPhone, instala la app: Compartir → «Añadir a pantalla de inicio».',
    bloqueado: 'Los avisos están bloqueados en este navegador. Actívalos en sus ajustes para esta web.'
  };

  // El bloque de arriba de la campanita. Se repinta entero cada vez: la
  // campanita borra su panel al rellenarlo.
  function pintarEnCampana(panel) {
    estado.then(function (e) {
      var viejo = panel.querySelector('.vt-campana__push');
      if (viejo) viejo.remove();
      if (!TEXTOS[e]) return;
      var el = document.createElement(e === 'pendiente' ? 'button' : 'div');
      el.className = 'vt-campana__item vt-campana__push';
      el.textContent = TEXTOS[e];
      if (e === 'pendiente') {
        el.type = 'button';
        el.addEventListener('click', function () {
          activar().then(function () { pintarEnCampana(panel); });
        });
      }
      panel.insertBefore(el, panel.firstChild);
    });
  }

  window.vtPush = { activar: activar, baja: baja, pintarEnCampana: pintarEnCampana };

  var panel = document.querySelector('#vtCampana .vt-campana__panel');
  if (panel && panel.firstChild) pintarEnCampana(panel);

  window.vtMe.then(function (user) {
    if (!user) return;
    estado.then(function (e) {
      if (e === 'activo') suscribir();
      else if (e === 'pendiente' || e === 'instalar') preguntarUnaVez(user, e);
    });
  });

  // --- La pregunta de la primera vez -------------------------------------

  function yaPreguntado(user) {
    try { return localStorage.getItem('vt-push-preguntado:' + user.email) === '1'; } catch (e) { return true; }
  }

  function marcarPreguntado(user) {
    try { localStorage.setItem('vt-push-preguntado:' + user.email, '1'); } catch (e) { /* sin almacenamiento */ }
  }

  // En estas se esta entrando o dandose de alta: no es el momento.
  function paginaDeEntrada() {
    return /^\/(cuenta|inscripcion|group-normativa)(\.html)?$/.test(location.pathname);
  }

  // Despues de la pantalla de bienvenida (splash.js), que tapa la pagina.
  function trasSplash(hacer) {
    var raiz = document.documentElement;
    if (!raiz.classList.contains('vt-splash')) return hacer();
    var obs = new MutationObserver(function () {
      if (raiz.classList.contains('vt-splash')) return;
      obs.disconnect();
      hacer();
    });
    obs.observe(raiz, { attributes: true, attributeFilter: ['class'] });
  }

  function preguntarUnaVez(user, e) {
    if (yaPreguntado(user) || paginaDeEntrada()) return;
    trasSplash(function () { mostrarDialogo(user, e); });
  }

  function boton(texto, clase, alPulsar) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = clase;
    b.textContent = texto;
    b.addEventListener('click', alPulsar);
    return b;
  }

  function mostrarDialogo(user, e) {
    var d = document.createElement('dialog');
    d.className = 'vt-push-dialogo';
    var titulo = document.createElement('h2');
    titulo.textContent = '¿Te avisamos en el móvil?';
    var texto = document.createElement('p');
    texto.textContent = e === 'instalar'
      ? 'Para recibir avisos en el iPhone, primero instala la app: pulsa Compartir y luego «Añadir a pantalla de inicio». Ábrela desde el icono y te lo volveremos a preguntar.'
      : 'Te llegará un aviso con lo mismo que la campanita: partidos para valorar, resultados que alguien ha editado… Si ahora no, puedes activarlos luego desde la campanita.';
    var botones = document.createElement('div');
    botones.className = 'vt-push-dialogo__botones';
    var cerrar = function () { marcarPreguntado(user); d.close(); d.remove(); };
    if (e === 'instalar') {
      botones.appendChild(boton('Entendido', 'vt-btn', cerrar));
    } else {
      botones.appendChild(boton('Ahora no', 'vt-btn vt-btn--quiet', cerrar));
      botones.appendChild(boton('Activar avisos', 'vt-btn', function () {
        activar().then(function () {
          var p = document.querySelector('#vtCampana .vt-campana__panel');
          if (p) pintarEnCampana(p);
        });
        cerrar();
      }));
    }
    d.appendChild(titulo);
    d.appendChild(texto);
    d.appendChild(botones);
    d.addEventListener('cancel', function () { marcarPreguntado(user); });
    document.body.appendChild(d);
    d.showModal();
  }
})();
