// La pantalla «Jugadores» del panel de administración (index.html): todos los
// jugadores y todas las cuentas, rechazadas incluidas, con su estado en color,
// filtros y un botón «Editar» para el nombre, la baja, el estado de la cuenta y
// el tipo de usuario.
//
// Lee /api/read?action=exportPlayers, la misma lista que el Excel de /rating,
// y guarda con /api/write?action=updatePlayer. Las dos son sólo de admin: el
// panel oculto es comodidad, el 403 del servidor es la cerradura.
//
// Detalle: ai_context/exportar_jugadores.md
(function () {
  var COLORES = {
    'Activo': '#4ade80', 'Pendiente': 'var(--vt-yellow)', 'Rechazado': '#f87171',
    'Bloqueado': '#fb923c', 'De baja': 'var(--vt-faint)', 'Sin cuenta': 'var(--vt-silver)'
  };
  var ESTADOS = Object.keys(COLORES);
  var ROLES = { member: 'Jugador', admin: 'Admin' };

  var CSS = '' +
    '.aj-filtros{display:flex;gap:8px;flex-wrap:wrap;align-items:center}' +
    '.aj-filtros input,.aj-filtros select,.aj-form input,.aj-form select{background:var(--vt-surface-deep);color:var(--vt-text);border:1px solid var(--vt-border-strong);border-radius:var(--vt-r);padding:8px 10px;font:inherit;font-size:14px;min-width:0}' +
    '.aj-filtros input{flex:1 1 160px}' +
    '.aj-cuenta{font-size:12px;color:var(--vt-muted)}' +
    '.aj-fila{display:flex;flex-direction:column;gap:8px;padding:8px 10px;border-radius:8px;background:var(--vt-surface-deep);border:1px solid var(--vt-border);border-left:4px solid var(--aj-color)}' +
    '.aj-cabeza{display:flex;align-items:center;justify-content:space-between;gap:8px}' +
    '.aj-nombre{color:var(--vt-text);font-weight:600;overflow-wrap:anywhere}' +
    '.aj-sub{font-size:12px;color:var(--vt-muted);overflow-wrap:anywhere}' +
    '.aj-estado{display:inline-block;font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--aj-color);border:1px solid var(--aj-color);border-radius:999px;padding:1px 8px;margin-right:6px}' +
    '.aj-form{display:grid;grid-template-columns:1fr 1fr;gap:8px}' +
    '.aj-form label{display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--vt-muted)}' +
    '.aj-form .aj-ancho{grid-column:1/-1}' +
    '.aj-botones{grid-column:1/-1;display:flex;gap:8px;justify-content:flex-end}' +
    '@media(max-width:520px){.aj-form{grid-template-columns:1fr}}';

  function estilos() {
    if (document.getElementById('ajEstilos')) return;
    var s = document.createElement('style');
    s.id = 'ajEstilos';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function el(tag, props, hijos) {
    var n = document.createElement(tag);
    Object.keys(props || {}).forEach(function (k) {
      if (k === 'style') n.style.cssText = props[k]; else n[k] = props[k];
    });
    (hijos || []).forEach(function (h) { if (h) n.appendChild(typeof h === 'string' ? document.createTextNode(h) : h); });
    return n;
  }

  function selector(opciones, valor) {
    var s = el('select');
    Object.keys(opciones).forEach(function (k) { s.appendChild(el('option', { value: k, textContent: opciones[k] })); });
    s.value = valor;
    return s;
  }

  var estado = { filas: [], texto: '', filtro: '', abierta: null, caja: null };

  function sinTildes(t) {
    return String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }

  function visibles() {
    var q = sinTildes(estado.texto);
    return estado.filas.filter(function (f) {
      if (estado.filtro && f.estado !== estado.filtro) return false;
      return !q || sinTildes(f.name + ' ' + (f.email || '') + ' ' + ((f.form || {}).fullName || '')).indexOf(q) >= 0;
    });
  }

  function clave(f) { return (f.userId || '') + '/' + (f.playerId || ''); }

  // Los campos que tiene sentido tocar en esa fila: la ficha si hay jugador, la
  // cuenta si hay cuenta; el estado sólo entre activa y bloqueada.
  function formulario(f) {
    var form = el('div', { className: 'aj-form' });
    var campos = {};
    if (f.playerId) {
      campos.name = el('input', { type: 'text', value: f.name, maxLength: 60 });
      campos.active = selector({ si: 'En activo', no: 'Dado de baja' }, f.playerActive === false ? 'no' : 'si');
      form.appendChild(el('label', { className: 'aj-ancho' }, ['Nombre en las tablas', campos.name]));
      form.appendChild(el('label', {}, ['Jugador', campos.active]));
    }
    if (f.userId) {
      if (f.status === 'active' || f.status === 'blocked') {
        campos.status = selector({ active: 'Activa', blocked: 'Bloqueada' }, f.status);
        form.appendChild(el('label', {}, ['Cuenta', campos.status]));
      } else {
        form.appendChild(el('div', { className: 'aj-sub aj-ancho', textContent: f.status === 'pending'
          ? 'Cuenta pendiente: se aprueba o se rechaza en Tu cuenta.' : 'Cuenta rechazada.' }));
      }
      if (f.status !== 'rejected') {
        campos.role = selector(ROLES, f.role || 'member');
        form.appendChild(el('label', {}, ['Tipo de usuario', campos.role]));
      }
    }
    var guardar = el('button', { className: 'btn secondary-green', textContent: 'Guardar' });
    var cancelar = el('button', { className: 'btn ghost', textContent: 'Cancelar' });
    guardar.onclick = function () { enviar(f, campos, guardar); };
    cancelar.onclick = function () { estado.abierta = null; pintarLista(); };
    form.appendChild(el('div', { className: 'aj-botones' }, [cancelar, guardar]));
    return form;
  }

  async function enviar(f, campos, boton) {
    var cuerpo = { playerId: f.playerId, userId: f.userId };
    if (campos.name) { cuerpo.name = campos.name.value; cuerpo.active = campos.active.value === 'si'; }
    if (campos.status) cuerpo.status = campos.status.value;
    if (campos.role) cuerpo.role = campos.role.value;
    boton.disabled = true;
    try {
      var r = await fetch('/api/write?action=updatePlayer', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo)
      });
      var j = await r.json().catch(function () { return {}; });
      if (!r.ok || !j.ok) throw new Error(j.message || 'HTTP ' + r.status);
      estado.abierta = null;
      await cargar();
    } catch (err) {
      alert('No se pudo guardar: ' + err.message);
      boton.disabled = false;
    }
  }

  function fila(f) {
    var color = COLORES[f.estado] || 'var(--vt-faint)';
    var sub = [f.email, f.userId ? ROLES[f.role] : null].filter(Boolean).join(' · ');
    var editar = el('button', { className: 'btn ghost', textContent: 'Editar', style: 'min-width:90px' });
    editar.onclick = function () { estado.abierta = estado.abierta === clave(f) ? null : clave(f); pintarLista(); };
    var texto = el('div', {}, [
      el('div', { className: 'aj-nombre' }, [el('span', { className: 'aj-estado', textContent: f.estado }), f.name || '(sin nombre)']),
      sub ? el('div', { className: 'aj-sub', textContent: sub }) : null
    ]);
    var caja = el('div', { className: 'aj-fila' }, [el('div', { className: 'aj-cabeza' }, [texto, editar])]);
    caja.style.setProperty('--aj-color', color);
    if (estado.abierta === clave(f)) caja.appendChild(formulario(f));
    return caja;
  }

  function pintarLista() {
    var lista = estado.caja.querySelector('.aj-lista');
    var filas = visibles();
    lista.textContent = '';
    filas.forEach(function (f) { lista.appendChild(fila(f)); });
    estado.caja.querySelector('.aj-cuenta').textContent = filas.length + ' de ' + estado.filas.length;
  }

  function filtros() {
    var buscar = el('input', { type: 'search', placeholder: 'Buscar nombre o correo', value: estado.texto });
    var opciones = { '': 'Todos los estados' };
    ESTADOS.forEach(function (e) { opciones[e] = e; });
    var cual = selector(opciones, estado.filtro);
    buscar.oninput = function () { estado.texto = buscar.value; pintarLista(); };
    cual.onchange = function () { estado.filtro = cual.value; pintarLista(); };
    return el('div', { className: 'aj-filtros' }, [buscar, cual, el('span', { className: 'aj-cuenta' })]);
  }

  async function cargar() {
    var r = await fetch('/api/read?action=exportPlayers', { headers: { accept: 'application/json' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    var datos = await r.json();
    estado.filas = (datos.players || []).sort(function (a, b) {
      return String(a.name).localeCompare(String(b.name), 'es', { sensitivity: 'base' });
    });
    pintarLista();
  }

  function pintar(caja) {
    estilos();
    estado.caja = caja;
    caja.textContent = '';
    caja.appendChild(filtros());
    caja.appendChild(el('div', { className: 'aj-lista', style: 'display:flex;flex-direction:column;gap:8px' }));
    return cargar().catch(function (err) {
      caja.querySelector('.aj-lista').textContent = 'No se pudo cargar la lista: ' + err.message;
    });
  }

  window.vtAdminJugadores = { pintar: pintar };
})();
