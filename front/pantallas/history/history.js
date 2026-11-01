// Lo que pinta /history.
//
// Hasta el 2026-11-01 estas lineas vivian dentro de history.html. Salen
// aqui sin tocar una coma; el <script> de la pagina las carga en el mismo
// sitio y sin defer, para que el orden de ejecucion no cambie.

const monthsNames = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

let parsedMatches = []
let lastFiltered = []
let isAdmin = false
// Desde el 2026-10-17 los cuatro jugadores de un partido pueden editarlo sin
// entrar en Administración; borrar sigue siendo solo de admin. El API lo
// comprueba igual (write.js, updateExistingMatch).
let miNombre = ''
const juegaEn = (m) => !!miNombre && [m.p1a, m.p1b, m.p2a, m.p2b].includes(miNombre)
// Partidos propios de los ultimos 14 dias que aun se pueden valorar, por su
// id (getResults lo manda desde el 2026-10-17; antes era por fecha y
// jugadores, y una revancha del mismo dia se confundia). Llevan un boton
// «Valorar» que entra a /valorar con lo ya elegido marcado.
const valorables = new Set()
function anadirValorar(td, m){
  const id = m.id
  if(!valorables.has(id)) return
  const b = document.createElement('button')
  b.className = 'small-btn'
  b.style.marginLeft = '6px'
  b.innerText = 'Valorar'
  // Con ?volver=: el «Atrás» de /valorar vuelve aqui, no a la portada.
  b.addEventListener('click', ()=>{ location.href = '/valorar?partido=' + id + '&volver=%2Fhistory' })
  td.appendChild(b)
}
async function cargarValorables(){
  try{
    const res = await fetch('/api/avisos?action=pendientes')
    const json = await res.json()
    ;(json.partidos || []).forEach(p => valorables.add(p.id))
  }catch(e){ console.warn('Sin partidos para valorar', e) }
}
document.addEventListener('DOMContentLoaded', ()=>{
  window.vtMe.then(async me=>{
    miNombre = (me && me.playerName) || ''
    if(miNombre) await cargarValorables()
    if(miNombre && lastFiltered.length) renderTable(lastFiltered)
  })
})

function parseMatches(raw){
  return (raw || []).map(m=>{
    const parts = (m.date||'').split('/')
    const d = new Date(parseInt(parts[2]||0,10), (parseInt(parts[1]||0,10)-1), parseInt(parts[0]||0,10))
    return Object.assign({}, m, {__date:d})
  }).filter(x=>x.__date && !isNaN(x.__date.getTime()))
}

async function loadData(){
  const isLocal = location.hostname==='localhost' || location.hostname==='127.0.0.1'
  let db = {matches:[]}
  try{
    const url = `/api/read?action=getResults&eventType=ranked,legacy&ts=${Date.now()}`
    const res = await fetch(url)
    db = await res.json()
  }catch(e){ console.error('Could not load results',e) }

  parsedMatches = parseMatches(db.matches || [])
  setupSelectors(parsedMatches)
  await loadPlayerNames()
  applyFilter()
}

function setupSelectors(matches){
  const years = [...new Set(matches.map(m=>m.__date.getFullYear()))].sort((a,b)=>b-a)
  const yearSel = document.getElementById('year')
  yearSel.innerHTML = ''
  if(years.length===0){ const y=new Date().getFullYear(); years.push(y) }
  years.forEach(y=>{ const opt=document.createElement('option'); opt.value=y; opt.innerText=y; yearSel.appendChild(opt) })

  const monthSel = document.getElementById('month')
  monthSel.innerHTML=''
  monthsNames.forEach((name,i)=>{ const opt=document.createElement('option'); opt.value=(i+1); opt.innerText=name; monthSel.appendChild(opt) })

  // default to current month/year
  const now = new Date()
  if(years.includes(now.getFullYear())) yearSel.value = now.getFullYear()
  monthSel.value = now.getMonth()+1
}

