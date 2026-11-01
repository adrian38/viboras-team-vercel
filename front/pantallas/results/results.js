// Lo que pinta /results.
//
// Hasta el 2026-11-01 estas lineas vivian dentro de results.html. Salen
// aqui sin tocar una coma; el <script> de la pagina las carga en el mismo
// sitio y sin defer, para que el orden de ejecucion no cambie.


const params = new URLSearchParams(window.location.search)
const date = params.get("date")
const readonly = params.get("readonly")==="1"

const parts = date.split("-")
const formatted = `${parts[2]}/${parts[1]}/${parts[0]}`

document.getElementById("title").innerText = `Disponibilidad ${formatted}`

const container = document.getElementById("results")

let slotsData = {}

async function load(){

  const res = await fetch(`/api/read?action=getSlots&date=${date}`)
  const data = await res.json()

  slotsData = data

  for(let h=9; h<=21; h++){

    const time = `${h}:00`
    const names = data[time] || []

    if(names.length===0) continue

    const div = document.createElement("div")
    div.className = "hour"

    const title = document.createElement("div")
    title.className = "hour-title"
    title.innerText = `${time} (${names.length})`

    div.appendChild(title)

    const list = document.createElement("div")
    list.className = "names"

    names.forEach(n=>{
      const span = document.createElement("span")
      span.className = "name"
      span.innerText = n
      list.appendChild(span)
    })

    div.appendChild(list)

    container.appendChild(div)
  }
}

function goBack(){

  if(readonly){
    window.location="/"
  }else{
    // Con el `volver` que trajo day.html, para que su «Atrás» siga sabiendo
    // de donde se venia.
    const v = params.get("volver")
    window.location = `/day?date=${date}` + (v ? `&volver=${encodeURIComponent(v)}` : "")
  }
}

function toggleOrganizer(){

  const div = document.getElementById("organizer")

  if(div.style.display==="none"){

    div.style.display="block"

    div.innerHTML = `
      <div style="margin-bottom:10px">
        <label>Polideportivo</label><br>
        <select id="venue">
          <option>Polideportivo San Ignacio</option>
          <option>Polideportivo Zorroza</option>
          <option>Polideportivo Artxanda</option>
        </select>
      </div>

      <div style="margin-bottom:10px">
        <label>Hora inicio</label><br>
        <select id="start" onchange="updatePlayers()"></select>
      </div>

      <div style="margin-bottom:10px">
        <label>Hora fin</label><br>
        <select id="end" onchange="updatePlayers()"></select>
      </div>

      <div id="players" style="margin-top:15px"></div>

      <button class="share-btn" onclick="shareMatch()">Compartir partido</button>
    `

    fillHours()

  }else{

    div.style.display="none"

  }
}

function fillHours(){

  const start = document.getElementById("start")
  const end = document.getElementById("end")

  for(let h=9; h<=21; h++){

    const label = String(h).padStart(2,"0")+":00"

    start.innerHTML += `<option value="${h}">${label}</option>`
    end.innerHTML += `<option value="${h}">${label}</option>`

  }

}

function playersAvailable(start,end){

  let common=null

  for(let h=start; h<end; h++){

    const key=`${h}:00`

    const names = slotsData[key] || []

    if(common===null){
      common=[...names]
    }else{
      common=common.filter(n=>names.includes(n))
    }

  }

  return common || []

}

function updatePlayers(){

  const start=parseInt(document.getElementById("start").value)
  const end=parseInt(document.getElementById("end").value)

  if(end<=start) return

  const players=playersAvailable(start,end)

  const container=document.getElementById("players")

  container.innerHTML=""

  if(players.length<4){

    container.innerHTML = `
      <div style="margin-bottom:10px; color:var(--vt-error);">
        Atención: no hay suficientes jugadores en esta franja horaria para generar un partido completo
      </div>
    `

  }

  for(let i=1;i<=4;i++){

    const select=document.createElement("select")

    select.id="j"+i

    select.innerHTML=`<option value="">Jugador ${i}</option>`

    players.forEach(p=>{
      select.add(new Option(p, p))
    })

    select.addEventListener("change",updateDropdowns)

    container.appendChild(select)

    container.appendChild(document.createElement("br"))

  }

}

function updateDropdowns(){

  const selected=[]

  for(let i=1;i<=4;i++){

    const val=document.getElementById("j"+i).value

    if(val) selected.push(val)

  }

  for(let i=1;i<=4;i++){

    const select=document.getElementById("j"+i)

    const current=select.value

    const options=[...select.options]

    options.forEach(o=>{

      if(o.value==="" || o.value===current){

        o.hidden=false

      }else if(selected.includes(o.value)){

        o.hidden=true

      }else{

        o.hidden=false

      }

    })

  }

}

function shareMatch(){

  const start=parseInt(document.getElementById("start").value)
  const end=parseInt(document.getElementById("end").value)

  if(end<=start){
    alert("La hora fin debe ser mayor")
    return
  }

  const players=[j1.value,j2.value,j3.value,j4.value]

  const filled = players.filter(p => p !== "")
  const unique = new Set(filled)

  if(unique.size !== filled.length){
    alert("Los jugadores deben ser distintos")
    return
  }

  const venue=document.getElementById("venue").value

  const d=new Date(date)

  const weekday=d.toLocaleDateString("es-ES",{weekday:"long"})
  const day=d.getDate()
  const month=d.toLocaleDateString("es-ES",{month:"long"})

  const startStr=String(start).padStart(2,"0")+":00"
  const endStr=String(end).padStart(2,"0")+":00"

  const msg=
`🗓️${weekday} ${day} de ${month}
🕋${venue}
⏰Hora ${startStr} a ${endStr}
🎾${players[0] || ""}
🎾${players[1] || ""}
🎾${players[2] || ""}
🎾${players[3] || ""}`

  const url="https://wa.me/?text="+encodeURIComponent(msg)

  window.open(url,"_blank")

}

vtCargando.arranque(load, 'Cargando los votos del día')

