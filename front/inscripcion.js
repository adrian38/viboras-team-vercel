// Lo que pinta /inscripcion.
//
// Hasta el 2026-11-01 estas lineas vivian dentro de inscripcion.html. Salen
// aqui sin tocar una coma; el <script> de la pagina las carga en el mismo
// sitio y sin defer, para que el orden de ejecucion no cambie.

// Las respuestas se guardan en este navegador (localStorage) y /cuenta las
// manda con el alta. Por eso este formulario puede vivir en su propia pestana,
// como la normativa: la pestana del alta se entera por el evento `storage`.
// No hay nada que enviar desde aqui; quien valida es el servidor al crear la
// cuenta (api/_inscripcion.js). /cuenta las borra en cuanto la cuenta existe.
//
// Detalle: ai_context/cuentas_y_sesiones.md
const CLAVE = 'vt-inscripcion'
const CAMPOS = ['fullName', 'phone', 'bkTest', 'bkLevel', 'league', 'tournaments', 'rankingPerWeek', 'availability']
const form = document.getElementById('formInscripcion')

function guardadas(){
  try{ const g = JSON.parse(localStorage.getItem(CLAVE) || 'null'); return g && g.respuestas }
  catch(e){ return null }
}

// Si ya lo rellenaron, se ve lo que pusieron para poder corregirlo.
function rellenar(r){
  if(!r) return
  for(const campo of CAMPOS){
    const el = form.elements[campo]
    if(!el || !r[campo]) continue
    if(el instanceof RadioNodeList){
      for(const opcion of el) opcion.checked = opcion.value === r[campo]
    } else {
      el.value = r[campo]
    }
  }
}

form.onsubmit = (ev) => {
  ev.preventDefault()
  const datos = new FormData(form)
  const respuestas = {}
  for(const campo of CAMPOS) respuestas[campo] = String(datos.get(campo) || '').trim()
  try{
    localStorage.setItem(CLAVE, JSON.stringify({ respuestas, guardado: Date.now() }))
  }catch(e){
    document.getElementById('error').classList.add('visible')
    return
  }
  const listo = document.getElementById('listo')
  listo.classList.add('visible')
  window.vtToast('Formulario guardado')
  listo.scrollIntoView({behavior:'smooth', block:'center'})
}

rellenar(guardadas())
