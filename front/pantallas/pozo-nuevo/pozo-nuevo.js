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

const estado = { nombres: [], elegidos: [], lados: new Map() };

// El lado que cada uno eligio en /cuenta (`players.court_side`, que llega por
// `getComunidad`). Aqui es una ayuda para colocar la lista y nada mas: **no
// decide** el lado del torneo, que es el puesto en el que lo pongas, ni se
// guarda en el pozo. Quien no lo ha elegido cuenta para los dos lados y no
// sale nada.
function ladoDelPerfil(nombre) {
  const lado = estado.lados.get(nombre);
  return lado === 'drive' || lado === 'reves' ? lado : null;
}

function comoSeLee(lado) {
  return lado === 'reves' ? 'revés' : 'drive';
}

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
    const suyo = ladoDelPerfil(nombre);
    caja.append(el('button', {
      type: 'button', class: 'vt-btn vt-btn--ghost vt-btn--sm',
      onclick: () => { estado.elegidos.push(nombre); pintarJugadores(); }
    }, nombre, suyo ? el('span', { class: 'suyo', texto: comoSeLee(suyo) }) : null));
  }
}

function mover(indice, salto) {
  const destino = indice + salto;
  if (destino < 0 || destino >= estado.elegidos.length) return;
  const copia = estado.elegidos;
  [copia[indice], copia[destino]] = [copia[destino], copia[indice]];
  pintarJugadores();
}

// La lista es la primera ronda, puesto por puesto: cada cuatro jugadores son
// una pista —los cuatro primeros en la de abajo, los cuatro ultimos en la 1—,
// dentro de la pista el 1.º y el 2.º son una pareja y el 3.º y el 4.º la
// otra, y dentro de la pareja el primero juega al drive y el segundo al
// reves. Se juega tal cual, asi que la pantalla lo tiene que ensenar tal
// cual: ai_context/pozo_americano.md.
function pistaDelPuesto(i) {
  return pistas() - Math.floor(i / JUGADORES_POR_PISTA);
}

function cabeceraDePista(i) {
  return el('li', {
    class: 'elegidos__pista',
    texto: i < hacenFalta() ? `Pista ${pistaDelPuesto(i)}` : 'Sobran'
  });
}

// Cambiar de lado es cambiarse con tu pareja: en una pareja hay un drive y un
// reves, asi que no se puede mover uno solo.
function botonDeLado(nombre, i) {
  const juega = i % 2 === 0 ? 'drive' : 'reves';
  const suyo = ladoDelPerfil(nombre);
  return el('button', {
    type: 'button',
    class: 'elegido__lado' + (suyo && suyo !== juega ? ' elegido__lado--choca' : ''),
    'aria-label': `${nombre} juega al ${comoSeLee(juega)}; tocar para cambiarlo de lado con su pareja`,
    texto: comoSeLee(juega),
    onclick: () => mover(i, i % 2 === 0 ? 1 : -1)
  });
}

function filaDeElegido(nombre, i) {
  const juega = i < hacenFalta();
  const suyo = ladoDelPerfil(nombre);
  return el('li', { class: 'elegido' + (i % JUGADORES_POR_PISTA === 2 ? ' elegido--pareja2' : '') },
    el('span', { class: 'elegido__num', texto: String(i + 1) }),
    el('span', { class: 'elegido__nombre', texto: nombre }),
    suyo ? el('span', { class: 'suyo', texto: comoSeLee(suyo) }) : null,
    juega ? botonDeLado(nombre, i) : el('span', { class: 'elegido__pista', texto: 'sobra' }),
    el('button', { type: 'button', class: 'vt-btn vt-btn--quiet vt-btn--sm elegido__accion', 'aria-label': 'Subir a ' + nombre, texto: '↑', onclick: () => mover(i, -1) }),
    el('button', { type: 'button', class: 'vt-btn vt-btn--quiet vt-btn--sm elegido__accion', 'aria-label': 'Bajar a ' + nombre, texto: '↓', onclick: () => mover(i, 1) }),
    el('button', {
      type: 'button', class: 'vt-btn vt-btn--danger vt-btn--sm elegido__accion', 'aria-label': 'Quitar a ' + nombre, texto: '✕',
      onclick: () => { estado.elegidos.splice(i, 1); pintarJugadores(); }
    }));
}

