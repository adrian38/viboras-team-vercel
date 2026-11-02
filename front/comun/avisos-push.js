// Avisos push en el movil: lo que sale en la pestana Avisos, con la app cerrada.
//
// Lo carga auth-client.js solo cuando hay sesion, asi que las 18 paginas lo
// tienen sin tocar sus <head>. Hace tres cosas:
//   - Mientras no esten activos, pregunta al abrir. Solo deja de recordarlo
//     si la cuenta lo pide expresamente; queda siempre la pestana Avisos.
//   - Si ya los acepto, vuelve a mandar la suscripcion al servidor en cada
//     carga (puede haber cerrado sesion, o el navegador haberla renovado).
//   - window.vtPush: lo usan la lista de avisos (auth-client.js) y cerrar sesion
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
  // navegador), 'instalar' (iPhone sin instalar), 'sinClaves' (el servidor no
  // tiene VAPID: solo se lo dice a los administradores) o null.
  var estado = clave.then(function (k) {
    if (!k) return 'sinClaves';
    if (!soporta) return esIOS && !instalada ? 'instalar' : 'noSoportado';
    if (Notification.permission === 'denied') return 'bloqueado';
    return Notification.permission === 'granted' ? 'comprobando' : 'pendiente';
  });

  // La suscripcion que ya tiene el navegador puede estar firmada con otra
  // clave VAPID (el servidor cambio de par, o la creo otro despliegue): el
  // servicio de push rechaza cada aviso con un 403 y aqui no se ve nada.
  // Reusarla sin mirar dejaria el movil mudo para siempre.
  function mismaClave(s, clavePublica) {
    var actual = (s.options || {}).applicationServerKey;
    // Safari instalado puede ocultarla. Ausencia no demuestra que sea otra:
    // la prueba del servidor renovara si Apple responde VapidPkHashMismatch.
    if (!actual) return true;
    var mia = bytes(clavePublica);
    var suya = new Uint8Array(actual);
    if (mia.length !== suya.length) return false;
    for (var i = 0; i < mia.length; i++) if (mia[i] !== suya[i]) return false;
    return true;
  }

  // Darse de baja antes de rehacerla: el navegador no deja tener dos.
  function renovar(reg, s, clavePublica, forzar) {
    if (!forzar && s && mismaClave(s, clavePublica)) return Promise.resolve(s);
    var endpointAnterior = s && s.endpoint;
    return (s ? s.unsubscribe().catch(function () { return null; }) : Promise.resolve(null))
      .then(function () {
        return endpointAnterior ? api('baja', { endpoint: endpointAnterior }) : null;
      })
      .then(function () {
        return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes(clavePublica) });
      });
  }

  function suscribir(forzar) {
    return Promise.all([navigator.serviceWorker.ready, clave]).then(function (r) {
      var reg = r[0];
      return reg.pushManager.getSubscription().then(function (s) {
        return renovar(reg, s, r[1], Boolean(forzar));
      });
    }).then(function (s) {
      return api('suscribir', s.toJSON());
    }).catch(function (err) {
      console.warn('No se pudieron activar los avisos:', err);
      return null;
    });
  }

  function activar(forzar, actualizar) {
    return Notification.requestPermission().then(function (p) {
      if (p !== 'granted') {
        estado = Promise.resolve(p === 'denied' ? 'bloqueado' : 'pendiente');
        return false;
      }
      estado = Promise.resolve('comprobando');
      return suscribir(forzar).then(function (j) {
        if (!j || !j.ok) {
          estado = Promise.resolve('fallo');
          return false;
        }
        if (j.verificado) {
          estado = Promise.resolve('activo');
          return true;
        }
        estado = Promise.resolve('sinProbar');
        return mandarPrueba(actualizar || function () {}, false).then(function (prueba) {
          var ok = pruebaMostrada(prueba);
          estado = Promise.resolve(ok ? 'activo' : 'falloEntrega');
          return ok;
        });
      });
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
  // claves dejaban la lista igual y no se distinguian.
  var TEXTOS = {
    activo: 'Avisos activados en este dispositivo.',
    comprobando: 'Comprobando avisos en este dispositivo…',
    fallo: 'El permiso está activo, pero no se pudo registrar este dispositivo. Reintentar.',
    sinProbar: 'El dispositivo está registrado, pero falta comprobar que recibe avisos. Probar ahora.',
    falloEntrega: 'El servicio aceptó la prueba, pero este dispositivo no confirmó que la mostrara. Revisar y reintentar.',
    pendiente: 'Activar avisos en este dispositivo',
    instalar: 'Para recibir avisos en el iPhone, instala la app: Compartir → «Añadir a pantalla de inicio».',
    noSoportado: 'Este navegador no admite avisos push. Los avisos siguen disponibles en la pestaña Avisos.',
    bloqueado: 'Los avisos están bloqueados en este navegador. Actívalos en sus ajustes para esta web.',
    sinClaves: 'Avisos al móvil sin configurar: faltan VAPID_PUBLIC_KEY y VAPID_PRIVATE_KEY en Vercel.'
  };

  function nombreServicio(host) {
    return String(host || '?').split('.').slice(-3).join('.');
  }

  function estadoDispositivo(d) {
    var nombre = nombreServicio(d.servicio);
    if (d.pulsado) return nombre + ': pulsado';
    if (d.mostrado) return nombre + ': mostrado por el navegador';
    if (d.recibido) return nombre + ': recibido por el navegador';
    if (d.estado >= 200 && d.estado < 300) return nombre + ': aceptado por el servicio (' + d.estado + ')';
    return nombre + ': rechazado (' + (d.estado || 'sin respuesta') + ')';
  }

  function resumenPrueba(j) {
    if (!j || !j.ok) return j && j.error === 'sin_claves' ? 'El servidor no tiene claves.' : 'No se pudo probar.';
    var dispositivos = j.dispositivos || [];
    if (!dispositivos.length) return 'Ningún dispositivo suscrito.';
    return dispositivos.map(estadoDispositivo).join(' · ');
  }

  function pruebaMostrada(j) {
    return Boolean(j && j.dispositivos && j.dispositivos.some(function (d) { return d.mostrado; }));
  }

  function pruebaPendiente(j) {
    return Boolean(j && j.dispositivos && j.dispositivos.some(function (d) {
      return d.estado >= 200 && d.estado < 300 && !d.mostrado;
    }));
  }

  function seguirPrueba(testId, actualizar, intentos) {
    return api('estado&id=' + encodeURIComponent(testId)).then(function (j) {
      actualizar(resumenPrueba(j));
      if (pruebaPendiente(j) && intentos < 25) {
        return new Promise(function (resolve) { setTimeout(resolve, 2000); })
          .then(function () { return seguirPrueba(testId, actualizar, intentos + 1); });
      }
      return j;
    });
  }

  function pruebaCaducada(j) {
    var d = j && j.dispositivos && j.dispositivos[0];
    var error = String(d && d.error || '');
    return d && (d.estado === 404 || d.estado === 410 ||
      /VapidPkHashMismatch|VAPID credentials/i.test(error));
  }

  function prepararPrueba(forzar) {
    return suscribir(forzar).then(function (j) {
      if (!j || !j.ok) return null;
      return navigator.serviceWorker.ready.then(function (reg) {
        return reg.pushManager.getSubscription();
      });
    });
  }

  function mandarPrueba(actualizar, reparado) {
    return prepararPrueba(reparado).then(function (s) {
      if (!s) return null;
      return api('probar', { endpoint: s.endpoint });
    }).then(function (j) {
      if (!reparado && pruebaCaducada(j)) {
        actualizar('Renovando la suscripción caducada…');
        return mandarPrueba(actualizar, true);
      }
      actualizar(resumenPrueba(j));
      if (j && j.ok && j.testId) return seguirPrueba(j.testId, actualizar, 0);
      return j;
    });
  }

  // «Probar», arriba a la derecha de la tarjeta, al lado de «Limpiar». Lo que
  // cuenta la prueba va a `actualizar`, que escribe en la linea de estado de
  // la lista: antes lo escribia en su propia etiqueta y el boton se quedaba
  // con el resumen puesto, sin forma de volver a pulsarlo a sabiendas.
  function botonProbar(actualizar) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'vt-btn vt-btn--sm vt-btn--quiet vt-avisos__accion vt-avisos__accion--probar';
    b.textContent = 'Probar';
    b.title = 'Manda un aviso de prueba a este dispositivo';
    b.addEventListener('click', function () {
      b.disabled = true;
      actualizar('Mandando aviso de prueba…');
      mandarPrueba(actualizar, false).then(function (j) {
        estado = Promise.resolve(pruebaMostrada(j) ? 'activo' : 'falloEntrega');
        b.disabled = false;
        b.title = 'Pulsa para repetir la prueba';
      });
    });
    return b;
  }

  // El bloque de arriba de la lista de avisos. Se repinta entero cada vez: la
  // lista se borra entera al rellenarse. Sin claves en el servidor no
  // salia nada, igual que con todo bien, y no habia forma de saberlo
  // (2026-10-18): ahora se lo dice a quien puede arreglarlo.
  function pintarEnLista(panel) {
    Promise.all([estado, window.vtMe]).then(function (r) {
      var e = r[0];
      Array.prototype.forEach.call(panel.querySelectorAll('.vt-avisos__push'), function (v) { v.remove(); });
      // «Probar» no vive en la lista: esta en la cabecera de la tarjeta, que
      // es hermana de la lista, no suya.
      var acciones = panel.parentNode && panel.parentNode.querySelector('.vt-avisos__acciones');
      var probar = acciones && acciones.querySelector('.vt-avisos__accion--probar');
      if (probar) probar.remove();
      if (e === 'sinClaves' && !(r[1] && r[1].role === 'admin')) return;
      if (!TEXTOS[e]) return;
      var interactivo = e === 'pendiente' || e === 'fallo' || e === 'sinProbar' || e === 'falloEntrega';
      var el = document.createElement(interactivo ? 'button' : 'div');
      el.className = 'vt-avisos__item vt-avisos__push';
      el.textContent = TEXTOS[e];
      if (interactivo) {
        el.type = 'button';
        el.addEventListener('click', function () {
          activar(e === 'fallo' || e === 'falloEntrega', function (texto) {
            el.textContent = texto;
          }).then(function () { pintarEnLista(panel); });
        });
      }
      panel.insertBefore(el, panel.firstChild);
      // A la izquierda de «Limpiar», que auth-client.js ya habra anadido.
      if (e === 'activo' && acciones) {
        acciones.insertBefore(botonProbar(function (texto) { el.textContent = texto; }), acciones.firstChild);
      }
    });
  }

  // El permiso se concede fuera de la web, en los ajustes del sistema, y al
  // volver a la app no hay recarga: `estado` se calcula una sola vez al abrir,
  // asi que la tarjeta seguia diciendo «bloqueados» con el permiso ya
  // concedido. Le paso el 2026-11-02 al movil de Adrian: el permiso estaba
  // dado y la pantalla decia que no.
  function refrescarPermiso() {
    if (!soporta) return Promise.resolve();
    return estado.then(function (e) {
      if (e === 'sinClaves' || e === 'noSoportado' || e === 'instalar') return;
      var p = Notification.permission;
      if (p === 'denied') {
        if (e !== 'bloqueado') { estado = Promise.resolve('bloqueado'); repintarTarjeta(); }
        return;
      }
      if (p === 'default') {
        if (e !== 'pendiente') { estado = Promise.resolve('pendiente'); repintarTarjeta(); }
        return;
      }
      // Concedido. Solo se actua viniendo de no tenerlo: en los demas estados
      // ya hay una suscripcion hecha y repetirla en cada vuelta a la pantalla
      // mandaria una prueba detras de otra.
      if (e !== 'bloqueado' && e !== 'pendiente') return;
      estado = Promise.resolve('comprobando');
      repintarTarjeta();
      return suscribir(false).then(function (j) {
        estado = Promise.resolve(j && j.ok ? (j.verificado ? 'activo' : 'sinProbar') : 'fallo');
        repintarTarjeta();
      });
    });
  }

  function repintarTarjeta() {
    var p = document.querySelector('#vtAvisos .vt-avisos__lista');
    if (p) pintarEnLista(p);
  }

  if (soporta) {
    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions.query({ name: 'notifications' })
        .then(function (st) { st.onchange = function () { refrescarPermiso(); }; })
        .catch(function () { /* Safari viejo no lo consulta */ });
    }
    // La red de seguridad: volver de los ajustes del sistema a la app pasa
    // siempre por aqui, aunque el navegador no avise del cambio de permiso.
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) refrescarPermiso();
    });
  }

  window.vtPush = { activar: activar, baja: baja, pintarEnLista: pintarEnLista };

  var panel = document.querySelector('#vtAvisos .vt-avisos__lista');
  if (panel && panel.firstChild) pintarEnLista(panel);

  window.vtMe.then(function (user) {
    if (!user) return;
    estado.then(function (e) {
      if (e === 'comprobando') {
        suscribir(false).then(function (j) {
          var siguiente = j && j.ok ? (j.verificado ? 'activo' : 'sinProbar') : 'fallo';
          estado = Promise.resolve(siguiente);
          if (panel) pintarEnLista(panel);
          if (siguiente === 'sinProbar' || siguiente === 'fallo') preguntarAlAbrir(user, siguiente);
        });
      }
      else if (e === 'pendiente' || e === 'instalar' || e === 'sinProbar' || e === 'bloqueado') preguntarAlAbrir(user, e);
    });
  });

  // --- La pregunta al abrir mientras no esten activos -------------------

  function noRecordar(user) {
    try { return localStorage.getItem('vt-push-no-recordar-v3:' + user.email) === '1'; } catch (e) { return false; }
  }

  function guardarNoRecordar(user) {
    try { localStorage.setItem('vt-push-no-recordar-v3:' + user.email, '1'); } catch (e) { /* sin almacenamiento */ }
  }

  function preguntadoEnEstaApertura(user) {
    try { return sessionStorage.getItem('vt-push-preguntado:' + user.email) === '1'; } catch (e) { return false; }
  }

  function marcarEstaApertura(user) {
    try { sessionStorage.setItem('vt-push-preguntado:' + user.email, '1'); } catch (e) { /* sin almacenamiento */ }
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

  function preguntarAlAbrir(user, e) {
    if (noRecordar(user) || preguntadoEnEstaApertura(user) || paginaDeEntrada()) return;
    marcarEstaApertura(user);
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
      ? 'Para recibir avisos en el iPhone, primero instala la app: pulsa Compartir y luego «Añadir a pantalla de inicio». Ábrela desde el icono para activar los avisos.'
      : e === 'bloqueado'
        ? 'Los avisos están bloqueados en este dispositivo. Actívalos en los ajustes de notificaciones del navegador o del teléfono; también verás el estado y las instrucciones en la pestaña Avisos.'
      : e === 'sinProbar'
        ? 'El permiso ya está concedido. Enviaremos una prueba y sólo daremos los avisos por activados cuando este dispositivo confirme que la mostró.'
        : 'Te llegará un aviso con lo mismo que la pestaña Avisos: partidos para valorar, resultados que alguien ha editado… Después enviaremos una prueba para confirmar que funciona.';
    var botones = document.createElement('div');
    botones.className = 'vt-push-dialogo__botones';
    var opcion = document.createElement('label');
    opcion.className = 'vt-push-dialogo__no-recordar';
    var noVolver = document.createElement('input');
    noVolver.type = 'checkbox';
    opcion.appendChild(noVolver);
    opcion.appendChild(document.createTextNode('No volver a recordármelo en este dispositivo'));
    var recordarDecision = function () { if (noVolver.checked) guardarNoRecordar(user); };
    var cerrar = function () { recordarDecision(); d.close(); d.remove(); };
    if (e === 'instalar' || e === 'bloqueado') {
      botones.appendChild(boton('Entendido', 'vt-btn', cerrar));
    } else {
      botones.appendChild(boton('Ahora no', 'vt-btn vt-btn--quiet', cerrar));
      botones.appendChild(boton(e === 'sinProbar' ? 'Comprobar avisos' : 'Activar avisos', 'vt-btn', function () {
        recordarDecision();
        Array.prototype.forEach.call(botones.querySelectorAll('button'), function (b) { b.disabled = true; });
        texto.textContent = 'Registrando este dispositivo…';
        activar(false, function (mensaje) { texto.textContent = mensaje; }).then(function (ok) {
          texto.textContent = ok
            ? 'Listo. Este dispositivo recibió y mostró el aviso de prueba.'
            : 'No pudimos confirmar la entrega. Revisa los permisos de notificación y que el sistema permita al navegador trabajar en segundo plano; después vuelve a intentarlo desde la pestaña Avisos.';
          while (botones.firstChild) botones.firstChild.remove();
          botones.appendChild(boton('Cerrar', 'vt-btn', cerrar));
          var p = document.querySelector('#vtAvisos .vt-avisos__lista');
          if (p) pintarEnLista(p);
        });
      }));
    }
    d.appendChild(titulo);
    d.appendChild(texto);
    d.appendChild(opcion);
    d.appendChild(botones);
    d.addEventListener('cancel', recordarDecision);
    document.body.appendChild(d);
    d.showModal();
  }
})();
