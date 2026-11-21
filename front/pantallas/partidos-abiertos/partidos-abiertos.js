// Los partidos que ha convocado el grupo y en los que no estoy.
//
// Es la pantalla de apuntarse, y por eso cada tarjeta ofrece una sola cosa:
// entrar, o ponerse a la espera si ya esta lleno. Compartir no esta aqui —
// esta en /partido y en /partidos— porque lo que se comparte es un partido
// tuyo, no el de otro.
const lista = document.getElementById('lista');
let miId = null;
let partidos = [];

function accionesDe(partido) {
  if (partido.libres > 0) {
    return `<div class="vt-partido__acciones">
      <button type="button" class="vt-btn vt-btn--ancho" data-accion="apuntarme" data-id="${partido.id}">
        <span class="ms ms--sm notranslate" translate="no" aria-hidden="true">person_add</span>Apuntarme
      </button></div>`;
  }
  if (partido.enEspera) {
    return `<div class="vt-partido__menores">
      <span class="ms ms--sm notranslate" translate="no" aria-hidden="true">hourglass_empty</span>
      <span style="font-size:13px;color:var(--vt-muted)">Te avisamos si queda plaza. No estás apuntado.</span>
      <button type="button" class="vt-enlace-accion" data-accion="no-esperarme" data-id="${partido.id}">Salir de la lista</button>
    </div>`;
  }
  return `<div class="vt-partido__acciones">
    <button type="button" class="vt-btn vt-btn--ghost vt-btn--ancho" data-accion="esperarme" data-id="${partido.id}">
      <span class="ms ms--sm notranslate" translate="no" aria-hidden="true">hourglass_empty</span>Avísame si queda plaza
    </button></div>`;
}

function pintar() {
  if (!partidos.length) {
    lista.innerHTML = '<p class="vacio">Ahora mismo nadie del grupo tiene un partido abierto.</p>';
    return;
  }
  lista.innerHTML = partidos.map((p) => `
    <article class="vt-card vt-partido" data-partido="${p.id}">
      ${window.vtPartido.cuerpo(p, { miId })}
      ${accionesDe(p)}
      <p class="vt-nota-aviso vt-nota-aviso--error" data-error="${p.id}" hidden>
        <span class="ms notranslate" translate="no" aria-hidden="true">error</span><span></span>
      </p>
    </article>`).join('');
}

// El error se ensena en la tarjeta que lo provoco y no en un toast: «ya estás
// en otro partido a esa hora» no se entiende sin ver de que partido habla.
function errorEn(id, texto) {
  const caja = lista.querySelector(`[data-error="${id}"]`);
  if (!caja) return;
  caja.lastElementChild.textContent = texto;
  caja.hidden = false;
}

async function cargar() {
  const r = await window.vtPartido.llamar('abiertos');
  if (!r.ok) {
    lista.innerHTML = `<p class="vacio">${window.vtPartido.escapar(r.mensaje)}</p>`;
    return;
  }
  miId = r.datos.yo;
  partidos = r.datos.partidos;
  pintar();
}

// Apuntarse lleva a /partido, que es desde donde se comparte: quien entra en
// un partido suele querer decirlo.
async function apuntarme(id) {
  const r = await window.vtPartido.llamar('apuntarme', { id: Number(id) });
  if (!r.ok) {
    await cargar();
    errorEn(id, r.mensaje);
    return;
  }
  window.location = `/partido?id=${id}&volver=%2Fpartidos-abiertos`;
}

const ACCIONES = {
  apuntarme,
  esperarme: async (id) => {
    const r = await window.vtPartido.llamar('esperarme', { id: Number(id) });
    await cargar();
    if (!r.ok) errorEn(id, r.mensaje);
  },
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

window.vtCargando.arranque(cargar, 'Buscando partidos');
