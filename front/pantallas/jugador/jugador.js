// /jugador?id=N: el perfil de otro jugador, el que se abre tocando su tarjeta
// en /comunidad. Solo lectura. Los datos salen de /api/perfil?action=jugador,
// que deja fuera todo lo personal; las tarjetas las pintan las funciones de
// /cuenta (cuenta-perfil.js y cuenta-rating.js), no una copia.
// Detalle: ai_context/perfil_publico_de_jugador.md
;(function(){

const $ = (id) => document.getElementById(id)
const LADOS = {drive: 'Drive', reves: 'Revés', ambos: 'Drive y revés'}
const params = new URLSearchParams(window.location.search)

// Solo rutas de este sitio: `//otro.com` seria un redirect abierto
// (ai_context/boton_atras_y_parametro_volver.md).
function volverA(){
  const v = params.get('volver') || ''
  return v.startsWith('/') && !v.startsWith('//') ? v : '/comunidad'
}

function iniciales(nombre){
  return String(nombre).split(/\s+/).filter(Boolean).slice(0, 2)
    .map((p) => p[0].toUpperCase()).join('')
}

function pintarIdentidad(j){
  document.title = j.nombre + ' · Viboras Team'
  $('pInicial').innerText = iniciales(j.nombre)
  $('pNombre').innerText = j.nombre
  $('pLado').innerText = LADOS[j.lado] || j.lado
  // Sin horarios en el formulario de alta no hay chip: nada de relleno.
  if(j.horarios){
    $('pHorarios').innerText = j.horarios
    $('pHorarios').classList.remove('oculto')
  }
  const aqui = '/jugador?id=' + j.id + (params.get('volver') ? '&volver=' + encodeURIComponent(params.get('volver')) : '')
  $('pEvolucion').href = '/players?player=' + encodeURIComponent(j.nombre) + '&volver=' + encodeURIComponent(aqui)
}

async function cargar(){
  $('volver').href = volverA()
  const id = params.get('id') || ''
  const res = await fetch('/api/perfil?action=jugador&id=' + encodeURIComponent(id), {headers:{accept:'application/json'}})
  const json = await res.json().catch(() => ({}))
  if(!res.ok || !json.ok){
    $('estado').innerText = json.message || 'No se pudo cargar este jugador.'
    return
  }
  pintarIdentidad(json.jugador)
  window.vtPerfil.pintarPartidos(json.partidos)
  window.vtPerfil.pintarValoracion(json.valoraciones)
  $('estado').classList.add('oculto')
  $('perfil').classList.remove('oculto')
  // Se espera, como en /cuenta: la tarjeta de rating y las estrellas tienen
  // que estar antes de quitar el velo. Si falla, sale el resto sin ella.
  await window.pintarRating(json.jugador.nombre, json.jugador.salida)
    .catch((err) => console.error('rating', err))
}

document.addEventListener('DOMContentLoaded', () => {
  vtCargando.arranque(cargar, 'Cargando el perfil')
})

})()
