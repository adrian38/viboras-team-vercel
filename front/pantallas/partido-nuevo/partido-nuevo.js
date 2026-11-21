// El formulario de convocar un partido, que es tambien el de editarlo:
// `/partido-nuevo?id=N` carga el partido y guarda con `editar` en vez de con
// `crear`. Son los mismos campos y las mismas reglas, asi que son una
// pantalla y no dos.
//
// Al guardar se va a /partido?id=N, que es la pantalla desde la que se
// comparte: convocar y mandarlo al grupo son el mismo gesto.
const $ = (id) => document.getElementById(id);
const parametros = new URLSearchParams(location.search);
const editando = Number(parametros.get('id')) || null;

// La misma regla que el servidor, con el mismo numero y el mismo mensaje. El
// que manda es el servidor: esta pagina es estatica y se puede descargar.
const MARGEN_MINUTOS = 15;
const AVISO_RESERVA_MINUTOS = 48 * 60 + 30;

const volver = () => {
  const pedido = parametros.get('volver') || '';
  return /^\/(?!\/)/.test(pedido) ? pedido : '/partidos';
};

// Las pistas se reservan por hora en punto, asi que la hora de inicio es una
// lista cerrada y no un reloj. De 7:00 a 23:00: no es una franja inventada
// por horario de nadie, es sencillamente el dia, y lo que no cabe fuera de
// ahi tampoco se juega.
//
// El servidor exige lo mismo (`:00`), asi que esta lista no es una comodidad
// de la pagina: es la regla, escrita dos veces porque la pagina es estatica.
const PRIMERA_HORA = 7;
const ULTIMA_HORA = 23;

const comoHora = (n) => `${String(n).padStart(2, '0')}:00`;

function pintarHoras(actual) {
  const horas = [];
  for (let h = PRIMERA_HORA; h <= ULTIMA_HORA; h += 1) horas.push(comoHora(h));
  // Un partido viejo a una hora que ya no esta en la lista conserva la suya:
  // editar el nivel no puede moverle la hora por la espalda.
  if (actual && !horas.includes(actual)) horas.push(actual);
  horas.sort();
  $('hora').innerHTML = horas.map((h) => `<option value="${h}">${h}</option>`).join('');
  $('hora').value = actual && horas.includes(actual) ? actual : comoHora(19);
}

// Las casillas de nivel. «Todos» no es un nivel mas: es la ausencia de
// filtro, y por eso esconde las otras cuatro en vez de marcarlas. Al
// servidor se le manda una lista vacia, que guarda NULL.
function pintarNiveles(lista) {
  $('niveles').innerHTML = lista.map((n) => `
    <label class="nivel">
      <input type="checkbox" class="nivel__casilla" value="${n.clave}">
      <span>${n.nombre}</span>
    </label>`).join('');
}

function nivelesMarcados() {
  if ($('todosLosNiveles').checked) return [];
  return [...document.querySelectorAll('.nivel__casilla:checked')].map((c) => c.value);
}

function marcarNiveles(niveles) {
  const algunos = Array.isArray(niveles) && niveles.length > 0;
  $('todosLosNiveles').checked = !algunos;
  $('niveles').hidden = !algunos;
  for (const c of document.querySelectorAll('.nivel__casilla')) {
    c.checked = algunos && niveles.includes(c.value);
  }
}

function pintarSedes(sedes) {
  $('sede').innerHTML = sedes.lista
    .map((s) => `<option value="${s.clave}">${s.pistas ? `${s.nombre} — ${s.pistas}` : s.nombre}</option>`)
    .join('');
  $('sede').value = sedes.porDefecto;
}

const empiezaEn = () => {
  if (!$('fecha').value || !$('hora').value) return null;
  return new Date(`${$('fecha').value}T${$('hora').value}`);
};

// El aviso de «la reserva ya esta abierta» sale cuando de verdad lo va a
// estar, no siempre: si se ensenara en todos los partidos dejaria de
// significar nada.
function repintarAvisoReserva() {
  const cuando = empiezaEn();
  const faltan = cuando ? (cuando.getTime() - Date.now()) / 60000 : Infinity;
  $('avisoReserva').hidden = !(faltan < AVISO_RESERVA_MINUTOS && faltan > 0);
}

function mostrarError(texto) {
  $('errorTexto').textContent = texto;
  $('error').hidden = !texto;
}