async function loadPlayerNames(){
  try{
    const res = await fetch('/api/read?action=getNames&ts=' + Date.now())
    const j = await res.json()
    const sel = document.getElementById('player')
    sel.innerHTML = ''
    const opt = document.createElement('option')
    opt.value = ''
    opt.innerText = 'Todos'
    sel.appendChild(opt)
    ;(j.names || []).forEach(n=>{ const o=document.createElement('option'); o.value = n; o.innerText = n; sel.appendChild(o) })
  }catch(e){ console.error('Could not load player names', e) }
}

function applyFilter(){
  const y = parseInt(document.getElementById('year').value,10)
  const m = parseInt(document.getElementById('month').value,10)
  const player = (document.getElementById('player').value || '').trim().toLowerCase()

  let filtered = parsedMatches.filter(x=> x.__date.getFullYear()===y && (x.__date.getMonth()+1)===m )

  if(player){
    filtered = filtered.filter(x=>{
      return [x.p1a,x.p1b,x.p2a,x.p2b].some(n=> (n||'').toLowerCase().includes(player))
    })
  }

  filtered = filtered.sort((a,b)=>a.__date-b.__date)

  const summary = document.getElementById('summary')
  summary.innerText = `Resultados: ${filtered.length}`

  lastFiltered = filtered

  renderTable(filtered)
}

