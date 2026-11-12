// Lo que pinta /tournaments.
//
// Hasta el 2026-11-01 estas lineas vivian dentro de tournaments.html. Salen
// aqui sin tocar una coma; el <script> de la pagina las carga en el mismo
// sitio y sin defer, para que el orden de ejecucion no cambie.

let parsedMatches = []
let lastFiltered = []
let currentTournamentView = 'rating'
let tournamentDateMap = new Map()
// Los pozos creados desde /pozo (los que tienen pozo_config). Esta pagina no
// calcula su clasificacion: la buena es la del pozo, que ordena por partidos
// ganados y pista de salida, y la de aqui ordenaria por victorias y juegos.
// Dos clasificaciones distintas del mismo torneo es justo lo que no puede
// ensenar la app, asi que para esos se enlaza a su pantalla.
let pozosPropios = new Set()

function formatEventDates(startDate, endDate){
  const normalize = (value) => {
    const text = String(value || '').trim()
    if (!text) return ''
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(text)) return text
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
      const [y, m, d] = text.split('-')
      return `${d}/${m}/${y}`
    }
    return text
  }

  const start = normalize(startDate)
  const end = normalize(endDate)
  if (!start && !end) return ''
  if (!start) return end
  if (!end) return start
  if (start === end) return start
  return `${start} - ${end}`
}

// Un pozo con pantalla propia no ensena aqui ni clasificacion ni resultados:
// la vista de arriba manda a /pozo, donde estan las rondas con sus marcadores
// y la clasificacion con sus desempates. Ensenar ademas la pestana de
// resultados era pintar los mismos partidos peor y en otro orden. Lo dijo
// Dani el 2026-11-12. Los demas torneos la siguen teniendo: ahi la
// clasificacion son victorias y juegos, y los partidos no se ven en ningun
// otro sitio.
function esPozoConPantallaPropia(eventId){
  return pozosPropios.has(String(eventId || '').trim())
}

function pintarElSelectorDeVista(){
  const toggle = document.getElementById('tournamentViewToggle')
  if (!toggle) return
  const seleccionado = (document.getElementById('eventSelect').value || '').trim()
  toggle.style.display = (seleccionado && !esPozoConPantallaPropia(seleccionado)) ? 'flex' : 'none'
}

function setTournamentView(view){
  const nextView = (view === 'results') ? 'results' : 'rating'
  currentTournamentView = nextView

  const buttons = document.querySelectorAll('.view-btn[data-view]')
  buttons.forEach((btn) => {
    const isActive = btn.getAttribute('data-view') === nextView
    btn.classList.toggle('active', isActive)
  })

  const ratingContainer = document.getElementById('ratingContainer')
  const tableContainer = document.getElementById('tableContainer')
  if (ratingContainer) ratingContainer.style.display = (nextView === 'rating') ? 'block' : 'none'
  if (tableContainer) tableContainer.style.display = (nextView === 'results') ? 'block' : 'none'

  pintarElSelectorDeVista()
}

function parseMatches(raw){
  return (raw || []).map(m => {
    const parts = (m.date || '').split('/')
    const d = new Date(parseInt(parts[2] || 0, 10), (parseInt(parts[1] || 0, 10) - 1), parseInt(parts[0] || 0, 10))
    return Object.assign({}, m, { __date: d, event_id: m.event_id != null ? String(m.event_id) : '' })
  }).filter(x => x.__date && !isNaN(x.__date.getTime()))
}

function buildEventOption(value, label){
  const opt = document.createElement('option')
  opt.value = value
  opt.textContent = label
  return opt
}

function setupEventSelector(events, matches){
  const select = document.getElementById('eventSelect')
  const uniqueEvents = []
  const seen = new Set()

  const eventMap = new Map((events || []).map((event) => [String(event.id || event.event_id), event]))

  ;(matches || []).forEach((m) => {
    if (m.event_id && !seen.has(String(m.event_id))) {
      seen.add(String(m.event_id))
      uniqueEvents.push({
        id: String(m.event_id),
        name: m.event_name || `Evento ${m.event_id}`,
        type: m.event_type || 'pozo'
      })
    }
  })

  uniqueEvents.forEach((event) => {
    if (!eventMap.has(event.id)) {
      eventMap.set(event.id, event)
    }
  })

  const sortedEvents = [...eventMap.values()].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es', { sensitivity: 'base' }))

  select.innerHTML = ''
  select.appendChild(buildEventOption('', '-- Selecciona un torneo --'))

  sortedEvents.forEach((event) => {
    select.appendChild(buildEventOption(String(event.id), event.name))
  })
}

