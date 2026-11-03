// Lo que pinta /tablon.
//
// Hasta el 2026-11-01 estas lineas vivian dentro de tablon.html. Salen
// aqui sin tocar una coma; el <script> de la pagina las carga en el mismo
// sitio y sin defer, para que el orden de ejecucion no cambie.

// Lee cualquiera con sesion; publicar, editar y borrar es de administradores,
// y lo comprueba el servidor (403 a los demas), no esta pagina.
// Al publicar, el aviso sale en la campanita y como push de todo el grupo:
// api/_tablon.js pasa por crearAviso. Detalle: ai_context/tablon_de_avisos.md
let CATEGORIAS = {};
let avisos = [];
let filtro = 'todos';
let editando = null;
// null = no se toca la foto que ya tenga; '' = quitarla; data URL = la nueva.
let fotoNueva = null;
// Lado mas largo al que se reescala antes de subir, y calidad del JPEG. La
// imagen viaja dentro de la fila (no hay almacenamiento de ficheros), asi que
// sin reescalar una foto de movil no cabria.
const LADO_MAXIMO = 1280;
const CALIDAD = 0.75;
// Lo que dura el fundido del visor en la hoja de estilos de la pagina (.18s).
// Si cambia alli, cambia aqui: retirar el <dialog> antes corta la salida.
const FUNDIDO_VISOR = 180;
// Cuanto deja agrandar el pellizco, y cuanto puede moverse un dedo sin dejar
// de ser un toque de cerrar.
const ZOOM_MAXIMO = 4;
const TOQUE_QUIETO = 10;

function el(tag, clase, texto) {
  const n = document.createElement(tag);
  if (clase) n.className = clase;
  if (texto !== undefined) n.textContent = texto;
  return n;
}

function icono(nombre) {
  const n = el('span', 'ms ms--sm notranslate', nombre);
  n.setAttribute('translate', 'no');
  n.setAttribute('aria-hidden', 'true');
  return n;
}

async function pedir(url, opciones) {
  const res = await fetch(url, opciones);
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.ok) throw new Error(json.message || 'No se pudo completar. Inténtalo otra vez.');
  return json;
}

function fecha(cuando) {
  return new Date(cuando).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ---- Pintar la lista ----

// Solo las categorias que tienen algun aviso: un filtro vacio enseñaria una
// lista vacia y no diria por que.
function pintarFiltros() {
  const caja = document.getElementById('filtros');
  caja.textContent = '';
  const usadas = Object.keys(CATEGORIAS).filter((c) => avisos.some((a) => a.categoria === c));
  const grupos = [['todos', 'Todos', avisos.length]]
    .concat(usadas.map((c) => [c, CATEGORIAS[c], avisos.filter((a) => a.categoria === c).length]));
  for (const [clave, nombre, cuantos] of grupos) {
    const boton = el('button', 'filtro', `${nombre} (${cuantos})`);
    boton.type = 'button';
    boton.setAttribute('aria-pressed', String(clave === filtro));
    boton.addEventListener('click', () => { filtro = clave; pintar(); });
    caja.appendChild(boton);
  }
}

function herramientasDeAviso(a) {
  const caja = el('div', 'aviso__herramientas');
  const editar = el('button', 'vt-btn vt-btn--ghost vt-btn--sm', 'Editar');
  editar.type = 'button';
  editar.addEventListener('click', () => abrirEdicion(a));
  const quitar = el('button', 'vt-btn vt-btn--danger vt-btn--sm', 'Borrar');
  quitar.type = 'button';
  quitar.addEventListener('click', () => borrar(a));
  caja.appendChild(editar);
  caja.appendChild(quitar);
  return caja;
}

function cabezaDeAviso(a, esAdmin) {
  const cabeza = el('div', 'aviso__cabeza');
  cabeza.appendChild(el('span', 'vt-badge', CATEGORIAS[a.categoria] || a.categoria));
  const cuando = el('span', 'aviso__cuando');
  cuando.appendChild(icono('schedule'));
  cuando.appendChild(document.createTextNode(` ${fecha(a.cuando)}`));
  cabeza.appendChild(cuando);
  if (a.editado) cabeza.appendChild(el('span', 'aviso__cuando', `· editado el ${fecha(a.editado)}`));
  if (esAdmin) cabeza.appendChild(herramientasDeAviso(a));
  return cabeza;
}

// La foto no viene en la lista (seria megas de base64): se pide por su id
// cuando la tarjeta se acerca a la pantalla. Quien la pone a mirar es
// `pintar()`, con la tarjeta ya metida en el documento: un
// IntersectionObserver sobre un elemento suelto no avisa nunca.
function fotoDeAviso(a) {
  const img = el('img', 'aviso__foto');
  img.alt = `Foto del aviso: ${a.titulo}`;
  img.dataset.aviso = String(a.id);
  img.tabIndex = 0;
  img.setAttribute('role', 'button');
  img.title = 'Ver la foto a pantalla completa';
  img.addEventListener('click', () => abrirVisor(img));
  img.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    abrirVisor(img);
  });
  return img;
}

