// Lo que pinta /day.
//
// Hasta el 2026-11-01 estas lineas vivian dentro de day.html. Salen
// aqui sin tocar una coma; el <script> de la pagina las carga en el mismo
// sitio y sin defer, para que el orden de ejecucion no cambie.

const params = new URLSearchParams(window.location.search)
const date = params.get("date")

const selectedDate = new Date(date)
const today = new Date()

const diffTime = selectedDate - today
const diffDays = diffTime / (1000 * 60 * 60 * 24)

if(diffDays < 2){
  document.getElementById("warning").style.display = "block"
}

const readonly = params.get("readonly") === "1"

// El dia de la semana por delante: se llega aqui desde el calendario del
// perfil o desde un enlace del grupo, y lo que uno comprueba es si es el
// sabado o el martes, no el numero. La fecha sigue, en pequeno, porque
// «Sabado» a secas no distingue dos sabados.
const parts = date.split("-")
const formatted = `${parts[2]}/${parts[1]}/${parts[0]}`
const DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
// Con los numeros del texto y no con el Date de arriba: `new Date("2026-10-31")`
// es medianoche UTC, que en invierno cae en el dia anterior aqui.
const diaDeLaSemana = DIAS_SEMANA[new Date(+parts[0], +parts[1] - 1, +parts[2]).getDay()]
document.getElementById("title").innerText = diaDeLaSemana
document.getElementById("fecha").innerText = formatted

const slotsDiv = document.getElementById("slots")
const slots = []

// Lo que hay guardado para este dia: hora -> nombres. Se queda aqui para
// poder volver a marcar las horas propias cuando se sabe quien eres.
let votos = {}

for(let h=9; h<=21; h++){
  const time = `${h}:00`
  slots.push(time)
  const div = document.createElement("div")
  div.className = "slot"
  div.dataset.time = time
  div.innerText = time
  if(!readonly){
    div.onclick = ()=> div.classList.toggle("selected")
  }
  slotsDiv.appendChild(div)
}

// Las horas que uno ya tiene votadas salen marcadas. Hace falta saber
// quien eres, asi que se llama otra vez cuando el <select> de nombres se
// rellena y cada vez que cambia.
function marcarMias(){
  const yo = document.getElementById('name').value
  if(readonly) return
  document.querySelectorAll('.slot').forEach(el=>{
    const mias = votos[el.dataset.time] || []
    el.classList.toggle('selected', !!yo && mias.includes(yo))
  })
}

async function loadSlots(){
  const res = await fetch(`/api/read?action=getSlots&date=${date}`)
  const data = await res.json()
  votos = data
  document.querySelectorAll(".slot").forEach(el=>{
    const t = el.dataset.time
    // El numero entre parentesis era cuanta gente habia votado esa hora, y
    // no lo decia en ninguna parte: aqui se viene a marcar las horas propias
    // y para ver los votos esta «Ver votos». En solo lectura, la hora que no
    // vota nadie no se ensena, que es para lo que sigue haciendo falta.
    const count = data[t]?.length || 0
    if(count===0 && readonly) el.style.display="none"
  })
  marcarMias()
}

async function submitVote(){

  const name = document.getElementById("name").value

  const selected = [...document.querySelectorAll(".selected")]
      .map(e=>e.dataset.time)

  // Sin Content-Type el cuerpo sale como text/plain: Vercel lo deja pasar,
  // pero el servidor local no lo lee y el voto se perdia sin aviso.
  const res = await fetch("/api/write?action=submitVote",{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({
      date,
      name,
      slots:selected
    })
  })
  if(!res.ok){
    alert(res.status === 403 ? "Solo puedes apuntar tu propia disponibilidad." : "No se pudo guardar. Elige tu nombre y vuelve a intentarlo.")
    return
  }

  // Sin recargar ni desmarcar nada: se vuelve a leer lo guardado y
  // `marcarMias` deja marcadas las horas que acaban de grabarse. Antes se
  // recargaba la pagina y volvia en blanco, que parece que no se guardo.
  await loadSlots()
  window.vtToast('Disponibilidad guardada')

}

// A donde se vuelve: lo dice quien trajo aqui, con ?volver=. Solo rutas de
// este sitio —una que empiece por // o por http seria un redirect abierto—,
// la misma regla que `destino()` en cuenta.html. Sin ese parametro, a la
// portada, que es de donde se llega desde el enlace del grupo.
function goBack(){
  const v = params.get("volver") || "/"
  window.location = (v.startsWith("/") && !v.startsWith("//")) ? v : "/"
}

vtCargando.arranque(loadSlots, 'Cargando el día')

// populate name select from registered names
async function loadNames(){
  const isLocal = location.hostname==="localhost" || location.hostname==="127.0.0.1"
  try{
    const res = await fetch("/api/read?action=getNames")
    const db = await res.json()
    const names = (db && db.names)
      ? db.names.slice().sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
      : []
    const sel = document.getElementById('name')
    sel.innerHTML = ''
    const empty = document.createElement('option')
    empty.value = ''
    empty.innerText = '-- Selecciona tu nombre --'
    sel.appendChild(empty)
    for(const n of names){
      const o = document.createElement('option')
      o.value = n
      o.innerText = n
      sel.appendChild(o)
    }
    // Con sesion abierta, tu nombre ya viene puesto. Va aqui y no en
    // auth-client.js porque el <select> acaba de rellenarse: antes no habia
    // ninguna <option> que elegir.
    // auth-client.js lleva defer, asi que normalmente ya ha corrido cuando el
    // fetch vuelve; si no, se espera, que los diferidos corren antes de
    // DOMContentLoaded.
    const poner = () => {
      if(window.vtPreseleccionarJugador) window.vtPreseleccionarJugador(sel)
      marcarMias()
    }
    if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', poner); else poner()
    sel.addEventListener('change', marcarMias)
  }catch(e){
    console.error('Could not load names',e)
  }
}

vtCargando.arranque(loadNames, 'Cargando el día')
