// Lo que pinta /index.
//
// Hasta el 2026-11-01 estas lineas vivian dentro de index.html. Salen
// aqui sin tocar una coma; el <script> de la pagina las carga en el mismo
// sitio y sin defer, para que el orden de ejecucion no cambie.

// Administration overlay for managing registered names
async function openAdmin(){
  // Lo decide la sesion; el servidor lo vuelve a comprobar en deleteName.
  const me = await window.vtMe
  if(!me || me.role !== 'admin'){
    alert('Solo para administradores')
    return
  }

  let overlay = document.getElementById('adminOverlay')
  if(!overlay){
    overlay = document.createElement('div')
    overlay.id = 'adminOverlay'
    overlay.style.display = 'none'
    overlay.style.position = 'fixed'
    overlay.style.inset = '0'
    overlay.style.background = 'rgba(0,0,0,0.4)'
    overlay.style.alignItems = 'center'
    overlay.style.justifyContent = 'center'
    overlay.style.padding = '24px'
    overlay.innerHTML = `
      <div style="background:var(--card);max-width:640px;width:100%;border-radius:12px;padding:12px;box-shadow:0 12px 30px rgba(2,6,23,0.3);color:var(--muted);display:flex;gap:12px;justify-content:center;align-items:flex-start">
        <div id="adminMenuColumn" style="flex:0 0 260px;display:flex;flex-direction:column;gap:8px;align-items:stretch">
          <div style="font-weight:700;text-align:center;padding:8px 0">Administración</div>
          <button class="btn" style="width:100%;text-align:left" onclick="showPlayerPanel()">Nuevo jugador</button>
          <button class="btn" style="width:100%;text-align:left" onclick="vtAdminJugadores.abrir()">Jugadores</button>
          <button class="btn" style="width:100%;text-align:left" onclick="window.location='/buzon'">Buzón</button>
          <button class="btn" style="width:100%;text-align:left" onclick="showCompasPanel()">Nuevo torneo Compás</button>
          <button class="btn" style="width:100%;text-align:left" onclick="showPozoPanel()">Nuevo torneo Pozo</button>
          <button class="btn red" style="width:100%;text-align:left" onclick="closeAdmin()">Cerrar</button>
        </div>
        <div id="adminMain" style="flex:1;display:none;flex-direction:column;gap:8px;max-width:520px">
          <div style="display:flex;align-items:center;justify-content:space-between">
            <div id="adminHeaderTitle" style="font-weight:700">Jugadores</div>
            <button id="adminHeaderButton" class="btn ghost" onclick="showAdminMenu()">Atrás</button>
          </div>
          <div id="adminContent" style="display:flex;flex-direction:column;gap:8px;max-height:420px;overflow:auto;padding-right:6px">
            <!-- Dynamic content: registration form + list -->
            <div id="playerForm" style="display:flex;gap:8px;align-items:center">
              <input id="playerNameInput" class="register-input" placeholder="Nombre completo" />
              <button class="btn secondary-green" onclick="registerPlayer()">Registrar jugador</button>
            </div>
            <div id="adminList" style="display:flex;flex-direction:column;gap:8px;overflow:auto"></div>
          </div>
        </div>
      </div>
    `
    document.body.appendChild(overlay)
  }
  overlay.style.display = 'flex'
  showAdminMenu()
}

// switch panel in admin overlay
function showAdminMenu(){
  const menu = document.getElementById('adminMenuColumn')
  const content = document.getElementById('adminContent')
  const adminMain = document.getElementById('adminMain')
  const header = document.getElementById('adminHeaderTitle')
  if(menu) menu.style.display = 'flex'
  if(content) content.style.display = 'none'
  if(adminMain) adminMain.style.display = 'none'
  if(header) header.innerText = 'Jugadores'
}

function normalizeDateInput(val){
  if(/^\d{4}-\d{2}-\d{2}$/.test(String(val||''))){
    const [y,m,d] = String(val).split('-')
    return `${d}/${m}/${y}`
  }
  return String(val || '')
}