function datosDelFormulario() {
  const marcado = document.querySelector('input[name=duracion]:checked');
  return {
    fecha: $('fecha').value,
    hora: $('hora').value,
    duracion: Number(marcado ? marcado.value : 60),
    sede: $('sede').value,
    sedeLibre: $('sedeLibre').value.trim(),
    niveles: nivelesMarcados()
  };
}

function problemaDeCliente(datos) {
  if (!datos.fecha || !datos.hora) return 'Pon el día y la hora.';
  const cuando = empiezaEn();
  if (!cuando || Number.isNaN(cuando.getTime())) return 'Esa fecha no existe.';
  if (cuando.getTime() < Date.now() + MARGEN_MINUTOS * 60000) {
    return `Ese partido ya ha empezado o empieza en nada: pon al menos ${MARGEN_MINUTOS} minutos de margen.`;
  }
  if (datos.sede === 'otro' && datos.sedeLibre.length < 2) return 'Escribe dónde se juega.';
  // Destildar «todos» y no marcar ninguno no es «ningún nivel»: es no haber
  // terminado de elegir. Se dice, en vez de guardar un partido al que no
  // puede venir nadie.
  if (!$('todosLosNiveles').checked && !datos.niveles.length) {
    return 'Marca qué niveles pueden venir, o deja «Todos los niveles».';
  }
  return null;
}

async function guardar(ev) {
  ev.preventDefault();
  const datos = datosDelFormulario();
  const problema = problemaDeCliente(datos);
  if (problema) { mostrarError(problema); return; }
  mostrarError('');
  $('guardar').disabled = true;
  const cuerpo = editando ? { ...datos, id: editando } : datos;
  const r = await window.vtPartido.llamar(editando ? 'editar' : 'crear', cuerpo);
  $('guardar').disabled = false;
  if (!r.ok) { mostrarError(r.mensaje); return; }
  window.location = `/partido?id=${editando || r.datos.id}`;
}

// Al editar, los campos llegan con lo que hay guardado. La fecha y la hora
// se sacan en hora peninsular y no en la del navegador: un movil con el reloj
// en otra zona moveria el partido por el hecho de abrir el formulario.
function rellenarCon(partido) {
  const opciones = { timeZone: 'Europe/Madrid' };
  const d = new Date(partido.empieza);
  // en-CA da la fecha como YYYY-MM-DD y en-GB la hora como HH:MM en 24 h,
  // que es justo lo que piden <input type=date> y <input type=time>.
  $('fecha').value = d.toLocaleDateString('en-CA', opciones);
  pintarHoras(d.toLocaleTimeString('en-GB', { ...opciones, hour: '2-digit', minute: '2-digit', hour12: false }));
  document.querySelector(`input[name=duracion][value="${partido.duracion}"]`).checked = true;
  $('sede').value = partido.sede;
  $('sedeLibre').value = partido.sede === 'otro' ? partido.sedeNombre : '';
  marcarNiveles(partido.niveles);
}

function modoEdicion() {
  document.title = 'Editar partido';
  $('titulo').textContent = 'Editar partido';
  $('subtitulo').textContent = 'Avisaremos a los que ya están apuntados';
  $('guardarTexto').textContent = 'Guardar cambios';
  $('pieNota').hidden = true;
}

async function cargar() {
  const r = await window.vtPartido.llamar(editando ? `uno&id=${editando}` : 'mios');
  if (!r.ok) { mostrarError(r.mensaje); return; }
  pintarSedes(r.datos.sedes);
  pintarNiveles(r.datos.niveles);
  pintarHoras(null);
  if (editando && r.datos.partido) {
    modoEdicion();
    rellenarCon(r.datos.partido);
  }
  repintarAvisoReserva();
}

$('sede').addEventListener('change', () => {
  $('campoSedeLibre').hidden = $('sede').value !== 'otro';
});
$('fecha').addEventListener('change', repintarAvisoReserva);
$('hora').addEventListener('change', repintarAvisoReserva);
$('todosLosNiveles').addEventListener('change', () => {
  $('niveles').hidden = $('todosLosNiveles').checked;
});
$('atras').addEventListener('click', () => { window.location = volver(); });
$('form').addEventListener('submit', guardar);

window.vtCargando.arranque(cargar, editando ? 'Cargando el partido' : 'Preparando');
