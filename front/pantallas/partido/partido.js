// La pantalla del enlace: un partido y nada mas.
//
// Es a donde lleva el enlace que sale por WhatsApp y a donde lleva cada aviso
// y cada push. Quien aterriza aqui puede no tener ni idea de que es esto, asi
// que la pantalla se explica sola y ofrece una sola cosa que hacer.
//
// La idea entera esta en dos botones:
//
//   - Si hay hueco y no estas dentro, tu nombre aparece YA puesto en la
//     primera plaza libre, marcado «sin guardar», y el boton es «Guardar y
//     compartir en WhatsApp». Eso no es inventarse un dato: no se ensena
//     como lo que hay, se ensena como lo que va a haber si pulsas.
//   - Si ya estas dentro, puedes «Borrarte y avisar al grupo», que publica el
//     mensaje actualizado, ya sin ti y con la plaza libre.
//
// En los dos casos manda el servidor y WhatsApp va despues: si el servidor
// dice que no, no se abre nada. Mandar al grupo un mensaje diciendo que vas
// cuando no te han apuntado es justo lo que no puede pasar.
const $ = (id) => document.getElementById(id);
const parametros = new URLSearchParams(location.search);
const idPartido = Number(parametros.get('id')) || 0;

let partido = null;
let yo = { id: null, nombre: '' };

const volver = () => {
  const pedido = parametros.get('volver') || '';
  return /^\/(?!\/)/.test(pedido) ? pedido : '/partidos';
};

function nota(texto, esError) {
  $('notaTexto').textContent = texto || '';
  $('nota').hidden = !texto;
  $('nota').classList.toggle('vt-nota-aviso--error', Boolean(esError));
}

// El puesto en el que se propone meterme: el hueco mas bajo, que es el mismo
// que tomaria el servidor. Null si no hay hueco o si ya estoy dentro.
function puestoPropuesto() {
  if (!partido || partido.estoyDentro || partido.cancelado || partido.jugado) return null;
  const libre = partido.plazas.find((p) => !p.playerId);
  return libre ? libre.puesto : null;
}

const boton = (clase, accion, icono, texto) =>
  `<button type="button" class="vt-btn ${clase} vt-btn--ancho" data-accion="${accion}">`
  + (icono ? `<span class="ms ms--sm notranslate" translate="no" aria-hidden="true">${icono}</span>` : '')
  + `${texto}</button>`;

const menor = (accion, texto) =>
  `<button type="button" class="vt-enlace-accion" data-accion="${accion}">${texto}</button>`;

function pintarAcciones() {
  const propuesto = puestoPropuesto();
  if (partido.cancelado) {
    $('acciones').innerHTML = '';
    $('menores').innerHTML = '';
    return;
  }
  if (propuesto) {
    $('acciones').innerHTML = boton('vt-btn--whatsapp', 'guardar-compartir', 'share', 'Guardar y compartir en WhatsApp');
    $('menores').innerHTML = menor('apuntarme', 'Apuntarme sin compartir');
    return;
  }
  if (partido.estoyDentro) {
    $('acciones').innerHTML = boton('vt-btn--whatsapp', 'compartir', 'share', 'Compartir por WhatsApp')
      + boton('vt-btn--ghost', 'borrarme-avisar', '', 'Borrarme y avisar al grupo');
    $('menores').innerHTML = menor('borrarme', 'Borrarme sin avisar');
    return;
  }
  // Completo y fuera: lo unico que queda es esperar o pasar el mensaje.
  $('acciones').innerHTML = boton('vt-btn--whatsapp', 'compartir', 'share', 'Compartir por WhatsApp');
  $('menores').innerHTML = partido.enEspera
    ? menor('no-esperarme', 'Salir de la lista de espera')
    : menor('esperarme', 'Avísame si queda plaza');
}

function pintar() {
  $('tarjeta').innerHTML = window.vtPartido.cuerpo(partido, {
    miId: yo.id, rejilla: true, propuestaEn: puestoPropuesto(), yoSoy: yo.nombre
  });
  pintarAcciones();
  if (partido.cancelado) nota('Este partido se canceló.');
  else if (partido.enEspera && !partido.estoyDentro) nota('Te avisamos si queda plaza. No estás apuntado.');
  else nota('');
}

async function recargar() {
  const r = await window.vtPartido.llamar(`uno&id=${idPartido}`);
  if (!r.ok) {
    $('tarjeta').innerHTML = `<p style="text-align:center;color:var(--vt-muted);margin:0">${window.vtPartido.escapar(r.mensaje)}</p>`;
    $('acciones').innerHTML = '';
    $('menores').innerHTML = '';
    return false;
  }
  partido = r.datos.partido;
  yo = { id: r.datos.yo, nombre: r.datos.yoSoy || 'Tú' };
  pintar();
  return true;
}

// Toma la plaza. Devuelve true solo si el servidor la dio: de eso depende que
// se abra WhatsApp o no.
async function apuntar() {
  const r = await window.vtPartido.llamar('apuntarme', { id: idPartido });
  if (!r.ok) {
    await recargar();
    nota(r.mensaje, true);
    return false;
  }
  return true;
}

async function soltar() {
  const r = await window.vtPartido.llamar('borrarme', { id: idPartido });
  if (!r.ok) {
    await recargar();
    nota(r.mensaje, true);
    return false;
  }
  return true;
}

// Siempre se comparte el partido que acaba de devolver el servidor, nunca el
// que esta pintado: entre pintar y pulsar pueden haber entrado dos personas.
async function compartirLoQueHay() {
  const r = await window.vtPartido.llamar(`uno&id=${idPartido}`);
  if (!r.ok) { nota(r.mensaje, true); return; }
  await window.vtCompartirPartido.compartir(r.datos.partido);
}

const ACCIONES = {
  compartir: compartirLoQueHay,
  'guardar-compartir': async () => {
    if (!await apuntar()) return;
    await recargar();
    await compartirLoQueHay();
  },
  apuntarme: async () => {
    if (await apuntar()) { await recargar(); window.vtToast('Apuntado.'); }
  },
  'borrarme-avisar': async () => {
    if (!await soltar()) return;
    await recargar();
    await compartirLoQueHay();
  },
  borrarme: async () => {
    if (await soltar()) { await recargar(); window.vtToast('Te has borrado.'); }
  },
  esperarme: async () => {
    const r = await window.vtPartido.llamar('esperarme', { id: idPartido });
    if (!r.ok) { nota(r.mensaje, true); return; }
    await recargar();
  },
  'no-esperarme': async () => {
    await window.vtPartido.llamar('no-esperarme', { id: idPartido });
    await recargar();
  }
};

document.body.addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-accion]');
  if (!b) return;
  const fn = ACCIONES[b.dataset.accion];
  if (fn) fn();
});

// A esta pantalla se entra desde WhatsApp o desde un push, sin historia, asi
// que `history.back()` no vale: el boton de atras lleva a `?volver=` si lo
// hay y, si no, a la lista.
$('atras').addEventListener('click', () => { window.location = volver(); });
$('atrasTexto').textContent = volver() === '/partidos' ? 'Mis partidos' : 'Volver';

window.vtCargando.arranque(recargar, 'Cargando el partido');