function renderTable(matches){
  const container = document.getElementById('tableContainer')
  if(matches.length===0){ container.innerHTML = '<div class="muted">No hay resultados para los filtros introducidos</div>'; return }

  const table = document.createElement('table')
  const thead = document.createElement('thead')
  thead.innerHTML = '<tr><th><span class="th-full">Fecha</span><span class="th-day">Día</span></th><th>Jugadores</th><th><span class="th-full-res">Marcador</span></th>' + (isAdmin || matches.some(juegaEn) ? '<th>Acciones</th>' : '') + '</tr>'
  table.appendChild(thead)

  const tbody = document.createElement('tbody')

  matches.forEach(m=>{
    const tr = document.createElement('tr')
    const tdDate = document.createElement('td')
    const spanFull = document.createElement('span')
    spanFull.className = 'date-full'
    spanFull.innerText = m.date
    const spanDay = document.createElement('span')
    spanDay.className = 'date-day'
    spanDay.innerText = (m.__date && !isNaN(m.__date.getTime())) ? String(m.__date.getDate()) : m.date
    tdDate.appendChild(spanFull)
    tdDate.appendChild(spanDay)

    const tdPlayers = document.createElement('td')

    // compute set wins
    let team1Sets = 0
    let team2Sets = 0
    for(let i=1;i<=3;i++){
      const aRaw = m['s1'+i]
      const bRaw = m['s2'+i]
      const a = (aRaw!==undefined && aRaw!=='') ? parseInt(aRaw,10) : NaN
      const b = (bRaw!==undefined && bRaw!=='') ? parseInt(bRaw,10) : NaN
      if(!isNaN(a) && !isNaN(b)){
        if(a>b) team1Sets++
        else if(b>a) team2Sets++
      }
    }

    let resultType = 'tie'
    if(team1Sets>=2 && team1Sets>team2Sets) resultType = 'team1'
    else if(team2Sets>=2 && team2Sets>team1Sets) resultType = 'team2'

    function makeTag(name, team){
      const span = document.createElement('span')
      span.className = 'tag'
      if(resultType==='tie') span.classList.add('tie')
      else if(resultType==='team1' && team===1) span.classList.add('win')
      else if(resultType==='team2' && team===2) span.classList.add('win')
      else span.classList.add('lose')
      span.innerText = name
      return span
    }

    // Desktop: individual tags and VS
    const p1aTag = makeTag(m.p1a || '',1); p1aTag.classList.add('desktop-only')
    const p1bTag = makeTag(m.p1b || '',1); p1bTag.classList.add('desktop-only')
    const vs = document.createElement('strong'); vs.className = 'desktop-only'; vs.style.margin = '0 8px'; vs.innerText = 'VS'
    const p2aTag = makeTag(m.p2a || '',2); p2aTag.classList.add('desktop-only')
    const p2bTag = makeTag(m.p2b || '',2); p2bTag.classList.add('desktop-only')
    tdPlayers.appendChild(p1aTag)
    tdPlayers.appendChild(p1bTag)
    tdPlayers.appendChild(vs)
    tdPlayers.appendChild(p2aTag)
    tdPlayers.appendChild(p2bTag)

    // Mobile: single tag per pair with slash, stacked
    const mobileTeam1 = document.createElement('span')
    mobileTeam1.className = 'tag mobile-only'
    mobileTeam1.innerText = `${(m.p1a||'').trim()} / ${(m.p1b||'').trim()}`
    const mobileTeam2 = document.createElement('span')
    mobileTeam2.className = 'tag mobile-only'
    mobileTeam2.innerText = `${(m.p2a||'').trim()} / ${(m.p2b||'').trim()}`
    // color mobile pair tags by result
    if(resultType==='team1'){
      mobileTeam1.classList.add('win')
      mobileTeam2.classList.add('lose')
    }else if(resultType==='team2'){
      mobileTeam1.classList.add('lose')
      mobileTeam2.classList.add('win')
    }else{
      mobileTeam1.classList.add('tie')
      mobileTeam2.classList.add('tie')
    }
    tdPlayers.appendChild(mobileTeam1)
    tdPlayers.appendChild(mobileTeam2)

    const sets = []
    for(let i=1;i<=3;i++){
      const a = m['s1'+i] || ''
      const b = m['s2'+i] || ''
      if(a === '' && b === '') continue
      const score = String(a) + '-' + String(b)
      const display = (String(m.format) === 'bo3_stb' && i === 3) ? `[${score}]` : score
      sets.push(display)
    }
    const tdScore = document.createElement('td')
    const list = document.createElement('div')
    list.className = 'set-list'
    sets.forEach(s=>{
      const it = document.createElement('span')
      it.className = 'set-item'
      it.innerText = String(s).replace(/-/g, '\u2011')
      list.appendChild(it)
    })
    tdScore.appendChild(list)

    tr.appendChild(tdDate)
    tr.appendChild(tdPlayers)
    tr.appendChild(tdScore)

    if(isAdmin || juegaEn(m)){
      const tdAct = document.createElement('td')
      const editBtn = document.createElement('button')
      editBtn.className = 'small-btn'
      editBtn.innerText = 'Editar'
      editBtn.addEventListener('click',()=> startEditRow(tr,m))

      const delBtn = document.createElement('button')
      delBtn.className = 'small-btn'
      delBtn.style.marginLeft='6px'
      delBtn.innerText = 'Eliminar'
      delBtn.addEventListener('click',()=> deleteMatch(m))

      tdAct.appendChild(editBtn); anadirValorar(tdAct, m)
      tdAct.appendChild(delBtn)
      tr.appendChild(tdAct)
    }

    tbody.appendChild(tr)
  })

  table.appendChild(tbody)
  container.innerHTML = ''
  container.appendChild(table)
}

// also apply filter when selectors change or player selection changes
document.getElementById('year').addEventListener('change', applyFilter)
document.getElementById('month').addEventListener('change', applyFilter)
document.getElementById('player').addEventListener('change', applyFilter)

vtCargando.arranque(loadData, 'Cargando el historial')

function toggleAdmin(on){
  isAdmin = !!on
  const panel = document.getElementById('adminPanel')
  if(panel) panel.style.display = isAdmin ? 'block' : 'none'
  const btn = document.getElementById('adminBtn')
  if(btn) btn.innerText = isAdmin ? 'Salir admin' : 'Administración'
  renderTable(lastFiltered)
}

// Admin handling
document.getElementById('adminBtn').addEventListener('click', ()=>{
  if(isAdmin){
    toggleAdmin(false)
    return
  }
  window.vtMe.then(me=>{
    if(me && me.role === 'admin') toggleAdmin(true)
    else alert('Solo para administradores')
  })
})