// En la tarjeta la foto va limitada a 70vh; un cartel con letra pequena no se
// lee ahi. Tocarla la abre entera en un <dialog> modal, que al estar en la top
// layer no necesita z-index, y un toque o Escape lo cierran. Se crea y se
// destruye en cada apertura: no hay estado que mantener.
function abrirVisor(img) {
  if (!img.src) return;
  const visor = el('dialog', 'visor');
  const grande = el('img', 'visor__foto');
  grande.src = img.src;
  grande.alt = img.alt;
  visor.appendChild(grande);
  // Retirarlo hay que retirarlo —un <dialog> cerrado que se queda en el DOM se
  // acumula—, pero no en el mismo toque: quitarlo corta el fundido de salida.
  // Por reloj y no por el evento `close`, que en el navegador de pruebas no
  // llego nunca.
  const cerrar = () => {
    if (!visor.open) return;
    visor.close();
    setTimeout(() => visor.remove(), FUNDIDO_VISOR);
  };
  activarPellizco(visor, grande, cerrar);
  visor.addEventListener('cancel', cerrar);
  document.body.appendChild(visor);
  visor.showModal();
}

// Escala alrededor del punto medio de los dos dedos: el trozo de foto que hay
// debajo de ellos se queda donde esta y el resto crece a su alrededor. Es lo
// que hace que agrandar una esquina del cartel no la mande fuera de pantalla.
function pellizcarFoto(gesto, visor, ahora) {
  const r = visor.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  const nueva = Math.min(ZOOM_MAXIMO, Math.max(1, gesto.escala * ahora.d / gesto.previo.d));
  const k = nueva / gesto.escala;
  gesto.x = (ahora.mx - cx) - k * ((gesto.previo.mx - cx) - gesto.x);
  gesto.y = (ahora.my - cy) - k * ((gesto.previo.my - cy) - gesto.y);
  gesto.escala = nueva;
  gesto.previo = ahora;
}

