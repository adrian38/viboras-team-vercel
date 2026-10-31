// La tarjeta de rating de /cuenta. Calcula el rating del jugador con el motor
// compartido (/vt-glicko.js), el mismo que usa /rating: aqui no hay ninguna
// copia del Glicko ni de la lectura de partidos.
//
// Lo que cuesta: el motor recorre el historico dia a dia, asi que sacar la
// curva de 30 dias son once pasadas. Con los partidos que tiene el grupo eso
// es despreciable, pero por si acaso la tarjeta no retrasa al resto del
// perfil: se pinta cuando esta, y hasta entonces no se ve.
;(function(){

const $ = (id) => document.getElementById(id)

// Puntos de la curva: once, uno cada tres dias. Mas no se distinguirian en
// 320 px de ancho y cada uno cuesta una pasada entera del motor.
const DIAS = 30
const PUNTOS = 11

const pad = (n) => String(n).padStart(2, '0')

function isoDeHace(dias){
  const d = new Date()
  d.setDate(d.getDate() - dias)
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
}

// El puesto se calcula aqui y no se comparte con /rating porque alli va
// pegado al pintado de la tabla. La regla es la suya: por rating de mayor a
// menor, empates por nombre, y quien empata en rating comparte puesto.
function puestoDe(entradas, nombre){
  const orden = [...entradas].sort((a, b) => {
    if(b.rating !== a.rating) return b.rating - a.rating
    return String(a.name || '').localeCompare(String(b.name || ''), 'es', {sensitivity:'base', numeric:true})
  })
  let puesto = 0
  let anterior = null
  for(let i = 0; i < orden.length; i++){
    if(anterior === null || orden[i].rating !== anterior){
      puesto = i + 1
      anterior = orden[i].rating
    }
    if(orden[i].name === nombre) return {puesto, de: orden.length}
  }
  return null
}

function pintarCurva(valores){
  const svg = $('pSpark')
  if(!svg || valores.length < 2) return
  const min = Math.min(...valores)
  const max = Math.max(...valores)
  const alto = max - min || 1
  const puntos = valores.map((v, i) => {
    const x = (i / (valores.length - 1)) * 320
    const y = 52 - ((v - min) / alto) * 44
    return x.toFixed(1) + ',' + y.toFixed(1)
  })
  svg.innerHTML = ''
  const linea = document.createElementNS('http://www.w3.org/2000/svg', 'polyline')
  linea.setAttribute('points', puntos.join(' '))
  linea.setAttribute('fill', 'none')
  linea.setAttribute('stroke', 'var(--vt-gold)')
  linea.setAttribute('stroke-width', '2.5')
  linea.setAttribute('stroke-linecap', 'round')
  linea.setAttribute('stroke-linejoin', 'round')
  svg.appendChild(linea)
  const punta = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
  const [cx, cy] = puntos[puntos.length - 1].split(',')
  punta.setAttribute('cx', cx)
  punta.setAttribute('cy', cy)
  punta.setAttribute('r', '3.5')
  punta.setAttribute('fill', 'var(--vt-gold-soft)')
  svg.appendChild(punta)
}

const coma = (n) => n.toFixed(2).replace('.', ',')

function pintar(hoy, hace30, puesto, curva, salida){
  $('pRating').innerText = coma(hoy.rating)
  $('pRatingCategoria').innerText = window.categoriaDeRating(hoy.rating)
  $('pRd').innerText = window.getFiabilidadConfig(hoy.rd).label
  $('pPuesto').innerText = puesto ? puesto.puesto + '.º de ' + puesto.de : '—'
  $('pSalida2').innerText = salida === null ? '1500' : String(Math.round(salida))
  if(hace30){
    const delta = hoy.rating - hace30.rating
    const nodo = $('pRatingMes')
    if(Math.abs(delta) >= 0.01){
      $('pRatingMesTexto').innerText = (delta > 0 ? '+' : '−') + coma(Math.abs(delta)) + ' este mes'
      nodo.classList.remove('oculto')
    }
  }
  if(curva.length){
    $('pRatingMax').innerText = 'Máx ' + coma(Math.max(...curva))
    pintarCurva(curva)
  }
  $('pTarjetaRating').classList.remove('oculto')
}

async function nombresActivos(){
  const res = await fetch('/api/read?action=getNames')
  const db = await res.json()
  return (db && db.names) ? db.names : []
}

// Una pasada del motor por cada fecha: devuelve la entrada de este jugador.
function miRating(nombres, partidos, iso, nombre){
  const todos = window.vtGlicko.calcularRatings(nombres, partidos, iso)
  return {todos, mia: todos.find((e) => e.name === nombre) || null}
}

async function pintarRating(nombre, salida){
  if(!nombre || !window.vtGlicko) return
  const [partidos, nombres] = await Promise.all([
    window.vtGlicko.leerPartidos(), nombresActivos(), window.vtNivel.listo, window.vtInicial.listo
  ])
  if(!partidos.length) return

  const hoy = miRating(nombres, partidos, isoDeHace(0), nombre)
  if(!hoy.mia) return
  const hace30 = miRating(nombres, partidos, isoDeHace(DIAS), nombre).mia

  const curva = []
  for(let i = PUNTOS - 1; i >= 0; i--){
    const dia = miRating(nombres, partidos, isoDeHace(Math.round((DIAS / (PUNTOS - 1)) * i)), nombre).mia
    if(dia) curva.push(dia.rating)
  }

  pintar(hoy.mia, hace30, puestoDe(hoy.todos, nombre), curva, salida)
}

window.pintarRating = pintarRating

})()