document.getElementById('adminAddBtn').addEventListener('click', async ()=>{
  const payload = {
    date: document.getElementById('a_date').value.trim(),
    p1a: document.getElementById('a_p1a').value.trim(),
    p1b: document.getElementById('a_p1b').value.trim(),
    p2a: document.getElementById('a_p2a').value.trim(),
    p2b: document.getElementById('a_p2b').value.trim(),
    s11: document.getElementById('a_s11').value.trim(),
    s21: document.getElementById('a_s21').value.trim(),
    s12: document.getElementById('a_s12').value.trim(),
    s22: document.getElementById('a_s22').value.trim(),
    s13: document.getElementById('a_s13').value.trim(),
    s23: document.getElementById('a_s23').value.trim()
  }

  if (document.getElementById('a_stb')?.checked) {
    payload.format = 'bo3_stb'
  }

  try {
    const res = await fetch('/api/write?action=submitResult', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    if(!(await saved(res))) return
    loadData()
  } catch (e) {
    console.error(e)
    alert('Error al agregar')
  }
})

// El API rechaza los partidos a medias con el motivo escrito; sin esto la
// pagina recargaba la tabla como si se hubiera guardado.
async function saved(res){
  const json = await res.json().catch(()=>({}))
  if(json && json.error === 'invalid_score'){ alert(json.message || 'El partido no está terminado'); return false }
  if(json && (json.error === 'forbidden' || json.error === 'bad_match')){ alert(json.message); return false }
  if(json && json.error === 'conflict'){ alert(json.message); loadData(); return false }
  if(!res.ok || !json.ok){ alert('Error al guardar'); return false }
  window.vtToast('Resultado guardado')
  return true
}

async function deleteMatch(m){
  if(!confirm('¿Eliminar este partido?')) return
  try{
    const res = await fetch('/api/write?action=deleteResult',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:m.id,date:m.date,p1a:m.p1a,p1b:m.p1b,p2a:m.p2a,p2b:m.p2b})})
    if(!res.ok){ const j = await res.json().catch(()=>({})); alert(j.message || 'No se pudo eliminar') }
    loadData()
  }catch(e){ console.error(e); alert('Error al eliminar') }
}

// Descargar Excel de resultados (botón central); el .xlsx lo hace excel-export.js
document.getElementById('downloadBtn').addEventListener('click', ()=>{
  downloadCSV()
})

