// Lo que pinta /valorar.
//
// Hasta el 2026-11-01 estas lineas vivian dentro de valorar.html. Salen
// aqui sin tocar una coma; el <script> de la pagina las carga en el mismo
// sitio y sin defer, para que el orden de ejecucion no cambie.

// Las valoraciones son anonimas: nadie ve quien voto que. «Nivel» cuenta en
// la fiabilidad del rating (nivel-votos.js); «ambiente» se guarda y no cuenta.
// Detalle: ai_context/valoraciones_y_avisos.md
const PREGUNTAS = [
  {
    campo: 'actitud', titulo: '¿Qué tal el ambiente?',
    texto: 'Cómo te sentiste jugando con cada uno.',
    opciones: [['buen_rollo', '👍', 'Buen rollo'], ['neutro', '😐', 'Neutro'], ['mejorable', '👎', 'No tan bien']]
  },
  {
    campo: 'nivel', titulo: '¿Estaban en su nivel?',
    texto: 'Comparado con su rating: ¿jugó como cabía esperar?',
    opciones: [['por_debajo', '', 'Por debajo'], ['en_su_nivel', '', 'En su nivel'], ['por_encima', '', 'Por encima']]
  }
];

function el(tag, clase, texto) {
  const n = document.createElement(tag);
  if (clase) n.className = clase;
  if (texto !== undefined) n.textContent = texto;
  return n;
}

function iconoCandado() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'privacidad__candado');
  svg.setAttribute('viewBox', '0 0 20 20');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('fill-rule', 'evenodd');
  path.setAttribute('clip-rule', 'evenodd');
  path.setAttribute('d', 'M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z');
  svg.appendChild(path);
  return svg;
}

function iconoFlecha(d, ancho) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'boton__flecha');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', d);
  path.setAttribute('stroke-width', ancho);
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  svg.appendChild(path);
  return svg;
}

function diaYMes(fecha) {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(fecha || ''));
  return iso ? `${iso[3]}/${iso[2]}` : String(fecha || '').slice(0, 5);
}

async function pedir(url, opciones) {
  const res = await fetch(url, opciones);
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.ok) throw new Error(json.message || 'No se pudo cargar.');
  return json;
}

function pintarLista(caja, partidos) {
  caja.textContent = '';
  caja.appendChild(el('h4', '', 'Tus partidos de los últimos 14 días'));
  if (!partidos.length) {
    caja.appendChild(el('p', 'estado', 'No tienes partidos recientes para valorar.'));
    return;
  }
  const lista = el('div', 'lista');
  partidos.forEach((p) => {
    // Con las parejas: dos partidos el mismo dia se distinguen.
    const j = p.jugadores || [];
    const a = el('a', '', `Partido del ${diaYMes(p.fecha)} · ${j[0]} / ${j[1]} vs ${j[2]} / ${j[3]} `);
    // Con el ?volver= de esta lista: desde el detalle, «Atrás» es la lista, y
    // desde la lista es quien trajo aquí (/cuenta).
    a.href = `/valorar?partido=${p.id}&volver=${encodeURIComponent(location.pathname + location.search)}`;
    const falta = p.faltanActitud + p.faltanNivel;
    a.appendChild(el('span', '', falta ? `· te faltan ${falta} respuestas` : '· valorado'));
    lista.appendChild(a);
  });
  caja.appendChild(lista);
}

// Una fila por compañero con un boton por opcion; pulsar marca y desmarca.
function pintarVoto(pregunta, jugador, elegidos) {
  const fila = el('div', 'voto');
  const cabecera = el('div', 'voto__cabecera');
  cabecera.appendChild(el('div', 'voto__nombre', jugador.name));
  if (jugador.categoria) cabecera.appendChild(el('span', 'voto__nivel', jugador.categoria));
  fila.appendChild(cabecera);
  const opciones = el('div', 'opciones');
  pregunta.opciones.forEach(([valor, icono, etiqueta]) => {
    const b = el('button', 'opcion');
    b.type = 'button';
    if (icono) b.appendChild(el('span', 'opcion__icono', icono));
    b.appendChild(el('span', '', etiqueta));
    b.setAttribute('aria-pressed', String(jugador[pregunta.campo] === valor));
    b.addEventListener('click', () => {
      const ya = elegidos.get(jugador.id) === valor;
      elegidos.set(jugador.id, ya ? null : valor);
      opciones.querySelectorAll('.opcion').forEach((o) => o.setAttribute('aria-pressed', 'false'));
      b.setAttribute('aria-pressed', String(!ya));
    });
    opciones.appendChild(b);
  });
  fila.appendChild(opciones);
  return fila;
}

