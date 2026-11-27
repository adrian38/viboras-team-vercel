// Lo que pinta /partidos: solo mis partidos pendientes, los que he convocado
// o en los que tengo plaza, mas aquellos cuya plaza estoy esperando.
//
// Los partidos abiertos del grupo son otra pantalla (/partidos-abiertos) y el
// formulario de convocar, otra (/partido-nuevo). Aqui no hay ninguna lista
// del grupo: esta pantalla responde «que tengo yo».
const lista = document.getElementById('lista');
let miId = null;
let soyAdmin = false;
let partidos = [];

function accionesDe(partido) {
  if (partido.enEspera && !partido.estoyDentro) {
    return `<div class="vt-partido__menores">
      <span class="ms ms--sm notranslate" translate="no" aria-hidden="true">hourglass_empty</span>
      <span style="font-size:13px;color:var(--vt-muted)">En lista de espera. No estás apuntado.</span>
      <button type="button" class="vt-enlace-accion" data-accion="no-esperarme" data-id="${partido.id}">Salir de la lista</button>
    </div>`;
  }
  // Ya se jugo y nadie ha metido el resultado: lo unico que queda por hacer.
  if (partido.jugado) {
    const faltan = partido.libres > 0;
    if (faltan) {
      // Quitarlo es cancelarlo para todos: quien lo creo, un admin o
      // cualquiera de los apuntados, la misma regla que aplica `cancelar`.
      const quitar = partido.soyElCreador || soyAdmin || partido.estoyDentro
        ? `<button type="button" class="vt-enlace-accion" data-accion="cancelar" data-id="${partido.id}">Quitarlo de aquí</button>`
        : '';
      return `<div class="vt-partido__menores">
        <span style="font-size:13px;color:var(--vt-muted)">Se quedó sin los cuatro.</span>
        ${quitar}
      </div>`;
    }
    return `<div class="vt-partido__acciones">
      <button type="button" class="vt-btn" data-accion="resultado" data-id="${partido.id}">
        <span class="ms ms--sm notranslate" translate="no" aria-hidden="true">scoreboard</span>Meter resultado
      </button></div>`;
  }
  const propias = partido.soyElCreador
    ? `<button type="button" class="vt-enlace-accion" data-accion="editar" data-id="${partido.id}">Editar</button>
       <button type="button" class="vt-enlace-accion" data-accion="cancelar" data-id="${partido.id}">Cancelar partido</button>`
    : '';
  // Convocar un partido no te mete en el: el creador puede haberse borrado y
  // seguir organizandolo. Ofrecerle «Borrarme» seria ofrecer algo que ya hizo.
  let mia = '<button type="button" class="vt-btn vt-btn--ghost" data-accion="borrarme" data-id="' + partido.id + '">Borrarme</button>';
  if (!partido.estoyDentro) {
    mia = partido.libres > 0
      ? `<button type="button" class="vt-btn vt-btn--ghost" data-accion="apuntarme" data-id="${partido.id}">Apuntarme</button>`
      : '';
  }
  return `<div class="vt-partido__acciones">
      <button type="button" class="vt-btn vt-btn--whatsapp" data-accion="compartir" data-id="${partido.id}">
        <span class="ms ms--sm notranslate" translate="no" aria-hidden="true">share</span>${window.vtCompartirPartido.etiqueta()}
      </button>
      ${mia}
    </div>
    <div class="vt-partido__menores">${propias}</div>`;
}

function pintar() {
  if (!partidos.length) {
    lista.innerHTML = '<p class="vacio">No tienes ningún partido pendiente. Crea uno o mira los que hay abiertos.</p>';
    return;
  }
  lista.innerHTML = partidos.map((p) => `
    <article class="vt-card vt-partido" data-partido="${p.id}">
      ${window.vtPartido.cuerpo(p, { miId })}
      ${accionesDe(p)}
    </article>`).join('');
}

const buscar = (id) => partidos.find((p) => p.id === Number(id));

// Siempre se recarga del servidor despues de cambiar algo: lo que se pinta es
// lo que hay en la base, no lo que este codigo cree que deberia haber.
async function cargar() {
  const r = await window.vtPartido.llamar('mios');
  if (!r.ok) {
    lista.innerHTML = `<p class="vacio">${window.vtPartido.escapar(r.mensaje)}</p>`;
    return;
  }
  miId = r.datos.yo || miId;
  soyAdmin = Boolean(r.datos.soyAdmin);
  partidos = r.datos.partidos;
  pintar();
}

// Compartir pide el partido al servidor antes de componer el mensaje: el que
// esta pintado puede tener un minuto y haber cambiado quien va.
async function compartir(id) {
  const r = await window.vtPartido.llamar(`uno&id=${id}`);
  if (!r.ok) { window.vtToast(r.mensaje); return; }
  await window.vtCompartirPartido.compartir(r.datos.partido);
}

async function borrarme(id) {
  const partido = buscar(id);
  if (!partido) return;
  if (!confirm('¿Te borras de este partido? Se lo diremos a los demás.')) return;
  const r = await window.vtPartido.llamar('borrarme', { id: partido.id });
  window.vtToast(r.ok ? 'Te has borrado.' : r.mensaje);
  await cargar();
}

async function cancelar(id) {
  const partido = buscar(id);
  if (!partido) return;
  let aviso = partido.libres < 3
    ? '¿Cancelas el partido? Se lo diremos a los que estaban apuntados.'
    : '¿Cancelas el partido?';
  if (partido.jugado) aviso = '¿Lo quitas? Desaparece también para los demás apuntados.';
  if (!confirm(aviso)) return;
  const r = await window.vtPartido.llamar('cancelar', { id: partido.id });
  window.vtToast(r.ok ? (partido.jugado ? 'Quitado.' : 'Partido cancelado.') : r.mensaje);
  await cargar();
}

// Lleva a /submit-result con la fecha y los cuatro ya puestos, y con el id
// del partido previsto para que al guardar se cierre.
function meterResultado(id) {
  const partido = buscar(id);
  if (!partido) return;
  const f = new Date(partido.empieza).toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid', day: '2-digit', month: '2-digit', year: 'numeric' });
  const nombres = partido.plazas.map((p) => p.nombre || '');
  const q = new URLSearchParams({
    fecha: f, p1a: nombres[0], p1b: nombres[1], p2a: nombres[2], p2b: nombres[3], previsto: String(partido.id)
  });
  window.location = `/submit-result?${q.toString()}`;
}

async function apuntarme(id) {
  const r = await window.vtPartido.llamar('apuntarme', { id: Number(id) });
  window.vtToast(r.ok ? 'Apuntado.' : r.mensaje);
  await cargar();
}

const ACCIONES = {
  compartir,
  apuntarme,
  borrarme,
  cancelar,
  resultado: meterResultado,
  editar: (id) => { window.location = `/partido-nuevo?id=${id}`; },
  'no-esperarme': async (id) => {
    await window.vtPartido.llamar('no-esperarme', { id: Number(id) });
    await cargar();
  }
};

lista.addEventListener('click', (ev) => {
  const boton = ev.target.closest('[data-accion]');
  if (!boton) return;
  const fn = ACCIONES[boton.dataset.accion];
  if (fn) fn(boton.dataset.id);
});

window.vtCargando.arranque(cargar, 'Cargando tus partidos');
