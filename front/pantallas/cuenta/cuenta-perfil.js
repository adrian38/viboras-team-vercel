// Rellena el perfil de /cuenta con lo que responde /api/perfil. Lo llama
// pintarSesion() en cuenta.html, una vez, cuando ya se sabe quien ha entrado.
//
// Fichero aparte y no dentro de la pagina: cuenta.html ya lleva el alta, la
// entrada, Google y el panel de administracion, y el techo son 600 lineas de
// JavaScript por fichero (AGENTS.md).
//
// Lo que la pagina ensena y no sale de aqui:
//
//   - el rating, que lo calcula el navegador en /rating a partir del
//     historico. Aqui solo se ensena la salida inicial, que si esta en la
//     base, y un enlace.
//
// Lo unico que escribe es el lado de pista.
;(function(){

const $ = (id) => document.getElementById(id)

function texto(id, valor){
  const nodo = $(id)
  if(nodo) nodo.innerText = valor === null || valor === undefined ? '—' : String(valor)
}

function ver(id, visible){
  const nodo = $(id)
  if(nodo) nodo.classList.toggle('oculto', !visible)
}

// 2026-10-31 -> "31 oct 2026". Las fechas llegan como ISO (timestamptz de
// Postgres) o como AAAA-MM-DD; las dos las entiende Date.
const MESES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
function fecha(valor){
  if(!valor) return null
  const d = new Date(valor)
  if(isNaN(d)) return null
  return d.getDate() + ' ' + MESES[d.getMonth()] + ' ' + d.getFullYear()
}

function iniciales(nombre){
  const partes = String(nombre || '').trim().split(/\s+/).filter(Boolean)
  if(!partes.length) return '?'
  return (partes[0][0] + (partes[1] ? partes[1][0] : '')).toUpperCase()
}

/* ------------------------------------------------------------- cuenta -- */

function pintarCuenta(c){
  // El nombre y el correo los pinta ya pintarSesion() con lo que devuelve
  // /api/auth?action=me, antes de que esto llegue.
  texto('pInicial', iniciales(c.nombre || c.correo))
  ver('pVerificado', c.correoVerificado)
  ver('pActivo', c.estado === 'active')
  texto('pAlta', fecha(c.alta) || 'fecha desconocida')
  ver('pSalidaFrase', c.salida !== null)
  if(c.salida !== null) texto('pSalida', Math.round(c.salida) + ' pts')
}

// Que fila se puede cambiar y cual no lo dice el servidor (campo.editable),
// que es quien lo tiene que decidir: la pagina solo pinta el candado o el
// lapiz segun lo que le digan.

function icono(nombre){
  const n = document.createElement('span')
  n.className = 'ms ms--sm notranslate'
  n.setAttribute('translate', 'no')
  n.setAttribute('aria-hidden', 'true')
  n.innerText = nombre
  return n
}

function filaFicha(titulo, valor, fija){
  const fila = document.createElement('div')
  fila.className = 'ficha__fila' + (fija ? ' ficha__fila--fija' : '')
  const et = document.createElement('span')
  et.className = 'ficha__et'
  et.innerText = titulo
  const val = document.createElement('span')
  val.className = 'ficha__val'
  val.innerText = valor === null || valor === undefined ? '—' : String(valor)
  if(fija) val.appendChild(icono('lock'))
  fila.appendChild(et)
  fila.appendChild(val)
  return fila
}

// El lapiz de una fila que si se puede cambiar. Solo se ve en modo edicion:
// fuera de el, la ficha es una lista que se lee.
function lapiz(campo, fila){
  const boton = document.createElement('button')
  boton.className = 'ficha__lapiz'
  boton.type = 'button'
  boton.setAttribute('aria-label', 'Cambiar ' + campo.titulo.toLowerCase())
  boton.appendChild(icono('edit_note'))
  boton.addEventListener('click', () => abrirEditor(campo, fila))
  return boton
}

// El valor se cambia en la propia fila: un control, guardar y cancelar. Lo
// que vale cada campo lo dice el servidor (campo.opciones), que es quien lo
// valida; aqui solo se ofrece.
function control(campo){
  if(!campo.opciones){
    const input = document.createElement('input')
    input.className = 'vt-input ficha__input'
    input.type = campo.campo === 'phone' ? 'tel' : 'text'
    input.value = campo.crudo || ''
    return input
  }
  const select = document.createElement('select')
  select.className = 'vt-select ficha__input'
  for(const [valor, texto] of campo.opciones){
    const op = document.createElement('option')
    op.value = valor
    op.textContent = texto
    if(valor === campo.crudo) op.selected = true
    select.appendChild(op)
  }
  return select
}

async function guardarCampo(campo, valor, aviso){
  const res = await fetch('/api/perfil?action=ficha', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({campo: campo.campo, valor})
  })
  const json = await res.json().catch(() => ({}))
  if(!res.ok || !json.ok){
    aviso.innerText = json.message || 'No se pudo guardar.'
    return null
  }
  return json.ficha
}

function abrirEditor(campo, fila){
  const val = fila.querySelector('.ficha__val')
  val.innerHTML = ''
  const entrada = control(campo)
  const aviso = document.createElement('small')
  aviso.className = 'ficha__aviso'
  const guardar = document.createElement('button')
  guardar.className = 'vt-btn vt-btn--sm'
  guardar.type = 'button'
  guardar.innerText = 'Guardar'
  const cancelar = document.createElement('button')
  cancelar.className = 'vt-btn vt-btn--quiet vt-btn--sm'
  cancelar.type = 'button'
  cancelar.innerText = 'Cancelar'
  cancelar.addEventListener('click', () => pintarFicha(ultimaCuenta))
  guardar.addEventListener('click', async () => {
    guardar.disabled = true
    const ficha = await guardarCampo(campo, entrada.value, aviso)
    guardar.disabled = false
    if(!ficha) return
    ultimaCuenta = {...ultimaCuenta, ficha}
    pintarFicha(ultimaCuenta)
  })
  val.appendChild(entrada)
  val.appendChild(guardar)
  val.appendChild(cancelar)
  fila.appendChild(aviso)
  entrada.focus()
}

// innerText y createElement en vez de innerHTML: aqui entra el nombre y el
// telefono que escribio una persona.
// La ultima respuesta del API, para repintar la ficha sin volver a pedirla
// al guardar o al cancelar.
let ultimaCuenta = null
let editando = false

function modoEdicion(valor){
  editando = valor
  const boton = $('pEditarFicha')
  if(boton) boton.innerText = valor ? 'Listo' : 'Editar'
  if(ultimaCuenta) pintarFicha(ultimaCuenta)
}

function pintarFicha(c){
  ultimaCuenta = c
  const caja = $('pFicha')
  if(!caja) return
  // Las cuentas anteriores al formulario (2026-10-17) no tienen respuestas:
  // ocho filas vacias no dicen nada, una frase si.
  const vacia = (c.ficha || []).every((campo) => !campo.valor)
  ver('pSinFicha', vacia)
  caja.innerHTML = ''
  caja.appendChild(filaFicha('Nombre en el grupo', c.nombre, true))
  caja.appendChild(filaFicha('Correo', c.correo, true))
  if(vacia) return
  for(const campo of c.ficha || []){
    const fila = filaFicha(campo.titulo, campo.valor, !campo.editable)
    if(campo.editable && editando) fila.querySelector('.ficha__val').appendChild(lapiz(campo, fila))
    caja.appendChild(fila)
  }
  const boton = $('pEditarFicha')
  if(boton) boton.classList.toggle('oculto', !(c.ficha || []).some((f) => f.editable))
}

/* ------------------------------------------------------ lado de pista -- */

function marcarLado(lado){
  for(const boton of document.querySelectorAll('.lado__op')){
    boton.setAttribute('aria-pressed', String(boton.dataset.lado === lado))
  }
}

// Se pinta el lado nuevo antes de que conteste el servidor: si falla, se
// vuelve al que habia y se dice. Esperar a la respuesta para mover el boton
// deja la pulsacion sin efecto visible medio segundo.
async function elegirLado(lado, anterior){
  marcarLado(lado)
  const botones = document.querySelectorAll('.lado__op')
  for(const b of botones) b.disabled = true
  try{
    const res = await fetch('/api/perfil?action=lado', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({lado})
    })
    const json = await res.json().catch(() => ({}))
    if(!res.ok || !json.ok) throw new Error(json.message || 'error')
    texto('pLadoPie', '')
    window.vtToast('Guardado.')
  }catch(err){
    marcarLado(anterior)
    texto('pLadoPie', 'No se pudo guardar. Vuelve a intentarlo.')
  }finally{
    for(const b of botones) b.disabled = false
  }
}

