// Crear un pozo: los datos del torneo y la lista de jugadores en orden.
//
// Esta pagina NO reparte las parejas por la pista ni cruza a nadie: eso lo
// hace api/_pozo-motor.js al crear el torneo, y duplicarlo aqui seria el
// cuarto motor repetido del repositorio. Lo unico que ensena es a que pista
// va cada pareja, que es lo que el administrador decide con el orden.
//
// Detalle: ai_context/pozo_americano.md

const JUGADORES_POR_PISTA = 4;

// La tabla que ha venido usando el grupo, la misma que PUNTOS_DEL_GRUPO en
// api/_pozo-motor.js. Solo se ofrece con cuatro pistas: con otro numero no hay
// tabla decidida y la escribe quien crea el torneo.
const PUNTOS_DEL_GRUPO = [[8, 6], [8, 4], [6, 2], [4, 2]];

const estado = { nombres: [], elegidos: [] };

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

function pistas() {
  return Number(document.getElementById('pistas').value);
}

function hacenFalta() {
  return pistas() * JUGADORES_POR_PISTA;
}

// --- Jugadores -----------------------------------------------------------

function pintarDisponibles() {
  const caja = document.getElementById('disponibles');
  const filtro = document.getElementById('buscar').value.trim().toLowerCase();
  caja.textContent = '';
  const libres = estado.nombres
    .filter((n) => !estado.elegidos.includes(n))
    .filter((n) => !filtro || n.toLowerCase().includes(filtro));

  if (!libres.length) {
    caja.append(el('p', { class: 'vt-muted', texto: filtro ? 'Nadie con ese nombre.' : 'Ya están todos en la lista.' }));
    return;
  }
  for (const nombre of libres) {
    caja.append(el('button', {
      type: 'button', class: 'vt-btn vt-btn--ghost vt-btn--sm', texto: nombre,
      onclick: () => { estado.elegidos.push(nombre); pintarJugadores(); }
    }));
  }
}

function mover(indice, salto) {
  const destino = indice + salto;
  if (destino < 0 || destino >= estado.elegidos.length) return;
  const copia = estado.elegidos;
  [copia[indice], copia[destino]] = [copia[destino], copia[indice]];
  pintarJugadores();
}

// La pareja 1 y la 2 empiezan en la ultima pista, y las dos ultimas en la 1.
function pistaDeLaPareja(numeroDePareja) {
  return pistas() - Math.floor((numeroDePareja - 1) / 2);
}

function filaDeElegido(nombre, i) {
  const pareja = Math.floor(i / 2) + 1;
  const pista = pistaDeLaPareja(pareja);
  return el('li', { class: 'elegido' },
    el('span', { class: 'elegido__num', texto: String(i + 1) }),
    el('span', { class: 'elegido__nombre', texto: nombre }),
    el('span', { class: 'elegido__pista', texto: i < hacenFalta() ? `pareja ${pareja} · pista ${pista}` : 'sobra' }),
    el('button', { type: 'button', class: 'vt-btn vt-btn--quiet vt-btn--sm', 'aria-label': 'Subir a ' + nombre, texto: '↑', onclick: () => mover(i, -1) }),
    el('button', { type: 'button', class: 'vt-btn vt-btn--quiet vt-btn--sm', 'aria-label': 'Bajar a ' + nombre, texto: '↓', onclick: () => mover(i, 1) }),
    el('button', {
      type: 'button', class: 'vt-btn vt-btn--danger vt-btn--sm', 'aria-label': 'Quitar a ' + nombre, texto: '✕',
      onclick: () => { estado.elegidos.splice(i, 1); pintarJugadores(); }
    }));
}

function pintarJugadores() {
  const lista = document.getElementById('elegidos');
  lista.textContent = '';
  estado.elegidos.forEach((nombre, i) => lista.append(filaDeElegido(nombre, i)));

  const faltan = hacenFalta() - estado.elegidos.length;
  const cuenta = document.getElementById('cuenta');
  if (faltan > 0) cuenta.textContent = `${estado.elegidos.length} de ${hacenFalta()}: faltan ${faltan}.`;
  else if (faltan < 0) cuenta.textContent = `${estado.elegidos.length} de ${hacenFalta()}: sobran ${-faltan}.`;
  else cuenta.textContent = `${hacenFalta()} jugadores, los que hacen falta.`;
  cuenta.className = faltan === 0 ? 'vt-chip vt-chip--gold' : 'vt-chip';
  pintarDisponibles();
}

// --- Tabla de puntos -----------------------------------------------------

function filaDePuntos(pista, gana, pierde) {
  const campo = (clase, valor, etiqueta) => el('input', {
    class: 'vt-input ' + clase, type: 'number', inputmode: 'numeric', min: '0', max: '999',
    value: valor === null ? '' : String(valor), 'aria-label': `${etiqueta} en la pista ${pista}`
  });
  return el('tr', {},
    el('td', { texto: String(pista) }),
    el('td', {}, campo('gana', gana, 'Puntos por ganar')),
    el('td', {}, campo('pierde', pierde, 'Puntos por perder')));
}

