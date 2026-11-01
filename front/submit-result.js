// Lo que pinta /submit-result.
//
// Hasta el 2026-11-01 estas lineas vivian dentro de submit-result.html. Salen
// aqui sin tocar una coma; el <script> de la pagina las carga en el mismo
// sitio y sin defer, para que el orden de ejecucion no cambie.

function formatToday(){
  const d=new Date();
  const day=String(d.getDate()).padStart(2,'0');
  const month=String(d.getMonth()+1).padStart(2,'0');
  const year=d.getFullYear();
  return `${day}/${month}/${year}`;
}
function isoToday(){
  const d=new Date();
  const day=String(d.getDate()).padStart(2,'0');
  const month=String(d.getMonth()+1).padStart(2,'0');
  const year=d.getFullYear();
  return `${year}-${month}-${day}`;
}
// set native date input to today (ISO format) so browsers show calendar picker
document.getElementById('date').value = isoToday();

// normalize value from date input (YYYY-MM-DD) to DD/MM/YYYY for validation/payload
function normalizeDateInput(val){
  if(/^\d{4}-\d{2}-\d{2}$/.test(val)){
    const [y,m,d] = val.split('-')
    return `${d}/${m}/${y}`
  }
  return val
}

function isNonNegativeIntegerString(s){ return /^\d+$/.test(String(s).trim()) }
function isValidDateDDMMYYYY(str){ if(!/^\d{2}\/\d{2}\/\d{4}$/.test(str)) return false; const parts=str.split('/'); const d=new Date(parseInt(parts[2],10), parseInt(parts[1],10)-1, parseInt(parts[0],10)); return d && d.getFullYear()==parseInt(parts[2],10) && d.getMonth()==parseInt(parts[1],10)-1 && d.getDate()==parseInt(parts[0],10) }

let submitInFlight = false

function mostrarAviso(texto){
  document.getElementById('avisoTexto').innerText = texto
  const caja = document.getElementById('aviso')
  caja.classList.add('visible')
  caja.scrollIntoView({behavior:'smooth', block:'center'})
}
function limpiarAviso(){ document.getElementById('aviso').classList.remove('visible') }

// Un set no pasa de 7 juegos, asi que en la casilla no entra un 8. El tope
// sube solo en el tercer set cuando esta marcado el super tie-break, que no
// tiene techo. El API vuelve a mirarlo todo: esto es para no llegar hasta alli.
const TOPE_JUEGOS = 7
const TOPE_TIEBREAK = 99

function esTercerSet(id){ return id === 's13' || id === 's23' }

function topeDeCasilla(id){
  const stb = document.getElementById('stb')
  return (esTercerSet(id) && stb && stb.checked) ? TOPE_TIEBREAK : TOPE_JUEGOS
}

// La pista del super tie-break solo vale en el tercero; en el set 1 confunde.
function porQueNoCabe(id, tope){
  if(tope === TOPE_TIEBREAK) return 'Un super tie-break no llega a 100 puntos.'
  const base = 'Un set no pasa de 7 juegos: a 6-6 se juega el tie-break.'
  return esTercerSet(id) ? base + ' Si el tercero fue un super tie-break, marca su casilla.' : base
}

function vigilarCasilla(el){
  el.addEventListener('input', () => {
    const limpio = el.value.replace(/\D/g, '').replace(/^0+(?=\d)/, '')
    if(limpio === ''){ el.value = ''; el.dataset.ultimo = ''; return }
    const tope = topeDeCasilla(el.id)
    if(parseInt(limpio, 10) > tope){
      el.value = el.dataset.ultimo || ''
      mostrarAviso(porQueNoCabe(el.id, tope))
      return
    }
    el.value = limpio
    el.dataset.ultimo = limpio
    limpiarAviso()
  })
}

// Al quitar el super tie-break, un 10-8 ya escrito deja de valer.
function vigilarMarcador(){
  for(const id of ['s11','s12','s13','s21','s22','s23']) vigilarCasilla(document.getElementById(id))
  document.getElementById('stb').addEventListener('change', () => {
    for(const id of ['s13','s23']){
      const el = document.getElementById(id)
      if(el.value !== '' && parseInt(el.value, 10) > topeDeCasilla(id)){
        el.value = ''
        el.dataset.ultimo = ''
        mostrarAviso('El set 3 se queda en blanco: sin super tie-break no pasa de 7 juegos.')
      }
    }
  })
}
vigilarMarcador()

