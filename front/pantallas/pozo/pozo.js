// Lo que pinta /pozo: tu pista primero, luego las rondas y la clasificacion.
//
// Todo lo que se ve sale de /api/read?action=getPozo. Esta pagina no calcula
// ni emparejamientos ni clasificacion: eso vive en api/_pozo-motor.js y basta
// con un sitio. Aqui solo se pinta y se manda el marcador.
//
// Detalle: ai_context/pozo_americano.md

const estado = { pozos: [], id: null, datos: null, editando: null };

function el(tag, props, ...hijos) {
  const nodo = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (k === 'class') nodo.className = v;
    else if (k === 'texto') nodo.textContent = v;
    else if (k === 'onclick') nodo.addEventListener('click', v);
    else if (v !== null && v !== undefined) nodo.setAttribute(k, v);
  }
  for (const hijo of hijos.flat()) {
    if (hijo === null || hijo === undefined || hijo === false) continue;
    nodo.append(typeof hijo === 'string' ? document.createTextNode(hijo) : hijo);
  }
  return nodo;
}

function icono(nombre, pequeno) {
  const span = el('span', { class: 'ms' + (pequeno ? ' ms--sm' : '') + ' notranslate', translate: 'no', 'aria-hidden': 'true' });
  span.textContent = nombre;
  return span;
}

function vaciar(id) {
  const nodo = document.getElementById(id);
  nodo.textContent = '';
  return nodo;
}

function nombresDe(equipo) {
  return equipo.map((j) => j.nombre).join(' y ');
}

function soyDe(partido) {
  const yo = estado.datos && estado.datos.yo.playerId;
  if (!yo) return false;
  return [...partido.team1, ...partido.team2].some((j) => j.id === yo);
}

// --- Carga ---------------------------------------------------------------

async function pedir(url, opciones) {
  const res = await fetch(url, opciones);
  let cuerpo = null;
  try { cuerpo = await res.json(); } catch { cuerpo = null; }
  return { ok: res.ok && cuerpo && cuerpo.ok !== false, cuerpo };
}

async function cargarLista() {
  const { cuerpo } = await pedir('/api/read?action=getPozos&ts=' + Date.now());
  estado.pozos = (cuerpo && cuerpo.pozos) || [];
  const select = document.getElementById('pozoSelect');
  select.textContent = '';
  for (const p of estado.pozos) {
    select.append(el('option', { value: String(p.id), texto: `${p.nombre} · ${p.fecha}` }));
  }
  document.getElementById('selectorCaja').hidden = estado.pozos.length < 2;
}

async function cargarPozo(id) {
  const { ok, cuerpo } = await pedir(`/api/read?action=getPozo&id=${id}&ts=${Date.now()}`);
  if (!ok) { estado.datos = null; return false; }
  estado.datos = cuerpo;
  estado.id = id;
  document.getElementById('pozoSelect').value = String(id);
  return true;
}

// --- Marcador ------------------------------------------------------------

function cajaDeEquipo(equipo, valor, marca) {
  const campo = el('input', {
    class: 'vt-input juegos', type: 'number', inputmode: 'numeric',
    min: '0', max: '99', value: valor === null ? '' : String(valor),
    'aria-label': 'Juegos de ' + nombresDe(equipo)
  });
  const fila = el('div', { class: 'marcador__fila' },
    el('span', { class: 'marcador__equipo' + (marca ? ' marcador__equipo--yo' : ''), texto: nombresDe(equipo) }),
    campo);
  return { fila, campo };
}

// Un empate no se guarda: se juega. La pantalla lo dice y deja el boton de
// guardar apagado mientras los dos numeros sean iguales. Hasta el 2026-11-12
// preguntaba que pareja se llevaba la pista; ahora el grupo juega un punto
// mas, que para eso la ronda a reloj deja tiempo de sobra.
function avisoDelEmpate() {
  return el('div', { class: 'empate' },
    el('p', { class: 'empate__texto', texto: 'Vais empatados a juegos: jugad un punto más y apuntad cómo queda.' }));
}