async function downloadCSV(){
  const res = await fetch("/api/read?action=getResults")
  const db = await res.json()

  if(!db.matches || db.matches.length===0){
    alert("No hay resultados")
    return
  }

  function parseDateStr(s){
    if(!s) return new Date(0)
    if(/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(s)
    const parts = String(s).split('/')
    if(parts.length===3){
      const d = parseInt(parts[0],10)||1
      const m = (parseInt(parts[1],10)||1)-1
      const y = parseInt(parts[2],10)||0
      return new Date(y,m,d)
    }
    return new Date(s)
  }

  const matches = (db.matches || []).slice().sort((a,b)=> parseDateStr(a.date) - parseDateStr(b.date))

  const header = [
    "fecha",
    "equipo1_jugA","equipo1_jugB",
    "equipo2_jugA","equipo2_jugB",
    "equipo1_set1","equipo2_set1",
    "equipo1_set2","equipo2_set2",
    "equipo1_set3","equipo2_set3",
    "formato"
  ]

  const rows = matches.map(m=>[
    m.date,
    m.p1a,m.p1b,
    m.p2a,m.p2b,
    m.s11,m.s21,
    m.s12||"",m.s22||"",
    m.s13||"",m.s23||""
  ].map(r => r)
  )

  // append formato column value per match
  const rowsWithFormat = matches.map(m=>[
    m.date,
    m.p1a,m.p1b,
    m.p2a,m.p2b,
    m.s11,m.s21,
    m.s12||"",m.s22||"",
    m.s13||"",m.s23||"",
    m.format || ''
  ])

  // Los juegos llegan como texto; en Excel van como numero para poder sumarlos.
  function comoNumero(v){ return /^\d+$/.test(String(v)) ? Number(v) : v }
  vtExcel.descargar('resultados.xlsx', 'Resultados', [header, ...rowsWithFormat.map(r => r.map(comoNumero))])
}


function startEditRow(tr,m){
  // replace row with editable inputs
  tr.innerHTML = ''

  const tdDate = document.createElement('td')
  const inDate = document.createElement('input')
  inDate.value = m.date || ''
  inDate.className = 'select'
  tdDate.appendChild(inDate)

  const tdPlayers = document.createElement('td')
  const inP1a = document.createElement('input'); inP1a.className='select'; inP1a.value=m.p1a||''
  const inP1b = document.createElement('input'); inP1b.className='select'; inP1b.value=m.p1b||''
  const inP2a = document.createElement('input'); inP2a.className='select'; inP2a.value=m.p2a||''
  const inP2b = document.createElement('input'); inP2b.className='select'; inP2b.value=m.p2b||''
  tdPlayers.appendChild(inP1a); tdPlayers.appendChild(inP1b); tdPlayers.appendChild(document.createElement('br'))
  tdPlayers.appendChild(inP2a); tdPlayers.appendChild(inP2b)

  const tdScore = document.createElement('td')
  const inS11=document.createElement('input'); inS11.className='select'; inS11.value = m.s11||''
  const inS21=document.createElement('input'); inS21.className='select'; inS21.value = m.s21||''
  const inS12=document.createElement('input'); inS12.className='select'; inS12.value = m.s12||''
  const inS22=document.createElement('input'); inS22.className='select'; inS22.value = m.s22||''
  const inS13=document.createElement('input'); inS13.className='select'; inS13.value = m.s13||''
  const inS23=document.createElement('input'); inS23.className='select'; inS23.value = m.s23||''
  const scoreWrap=document.createElement('div')
  scoreWrap.style.display='grid'
  scoreWrap.style.gridTemplateColumns='repeat(3,1fr)'
  scoreWrap.style.gap='6px'
  scoreWrap.appendChild(inS11); scoreWrap.appendChild(inS12); scoreWrap.appendChild(inS13)
  scoreWrap.appendChild(inS21); scoreWrap.appendChild(inS22); scoreWrap.appendChild(inS23)
  tdScore.appendChild(scoreWrap)

  const tdAct = document.createElement('td')
  const saveBtn = document.createElement('button'); saveBtn.className='btn'; saveBtn.innerText='Guardar'
  const cancelBtn = document.createElement('button'); cancelBtn.className='small-btn'; cancelBtn.innerText='Cancelar'

  saveBtn.addEventListener('click', async ()=>{
    const payload = {
      date: inDate.value.trim(),
      p1a: inP1a.value.trim(), p1b: inP1b.value.trim(), p2a: inP2a.value.trim(), p2b: inP2b.value.trim(),
      s11: inS11.value.trim(), s12: inS12.value.trim(), s13: inS13.value.trim(),
      s21: inS21.value.trim(), s22: inS22.value.trim(), s23: inS23.value.trim(),
      format: m.format, _original: { id: m.id, date: m.date, p1a: m.p1a, p1b: m.p1b, p2a: m.p2a, p2b: m.p2b }
    }
    try{
      const res = await fetch('/api/write?action=submitResult',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)})
      if(!(await saved(res))) return
      loadData()
    }catch(e){ console.error(e); alert('Error al guardar') }
  })

  cancelBtn.addEventListener('click', ()=>{
    renderTable(lastFiltered)
  })

  tdAct.appendChild(saveBtn); tdAct.appendChild(cancelBtn)

  tr.appendChild(tdDate); tr.appendChild(tdPlayers); tr.appendChild(tdScore); tr.appendChild(tdAct)
}
