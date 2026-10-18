// La entrada «Jugadores» del panel de administración (index.html): la lista de
// todos los jugadores y todas las cuentas, rechazadas incluidas, con el estado
// en color y filtros; y, aparte, la pantalla «Editar jugador» con todos sus
// datos.
//
// Lee /api/read?action=exportPlayers, la misma lista que el Excel de /rating,
// y guarda con /api/write?action=updatePlayer. Las dos son sólo de admin: el
// panel oculto es comodidad, el 403 del servidor es la cerradura.
//
// Detalle: ai_context/exportar_jugadores.md
(function () {
  // Sólo los estados que existen en la app. «Bloqueado» no está: la acción
  // existe en el API pero ninguna pantalla la usa.
  var COLORES = {
    'Activo': '#4ade80', 'Pendiente': 'var(--vt-yellow)', 'Rechazado': '#f87171',
    'De baja': 'var(--vt-faint)', 'Sin cuenta': 'var(--vt-silver)'
  };
  var ROLES = { member: 'Jugador', admin: 'Admin' };

  var CSS = '' +
    '.aj-filtros{display:flex;gap:8px;flex-wrap:wrap;align-items:center}' +
    '.aj-filtros input,.aj-filtros select,.aj-form input,.aj-form select{background:var(--vt-surface-deep);color:var(--vt-text);border:1px solid var(--vt-border-strong);border-radius:var(--vt-r);padding:8px 10px;font:inherit;font-size:14px;min-width:0;width:100%;box-sizing:border-box}' +
    '.aj-filtros input{flex:1 1 160px;width:auto}.aj-filtros select{flex:0 1 auto;width:auto}' +
    '.aj-cuenta{font-size:12px;color:var(--vt-muted)}' +
    '.aj-fila{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 10px;border-radius:8px;background:var(--vt-surface-deep);border:1px solid var(--vt-border);border-left:4px solid var(--aj-color)}' +
    '.aj-nombre{color:var(--vt-text);font-weight:600;overflow-wrap:anywhere}' +
    '.aj-sub{font-size:12px;color:var(--vt-muted);overflow-wrap:anywhere}' +
    '.aj-estado{display:inline-block;font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--aj-color);border:1px solid var(--aj-color);border-radius:999px;padding:1px 8px;margin-right:6px}' +
    '.aj-seccion{font-family:var(--vt-font-head);font-size:16px;letter-spacing:.06em;text-transform:uppercase;color:var(--vt-gold-light);margin:8px 0 0;grid-column:1/-1}' +
    '.aj-form{display:grid;grid-template-columns:1fr 1fr;gap:8px}' +
    '.aj-form label,.aj-dato{display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--vt-muted)}' +
    '.aj-dato span{font-size:14px;color:var(--vt-text);overflow-wrap:anywhere}' +
    '.aj-ancho{grid-column:1/-1}' +
    '.aj-botones{grid-column:1/-1;display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap}' +
    '@media(max-width:520px){.aj-form{grid-template-columns:1fr}}';

  var estado = { filas: [], inscripcion: [], ambiente: {}, texto: '', filtro: '', caja: null };

  // Lo que le votaron de ambiente tras los partidos (/valorar), solo cuentas.
  // Desde el 2026-10-17. Detalle: ai_context/valoraciones_y_avisos.md
  function ambienteDe(f) {
    var a = f.playerId ? estado.ambiente[f.playerId] : null;
    return a && (a.buen_rollo || a.mejorable) ? a : null;
  }

  function resumenAmbiente(a) {
    return '👍 ' + a.buen_rollo + ' · 👎 ' + a.mejorable;
  }

  function estilos() {
    if (document.getElementById('ajEstilos')) return;
    document.head.appendChild(el('style', { id: 'ajEstilos', textContent: CSS }));
  }

  function el(tag, props, hijos) {
    var n = document.createElement(tag);
    Object.keys(props || {}).forEach(function (k) {
      if (k === 'style') n.style.cssText = props[k]; else n[k] = props[k];
    });
    (hijos || []).forEach(function (h) { if (h) n.appendChild(typeof h === 'string' ? document.createTextNode(h) : h); });
    return n;
  }

  function selector(pares, valor) {
    var s = el('select');
    pares.forEach(function (p) { s.appendChild(el('option', { value: p[0], textContent: p[1] })); });
    s.value = valor;
    return s;
  }

  function sinTildes(t) {
    return String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }

  function fecha(v) {
    return v ? new Date(v).toLocaleDateString('es-ES') : '—';
  }

  // Cabecera del panel: la comparte con las otras entradas de index.html.
  function cabecera(titulo, volver) {
    var menu = document.getElementById('adminMenuColumn');
    var main = document.getElementById('adminMain');
    if (menu) menu.style.display = 'none';
    if (main) main.style.display = 'flex';
    document.getElementById('adminHeaderTitle').innerText = titulo;
    document.getElementById('adminHeaderButton').onclick = volver;
    var caja = document.getElementById('adminContent');
    caja.style.display = 'flex';
    caja.textContent = '';
    caja.scrollTop = 0;
    return caja;
  }

  // ---- Lista ----

  function visibles() {
    var q = sinTildes(estado.texto);
    return estado.filas.filter(function (f) {
      if (estado.filtro && f.estado !== estado.filtro) return false;
      return !q || sinTildes([f.name, f.email, (f.form || {}).fullName, (f.form || {}).phone].join(' ')).indexOf(q) >= 0;
    });
  }

  function fila(f) {
    var a = ambienteDe(f);
    var sub = [f.email, f.userId ? ROLES[f.role] : null, a ? resumenAmbiente(a) : null].filter(Boolean).join(' · ');
    var editar = el('button', { className: 'btn ghost', textContent: 'Editar', style: 'min-width:90px' });
    editar.onclick = function () { pantallaEditar(f); };
    var caja = el('div', { className: 'aj-fila' }, [
      el('div', {}, [
        el('div', { className: 'aj-nombre' }, [el('span', { className: 'aj-estado', textContent: f.estado }), f.name || '(sin nombre)']),
        sub ? el('div', { className: 'aj-sub', textContent: sub }) : null
      ]),
      editar
    ]);
    caja.style.setProperty('--aj-color', COLORES[f.estado] || 'var(--vt-faint)');
    return caja;
  }

  function pintarLista() {
    var lista = estado.caja.querySelector('.aj-lista');
    var filas = visibles();
    lista.textContent = '';
    filas.forEach(function (f) { lista.appendChild(fila(f)); });
    estado.caja.querySelector('.aj-cuenta').textContent = filas.length + ' de ' + estado.filas.length;
  }

  // El filtro sólo ofrece los estados que hay en los datos, con cuántos.
  function filtros() {
    var cuantos = {};
    estado.filas.forEach(function (f) { cuantos[f.estado] = (cuantos[f.estado] || 0) + 1; });
    var pares = [['', 'Todos los estados']].concat(Object.keys(COLORES).filter(function (e) { return cuantos[e]; })
      .map(function (e) { return [e, e + ' (' + cuantos[e] + ')']; }));
    if (!cuantos[estado.filtro]) estado.filtro = '';
    var buscar = el('input', { type: 'search', placeholder: 'Buscar nombre, correo o teléfono', value: estado.texto });
    var cual = selector(pares, estado.filtro);
    buscar.oninput = function () { estado.texto = buscar.value; pintarLista(); };
    cual.onchange = function () { estado.filtro = cual.value; pintarLista(); };
    return el('div', { className: 'aj-filtros' }, [buscar, cual, el('span', { className: 'aj-cuenta' })]);
  }

  // El ambiente es un extra: si falla, la lista sale igual, sin él.
  async function cargarAmbiente() {
    estado.ambiente = {};
    try {
      var r = await fetch('/api/read?action=getAmbiente', { headers: { accept: 'application/json' } });
      var j = r.ok ? await r.json() : {};
      (j.ambiente || []).forEach(function (a) { estado.ambiente[a.player_id] = a; });
    } catch (err) { console.warn('Sin datos de ambiente', err); }
  }

  async function cargar() {
    var yo = await window.vtMe;
    estado.yo = yo && yo.email;
    var pedidas = await Promise.all([fetch('/api/read?action=exportPlayers', { headers: { accept: 'application/json' } }), cargarAmbiente()]);
    var r = pedidas[0];
    if (!r.ok) throw new Error(r.status === 403 ? 'sólo para administradores' : 'HTTP ' + r.status);
    var datos = await r.json();
    estado.inscripcion = datos.inscripcion || [];
    estado.filas = (datos.players || []).sort(function (a, b) {
      return String(a.name).localeCompare(String(b.name), 'es', { sensitivity: 'base' });
    });
  }

  async function abrir() {
    estilos();
    var caja = cabecera('Jugadores', function () { window.showAdminMenu(); });
    estado.caja = caja;
    caja.appendChild(el('div', { className: 'aj-lista', style: 'display:flex;flex-direction:column;gap:8px', textContent: 'Cargando…' }));
    try {
      await cargar();
      caja.insertBefore(filtros(), caja.firstChild);
      pintarLista();
    } catch (err) {
      caja.querySelector('.aj-lista').textContent = 'No se pudo cargar la lista: ' + err.message;
    }
  }

  // ---- Editar ----

  function dato(titulo, valor) {
    return el('div', { className: 'aj-dato' }, [titulo, el('span', { textContent: valor || '—' })]);
  }

  function seccionFicha(f, form, campos) {
    if (!f.playerId) return;
    form.appendChild(el('h3', { className: 'aj-seccion', textContent: 'Jugador' }));
    campos.name = el('input', { type: 'text', value: f.name, maxLength: 60 });
    campos.active = selector([['si', 'En activo'], ['no', 'Dado de baja']], f.playerActive === false ? 'no' : 'si');
    form.appendChild(el('label', { className: 'aj-ancho' }, ['Nombre en las tablas', campos.name]));
    form.appendChild(el('label', {}, ['Situación', campos.active]));
  }

  // A qué estado se puede pasar desde cada uno (desde el 2026-10-18).
  // Rechazar es negar el alta: a una cuenta activa se la devuelve a
  // pendiente, no se la rechaza. «Bloqueada» no tiene pantalla.
  var ESTADOS = { pending: 'Pendiente', active: 'Activo', rejected: 'Rechazado' };
  function estadosDesde(status) {
    var a = status === 'active' ? ['active', 'pending'] : ['pending', 'active', 'rejected'];
    return a.map(function (s) { return [s, ESTADOS[s]]; });
  }

  // El estado y el tipo se cambian aquí, salvo los de tu propia cuenta: un
  // admin podría quedarse fuera. El tipo también se elige en una pendiente:
  // es el que se le da al aprobarla.
  function seccionCuenta(f, form, campos) {
    form.appendChild(el('h3', { className: 'aj-seccion', textContent: 'Cuenta' }));
    if (!f.userId) {
      form.appendChild(el('div', { className: 'aj-sub aj-ancho', textContent: 'Todavía no tiene cuenta en la app.' }));
      return;
    }
    var propia = estado.yo && estado.yo === f.email;
    if (ESTADOS[f.status] && !propia) {
      campos.status = selector(estadosDesde(f.status), f.status);
      form.appendChild(el('label', {}, ['Estado de la cuenta', campos.status]));
    } else {
      form.appendChild(dato('Estado de la cuenta', ESTADOS[f.status] || f.estado));
    }
    if (!f.playerId) form.appendChild(dato('Nombre que pidió', f.name));
    form.appendChild(dato('Correo', f.email));
    if (!propia) {
      campos.role = selector([['member', 'Jugador'], ['admin', 'Admin']], f.role || 'member');
      form.appendChild(el('label', {}, ['Tipo de usuario', campos.role]));
    } else {
      form.appendChild(dato('Tipo de usuario', ROLES[f.role]));
    }
    form.appendChild(dato('Correo confirmado', f.emailVerified ? 'Sí' : 'No'));
    form.appendChild(dato('Alta', fecha(f.createdAt)));
    form.appendChild(dato(f.status === 'rejected' ? 'Rechazada' : 'Aprobada', fecha(f.status === 'rejected' ? f.rejectedAt : f.approvedAt)));
  }

  // Solo lectura: lo votan los compañeros, no se edita.
  function seccionAmbiente(f, form) {
    if (!f.playerId) return;
    var a = ambienteDe(f);
    form.appendChild(el('h3', { className: 'aj-seccion', textContent: 'Ambiente' }));
    if (!a) {
      form.appendChild(el('div', { className: 'aj-sub aj-ancho', textContent: 'Todavía nadie ha valorado su ambiente.' }));
      return;
    }
    form.appendChild(dato('👍 Buen rollo', String(a.buen_rollo)));
    form.appendChild(dato('👎 No tan bien', String(a.mejorable)));
    form.appendChild(el('div', { className: 'aj-sub aj-ancho', textContent: 'Votos anónimos de sus compañeros de pista al terminar cada partido.' }));
  }

  function seccionInscripcion(f, form, campos) {
    if (!f.userId) return;
    form.appendChild(el('h3', { className: 'aj-seccion', textContent: 'Inscripción' }));
    campos.form = {};
    estado.inscripcion.forEach(function (p) {
      var valor = (f.form || {})[p.campo] || '';
      var control = p.opciones
        ? selector([['', '—']].concat(p.opciones), valor)
        : el('input', { type: p.campo === 'phone' ? 'tel' : 'text', value: valor, maxLength: 100 });
      campos.form[p.campo] = control;
      form.appendChild(el('label', { className: p.campo === 'fullName' ? 'aj-ancho' : '' }, [p.titulo, control]));
    });
  }

  function pantallaEditar(f) {
    var caja = cabecera('Editar jugador', abrir);
    var campos = {};
    var form = el('div', { className: 'aj-form' });
    var marca = el('div', { className: 'aj-nombre aj-ancho' }, [el('span', { className: 'aj-estado', textContent: f.estado }), f.name || '(sin nombre)']);
    marca.style.setProperty('--aj-color', COLORES[f.estado] || 'var(--vt-faint)');
    form.appendChild(marca);
    seccionFicha(f, form, campos);
    seccionAmbiente(f, form);
    seccionCuenta(f, form, campos);
    seccionInscripcion(f, form, campos);
    var guardar = el('button', { className: 'btn secondary-green', textContent: 'Guardar' });
    var volver = el('button', { className: 'btn ghost', textContent: 'Volver a la lista' });
    guardar.onclick = function () { enviar(f, campos, guardar); };
    volver.onclick = abrir;
    form.appendChild(el('div', { className: 'aj-botones' }, [volver, guardar]));
    caja.appendChild(form);
  }

  // La inscripción sólo se manda si tiene algo: las cuentas anteriores al
  // formulario la tienen vacía, y el servidor exige todas las preguntas.
  function cuerpoDe(f, campos) {
    var cuerpo = { playerId: f.playerId, userId: f.userId };
    if (campos.name) { cuerpo.name = campos.name.value; cuerpo.active = campos.active.value === 'si'; }
    if (campos.role) cuerpo.role = campos.role.value;
    if (campos.status && campos.status.value === 'pending' && f.status !== 'pending') cuerpo.status = 'pending';
    if (campos.form) {
      var respuestas = {};
      Object.keys(campos.form).forEach(function (k) { respuestas[k] = campos.form[k].value; });
      if (Object.keys(respuestas).some(function (k) { return respuestas[k]; })) cuerpo.form = respuestas;
    }
    return cuerpo;
  }

  async function post(url, cuerpo) {
    var r = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo)
    });
    var j = await r.json().catch(function () { return {}; });
    if (!r.ok || !j.ok) throw new Error(j.message || 'HTTP ' + r.status);
    return j;
  }

  // Aprobar y rechazar van por las mismas acciones que /cuenta: crean la
  // ficha, comprueban el jugador y mandan el correo. Una rechazada se aprueba
  // pasando antes por pendiente (lo hace updatePlayer con cuerpo.status).
  async function cambiarEstado(f, campos) {
    var nuevo = campos.status && campos.status.value;
    if (!nuevo || nuevo === f.status || nuevo === 'pending') return;
    if (f.status === 'rejected' && nuevo === 'active') {
      await post('/api/write?action=updatePlayer', { userId: f.userId, status: 'pending' });
    }
    if (nuevo === 'active') await post('/api/auth?action=approveUser', { id: f.userId, role: campos.role.value });
    if (nuevo === 'rejected') await post('/api/auth?action=rejectUser', { id: f.userId });
  }

  async function enviar(f, campos, boton) {
    boton.disabled = true;
    try {
      await post('/api/write?action=updatePlayer', cuerpoDe(f, campos));
      await cambiarEstado(f, campos);
      await abrir();
    } catch (err) {
      alert('No se pudo guardar: ' + err.message);
      boton.disabled = false;
    }
  }

  window.vtAdminJugadores = { abrir: abrir };
})();