async function enviar(ids, pregunta, elegidos) {
  const votos = [...elegidos].filter(([, v]) => v).map(([playerId, v]) => ({ playerId, [pregunta.campo]: v }));
  if (!votos.length) return 0;
  await pedir('/api/avisos?action=valorar', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ partido: ids.join(','), votos })
  });
  return votos.length;
}

function pintarPregunta(ids, pregunta, otros) {
  const caja = el('div', `pregunta pregunta--${pregunta.campo}`);
  const titulo = el('div', 'pregunta__titulo');
  titulo.appendChild(el('span', 'pregunta__marca'));
  titulo.appendChild(el('h4', '', pregunta.titulo));
  caja.appendChild(titulo);
  caja.appendChild(el('p', '', pregunta.texto));
  const elegidos = new Map(otros.map((j) => [j.id, j[pregunta.campo]]));
  otros.forEach((j) => caja.appendChild(pintarVoto(pregunta, j, elegidos)));
  return { caja, pregunta, elegidos };
}

async function enviarTodo(ids, controles, boton) {
  boton.disabled = true;
  window.vtToast('Enviando…', 10000);
  try {
    const cantidades = await Promise.all(controles.map((c) => enviar(ids, c.pregunta, c.elegidos)));
    const total = cantidades.reduce((suma, n) => suma + n, 0);
    if (!total) window.vtToast('Elige al menos una respuesta.');
    else window.vtToast(total < 6 ? 'Guardado. Te quedan respuestas por completar.' : 'Guardado. ¡Gracias!');
  } catch (e) {
    window.vtToast(e.message, 5000);
  } finally {
    boton.disabled = false;
  }
}

async function ponerCategorias(datos) {
  const nombres = datos.otros.map((j) => j.name);
  const [, , partidos] = await Promise.all([
    window.vtNivel.listo, window.vtInicial.listo, window.vtGlicko.leerPartidos()
  ]);
  const ratings = new Map(window.vtGlicko.calcularRatings(nombres, partidos).map((r) => [r.name, r.rating]));
  datos.otros.forEach((j) => { j.categoria = window.categoriaDeRating(ratings.get(j.name)); });
  return datos;
}

function marcadorDelPartido(p) {
  const tanteos = p.sets.map((s) => s.split('-').map(Number));
  const juegos1 = tanteos.map((s) => s[0]).join(' · ');
  const juegos2 = tanteos.map((s) => s[1]).join(' · ');
  const sets1 = tanteos.filter((s) => s[0] > s[1]).length;
  const sets2 = tanteos.filter((s) => s[1] > s[0]).length;
  return { juegos1, juegos2, ganador: sets1 === sets2 ? 0 : (sets1 > sets2 ? 1 : 2) };
}