// Dos dedos agrandan, uno arrastra la foto ya agrandada y un toque que no se
// mueve cierra. El gesto va a mano con pointer events porque el navegador no
// hace zoom dentro de un <dialog> de la top layer; por eso la foto lleva
// `touch-action:none` en la hoja de estilos.
function activarPellizco(visor, img, cerrar) {
  const dedos = new Map();
  const gesto = { escala: 1, x: 0, y: 0, previo: null };
  let origen = null;
  let arrastrado = false;
  let pellizcado = false;

  const pintar = () => {
    const mx = img.clientWidth * (gesto.escala - 1) / 2;
    const my = img.clientHeight * (gesto.escala - 1) / 2;
    gesto.x = Math.min(mx, Math.max(-mx, gesto.x));
    gesto.y = Math.min(my, Math.max(-my, gesto.y));
    img.style.transform = `translate(${gesto.x}px, ${gesto.y}px) scale(${gesto.escala})`;
  };

  const medir = () => {
    const [a, b] = [...dedos.values()];
    return { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
  };

  visor.addEventListener('pointerdown', (ev) => {
    dedos.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (dedos.size === 1) {
      origen = { x: ev.clientX, y: ev.clientY };
      arrastrado = false;
      pellizcado = false;
    }
    if (dedos.size === 2) {
      pellizcado = true;
      gesto.previo = medir();
    }
  });

  visor.addEventListener('pointermove', (ev) => {
    const antes = dedos.get(ev.pointerId);
    if (!antes) return;
    dedos.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (origen && Math.hypot(ev.clientX - origen.x, ev.clientY - origen.y) > TOQUE_QUIETO) arrastrado = true;
    if (dedos.size >= 2) pellizcarFoto(gesto, visor, medir());
    else if (gesto.escala > 1) {
      gesto.x += ev.clientX - antes.x;
      gesto.y += ev.clientY - antes.y;
    } else return;
    pintar();
  });

  const soltar = (ev) => {
    dedos.delete(ev.pointerId);
    if (dedos.size) return;
    if (!arrastrado && !pellizcado) cerrar();
  };
  visor.addEventListener('pointerup', soltar);
  visor.addEventListener('pointercancel', soltar);
}

const observador = new IntersectionObserver((entradas) => {
  for (const e of entradas) {
    if (!e.isIntersecting) continue;
    observador.unobserve(e.target);
    cargarFoto(e.target);
  }
}, { rootMargin: '200px' });

async function cargarFoto(img) {
  try {
    const { imagen } = await pedir(`/api/tablon?action=imagen&id=${img.dataset.aviso}`);
    img.src = imagen;
  } catch {
    img.remove();
  }
}

function pintarAviso(a, esAdmin) {
  const caja = el('article', a.categoria === 'importante' ? 'aviso aviso--importante' : 'aviso');
  caja.appendChild(cabezaDeAviso(a, esAdmin));
  caja.appendChild(el('h2', 'aviso__titulo', a.titulo));
  if (a.tieneImagen) caja.appendChild(fotoDeAviso(a));
  caja.appendChild(el('p', 'aviso__texto', a.texto));
  if (a.autor) {
    const pie = el('p', 'aviso__autor');
    pie.appendChild(icono('verified'));
    pie.appendChild(document.createTextNode(`Publicado por ${a.autor}`));
    caja.appendChild(pie);
  }
  return caja;
}

let soyAdmin = false;

function pintar() {
  pintarFiltros();
  const lista = document.getElementById('lista');
  lista.textContent = '';
  const visibles = filtro === 'todos' ? avisos : avisos.filter((a) => a.categoria === filtro);
  if (!visibles.length) {
    lista.appendChild(el('p', 'estado', avisos.length
      ? 'Nada en esta categoría.'
      : 'Todavía no hay avisos en el tablón.'));
    return;
  }
  visibles.forEach((a) => lista.appendChild(pintarAviso(a, soyAdmin)));
  lista.querySelectorAll('.aviso__foto').forEach((img) => observador.observe(img));
}

async function cargar() {
  const lista = document.getElementById('lista');
  try {
    const datos = await pedir('/api/tablon?action=lista');
    CATEGORIAS = datos.categorias;
    avisos = datos.avisos;
    pintar();
  } catch (e) {
    lista.textContent = '';
    lista.appendChild(el('p', 'estado', e.message));
  }
}

// ---- Formulario de administrador ----

function opcionesDeCategoria() {
  const select = document.getElementById('categoria');
  select.textContent = '';
  for (const [valor, nombre] of Object.entries(CATEGORIAS)) {
    const op = el('option', null, nombre);
    op.value = valor;
    select.appendChild(op);
  }
}

function verFormulario(abierto) {
  document.getElementById('formulario').hidden = !abierto;
  document.getElementById('btnNuevo').hidden = abierto;
}

function limpiarFoto() {
  document.getElementById('foto').value = '';
  document.getElementById('previa').hidden = true;
  document.getElementById('previa').removeAttribute('src');
  document.getElementById('btnQuitarFoto').hidden = true;
  document.getElementById('estadoFoto').textContent = '';
  fotoNueva = null;
}

function abrirAlta() {
  editando = null;
  opcionesDeCategoria();
  document.getElementById('titulo').value = '';
  document.getElementById('texto').value = '';
  document.getElementById('categoria').value = 'general';
  document.getElementById('estadoForm').textContent = '';
  document.getElementById('btnPublicar').textContent = 'Publicar aviso';
  limpiarFoto();
  verFormulario(true);
}

// Editar no reenvia el aviso a nadie (api/_tablon.js, editar): corregir una
// falta no es una novedad.
function abrirEdicion(a) {
  editando = a;
  opcionesDeCategoria();
  document.getElementById('titulo').value = a.titulo;
  document.getElementById('texto').value = a.texto;
  document.getElementById('categoria').value = a.categoria;
  document.getElementById('estadoForm').textContent = '';
  document.getElementById('btnPublicar').textContent = 'Guardar cambios';
  limpiarFoto();
  if (a.tieneImagen) {
    document.getElementById('estadoFoto').textContent = 'Este aviso ya tiene foto. Elige otra para cambiarla.';
    document.getElementById('btnQuitarFoto').hidden = false;
  }
  verFormulario(true);
  document.getElementById('titulo').focus();
}

// Reescala a LADO_MAXIMO y pasa a JPEG: una foto de movil en crudo no cabe en
// la fila. Devuelve el data URL.
function reescalar(fichero) {
  return new Promise((listo, fallo) => {
    const lector = new FileReader();
    lector.onerror = () => fallo(new Error('No se pudo leer la foto.'));
    lector.onload = () => {
      const img = new Image();
      img.onerror = () => fallo(new Error('Ese fichero no es una imagen.'));
      img.onload = () => {
        const escala = Math.min(1, LADO_MAXIMO / Math.max(img.width, img.height));
        const lienzo = document.createElement('canvas');
        lienzo.width = Math.round(img.width * escala);
        lienzo.height = Math.round(img.height * escala);
        lienzo.getContext('2d').drawImage(img, 0, 0, lienzo.width, lienzo.height);
        listo(lienzo.toDataURL('image/jpeg', CALIDAD));
      };
      img.src = lector.result;
    };
    lector.readAsDataURL(fichero);
  });
}

async function elegirFoto() {
  const fichero = document.getElementById('foto').files[0];
  const estado = document.getElementById('estadoFoto');
  if (!fichero) return;
  estado.textContent = 'Preparando la foto…';
  try {
    fotoNueva = await reescalar(fichero);
    const previa = document.getElementById('previa');
    previa.src = fotoNueva;
    previa.hidden = false;
    document.getElementById('btnQuitarFoto').hidden = false;
    estado.textContent = `Lista: ${Math.round(fotoNueva.length / 1024)} KB.`;
  } catch (e) {
    fotoNueva = null;
    estado.textContent = e.message;
  }
}

// Quitar la foto en una edicion tiene que llegar al servidor como '' (quitala)
// y no como null (dejala): son dos cosas distintas.
function quitarFoto() {
  const teniaFoto = editando && editando.tieneImagen;
  limpiarFoto();
  if (teniaFoto) {
    fotoNueva = '';
    document.getElementById('estadoFoto').textContent = 'Se quitará la foto al guardar.';
  }
}

function cuerpoDelAviso() {
  const cuerpo = {
    titulo: document.getElementById('titulo').value.trim(),
    texto: document.getElementById('texto').value.trim(),
    categoria: document.getElementById('categoria').value
  };
  // Sin `imagen` en el cuerpo, el servidor deja la que hubiera.
  if (fotoNueva !== null) cuerpo.imagen = fotoNueva;
  else if (!editando) cuerpo.imagen = '';
  return cuerpo;
}

async function guardar() {
  const estado = document.getElementById('estadoForm');
  const boton = document.getElementById('btnPublicar');
  const cuerpo = cuerpoDelAviso();
  if (cuerpo.titulo.length < 3) { estado.textContent = 'Pon un título.'; return; }
  if (cuerpo.texto.length < 5) { estado.textContent = 'Escribe el mensaje.'; return; }
  if (editando) cuerpo.id = editando.id;
  boton.disabled = true;
  estado.textContent = editando ? 'Guardando…' : 'Publicando y avisando al grupo…';
  try {
    await pedir(`/api/tablon?action=${editando ? 'editar' : 'crear'}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo)
    });
    verFormulario(false);
    await cargar();
    window.vtToast(editando ? 'Aviso guardado' : 'Aviso publicado');
  } catch (e) {
    estado.textContent = e.message;
  } finally {
    boton.disabled = false;
  }
}

async function borrar(a) {
  if (!confirm(`¿Borrar «${a.titulo}»? No se puede deshacer.`)) return;
  try {
    await pedir('/api/tablon?action=borrar', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: a.id })
    });
  } catch (e) {
    alert(e.message);
  }
  await cargar();
}

document.getElementById('btnNuevo').addEventListener('click', abrirAlta);
document.getElementById('btnCancelar').addEventListener('click', () => verFormulario(false));
document.getElementById('btnPublicar').addEventListener('click', guardar);
document.getElementById('foto').addEventListener('change', elegirFoto);
document.getElementById('btnQuitarFoto').addEventListener('click', quitarFoto);

// auth-client.js va con defer: window.vtMe existe en DOMContentLoaded.
document.addEventListener('DOMContentLoaded', () => {
  vtCargando.arranque(async () => {
    const me = await window.vtMe;
    soyAdmin = Boolean(me && me.role === 'admin');
    document.getElementById('panel').hidden = !soyAdmin;
    await cargar();
  }, 'Cargando el tablón');
});
