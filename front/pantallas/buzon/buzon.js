// Lo que pinta /buzon.
//
// Hasta el 2026-11-01 estas lineas vivian dentro de buzon.html. Salen
// aqui sin tocar una coma; el <script> de la pagina las carga en el mismo
// sitio y sin defer, para que el orden de ejecucion no cambie.

// Escribe cualquiera con sesion; la lista solo se pide si la cuenta es de
// administrador, y el servidor lo vuelve a comprobar (403 a los demas).
// Detalle: ai_context/buzon_de_quejas.md
const TIPOS = { queja: 'Queja', sugerencia: 'Sugerencia' };
let tipoElegido = null;

// A dónde vuelve el botón del pie: lo dice quien trajo aquí, con ?volver= (lo
// pone /cuenta, que enlaza al buzón desde dos sitios). Sólo rutas de este
// sitio —una que empiece por // o por http sería un redirect abierto—, la
// misma regla que `goBack()` en day.html. Sin ese parámetro, a la portada; y
// la etiqueta cambia, porque «Volver al inicio» sería mentira si no va allí.
(function volverA() {
  const v = new URLSearchParams(location.search).get('volver');
  if (!v || !v.startsWith('/') || v.startsWith('//')) return;
  const boton = document.getElementById('volver');
  boton.href = v;
  boton.textContent = 'Volver';
})();

function el(tag, clase, texto) {
  const n = document.createElement(tag);
  if (clase) n.className = clase;
  if (texto !== undefined) n.textContent = texto;
  return n;
}

async function pedir(url, opciones) {
  const res = await fetch(url, opciones);
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.ok) throw new Error(json.message || 'No se pudo completar. Inténtalo otra vez.');
  return json;
}

function elegirTipo(boton) {
  tipoElegido = boton.dataset.tipo;
  document.querySelectorAll('.tipo').forEach((b) => b.setAttribute('aria-pressed', String(b === boton)));
}

async function enviar() {
  const estado = document.getElementById('estado');
  const caja = document.getElementById('texto');
  const texto = caja.value.trim();
  if (!tipoElegido) { estado.textContent = 'Elige si es una queja o una sugerencia.'; return; }
  if (texto.length < 5) { estado.textContent = 'Escribe un poco más.'; caja.focus(); return; }
  const boton = document.getElementById('enviar');
  boton.disabled = true;
  estado.textContent = 'Enviando…';
  try {
    await pedir('/api/buzon?action=enviar', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipo: tipoElegido, texto })
    });
    caja.value = '';
    contarLetras();
    estado.textContent = '';
    window.vtToast('Enviado. Gracias, los administradores ya lo tienen.');
  } catch (e) {
    estado.textContent = e.message;
  } finally {
    boton.disabled = false;
  }
}

function contarLetras() {
  document.getElementById('letras').textContent = `${document.getElementById('texto').value.length} / 2000`;
}

function fecha(cuando) {
  return new Date(cuando).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function pintarMensaje(m) {
  const fila = el('div', m.nuevo ? 'mensaje mensaje--nuevo' : 'mensaje');
  const cabeza = el('div', 'mensaje__cabeza');
  cabeza.appendChild(el('span', 'vt-badge', TIPOS[m.tipo] || m.tipo));
  cabeza.appendChild(el('span', 'mensaje__quien', m.quien));
  cabeza.appendChild(el('span', 'mensaje__cuando', fecha(m.cuando)));
  fila.appendChild(cabeza);
  fila.appendChild(el('p', 'mensaje__texto', m.texto));
  fila.appendChild(pieDeMensaje(m));
  return fila;
}

// Procesado: quien y cuando. Sin procesar: el boton, que da las gracias al
// autor por la campanita y por push (api/_buzon.js, marcarProcesado).
function pieDeMensaje(m) {
  const pie = el('div', 'mensaje__pie');
  if (m.procesado) {
    const quien = m.procesadoPor ? ` por ${m.procesadoPor}` : '';
    pie.appendChild(el('span', 'mensaje__procesado', `✓ Procesada${quien} el ${fecha(m.procesado)}`));
    return pie;
  }
  const boton = el('button', 'vt-btn vt-btn--ghost vt-btn--sm', 'Marcar como procesada');
  boton.type = 'button';
  boton.addEventListener('click', () => procesar(m, boton));
  pie.appendChild(boton);
  return pie;
}

async function procesar(m, boton) {
  if (!confirm(`¿Marcar como procesada? A ${m.quien} le llegará un aviso dándole las gracias.`)) return;
  boton.disabled = true;
  try {
    await pedir('/api/buzon?action=procesar', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: m.id })
    });
  } catch (e) {
    alert(e.message);
  }
  pintarRecibidos();
}

// Al verlos, se dan por leidos para este administrador: salen de su campanita.
async function pintarRecibidos() {
  document.getElementById('recibidos').hidden = false;
  const lista = document.getElementById('lista');
  try {
    const { mensajes } = await pedir('/api/buzon?action=lista');
    lista.textContent = '';
    if (!mensajes.length) { lista.appendChild(el('p', 'estado', 'Todavía no ha llegado nada.')); return; }
    mensajes.forEach((m) => lista.appendChild(pintarMensaje(m)));
    if (mensajes.some((m) => m.nuevo)) {
      await pedir('/api/buzon?action=leidos', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hasta: Math.max(...mensajes.map((m) => m.id)) })
      });
    }
  } catch (e) {
    lista.textContent = '';
    lista.appendChild(el('p', 'estado', e.message));
  }
}

document.querySelectorAll('.tipo').forEach((b) => b.addEventListener('click', () => elegirTipo(b)));
document.getElementById('texto').addEventListener('input', contarLetras);
document.getElementById('enviar').addEventListener('click', enviar);
// auth-client.js va con defer: window.vtMe existe en DOMContentLoaded, no antes.
document.addEventListener('DOMContentLoaded', () => {
  // El arranque cubre las dos ramas: saber quien eres y, si eres
  // administrador, traerte los mensajes. Si solo se tapara la rama de admin,
  // quien no lo es se quedaria mirando la pagina tapada hasta el rescate.
  vtCargando.arranque(
    () => window.vtMe.then((me) => (me && me.role === 'admin') ? pintarRecibidos() : null),
    'Cargando el buzón'
  );
});