function pintarLado(lado){
  let actual = lado
  marcarLado(actual)
  for(const boton of document.querySelectorAll('.lado__op')){
    boton.addEventListener('click', () => {
      const nuevo = boton.dataset.lado
      if(nuevo === actual) return
      const anterior = actual
      actual = nuevo
      elegirLado(nuevo, anterior)
    })
  }
}

/* ----------------------------------------------------------- partidos -- */

function pintarPersona(id, dato, sufijo){
  ver(id, Boolean(dato))
  if(!dato) return
  texto(id + 'Nombre', dato.nombre)
  // El porcentaje es de partidos GANADOS juntos, no de partidos jugados
  // juntos: «25% juntos» se leia como lo segundo y era lo primero.
  texto(id + 'Dato', sufijo === '%'
    ? dato.veces + ' partidos · ' + dato.porcentaje + '% ganados'
    : dato.veces + ' partidos')
  const ini = $(id + 'Ini')
  if(ini) ini.innerText = iniciales(dato.nombre)
}

function pintarPartidos(p){
  texto('pJugados', p.jugados)
  texto('pGanados', p.ganados)
  texto('pPct', p.porcentaje + '%')
  texto('pRacha', p.racha)
  texto('pSetsFav', p.setsFavor)
  texto('pSetsCon', p.setsContra)
  const total = p.setsFavor + p.setsContra
  const barra = $('pBarraSets')
  if(barra) barra.style.width = (total ? Math.round((p.setsFavor / total) * 100) : 0) + '%'
  texto('pUltimo', fecha(p.ultimo) || 'sin partidos')
  pintarPersona('pCompa', p.companero, '%')
  pintarPersona('pRival', p.rival, 'n')
}