async function submitResult(){
  if (submitInFlight) return
  limpiarAviso()

  // basic required
  const required = ['p1a','p1b','p2a','p2b','s11','s21']
  for(const id of required){ const el=document.getElementById(id); if(!el || !el.value.trim()){ mostrarAviso('Faltan campos por rellenar: los cuatro jugadores y el primer set.'); el && el.focus(); return } }

  const rawDate = document.getElementById('date').value.trim();
  const dateVal = normalizeDateInput(rawDate)
  if(!isValidDateDDMMYYYY(dateVal)){ mostrarAviso('La fecha no vale. Tiene que ser DD/MM/AAAA.'); return }

  const setIds = ['s11','s12','s13','s21','s22','s23']
  for(const id of setIds){ const v=document.getElementById(id).value.trim(); if(v!=='' && !isNonNegativeIntegerString(v)){ mostrarAviso('Los juegos se escriben con números enteros.'); document.getElementById(id).focus(); return } }

  // ensure names unique across both teams
  const names = ['p1a','p1b','p2a','p2b'].map(id=>document.getElementById(id).value.trim())
  const set = new Set(); for(const n of names){ if(set.has(n)){ mostrarAviso('Hay un jugador repetido: cada uno juega en una sola pareja.'); return } set.add(n) }

  const payload = {
    date: dateVal,
    p1a: names[0], p1b: names[1], p2a: names[2], p2b: names[3],
    s11: document.getElementById('s11').value.trim(), s12: document.getElementById('s12').value.trim(), s13: document.getElementById('s13').value.trim(),
    s21: document.getElementById('s21').value.trim(), s22: document.getElementById('s22').value.trim(), s23: document.getElementById('s23').value.trim()
  }

  // include format when set 3 is a super tie-break
  const stbEl = document.getElementById('stb')
  if(stbEl && stbEl.checked){ payload.format = 'bo3_stb' }

  const saveButton = document.querySelector('.btn.warn')
  if (saveButton) {
    saveButton.disabled = true
    saveButton.textContent = 'Guardando...'
  }

  submitInFlight = true

  try{
    const res = await fetch('/api/write?action=submitResult',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)})
    const json = await res.json().catch(() => ({}))
    // El API rechaza los partidos a medias y dice por que; el motivo se enseña
    // tal cual, que para eso lo escribe.
    if(json && json.error === 'invalid_score'){ mostrarAviso(json.message || 'El partido no está terminado.'); return }
    if(json && json.error === 'bad_match'){ mostrarAviso(json.message); return }
    if(!res.ok || !json.ok){ throw new Error('save_failed') }
    window.vtToast('Resultado guardado')
    // El toast vive en la pagina que se abandona: 1200 ms es lo que tarda en
    // leerse (180 ms de entrada incluidos) antes de que el navegador cambie.
    setTimeout(() => { window.location='/' }, 1200)
  }catch(e){ console.error(e); mostrarAviso('No se pudo guardar. Mira la conexión y vuelve a intentarlo.') } finally {
    submitInFlight = false
    if(saveButton){
      saveButton.disabled = false
      saveButton.textContent = 'Guardar resultado'
    }
  }
}

// load names into selects
async function loadNamesIntoSelects(){
  const isLocal = location.hostname==='localhost' || location.hostname==='127.0.0.1'
  try{
    const res = await fetch('/api/read?action=getNames')
    const db = await res.json()
    const names = (db && db.names) ? (db.names.slice().sort((a,b)=>a.toLowerCase().localeCompare(b.toLowerCase()))) : []
    const ids = ['p1a','p1b','p2a','p2b']
    for(const id of ids){ const sel=document.getElementById(id); if(!sel) continue; sel.innerHTML=''; const empty=document.createElement('option'); empty.value=''; empty.innerText='-- Nombre --'; sel.appendChild(empty); for(const n of names){ const opt=document.createElement('option'); opt.value=n; opt.innerText=n; sel.appendChild(opt) } }
    // Con sesion abierta, el primer hueco ya viene con tu nombre. Va aqui y no
    // en auth-client.js porque los <select> acaban de rellenarse.
    // auth-client.js lleva defer: si el fetch volvio antes que el, se espera.
    const poner = () => window.vtPreseleccionarJugador && window.vtPreseleccionarJugador('p1a')
    if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', poner); else poner()
  }catch(e){ console.error('Could not load names',e) }
}
vtCargando.arranque(loadNamesIntoSelects, 'Cargando los jugadores')