async function loadData(){
  try {
    const url = `/api/read?action=getResults&eventType=pozo,compas,doble_ko&ts=${Date.now()}`
    const res = await fetch(url)
    const db = await res.json()

    tournamentDateMap = new Map((db.events || []).map((event) => [String(event.id), {
      start: event.start_date || event.startDate || '',
      end: event.end_date || event.endDate || ''
    }]))

    parsedMatches = parseMatches(db.matches || [])
    setupEventSelector(db.events || [], parsedMatches)
    await loadPozosPropios()
    await loadPlayerNames()
    document.getElementById('summary').innerText = ''
    document.getElementById('tableContainer').innerHTML = '<div class="muted">Selecciona un torneo para ver los resultados y la clasificación.</div>'
    document.getElementById('ratingContainer').innerHTML = '<div class="muted">Selecciona un torneo para ver los resultados y la clasificación.</div>'
  } catch (e) {
    console.error('Could not load tournament results', e)
    document.getElementById('summary').innerText = 'No se pudieron cargar los resultados del torneo.'
    document.getElementById('tableContainer').innerHTML = '<div class="muted">No hay resultados para mostrar.</div>'
  }
}

async function loadPozosPropios(){
  try{
    const res = await fetch('/api/read?action=getPozos&ts=' + Date.now())
    const db = await res.json()
    pozosPropios = new Set((db.pozos || []).map(p => String(p.id)))
  }catch(e){
    // Sin esta lista se pinta la clasificacion de siempre, que es lo que
    // habia antes del pozo: peor, pero no roto.
    pozosPropios = new Set()
  }
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
  const selectedEvent = (document.getElementById('eventSelect').value || '').trim()
  const player = (document.getElementById('player').value || '').trim().toLowerCase()


  // filter by selected event (this set is used for rating)
  pintarElSelectorDeVista()

  if (!selectedEvent) {
    document.getElementById('summary').innerText = ''
    document.getElementById('tableContainer').innerHTML = '<div class="muted">Selecciona un torneo para ver los resultados.</div>'
    document.getElementById('ratingContainer').innerHTML = '<div class="muted">Selecciona un torneo para ver la clasificación.</div>'
    lastFiltered = []
    setTournamentView('rating')
    return
  }

  const eventFiltered = parsedMatches.filter(x => String(x.event_id) === String(selectedEvent))

  // now apply player filter only to results (rating remains based on full event)
  let filtered = eventFiltered.slice()
  if (player) {
    filtered = filtered.filter(x => {
      return [x.p1a, x.p1b, x.p2a, x.p2b].some(n => (n || '').toLowerCase().includes(player))
    })
  }

  filtered = filtered.sort((a, b) => a.__date - b.__date)

  const summary = document.getElementById('summary')
  const selectedEventDates = tournamentDateMap.get(String(selectedEvent)) || null
  const eventDateText = selectedEventDates ? formatEventDates(selectedEventDates.start, selectedEventDates.end) : ''
  const dateLine = eventDateText ? `Fecha: ${eventDateText}` : 'Fecha: -'
  summary.innerHTML = `<div>${dateLine}</div><div>Total de partidos: ${filtered.length}</div>`

  lastFiltered = filtered
  const eventType = (eventFiltered && eventFiltered.length) ? (eventFiltered[0].event_type || '') : ''
  renderTable(filtered, eventType)
  renderRating(eventFiltered, eventType, selectedEvent)
  setTournamentView(esPozoConPantallaPropia(selectedEvent) ? 'rating' : currentTournamentView)
}

function pairKeyFromPlayers(players){
  return (players || []).map(p => String(p || '').trim()).filter(Boolean).join(' / ')
}