/* -------------------------------------------------------- valoracion -- */

const NIVEL = {
  '-1': 'Por debajo de su nivel',
  '0': 'En su nivel',
  '1': 'Por encima de su nivel'
}

function signo(neto){
  if(neto > 0) return '1'
  if(neto < 0) return '-1'
  return '0'
}

// Cinco estrellas: llena, media o vacia segun la calificacion. La media se dibuja con
// el degradado que define la pagina, porque la fuente de iconos viene con
// FILL 0 y no trae estrella llena.
function pintarEstrellas(nota){
  const caja = $('pEstrellas')
  if(!caja) return
  caja.innerHTML = ''
  for(let i = 1; i <= 5; i++){
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    const uso = document.createElementNS('http://www.w3.org/2000/svg', 'use')
    uso.setAttribute('href', '#estrella')
    const lleno = nota >= i ? 'currentColor' : (nota >= i - 0.5 ? 'url(#mediaEstrella)' : 'transparent')
    svg.setAttribute('fill', lleno)
    svg.setAttribute('stroke', 'currentColor')
    svg.setAttribute('stroke-width', '1')
    svg.appendChild(uso)
    caja.appendChild(svg)
  }
  caja.setAttribute('aria-label', nota.toFixed(1).replace('.', ',') + ' sobre 5')
}