function addDaysToDateText(dateText, daysToAdd){
  const [d, m, y] = String(dateText || '').split('/')
  if(!d || !m || !y) return null
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)))
  date.setUTCDate(date.getUTCDate() + daysToAdd)
  const dd = String(date.getUTCDate()).padStart(2, '0')
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0')
  const yyyy = String(date.getUTCFullYear())
  return `${dd}/${mm}/${yyyy}`
}

function showPlayerPanel(){
  const menu = document.getElementById('adminMenuColumn')
  const content = document.getElementById('adminContent')
  const adminMain = document.getElementById('adminMain')
  const header = document.getElementById('adminHeaderTitle')
  if(menu) menu.style.display = 'none'
  if(adminMain) adminMain.style.display = 'flex'
  if(content) content.style.display = 'flex'
  if(header) header.innerText = 'Jugadores'
  content.innerHTML = `
    <div id="playerForm" style="display:flex;gap:8px;align-items:center">
      <input id="playerNameInput" class="register-input" placeholder="Nombre completo" />
      <button class="btn secondary-green" onclick="registerPlayer()">Registrar jugador</button>
    </div>
  `
}

function showPozoPanel(){
  const menu = document.getElementById('adminMenuColumn')
  const content = document.getElementById('adminContent')
  const adminMain = document.getElementById('adminMain')
  const header = document.getElementById('adminHeaderTitle')
  if(menu) menu.style.display = 'none'
  if(adminMain) adminMain.style.display = 'flex'
  if(content) content.style.display = 'flex'
  if(header) header.innerText = 'Nuevo torneo Pozo'
  content.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:12px;min-width:0">
      <label style="display:flex;flex-direction:column;gap:6px;font-weight:600;color:var(--muted)">
        Nombre del torneo
        <input id="pozoName" class="register-input" placeholder="Ej: Pozo DD/MM/AAAA" />
      </label>
      <div class="pozo-form-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <label style="display:flex;flex-direction:column;gap:6px;font-weight:600;color:var(--muted)">
          Fecha inicio
          <input id="pozoStartDate" type="date" class="register-input" />
        </label>
        <label style="display:flex;flex-direction:column;gap:6px;font-weight:600;color:var(--muted)">
          Fecha fin
          <input id="pozoEndDate" type="date" class="register-input" />
        </label>
      </div>
      <label style="display:flex;flex-direction:column;gap:6px;font-weight:600;color:var(--muted)">
        CSV del torneo
        <input id="pozoCsvFile" type="file" accept=".csv,text/csv" />
      </label>
      <div style="color:var(--muted);font-size:0.9rem;line-height:1.4">
        Formato del fichero CSV (sin cabecera): jugador1;jugador2;jugador3;jugador4;juegos_pareja1;juegos_pareja2
      </div>
      <div style="color:var(--muted);font-size:0.9rem;line-height:1.4">
        En caso de empate a juegos, añadir el símbolo '+' a los juegos de la pareja ganadora, por ejemplo J1;J2;J3;J4;4;4+
      </div>
      <button class="btn secondary-green" onclick="submitPozoTournament()">Guardar torneo</button>
    </div>
  `
}

function showCompasPanel(){
  const menu = document.getElementById('adminMenuColumn')
  const content = document.getElementById('adminContent')
  const adminMain = document.getElementById('adminMain')
  const header = document.getElementById('adminHeaderTitle')
  if(menu) menu.style.display = 'none'
  if(adminMain) adminMain.style.display = 'flex'
  if(content) content.style.display = 'flex'
  if(header) header.innerText = 'Nuevo torneo Compás'
  content.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:12px;min-width:0">
      <label style="display:flex;flex-direction:column;gap:6px;font-weight:600;color:var(--muted)">
        Nombre del torneo
        <input id="compasName" class="register-input" placeholder="Ej: Compás DD/MM/AAAA" />
      </label>
      <div class="pozo-form-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <label style="display:flex;flex-direction:column;gap:6px;font-weight:600;color:var(--muted)">
          Fecha inicio
          <input id="compasStartDate" type="date" class="register-input" />
        </label>
        <label style="display:flex;flex-direction:column;gap:6px;font-weight:600;color:var(--muted)">
          Fecha fin
          <input id="compasEndDate" type="date" class="register-input" />
        </label>
      </div>
      <label style="display:flex;flex-direction:column;gap:6px;font-weight:600;color:var(--muted)">
        CSV del torneo
        <input id="compasCsvFile" type="file" accept=".csv,text/csv" />
      </label>
      <div style="color:var(--muted);font-size:0.9rem;line-height:1.4">
        Formato del fichero CSV (sin cabecera): ronda;bracket;jugador1;jugador2;jugador3;jugador4;juegos_pareja1;juegos_pareja2
      </div>
      <div style="color:var(--muted);font-size:0.9rem;line-height:1.4">
        Valores válidos para <strong>bracket</strong>: E, W, N, S, NE, SE, NW, SW (mayúsculas o minúsculas aceptadas).
      </div>
      <button class="btn secondary-green" onclick="submitCompasTournament()">Guardar torneo</button>
    </div>
  `
}