function computeRating(matches, eventType = ''){
  const stats = new Map()
  const isCompas = String(eventType).toLowerCase() === 'compas'

  function ensure(name){ if(!stats.has(name)) stats.set(name,{name:name,wins:0,gamesWon:0,gamesLost:0}) }

  matches.forEach(m => {
    const p1 = [(m.p1a||'').trim(), (m.p1b||'').trim()].filter(Boolean)
    const p2 = [(m.p2a||'').trim(), (m.p2b||'').trim()].filter(Boolean)
    const pair1 = pairKeyFromPlayers(p1)
    const pair2 = pairKeyFromPlayers(p2)

    let team1Sets = 0, team2Sets = 0
    for(let i=1;i<=3;i++){
      const aRaw = m['s1'+i]
      const bRaw = m['s2'+i]

      // For timed_games (or when set2 contains the winner flag '1'), the second set is a tiebreak flag
      // and must not be counted as games or as a set for games totals.
      const isSet2Flag = (i === 2) && (String(m.format) === 'timed_games' || String(m.format) === 'timed_games_long' || String(aRaw) === '1' || String(bRaw) === '1')
      if (isSet2Flag) continue

      const ai = (aRaw !== undefined && aRaw !== '') ? parseInt(aRaw,10) : NaN
      const bi = (bRaw !== undefined && bRaw !== '') ? parseInt(bRaw,10) : NaN
      if(!isNaN(ai) && !isNaN(bi)){
        if(ai > bi) team1Sets++
        else if(bi > ai) team2Sets++

        if (isCompas) {
          ensure(pair1)
          ensure(pair2)
          const ent1 = stats.get(pair1)
          const ent2 = stats.get(pair2)
          ent1.gamesWon += ai
          ent1.gamesLost += bi
          ent2.gamesWon += bi
          ent2.gamesLost += ai
        } else {
          p1.forEach(n => { if(n){ ensure(n); const ent = stats.get(n); ent.gamesWon += ai; ent.gamesLost += bi } })
          p2.forEach(n => { if(n){ ensure(n); const ent = stats.get(n); ent.gamesWon += bi; ent.gamesLost += ai } })
        }
      }
    }

    if (isCompas) {
      if(team1Sets > team2Sets){ ensure(pair1); stats.get(pair1).wins += 1 }
      else if(team2Sets > team1Sets){ ensure(pair2); stats.get(pair2).wins += 1 }
      else {
        if ((m.s12 || '') === '1') { ensure(pair1); stats.get(pair1).wins += 1 }
        else if ((m.s22 || '') === '1') { ensure(pair2); stats.get(pair2).wins += 1 }
      }
    } else {
      if(team1Sets > team2Sets){ p1.forEach(n=>{ if(n){ ensure(n); stats.get(n).wins += 1 } }) }
      else if(team2Sets > team1Sets){ p2.forEach(n=>{ if(n){ ensure(n); stats.get(n).wins += 1 } }) }
      else {
        if ((m.s12 || '') === '1') { p1.forEach(n=>{ if(n){ ensure(n); stats.get(n).wins += 1 } }) }
        else if ((m.s22 || '') === '1') { p2.forEach(n=>{ if(n){ ensure(n); stats.get(n).wins += 1 } }) }
      }
    }
  })

  const out = Array.from(stats.values()).map(s => {
    const totalGames = (s.gamesWon||0) + (s.gamesLost||0)
    const pct = totalGames > 0 ? (s.gamesWon / totalGames) : null
    return Object.assign({}, s, { gamesTotal: totalGames, gamesPct: pct })
  })

  out.sort((a,b)=>{
    if((b.wins||0) !== (a.wins||0)) return (b.wins||0) - (a.wins||0)
    const pa = a.gamesPct===null ? -1 : a.gamesPct
    const pb = b.gamesPct===null ? -1 : b.gamesPct
    if(pb !== pa) return pb > pa ? 1 : -1
    return 0
  })

  // assign positions (same position when wins and pct equal)
  let lastKey = null
  let pos = 0
  let displayPos = 0
  out.forEach(row => {
    pos++
    const key = `${row.wins}_${row.gamesPct}`
    if(key !== lastKey){ displayPos = pos; lastKey = key }
    row.position = displayPos
  })

  return out
}