const coma = (n) => n.toFixed(1).replace('.', ',')

// La fiabilidad es la del ranking: el RD de Glicko, el mismo numero que la
// tarjeta de rating enseña como «Media» o «Alta». No hay otra fiabilidad en
// esta pantalla; la que hubo aqui hasta el 2026-10-31, calculada con votos y
// partidos, era un invento que ademas chocaba de nombre con esta.
// De 0 a 1 para poder
// multiplicar: RD 350 (nadie sabe nada de ti) es 0 y RD 80 (el suelo del
// motor) es 1. Los dos limites son los del motor, no inventados aqui.
function fiabilidadDeRd(rd){
  return window.vtCalificacion.fiabilidadDeRd(rd)
}

// La calificacion: las opiniones de buen rollo del grupo, pesadas por lo
// seguro que esta el motor de tu ranking. El 3 es el centro —sin fiabilidad
// no se sabe lo bastante para subir ni para bajar— y la fiabilidad
// multiplica en vez de sumar, que es lo que evita que dos opiniones den un 5
// redondo.
function calificacionDe(buenRollo, fiabilidad){
  return window.vtCalificacion.calificacionDe(buenRollo, fiabilidad)
}

// Lo ultimo que llega del API, para componer la calificacion cuando el motor
// tenga el RD: las dos mitades no vienen a la vez.
let ultimaValoracion = null

// La llama cuenta-rating.js cuando el motor termina. Antes de eso falta la
// mitad de la cuenta, asi que la caja esta escondida.
function pintarCalificacion(rd){
  const v = ultimaValoracion
  if(!v || v.buenRollo === null) return
  const fiabilidad = fiabilidadDeRd(rd)
  const calificacion = calificacionDe(v.buenRollo, fiabilidad)
  pintarEstrellas(calificacion)
  texto('pNota', coma(calificacion))
  texto('pVotos', v.votos + (v.votos === 1 ? ' opinión' : ' opiniones'))
  const barra = $('pBarraFiab')
  if(barra) barra.style.width = Math.round(fiabilidad * 100) + '%'
  texto('pValorFiab', window.getFiabilidadConfig(rd).label)
  ver('pConVotos', true)
}

function pintarValoracion(v){
  ultimaValoracion = v
  // La caja de la nota no se enseña hasta que el motor da el RD; la frase de
  // «todavia no te ha valorado nadie» se sabe ya.
  ver('pSinVotos', v.buenRollo === null)
  texto('pNivel', v.nivelVotos ? NIVEL[signo(v.nivelNeto)] : 'Sin votos')
  // Son partidos por valorar, no valoraciones sueltas: en cada uno hay tres
  // compañeros y dos preguntas.
  texto('pPendientes', v.pendientes
    ? (v.pendientes === 1 ? 'Te falta valorar un partido' : 'Te faltan ' + v.pendientes + ' partidos por valorar')
    : 'Los tienes todos valorados')
  ver('pValorar', v.pendientes > 0)
}

/* ---------------------------------------------------- disponibilidad -- */

const DIAS = ['L','M','X','J','V','S','D']

const pad = (n) => String(n).padStart(2, '0')

const enlaceDeDia = (iso) => '/day?date=' + iso + '&volver=' + encodeURIComponent('/cuenta')