// Las dos casillas se montan UNA vez y no se vuelven a crear: rehacerlas en
// cada tecla le quitaba el foco a quien estaba escribiendo, y un marcador de
// dos cifras se quedaba en la primera. Lo que se rehace es solo lo que depende
// de los valores: el aviso del empate y los botones.
function editorDeMarcador(partido) {
  const yo = estado.datos.yo.playerId;
  const uno = cajaDeEquipo(partido.team1, partido.juegos1, partido.team1.some((j) => j.id === yo));
  const dos = cajaDeEquipo(partido.team2, partido.juegos2, partido.team2.some((j) => j.id === yo));
  const zonaEmpate = el('div');
  const acciones = el('div', { class: 'vt-acciones' });

  const refrescar = () => {
    const a = uno.campo.value.trim();
    const b = dos.campo.value.trim();
    const empatan = a !== '' && a === b;
    zonaEmpate.textContent = '';
    if (empatan) zonaEmpate.append(avisoDelEmpate());
    acciones.textContent = '';
    for (const boton of botonesDelEditor(partido, uno.campo, dos.campo, empatan)) acciones.append(boton);
  };

  for (const campo of [uno.campo, dos.campo]) campo.addEventListener('input', refrescar);
  refrescar();
  return el('div', { class: 'marcador' }, uno.fila, dos.fila, zonaEmpate, acciones);
}

function botonesDelEditor(partido, campo1, campo2, empatan) {
  const listo = campo1.value.trim() !== '' && campo2.value.trim() !== '' && !empatan;
  const guardar = el('button', {
    type: 'button', class: 'vt-btn', disabled: listo ? null : 'disabled',
    onclick: () => enviar(partido, {
      juegos1: Number(campo1.value), juegos2: Number(campo2.value)
    })
  }, icono('scoreboard', true), 'Guardar resultado');

  const botones = [guardar];
  if (partido.juegos1 !== null) {
    botones.push(el('button', {
      type: 'button', class: 'vt-btn vt-btn--danger vt-btn--sm',
      onclick: () => { if (confirm('¿Borrar el resultado de esta pista?')) enviar(partido, { borrar: true }); }
    }, 'Borrar'));
  }
  if (estado.editando === partido.id) {
    botones.push(el('button', {
      type: 'button', class: 'vt-btn vt-btn--ghost vt-btn--sm',
      texto: 'Cancelar', onclick: () => { estado.editando = null; pintar(); }
    }));
  }
  return botones;
}

async function enviar(partido, datos) {
  const aviso = document.getElementById('aviso');
  aviso.textContent = '';
  const cuerpo = Object.assign({ eventId: estado.id, matchId: partido.id }, datos);
  const { ok, cuerpo: respuesta } = await pedir('/api/write?action=submitPozoResult', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(cuerpo)
  });
  if (!ok) {
    aviso.textContent = (respuesta && respuesta.message) || 'No se ha podido guardar. Inténtalo otra vez.';
    return;
  }
  estado.editando = null;
  if (respuesta.perdidos) {
    window.vtToast(`Guardado. Se han borrado ${respuesta.perdidos} resultado(s) de rondas posteriores.`, 6000);
  } else {
    window.vtToast('Resultado guardado');
  }
  await cargarPozo(estado.id);
  pintar();
}

// --- Pintado -------------------------------------------------------------

function rondaEnJuego() {
  const formadas = estado.datos.rondas.filter((r) => r.formada);
  return formadas.length ? formadas[formadas.length - 1] : null;
}

function puedoEditar(partido, ronda) {
  if (estado.datos.yo.esAdmin) return true;
  const ultima = rondaEnJuego();
  return soyDe(partido) && ultima && ronda.numero === ultima.numero;
}