function renderRating(matches, eventType = '', eventId = ''){
  const container = document.getElementById('ratingContainer')
  if (pozosPropios.has(String(eventId))) {
    container.innerHTML = ''
    const aviso = document.createElement('div')
    aviso.className = 'muted'
    aviso.textContent = 'Este pozo lleva su propia clasificación, con sus desempates y sus puntos por pista.'
    const enlace = document.createElement('button')
    enlace.className = 'btn'
    enlace.style.marginTop = '10px'
    enlace.textContent = 'Ver la clasificación del pozo'
    enlace.addEventListener('click', () => { window.location = '/pozo?id=' + encodeURIComponent(eventId) })
    container.appendChild(aviso)
    container.appendChild(enlace)
    return
  }
  const rating = computeRating(matches || [], eventType)
  if(!rating || rating.length === 0){ container.innerHTML = '<div class="muted">Sin clasificación para mostrar.</div>'; return }

  const table = document.createElement('table')
  const thead = document.createElement('thead')
  thead.innerHTML = '<tr><th>Jugador</th><th>Victorias</th><th>Juegos</th></tr>'
  table.appendChild(thead)
  const tbody = document.createElement('tbody')

  rating.forEach(r => {
    const tr = document.createElement('tr')
    const tdName = document.createElement('td')
    const nameWrap = document.createElement('div')
    nameWrap.className = 'rating-name'
    const badge = document.createElement('span')
    badge.className = 'pos-badge'
    if (r.position === 1) badge.classList.add('pos-1')
    else if (r.position === 2) badge.classList.add('pos-2')
    else if (r.position === 3) badge.classList.add('pos-3')
    badge.innerText = String(r.position)
    const nameSpan = document.createElement('span')
    nameSpan.innerText = r.name
    nameWrap.appendChild(badge)
    nameWrap.appendChild(nameSpan)
    tdName.appendChild(nameWrap)

    const tdWins = document.createElement('td'); tdWins.innerText = String(r.wins||0)
    const tdGames = document.createElement('td')
    const gw = Math.round(r.gamesWon||0)
    const gl = Math.round(r.gamesLost||0)
    const pct = (r.gamesPct===null) ? '-' : Math.round((r.gamesPct||0)*100) + '%'
    tdGames.innerText = `${gw}-${gl} (${pct})`
    tr.appendChild(tdName); tr.appendChild(tdWins); tr.appendChild(tdGames)
    tbody.appendChild(tr)
  })

  table.appendChild(tbody)
  container.innerHTML = ''
  container.appendChild(table)
}