function pintarPuntos() {
  const cuerpo = document.getElementById('puntosCuerpo');
  const previos = [...cuerpo.querySelectorAll('tr')].map((tr) => [
    tr.querySelector('.gana').value, tr.querySelector('.pierde').value]);
  cuerpo.textContent = '';
  for (let p = 1; p <= pistas(); p++) {
    const porDefecto = pistas() === 4 ? PUNTOS_DEL_GRUPO[p - 1] : [null, null];
    const previo = previos[p - 1];
    cuerpo.append(filaDePuntos(p,
      previo && previo[0] !== '' ? previo[0] : porDefecto[0],
      previo && previo[1] !== '' ? previo[1] : porDefecto[1]));
  }
}

function leerPuntos() {
  return [...document.getElementById('puntosCuerpo').querySelectorAll('tr')].map((tr) => [
    Number(tr.querySelector('.gana').value), Number(tr.querySelector('.pierde').value)]);
}

// --- Crear ---------------------------------------------------------------

function fechaEnFormato() {
  const valor = document.getElementById('fecha').value;
  const p = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor);
  return p ? `${p[3]}/${p[2]}/${p[1]}` : '';
}

function cuerpoDelFormulario() {
  return {
    nombre: document.getElementById('nombre').value.trim(),
    fecha: fechaEnFormato(),
    pistas: pistas(),
    rondas: Number(document.getElementById('rondas').value),
    puntos: leerPuntos(),
    jugadores: estado.elegidos
  };
}

// El nombre del torneo es unico para toda la tabla `events`, y el que esta
// pagina propone es el mismo para todos los pozos de un dia. Si aun asi
// choca —otro pozo creado desde otro movil, un nombre escrito a mano— el
// servidor dice uno libre y se deja puesto: el administrador solo tiene que
// volver a darle al boton.
function ponerNombreLibre(enviado, sugerencia) {
  const campo = document.getElementById('nombre');
  campo.value = sugerencia;
  campo.focus();
  document.getElementById('aviso').textContent =
    `Ya hay un torneo llamado «${enviado}». Le he puesto «${sugerencia}»: dale otra vez a crear, o escribe el nombre que quieras.`;
}

async function crear() {
  const aviso = document.getElementById('aviso');
  const boton = document.getElementById('crearBtn');
  const enviado = cuerpoDelFormulario();
  aviso.textContent = '';
  boton.disabled = true;
  try {
    const res = await fetch('/api/write?action=createPozo', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(enviado)
    });
    const cuerpo = await res.json().catch(() => null);
    if (res.status === 409 && cuerpo && cuerpo.sugerencia) {
      ponerNombreLibre(enviado.nombre, cuerpo.sugerencia);
      return;
    }
    if (!res.ok || !cuerpo || cuerpo.ok === false) {
      aviso.textContent = (cuerpo && cuerpo.message) || 'No se ha podido crear el torneo.';
      return;
    }
    window.location.href = '/pozo?id=' + cuerpo.id;
  } catch {
    aviso.textContent = 'No se ha podido crear el torneo. Comprueba la conexión.';
  } finally {
    boton.disabled = false;
  }
}

// --- Arranque ------------------------------------------------------------

function hoy() {
  const d = new Date();
  const dos = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
}

// «Pozo <fecha de hoy>» lo propondrian igual todos los pozos del dia, y el
// segundo no se podria crear. Se mira cuales hay ya y se numera.
function primerNombreLibre(base, usados) {
  if (!usados.has(base)) return base;
  for (let n = 2; n <= 99; n++) {
    if (!usados.has(`${base} (${n})`)) return `${base} (${n})`;
  }
  return base;
}

async function nombrePorDefecto() {
  const base = 'Pozo ' + new Date().toLocaleDateString('es-ES');
  try {
    const res = await fetch('/api/read?action=getPozos&ts=' + Date.now());
    const cuerpo = await res.json();
    return primerNombreLibre(base, new Set((cuerpo.pozos || []).map((p) => p.nombre)));
  } catch {
    return base;
  }
}

async function arrancar() {
  const user = await window.vtMe;
  if (!user || user.role !== 'admin') {
    document.getElementById('formulario').hidden = true;
    document.getElementById('soloAdmin').hidden = false;
    return;
  }
  document.getElementById('fecha').value = hoy();
  document.getElementById('nombre').value = await nombrePorDefecto();
  const res = await fetch('/api/read?action=getNames&ts=' + Date.now());
  const cuerpo = await res.json().catch(() => null);
  estado.nombres = (cuerpo && cuerpo.names) || [];
  pintarPuntos();
  pintarJugadores();
}

document.getElementById('buscar').addEventListener('input', pintarDisponibles);
document.getElementById('pistas').addEventListener('change', () => { pintarPuntos(); pintarJugadores(); });
document.getElementById('crearBtn').addEventListener('click', crear);

document.addEventListener('DOMContentLoaded', () => {
  window.vtCargando.arranque(arrancar, 'Preparando el torneo');
});