async function submitCompasTournament(){
  const name = document.getElementById('compasName')?.value.trim() || ''
  const startInput = document.getElementById('compasStartDate')?.value || ''
  const endInput = document.getElementById('compasEndDate')?.value || ''
  const fileEl = document.getElementById('compasCsvFile')
  const file = fileEl && fileEl.files ? fileEl.files[0] : null

  if(!name){ alert('Introduce el nombre del torneo'); return }
  if(!startInput || !endInput){ alert('Selecciona la fecha de inicio y la de fin'); return }
  if(!file){ alert('Sube un fichero CSV'); return }

  try{
    const csvText = await file.text()
    const payload = {
      name,
      start_date: normalizeDateInput(startInput),
      end_date: normalizeDateInput(endInput),
      csv: csvText
    }

    const res = await fetch('/api/league-admin?action=createCompasTournament', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })

    const json = await res.json().catch(() => ({}))
    if(!res.ok || !json.ok){ throw new Error(json && json.error ? json.error : 'Error al guardar el torneo') }

    window.vtToast('Torneo Compás guardado')
    closeAdmin()
  }catch(e){ console.error(e); alert(e && e.message ? e.message : 'Error al guardar el torneo') }
}

async function submitPozoTournament(){
  const name = document.getElementById('pozoName')?.value.trim() || ''
  const startInput = document.getElementById('pozoStartDate')?.value || ''
  const endInput = document.getElementById('pozoEndDate')?.value || ''
  const fileEl = document.getElementById('pozoCsvFile')
  const file = fileEl && fileEl.files ? fileEl.files[0] : null

  if(!name){ alert('Introduce el nombre del torneo'); return }
  if(!startInput || !endInput){ alert('Selecciona la fecha de inicio y la de fin'); return }
  if(!file){ alert('Sube un fichero CSV'); return }

  try{
    const csvText = await file.text()
    const payload = {
      name,
      start_date: normalizeDateInput(startInput),
      end_date: normalizeDateInput(endInput),
      csv: csvText
    }

    const res = await fetch('/api/league-admin?action=createPozoTournament', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })

    const json = await res.json().catch(() => ({}))
    if(!res.ok || !json.ok){
      throw new Error(json && json.error ? json.error : 'Error al guardar el torneo')
    }

    window.vtToast('Torneo Pozo guardado')
    closeAdmin()
  }catch(e){
    console.error(e)
    alert(e && e.message ? e.message : 'Error al guardar el torneo')
  }
}

async function registerPlayer(){
  const el = document.getElementById('playerNameInput')
  if(!el) return
  const name = el.value.trim()
  if(!name){ alert('Introduce un nombre completo'); return }
  try{
    const res = await fetch('/api/write?action=submitName',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name})})
    const j = await res.json()
    if(j && j.ok){
      if(j.added){ window.vtToast('Jugador guardado'); el.value = '' }
      else alert('Nombre ya registrado')
    } else {
      alert('Error al guardar')
    }
  }catch(e){ console.error(e); alert('Error al guardar') }
}
function closeAdmin(){ const o=document.getElementById('adminOverlay'); if(o) o.style.display='none' }