function renderTable(matches, eventType){
  const container = document.getElementById('tableContainer')
  if (!matches.length) {
    container.innerHTML = '<div class="muted">No hay resultados para los filtros introducidos</div>'
    return
  }

  // helper to render a list of matches into a table element
  function buildTableForMatches(list){
    const table = document.createElement('table')
    const thead = document.createElement('thead')
    thead.innerHTML = '<tr><th>Jugadores</th><th><span class="th-full-res">Marcador</span></th></tr>'
    table.appendChild(thead)
    const tbody = document.createElement('tbody')

    list.forEach(m => {
      const tr = document.createElement('tr')

      const tdPlayers = document.createElement('td')
      let team1Sets = 0
      let team2Sets = 0

      for (let i = 1; i <= 3; i++) {
        const aRaw = m['s1' + i]
        const bRaw = m['s2' + i]
        const a = (aRaw !== undefined && aRaw !== '') ? parseInt(aRaw, 10) : NaN
        const b = (bRaw !== undefined && bRaw !== '') ? parseInt(bRaw, 10) : NaN
        if (!isNaN(a) && !isNaN(b)) {
          if (a > b) team1Sets++
          else if (b > a) team2Sets++
        }
      }

      let resultType = 'tie'
      if (team1Sets > team2Sets) resultType = 'team1'
      else if (team2Sets > team1Sets) resultType = 'team2'
      else {
        if ((m.s12 || '') === '1') resultType = 'team1'
        else if ((m.s22 || '') === '1') resultType = 'team2'
      }

      function makeTag(name, team){
        const span = document.createElement('span')
        span.className = 'tag'
        if (resultType === 'tie') span.classList.add('tie')
        else if (resultType === 'team1' && team === 1) span.classList.add('win')
        else if (resultType === 'team2' && team === 2) span.classList.add('win')
        else span.classList.add('lose')
        span.innerText = name
        return span
      }

      const p1aTag = makeTag(m.p1a || '', 1); p1aTag.classList.add('desktop-only')
      const p1bTag = makeTag(m.p1b || '', 1); p1bTag.classList.add('desktop-only')
      const vs = document.createElement('strong'); vs.className = 'desktop-only'; vs.style.margin = '0 8px'; vs.innerText = 'VS'
      const p2aTag = makeTag(m.p2a || '', 2); p2aTag.classList.add('desktop-only')
      const p2bTag = makeTag(m.p2b || '', 2); p2bTag.classList.add('desktop-only')
      tdPlayers.appendChild(p1aTag)
      tdPlayers.appendChild(p1bTag)
      tdPlayers.appendChild(vs)
      tdPlayers.appendChild(p2aTag)
      tdPlayers.appendChild(p2bTag)

      const mobileTeam1 = document.createElement('span')
      mobileTeam1.className = 'tag mobile-only'
      mobileTeam1.innerText = `${(m.p1a || '').trim()} / ${(m.p1b || '').trim()}`
      const mobileTeam2 = document.createElement('span')
      mobileTeam2.className = 'tag mobile-only'
      mobileTeam2.innerText = `${(m.p2a || '').trim()} / ${(m.p2b || '').trim()}`

      if (resultType === 'team1') {
        mobileTeam1.classList.add('win')
        mobileTeam2.classList.add('lose')
      } else if (resultType === 'team2') {
        mobileTeam1.classList.add('lose')
        mobileTeam2.classList.add('win')
      } else {
        mobileTeam1.classList.add('tie')
        mobileTeam2.classList.add('tie')
      }
      tdPlayers.appendChild(mobileTeam1)
      tdPlayers.appendChild(mobileTeam2)

      const sets = []
      for (let i = 1; i <= 3; i++) {
        if (i === 2 && (String(m.format) === 'timed_games' || String(m.format) === 'timed_games_long')) continue

        let a = m['s1' + i] || ''
        let b = m['s2' + i] || ''
        if (a === '' && b === '') continue
        const score = String(a) + '-' + String(b)
        const display = (String(m.format) === 'bo3_stb' && i === 3) ? `[${score}]` : score
        sets.push(display)
      }

      const tdScore = document.createElement('td')
      const list = document.createElement('div')
      list.className = 'set-list'
      sets.forEach(s => {
        const it = document.createElement('span')
        it.className = 'set-item'
        it.innerText = String(s).replace(/-/g, '\u2011')
        list.appendChild(it)
      })
      tdScore.appendChild(list)

      tr.appendChild(tdPlayers)
      tr.appendChild(tdScore)
      tbody.appendChild(tr)
    })

    table.appendChild(tbody)
    return table
  }

  // If compas, group by round (ignore bracket) and render each round separately
  if (String(eventType).toLowerCase() === 'compas') {
    // group by round number (round field may be like "1-E"), take part before '-'
    const groups = new Map()
    matches.forEach(m => {
      const raw = String(m.round || '').trim()
      const roundKey = raw ? raw.split('-')[0] : '0'
      if (!groups.has(roundKey)) groups.set(roundKey, [])
      groups.get(roundKey).push(m)
    })

    // sort round keys numerically
    const sortedKeys = Array.from(groups.keys()).sort((a,b)=>{ const na = parseInt(a,10)||0; const nb = parseInt(b,10)||0; return na - nb })

    container.innerHTML = ''
    for (const rk of sortedKeys) {
      const roundMatches = groups.get(rk) || []
      const header = document.createElement('div')
      header.style.fontWeight = '700'
      header.style.margin = '8px 0'
      header.innerText = `Ronda ${rk}`
      container.appendChild(header)
      // build table for this round
      const tbl = buildTableForMatches(roundMatches)
      container.appendChild(tbl)
    }
    return
  }

  // default: render flat list
  const table = buildTableForMatches(matches)
  container.innerHTML = ''
  container.appendChild(table)
}

async function downloadCSV(){
  const matches = lastFiltered.slice()
  if (!matches.length) {
    alert('No hay resultados para descargar')
    return
  }

  const header = ['fecha', 'equipo1_jugA', 'equipo1_jugB', 'equipo2_jugA', 'equipo2_jugB', 'equipo1_set1', 'equipo2_set1', 'equipo1_set2', 'equipo2_set2', 'equipo1_set3', 'equipo2_set3']
  const rows = matches.map(m => [
    m.date,
    m.p1a || '', m.p1b || '',
    m.p2a || '', m.p2b || '',
    m.s11 || '', m.s21 || '',
    m.s12 || '', m.s22 || '',
    m.s13 || '', m.s23 || ''
  ])

  const csv = [header, ...rows].map(r => r.join(';')).join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'torneos.csv'
  a.click()
  URL.revokeObjectURL(url)
}

document.querySelectorAll('.view-btn[data-view]').forEach((btn) => {
  btn.addEventListener('click', () => setTournamentView(btn.getAttribute('data-view')))
})

document.getElementById('eventSelect').addEventListener('change', applyFilter)
document.getElementById('player').addEventListener('change', applyFilter)
document.getElementById('downloadBtn').addEventListener('click', downloadCSV)

setTournamentView('rating')
vtCargando.arranque(loadData, 'Cargando los torneos')