function pintarCabecera() {
  const caja = vaciar('cabecera');
  const ev = estado.datos.evento;
  const ultima = rondaEnJuego();
  const faltan = ultima ? ultima.partidos.filter((p) => p.juegos1 === null) : [];

  caja.append(
    el('span', { class: 'vt-label vt-gold', texto: 'Pozo americano' }),
    el('h2', { style: 'margin-top:2px', texto: ev.nombre }),
    el('p', { class: 'vt-muted', texto: `${ev.fecha} · ${ev.pistas} pistas · ${ev.siembra ? ev.siembra.length : ev.pistas * 4} jugadores` })
  );
  if (!ultima) return;
  const resumen = faltan.length
    ? `Ronda ${ultima.numero} de ${ev.rondas} · falta el resultado de ${faltan.length === 1 ? 'la pista ' + faltan[0].pista : faltan.length + ' pistas'}`
    : (ultima.numero >= ev.rondas ? 'Torneo terminado' : `Ronda ${ultima.numero} de ${ev.rondas} · completa`);
  caja.append(el('p', { class: 'vt-chip vt-chip--gold', texto: resumen }));
}

function pintarTuPista() {
  const caja = vaciar('tuPista');
  const ultima = rondaEnJuego();
  if (!ultima) { caja.hidden = true; return; }
  const mio = ultima.partidos.find((p) => soyDe(p));
  if (!mio) { caja.hidden = true; return; }

  caja.hidden = false;
  caja.append(
    el('div', { class: 'vt-sec-title' }, el('h3', { texto: `Tu pista · ronda ${ultima.numero}` })),
    el('p', { class: 'vt-muted', texto: `Pista ${mio.pista} · ganar vale ${mio.puntos[0]} puntos, perder ${mio.puntos[1]}` })
  );
  if (puedoEditar(mio, ultima)) caja.append(editorDeMarcador(mio));
  else caja.append(el('p', { class: 'vt-muted', texto: 'Esta ronda ya está cerrada. Si hay que corregirla, habla con un administrador.' }));
}

function marcadorDe(partido) {
  if (partido.juegos1 === null) return el('span', { class: 'pendiente', texto: 'sin resultado' });
  const texto = `${partido.juegos1} – ${partido.juegos2}`;
  return el('span', { class: 'resultado', texto });
}

function filaDePartido(partido, ronda) {
  // Un marcador igualado no lo gana nadie: el partido sigue sin resolver, lo
  // mismo que si no hubiera resultado. Guardarlo ya no se puede, pero un pozo
  // de antes del 2026-11-12 puede tenerlo.
  const resuelto = partido.juegos1 !== null && partido.juegos1 !== partido.juegos2;
  const gana1 = resuelto && partido.juegos1 > partido.juegos2;
  const gana2 = resuelto && !gana1;
  const clase = (gano) => 'partido__equipo' + (gano ? ' partido__equipo--gana' : '');

  const fila = el('div', { class: 'partido' + (soyDe(partido) ? ' partido--mio' : '') },
    el('span', { class: 'partido__pista', texto: String(partido.pista) }),
    el('div', { class: 'partido__equipos' },
      el('span', { class: clase(gana1), texto: nombresDe(partido.team1) }),
      marcadorDe(partido),
      el('span', { class: clase(gana2), texto: nombresDe(partido.team2) })));

  if (puedoEditar(partido, ronda) && estado.editando !== partido.id) {
    fila.append(el('button', {
      type: 'button', class: 'vt-btn vt-btn--ghost vt-btn--sm', 'aria-label': 'Editar la pista ' + partido.pista,
      onclick: () => { estado.editando = partido.id; pintar(); }
    }, icono('edit_note', true)));
  }
  if (estado.editando === partido.id) return el('div', {}, fila, editorDeMarcador(partido));
  return fila;
}

function pintarRondas() {
  const caja = vaciar('rondas');
  const ultima = rondaEnJuego();
  caja.append(el('div', { class: 'vt-sec-title' }, el('h3', { texto: 'Rondas' })));

  for (const ronda of estado.datos.rondas) {
    if (!ronda.formada) {
      caja.append(el('div', { class: 'ronda ronda--futura' },
        el('h4', { texto: `Ronda ${ronda.numero}` }),
        el('p', { class: 'vt-muted', texto: 'Se formará cuando la ronda anterior tenga todos los resultados.' })));
      continue;
    }
    const detalle = el('details', { class: 'ronda' });
    if (ultima && ronda.numero === ultima.numero) detalle.setAttribute('open', 'open');
    detalle.append(el('summary', {}, el('h4', { texto: `Ronda ${ronda.numero}` })));
    for (const partido of ronda.partidos) detalle.append(filaDePartido(partido, ronda));
    caja.append(detalle);
  }
}