// Los siete dias que vienen, empezando hoy. La base no guarda el pasado
// (getSlots borra las franjas vencidas), asi que esto es lo que hay votado de
// aqui en adelante, no un historico.
function pintarDisponibilidad(d){
  const caja = $('pSemana')
  if(!caja) return
  const votados = new Set((d.dias || []).map((x) => x.dia))
  caja.innerHTML = ''
  const hoy = new Date()
  let primeroSinVotar = null
  for(let i = 0; i < 7; i++){
    const dia = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + i)
    // toISOString pasa por UTC y en invierno nos devolveria el dia anterior.
    const iso = dia.getFullYear() + '-' + pad(dia.getMonth() + 1) + '-' + pad(dia.getDate())
    const si = votados.has(iso)
    if(!si && !primeroSinVotar) primeroSinVotar = iso
    const col = document.createElement('div')
    const et = document.createElement('span')
    et.className = 'semana__dia'
    et.innerText = DIAS[(dia.getDay() + 6) % 7]
    // Cada dia lleva a su pagina de votacion. El `volver` es lo que hace que
    // su «Atras» traiga de vuelta aqui y no a la portada.
    const celda = document.createElement('a')
    celda.className = 'semana__celda' + (si ? ' semana__celda--si' : '')
    celda.href = enlaceDeDia(iso)
    celda.innerText = si ? '✓' : '·'
    celda.title = (si ? 'Votado el ' : 'Votar el ') + iso
    col.appendChild(et)
    col.appendChild(celda)
    caja.appendChild(col)
  }
  const votar = $('pVotar')
  if(votar) votar.href = enlaceDeDia(primeroSinVotar || (d.dias[0] && d.dias[0].dia))
  texto('pFranjas', d.franjas
    ? d.franjas + (d.franjas === 1 ? ' franja votada' : ' franjas votadas') + ' por delante'
    : 'No tienes ninguna franja votada')
}

function pintarDispositivos(d){
  texto('pPush', d.push
    ? 'Activos en ' + d.push + (d.push === 1 ? ' dispositivo' : ' dispositivos')
    : 'Sin activar en ningún dispositivo')
  texto('pBuzon', d.buzon
    ? d.buzon + (d.buzon === 1 ? ' mensaje enviado' : ' mensajes enviados')
    : 'No has enviado ninguno')
}

/* ---------------------------------------------------------------- api -- */

// Un fallo aqui no puede tumbar la pagina: lo importante de /cuenta es entrar
// y salir, y eso no depende de esto. Las tarjetas se quedan escondidas.
async function pedirPerfil(){
  const res = await fetch('/api/perfil', {headers:{accept:'application/json'}})
  const json = await res.json()
  if(!res.ok || !json.ok) throw new Error(json.error || 'error')
  return json
}

// La llama pintarSesion() y la espera, con el velo de arranque puesto: aqui
// no se pide otro velo ni se lanza nada por libre.
async function pintarPerfil(){
  let datos = null
  try{
    datos = await pedirPerfil()
  }catch(err){
    console.error('perfil', err)
    ver('pErrorPerfil', true)
    return
  }
  pintarCuenta(datos.cuenta)
  pintarFicha(datos.cuenta)
  const editar = $('pEditarFicha')
  if(editar) editar.addEventListener('click', () => modoEdicion(!editando))
  const conJugador = Boolean(datos.partidos)
  // Sin ficha de jugador no hay donde guardar el lado, asi que la tarjeta no
  // se ensena: seria un boton que no hace nada.
  ver('pTarjetaLado', conJugador)
  if(conJugador) pintarLado(datos.cuenta.lado)
  ver('pTarjetaPartidos', conJugador)
  ver('pTarjetaValoracion', conJugador)
  ver('pTarjetaDisponibilidad', conJugador)
  if(conJugador){
    pintarPartidos(datos.partidos)
    pintarValoracion(datos.valoraciones)
    pintarDisponibilidad(datos.disponibilidad)
  }
  pintarDispositivos(datos.dispositivos)
  // El rating lo calcula el navegador (cuenta-rating.js) y tarda mas que
  // todo lo demas junto, pero SE ESPERA: su tarjeta, su grafica y la
  // calificacion de estrellas tienen que estar pintadas antes de que la
  // pagina se vea. Si falla, la pagina sale igual y sin su tarjeta.
  if(conJugador && window.pintarRating){
    await window.pintarRating(datos.cuenta.nombre, datos.cuenta.salida)
      .catch((err) => console.error('rating', err))
  }
}

window.pintarPerfil = pintarPerfil
window.pintarCalificacion = pintarCalificacion

})()
