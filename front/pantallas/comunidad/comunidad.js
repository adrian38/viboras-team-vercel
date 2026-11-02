// Lo que pinta /comunidad.
//
// Hasta el 2026-11-01 estas lineas vivian dentro de comunidad.html. Salen
// aqui sin tocar una coma; el <script> de la pagina las carga en el mismo
// sitio y sin defer, para que el orden de ejecucion no cambie.

// El directorio del grupo. Todo lo que se enseña aquí sale de /api/read
// (action=getComunidad): ficha, formulario y opiniones agregadas. Rating y RD
// salen del mismo vt-glicko.js que usa /rating; no hay una copia del motor.
// No hay fotos de jugador ni horas privadas de /day. Detalle:
// ai_context/comunidad_de_jugadores.md
const LADOS = { drive: 'Drive', reves: 'Revés', ambos: 'Ambos' };
let jugadores = [];
let filtro = 'todos';

// A donde lleva la flecha de la barra: lo dice quien trajo aquí, con ?volver=
// (lo pone /cuenta, que enlaza a esta página desde dos sitios). Sólo rutas de
// este sitio —una que empiece por // o por http sería un redirect abierto—,
// la misma regla que `goBack()` en day.html. Sin ese parámetro, a la portada.
(function volverA() {
  const v = new URLSearchParams(location.search).get('volver') || '/';
  document.getElementById('volver').href = (v.startsWith('/') && !v.startsWith('//')) ? v : '/';
})();

function el(tag, clase, texto) {
  const n = document.createElement(tag);
  if (clase) n.className = clase;
  if (texto !== undefined) n.textContent = texto;
  return n;
}

// Dos letras como mucho: la primera de cada palabra del nombre.
function iniciales(nombre) {
  return String(nombre).split(/\s+/).filter(Boolean).slice(0, 2)
    .map((p) => p[0].toUpperCase()).join('');
}

function dato(clave, valor) {
  const caja = el('div', 'dato');
  caja.appendChild(el('span', 'dato__clave', clave));
  caja.appendChild(el('span', 'dato__valor', valor));
  return caja;
}

function datoValoracion(nota) {
  const caja = dato('Calificación', nota.toFixed(1));
  caja.classList.add('dato--calificacion');
  const icono = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  icono.setAttribute('class', 'estrella');
  icono.setAttribute('viewBox', '0 0 24 24');
  icono.setAttribute('aria-hidden', 'true');
  const forma = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  forma.setAttribute('d', 'M22 9.24l-7.19-.62L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.63-7.03L22 9.24zM12 15.4l-3.76 2.27 1-4.28-3.32-2.88 4.38-.38L12 6.1l1.71 4.04 4.38.38-3.32 2.88 1 4.28L12 15.4z');
  icono.appendChild(forma);
  caja.querySelector('.dato__valor').appendChild(icono);
  return caja;
}

function calificacion(j) {
  if (j.buenRollo === null || !Number.isFinite(j.rd)) return null;
  const fiabilidad = Math.min(1, Math.max(0, (window.MAX_RD - j.rd) / (window.MAX_RD - window.MIN_RD)));
  return Math.min(5, Math.max(1, 3 + 2 * fiabilidad * (2 * j.buenRollo - 1)));
}

function cabezaDeJugador(j) {
  const cabeza = el('div', 'jugador__cabeza');
  cabeza.appendChild(el('div', 'jugador__iniciales', iniciales(j.nombre)));
  const identidad = el('div', 'jugador__id');
  const linea = el('div', 'jugador__linea');
  linea.appendChild(el('h2', 'jugador__nombre', j.nombre));
  identidad.appendChild(linea);
  if (j.categoria) identidad.appendChild(el('span', 'jugador__nivel', j.categoria));
  cabeza.appendChild(identidad);
  const cuentas = el('div', 'jugador__cuentas');
  cuentas.appendChild(el('span', 'jugador__numero', Number.isFinite(j.rating) ? Math.round(j.rating).toLocaleString('en-US') : '—'));
  cuentas.appendChild(el('span', 'jugador__nota', 'Fiabilidad'));
  cabeza.appendChild(cuentas);
  return cabeza;
}

