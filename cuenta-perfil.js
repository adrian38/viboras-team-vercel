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
  texto('pAlta', fecha(c.alta) || 'fecha desconocida')
  ver('pSalidaFrase', c.salida !== null)
  if(c.salida !== null) texto('pSalida', Math.round(c.salida) + ' pts')
}

// Las tres de arriba no las cambia el jugador; el resto son sus respuestas de
// la inscripcion. El nivel BK va con las fijas aunque venga del formulario:
// de el salen los puntos de partida.
const FIJAS = ['bkLevel']

function filaFicha(titulo, valor, fija){
  const fila = document.createElement('div')
  fila.className = 'ficha__fila' + (fija ? ' ficha__fila--fija' : '')
  const et = document.createElement('span')
  et.className = 'ficha__et'
  et.innerText = titulo
  const val = document.createElement('span')
  val.className = 'ficha__val'
  val.innerText = valor === null || valor === undefined ? '—' : String(valor)
  if(fija){
    const candado = document.createElement('span')
    candado.className = 'ms ms--sm notranslate'
    candado.setAttribute('translate', 'no')
    candado.setAttribute('aria-hidden', 'true')
    candado.innerText = 'lock'
    val.appendChild(candado)
  }
  fila.appendChild(et)
  fila.appendChild(val)
  return fila
}

// innerText y createElement en vez de innerHTML: aqui entra el nombre y el
// telefono que escribio una persona.
function pintarFicha(c){
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
    caja.appendChild(filaFicha(campo.titulo, campo.valor, FIJAS.includes(campo.campo)))
  }
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
    texto('pLadoPie', 'Guardado.')
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
  texto(id + 'Dato', sufijo === '%' ? dato.porcentaje + '% juntos' : dato.veces + ' partidos')
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

// Cinco estrellas: llena, media o vacia segun la nota. La media se dibuja con
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

function medidor(barraId, valorId, sobreCinco){
  const barra = $(barraId)
  if(barra) barra.style.width = Math.round((sobreCinco / 5) * 100) + '%'
  texto(valorId, coma(sobreCinco))
}

// La nota no se vota: la calcula el servidor con el buen rollo y la
// fiabilidad (api/perfil.js). Aqui solo se pinta, con sus dos partes a la
// vista para que se entienda de donde sale.
function pintarValoracion(v){
  ver('pSinVotos', v.estrellas === null)
  ver('pConVotos', v.estrellas !== null)
  if(v.estrellas !== null){
    pintarEstrellas(v.estrellas)
    texto('pNota', coma(v.estrellas))
    texto('pVotos', v.votos + (v.votos === 1 ? ' valoración' : ' valoraciones'))
    medidor('pBarraRollo', 'pValorRollo', v.buenRollo)
    medidor('pBarraFiab', 'pValorFiab', v.fiabilidad)
    texto('pComoSeCalcula', v.fiabilidad >= 4
      ? 'Con tantos partidos y valoraciones, tu nota ya se mueve en todo el rango.'
      : 'Las notas parten de 3 y se separan según se sabe más de ti: juega y pide que te valoren.')
  }
  texto('pNivel', v.nivelVotos ? NIVEL[signo(v.nivelNeto)] : 'Sin votos')
  texto('pPendientes', v.pendientes
    ? 'Te faltan ' + v.pendientes + (v.pendientes === 1 ? ' valoración' : ' valoraciones') + ' de partidos recientes'
    : 'No tienes valoraciones pendientes')
  ver('pValorar', v.pendientes > 0)
}

/* ---------------------------------------------------- disponibilidad -- */

const DIAS = ['L','M','X','J','V','S','D']

const pad = (n) => String(n).padStart(2, '0')

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
    // Cada dia lleva a su pagina de votacion: /day?date=AAAA-MM-DD.
    const celda = document.createElement('a')
    celda.className = 'semana__celda' + (si ? ' semana__celda--si' : '')
    celda.href = '/day?date=' + iso
    celda.innerText = si ? '✓' : '·'
    celda.title = (si ? 'Votado el ' : 'Votar el ') + iso
    col.appendChild(et)
    col.appendChild(celda)
    caja.appendChild(col)
  }
  const votar = $('pVotar')
  if(votar) votar.href = '/day?date=' + (primeroSinVotar || (d.dias[0] && d.dias[0].dia))
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

async function pintarPerfil(){
  let datos = null
  try{
    datos = await window.vtCargando.mientras(pedirPerfil, 'Cargando tu perfil')
  }catch(err){
    console.error('perfil', err)
    ver('pErrorPerfil', true)
    return
  }
  pintarCuenta(datos.cuenta)
  pintarFicha(datos.cuenta)
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
}

window.pintarPerfil = pintarPerfil

})()
