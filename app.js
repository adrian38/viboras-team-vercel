const container = document.getElementById("days")

const today = new Date()
today.setHours(12,0,0,0)

function formatDate(d){
  const weekday = d.toLocaleDateString("es-ES", { weekday: "short" })
  const day = String(d.getDate()).padStart(2,"0")
  const month = String(d.getMonth()+1).padStart(2,"0")
  return `${weekday} ${day}/${month}`
}

function iso(d){
  const year = d.getFullYear()
  const month = String(d.getMonth()+1).padStart(2,"0")
  const day = String(d.getDate()).padStart(2,"0")
  return `${year}-${month}-${day}`
}

for(let i=0; i<7; i++){

  const date = new Date(today)
  date.setDate(today.getDate()+i)

  const div = document.createElement("div")
  div.className = "day"
  div.innerText = formatDate(date)

  const dateStr = iso(date)

  if(i < 3){
    div.classList.add('red')
  }

  div.onclick = () => {
    window.location = `/day?date=${dateStr}`
  }

  container.appendChild(div)
}

  // Add a global function to save a full name via Netlify function (creates names.json locally)
  async function addName(){
    const el = document.getElementById("fullname")
    if(!el) return
    const name = el.value.trim()
    if(!name){
      alert("Introduce un nombre completo")
      return
    }

    try{
      const res = await fetch("/api/submitName",{
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name })
      })

      const json = await res.json()

      if(json && json.ok){
        if(json.added){
          alert("Nombre guardado")
          el.value = ""
        } else {
          alert("Nombre ya registrado. Si no eres tu, utiliza otro nombre.")
        }
      } else {
        alert("Error al guardar el nombre")
      }

    }catch(e){
      console.error(e)
      alert("Error al guardar el nombre")
    }

  }