// Solo las casillas con dato. Quien no rellenó el formulario de alta (las
// cuentas anteriores al 2026-10-17) no tiene nivel ni horarios, y entonces no
// se pinta la casilla en vez de dejarla vacía.
function pintarJugador(j) {
  const caja = el('article', 'jugador');
  caja.dataset.lado = j.lado;
  caja.dataset.nombre = j.nombre.toLowerCase();
  caja.appendChild(cabezaDeJugador(j));
  const nota = calificacion(j);
  const cantidad = 1 + Number(nota !== null) + Number(Boolean(j.horarios));
  const datos = el('div', `datos datos--${cantidad}`);
  const lado = dato('Lado', LADOS[j.lado] || j.lado);
  lado.classList.add('dato--gold');
  datos.appendChild(lado);
  if (nota !== null) datos.appendChild(datoValoracion(nota));
  if (j.horarios) datos.appendChild(dato('Horarios', j.horarios));
  caja.appendChild(datos);
  const pie = el('div', 'jugador__pie');
  pie.appendChild(el('span', 'jugador__resumen', j.partidos ? `${j.ganados} ganados de ${j.partidos}` : 'Aún sin partidos'));
  const perfil = el('a', 'vt-btn jugador__accion', 'Ver evolución');
  perfil.href = `/players?player=${encodeURIComponent(j.nombre)}`;
  pie.appendChild(perfil);
  caja.appendChild(pie);
  return caja;
}

// Un filtro por lado de pista y uno por cada categoria actual del rating.
function pintarFiltros() {
  const caja = document.getElementById('filtros');
  caja.textContent = '';
  // De más fuerte a más flojo, como en la tabla de /rating; alfabético dejaba
  // «Avanzado» delante de «Entreno».
  const orden = (window.TIER_DEFINITIONS || []).map((t) => t.title);
  const puesto = (c) => (orden.indexOf(c) === -1 ? orden.length : orden.indexOf(c));
  const categorias = [...new Set(jugadores.map((j) => j.categoria).filter(Boolean))]
    .sort((a, b) => puesto(a) - puesto(b));
  const grupos = [['todos', `Todos (${jugadores.length})`]]
    .concat([['drive', 'Drive'], ['reves', 'Revés']].filter(([l]) => jugadores.some((j) => j.lado === l || j.lado === 'ambos')))
    .concat(categorias.map((c) => [`categoria:${c}`, c]));
  for (const [clave, nombre] of grupos) {
    const boton = el('button', 'filtro', nombre);
    boton.type = 'button';
    boton.setAttribute('aria-pressed', String(clave === filtro));
    boton.addEventListener('click', () => { filtro = clave; pintarFiltros(); aplicar(); });
    caja.appendChild(boton);
  }
}

function pasaElFiltro(j) {
  if (filtro === 'todos') return true;
  if (filtro.startsWith('categoria:')) return j.categoria === filtro.slice(10);
  return j.lado === filtro || j.lado === 'ambos';
}

// El filtro y la búsqueda se aplican juntos: elegir «Drive» y escribir un
// nombre tiene que cruzar las dos cosas, no quedarse con la última.
function aplicar() {
  const busca = document.getElementById('buscar').value.trim().toLowerCase();
  const lista = document.getElementById('lista');
  lista.textContent = '';
  const visibles = jugadores.filter((j) => {
    const texto = [j.nombre, j.categoria, LADOS[j.lado]].filter(Boolean).join(' ').toLowerCase();
    return pasaElFiltro(j) && texto.includes(busca);
  });
  if (!visibles.length) {
    lista.appendChild(el('p', 'estado', 'Ningún jugador encaja con eso.'));
    return;
  }
  visibles.forEach((j) => lista.appendChild(pintarJugador(j)));
}

async function cargar() {
  const lista = document.getElementById('lista');
  try {
    const res = await fetch('/api/read?action=getComunidad&ts=' + Date.now());
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.ok) throw new Error('No se pudo cargar la comunidad. Inténtalo otra vez.');
    const nombres = json.jugadores.map((j) => j.nombre);
    const [, , partidos] = await Promise.all([window.vtNivel.listo, window.vtInicial.listo, window.vtGlicko.leerPartidos()]);
    const ratings = new Map(window.vtGlicko.calcularRatings(nombres, partidos).map((r) => [r.name, r]));
    jugadores = json.jugadores.map((j) => {
      const r = ratings.get(j.nombre) || {};
      return { ...j, rating: r.rating, rd: r.rd, categoria: window.categoriaDeRating(r.rating) };
    });
    document.getElementById('cuantos').textContent = `${jugadores.length} en activo`;
    pintarFiltros();
    aplicar();
  } catch (e) {
    lista.textContent = '';
    lista.appendChild(el('p', 'estado', e.message));
  }
}

document.getElementById('buscar').addEventListener('input', aplicar);
document.addEventListener('DOMContentLoaded', () => {
  vtCargando.arranque(cargar, 'Cargando la comunidad');
});