function filaDeClasificacion(fila, yo) {
  const medalla = fila.puesto <= 3 ? ' vt-rank-' + fila.puesto : '';
  return el('tr', { class: fila.playerId === yo ? 'tabla__yo' : null },
    el('td', { class: 'vt-num' + medalla, texto: String(fila.puesto) }),
    el('td', { texto: fila.nombre }),
    el('td', { class: 'vt-num', texto: String(fila.ganados) }),
    el('td', { class: 'vt-num', texto: String(fila.pistaInicio || '-') }),
    el('td', { class: 'vt-num', texto: String(fila.puntos) }),
    el('td', { class: 'vt-num', texto: (fila.difJuegos > 0 ? '+' : '') + fila.difJuegos }));
}

function pintarClasificacion() {
  const caja = vaciar('clasificacion');
  const yo = estado.datos.yo.playerId;
  const cuerpo = el('tbody');
  for (const fila of estado.datos.clasificacion) cuerpo.append(filaDeClasificacion(fila, yo));

  caja.append(
    el('div', { class: 'vt-sec-title' }, el('h3', { texto: 'Clasificación' })),
    el('div', { class: 'vt-table-wrap' },
      el('table', { class: 'vt-table' },
        el('thead', {}, el('tr', {},
          el('th', { class: 'vt-num', texto: '#' }),
          el('th', { texto: 'Jugador' }),
          el('th', { class: 'vt-num', texto: 'Gan.' }),
          el('th', { class: 'vt-num', texto: 'Pista' }),
          el('th', { class: 'vt-num', texto: 'Pts' }),
          el('th', { class: 'vt-num', texto: 'Dif' }))),
        cuerpo)),
    el('p', { class: 'vt-muted', style: 'margin-top:var(--vt-sm);font-size:13px',
      texto: 'Orden: partidos ganados → pista de salida más baja (la 4 antes que la 1) → puntos → diferencia de juegos.' }));
}

function pintar() {
  document.getElementById('aviso').textContent = '';
  if (!estado.datos) {
    document.getElementById('vacio').hidden = false;
    for (const id of ['cabecera', 'tuPista', 'rondas', 'clasificacion']) vaciar(id).hidden = true;
    return;
  }
  document.getElementById('vacio').hidden = true;
  for (const id of ['cabecera', 'rondas', 'clasificacion']) document.getElementById(id).hidden = false;
  pintarCabecera();
  pintarTuPista();
  pintarRondas();
  pintarClasificacion();
}

// --- Arranque ------------------------------------------------------------

function idPedido() {
  const enLaUrl = Number(new URLSearchParams(location.search).get('id'));
  if (enLaUrl && estado.pozos.some((p) => p.id === enLaUrl)) return enLaUrl;
  return estado.pozos.length ? estado.pozos[0].id : null;
}

async function arrancar() {
  const user = await window.vtMe;
  if (user && user.role === 'admin') document.getElementById('crear').hidden = false;
  await cargarLista();
  const id = idPedido();
  if (id) await cargarPozo(id);
  pintar();
}

// «Atrás» vuelve a donde estabas. Si no hay a donde volver —la app abierta
// de cero justo en esta pagina, que en el movil instalado pasa— lleva a la
// portada, porque un boton que no hace nada es peor que uno que hace algo
// razonable.
document.getElementById('atrasBtn').addEventListener('click', () => {
  if (window.history.length > 1) window.history.back();
  else window.location.href = '/';
});

document.getElementById('pozoSelect').addEventListener('change', async (ev) => {
  estado.editando = null;
  await window.vtCargando.mientras(async () => {
    await cargarPozo(Number(ev.target.value));
    pintar();
  }, 'Cargando el torneo');
});

// auth-client.js va con defer: window.vtMe existe en DOMContentLoaded, no
// antes, y este script se ejecuta al final del body, que es antes.
document.addEventListener('DOMContentLoaded', () => {
  window.vtCargando.arranque(arrancar, 'Cargando el pozo');
});