function pintarResumen(partidos, total) {
  const resumen = el('div', 'resumen');
  partidos.forEach((p) => {
    const cabecera = el('div', 'partido');
    const meta = el('div', 'partido__meta');
    meta.appendChild(el('span', 'partido__fecha', `Partido del ${diaYMes(p.fecha)}`));
    if (p.evento) meta.appendChild(el('span', 'partido__evento', p.evento));
    cabecera.appendChild(meta);
    const marcador = marcadorDelPartido(p);
    const equipo1 = el('div', `equipo${marcador.ganador === 1 ? ' equipo--ganador' : ''}`);
    equipo1.appendChild(el('span', '', p.equipo1.join(' / ')));
    equipo1.appendChild(el('span', 'equipo__sets', marcador.juegos1));
    const equipo2 = el('div', `equipo${marcador.ganador === 2 ? ' equipo--ganador' : ''}`);
    equipo2.appendChild(el('span', '', p.equipo2.join(' / ')));
    equipo2.appendChild(el('span', 'equipo__sets', marcador.juegos2));
    cabecera.appendChild(equipo1);
    cabecera.appendChild(equipo2);
    resumen.appendChild(cabecera);
  });
  const privacidad = el('div', 'privacidad');
  const texto = el('span', 'privacidad__texto');
  texto.appendChild(iconoCandado());
  texto.appendChild(el('span', '', 'Las respuestas son 100% anónimas'));
  privacidad.appendChild(texto);
  privacidad.appendChild(el('span', 'privacidad__total', `${total} evaluados`));
  resumen.appendChild(privacidad);
  return resumen;
}

// Uno o varios partidos (mismo dia, mismos cuatro): una cabecera por partido
// y las preguntas una sola vez, para todos a la vez.
function pintarPartido(caja, datos) {
  caja.textContent = '';
  caja.className = 'detalle';
  caja.appendChild(pintarResumen(datos.partidos, datos.otros.length));
  const ids = datos.partidos.map((p) => p.id);
  const controles = PREGUNTAS.map((q) => pintarPregunta(ids, q, datos.otros));
  controles.forEach((c) => caja.appendChild(c.caja));
  const boton = el('button', 'vt-btn enviar-valoracion');
  boton.type = 'button';
  boton.appendChild(el('span', '', 'Enviar valoración'));
  boton.appendChild(iconoFlecha('M14 5l7 7m0 0l-7 7m7-7H3', '2.5'));
  boton.addEventListener('click', () => enviarTodo(ids, controles, boton));
  caja.appendChild(boton);
}

async function iniciar() {
  const caja = document.getElementById('contenido');
  const id = new URLSearchParams(location.search).get('partido');
  try {
    const datos = await window.vtCargando.arranque(
      async () => {
        const cargados = await pedir(id ? `/api/avisos?action=partido&id=${encodeURIComponent(id)}` : '/api/avisos?action=pendientes');
        return id ? ponerCategorias(cargados) : cargados;
      },
      'Buscando tus partidos'
    );
    if (id) pintarPartido(caja, datos);
    else pintarLista(caja, datos.partidos);
  } catch (e) {
    caja.textContent = '';
    caja.appendChild(el('p', 'estado', e.message));
  }
}

// A donde vuelve el boton del pie, por orden:
//
// 1. El ?volver= de quien enlazo, que lo ponen /cuenta y /history. Solo rutas
//    de este sitio —una que empiece por // o por http seria un redirect
//    abierto—, la misma regla que `goBack()` en day.html.
// 2. Sin ese parametro pero con ?partido=, la lista, que es la pantalla madre
//    del detalle. Asi entran la campanita y los avisos push, que enlazan a un
//    partido concreto y no pasan por la lista: mandarlos a la portada los
//    dejaba sin ver el resto de partidos que les faltan por valorar.
// 3. Y si no, la portada.
//
// La etiqueta cambia con el destino: «Volver al inicio» cuando no va al
// inicio seria una frase que promete otra cosa que el codigo hace. El texto
// antes que la flecha: `textContent` vacia el enlace y se llevaria el icono.
const volverBoton = document.getElementById('volverInicio');
const parametros = new URLSearchParams(location.search);
const volverA = parametros.get('volver');
if (volverA && volverA.startsWith('/') && !volverA.startsWith('//')) {
  volverBoton.href = volverA;
  volverBoton.textContent = 'Volver';
} else if (parametros.get('partido')) {
  volverBoton.href = '/valorar';
  volverBoton.textContent = 'Volver a tus partidos';
}

// En DOMContentLoaded y no al vuelo: pintarLista toca el DOM de la pagina,
// que este <script> todavia esta parseando cuando corre.
volverBoton.prepend(iconoFlecha('M10 19l-7-7m0 0l7-7m-7 7h18', '2'));
document.addEventListener('DOMContentLoaded', iniciar);