function pintarJugadores() {
  const lista = document.getElementById('elegidos');
  lista.textContent = '';
  estado.elegidos.forEach((nombre, i) => {
    const abrePista = i < hacenFalta() ? i % JUGADORES_POR_PISTA === 0 : i === hacenFalta();
    if (abrePista) lista.append(cabeceraDePista(i));
    lista.append(filaDeElegido(nombre, i));
  });

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

// --- Ordenar por ranking -------------------------------------------------

// Dentro de cada pareja, si uno es de drive y el otro de reves, se ponen en
// ese orden. No cambia quien juega con quien ni en que pista: solo el lado.
function porLadoDentroDeCadaPareja() {
  const hasta = Math.min(estado.elegidos.length, hacenFalta());
  for (let i = 0; i + 1 < hasta; i += 2) {
    if (ladoDelPerfil(estado.elegidos[i]) === 'reves' && ladoDelPerfil(estado.elegidos[i + 1]) === 'drive') {
      [estado.elegidos[i], estado.elegidos[i + 1]] = [estado.elegidos[i + 1], estado.elegidos[i]];
    }
  }
}

// El ranking es el de /rating: el mismo motor (`front/comun/vt-glicko.js`),
// con el rating de partida y los votos de nivel y arrancado igual que lo
// arranca `rating.js`. Calcularlo de otra manera daria un orden que no es el
// que el grupo ve, que es la definicion de dato inventado.
//
// Los mejores van arriba de la lista y por tanto a la pista de abajo, que es
// como empieza el pozo: los cuatro primeros a la ultima pista.
async function ordenarPorRanking() {
  const [partidos] = await Promise.all([
    window.vtGlicko.leerPartidos(), window.vtNivel.listo, window.vtInicial.listo
  ]);
  const hoyIso = window.vtGlicko.hoyIso();
  const ratings = new Map(window.vtGlicko.calcularRatings(estado.nombres, partidos, hoyIso)
    .map((f) => [f.name, f.rating]));
  estado.elegidos.sort((a, b) => (ratings.get(b) || 0) - (ratings.get(a) || 0));
  porLadoDentroDeCadaPareja();
  pintarJugadores();
}

async function alOrdenar() {
  const boton = document.getElementById('ordenarBtn');
  const texto = document.getElementById('ordenarTexto');
  const aviso = document.getElementById('aviso');
  boton.disabled = true;
  texto.textContent = 'Calculando el ranking…';
  aviso.textContent = '';
  try {
    await ordenarPorRanking();
  } catch {
    aviso.textContent = 'No se ha podido calcular el ranking. La lista se queda como estaba.';
  } finally {
    boton.disabled = false;
    texto.textContent = 'Ordenar por ranking';
  }
}

// Si esto falla, la lista sale sin los lados del perfil y se puede montar el
// torneo igual: es una ayuda, no un requisito.
async function cargarLados() {
  try {
    const res = await fetch('/api/read?action=getComunidad&ts=' + Date.now());
    const cuerpo = await res.json();
    estado.lados = new Map((cuerpo.jugadores || []).map((j) => [j.nombre, j.lado]));
  } catch {
    estado.lados = new Map();
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
  await cargarLados();
  pintarPuntos();
  pintarJugadores();
}

document.getElementById('buscar').addEventListener('input', pintarDisponibles);
document.getElementById('ordenarBtn').addEventListener('click', alOrdenar);
document.getElementById('pistas').addEventListener('change', () => { pintarPuntos(); pintarJugadores(); });
document.getElementById('crearBtn').addEventListener('click', crear);

document.addEventListener('DOMContentLoaded', () => {
  window.vtCargando.arranque(arrancar, 'Preparando el torneo');
});
