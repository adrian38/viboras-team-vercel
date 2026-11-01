// Estadisticas de temporada: lo que pinta /statistics.
//
// Hasta el 2026-11-01 estas lineas vivian dentro de statistics.html. Salen
// aqui sin tocar una coma; el <script> de la pagina las carga en el mismo
// sitio y sin defer, para que el orden de ejecucion no cambie.

const EVENT_FILTER_DEFS = [
  { id: 'ranked', label: 'Partidos', values: ['ranked'] },
  { id: 'legacy', label: 'Pre-09/2026', values: ['legacy'] },
  { id: 'grupo_liga', label: 'Ligas', values: ['grupo_liga'] },
  { id: 'tournaments', label: 'Torneos', values: ['pozo', 'compas', 'doble_ko'] }
]

function parseDateStr(s){ if(!s) return new Date(0); if(/^-?\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(s); const parts=String(s).split('/'); if(parts.length===3){ const d=parseInt(parts[0],10)||1; const m=(parseInt(parts[1],10)||1)-1; const y=parseInt(parts[2],10)||0; return new Date(y,m,d) } return new Date(s) }

function getSelectedEventTypes(){
  const selected = []
  document.querySelectorAll('.event-checkbox input[type="checkbox"]').forEach((input) => {
    // ignore the pre-09 toggle input here; it only modifies behavior when 'ranked' is selected
    if (input.id === 'includePreToggle') return
    if (!input.checked) return
    const values = String(input.value || '').split(',').map((v) => String(v).trim().toLowerCase()).filter(Boolean)
    selected.push(...values)
  })
  return [...new Set(selected)]
}

function isMatchIncludedByEventType(match){
  const selected = getSelectedEventTypes()
  if (!selected.length) return false

  const type = String(match && match.event_type ? match.event_type : '').trim().toLowerCase()
  const eventId = (match && (match.event_id !== undefined && match.event_id !== null)) ? Number(match.event_id) : null
  const includePre = !!document.getElementById('includePreToggle') && document.getElementById('includePreToggle').checked

  // When the pre-09 toggle is disabled, always exclude specific old-tournament event IDs
  if (!includePre && (eventId === 23 || eventId === 24)) return false

  // Special handling for the "Partidos" checkbox (value 'ranked'):
  // - If 'ranked' is selected and the pre toggle is enabled, include event_id 1 and 3
  // - If 'ranked' is selected and pre toggle is disabled, include only event_id 1
  if (selected.includes('ranked')){
    if (eventId === 1) return true
    if (includePre && eventId === 3) return true
    // fallback to matching by type string
    if (type === 'ranked') return true
    if (includePre && type === 'legacy') return true
  }

  // For other selected event types, match by event_type string
  if (type && selected.includes(type)) return true

  return false
}

function loadData(){
  const url = `/api/read?action=getResults&eventType=ranked,legacy,grupo_liga,pozo,compas,doble_ko&ts=${Date.now()}`
  return fetch(url)
    .then(r=>{
      if(!r.ok) throw new Error('HTTP '+r.status)
      return r.json()
    })
    .then(db => {
      const matches = (db && db.matches) ? db.matches : []
      return matches.filter((match) => isMatchIncludedByEventType(match))
    })
    .catch(e=>{ console.error('Could not load results', e); return [] })
}

function loadNames(){
  const isLocal = location.hostname==='localhost' || location.hostname==='127.0.0.1'
  const url = '/api/read?action=getNames'
  return fetch(url).then(r=>{ if(!r.ok) throw new Error('HTTP '+r.status); return r.json() }).then(db=>{ return (db && db.names) ? db.names : [] }).catch(e=>{ return [] })
}

function normalizeTeamNames(names){
  const cleaned = (names||[]).map(n=>String(n||'').trim()).filter(Boolean)
  return cleaned.slice().sort((a,b)=>a.localeCompare(b,'es',{sensitivity:'base',numeric:true}))
}

function toIntStrict(v){ if(v===undefined || v===null) return null; const s=String(v).trim(); if(!/^[0-9]+$/.test(s)) return null; return parseInt(s,10) }

function computeStats(matches, mode, includeInactive){
  const stats = new Map()
  // If includeInactive is true, bypass the registered filter so inactive names are included
  const registered = (!includeInactive && window._registeredNames && window._registeredNames.size>0) ? window._registeredNames : null

  function ensure(key, displayName){ if(!stats.has(key)) stats.set(key,{name:displayName,played:0,wins:0,losses:0,draws:0,setsWon:0,setsTotal:0,gamesWon:0,gamesTotal:0}) }
  function isRegisteredName(name){ if(!name) return false; return !registered || registered.has(name) }

  function addSetStatsForPlayer(names, gamesWon, gamesTotal, setWon){
    if(mode !== 'players') return
    for(const name of names){
      if(!name || !isRegisteredName(name)) continue
      ensure(name, name)
      const ent = stats.get(name)
      if(ent){ ent.gamesWon += gamesWon; ent.gamesTotal += gamesTotal; ent.setsTotal += 1; if(setWon) ent.setsWon += 1 }
    }
  }

  function addGamesOnlyForPlayer(names, gamesWon, gamesTotal){
    if(mode !== 'players') return
    for(const name of names){
      if(!name || !isRegisteredName(name)) continue
      ensure(name, name)
      const ent = stats.get(name)
      if(ent){ ent.gamesWon += gamesWon; ent.gamesTotal += gamesTotal }
    }
  }

  function addSetStatsForTeam(names, gamesWon, gamesTotal, setWon){
    if(mode !== 'teams') return
    const normalized = normalizeTeamNames(names)
    if(normalized.length < 2) return
    if(registered && normalized.some(name=>!registered.has(name))) return
    const key = normalized.join(' / ')
    ensure(key, key)
    const ent = stats.get(key)
    if(ent){ ent.gamesWon += gamesWon; ent.gamesTotal += gamesTotal; ent.setsTotal += 1; if(setWon) ent.setsWon += 1 }
  }

  function addGamesOnlyForTeam(names, gamesWon, gamesTotal){
    if(mode !== 'teams') return
    const normalized = normalizeTeamNames(names)
    if(normalized.length < 2) return
    if(registered && normalized.some(name=>!registered.has(name))) return
    const key = normalized.join(' / ')
    ensure(key, key)
    const ent = stats.get(key)
    if(ent){ ent.gamesWon += gamesWon; ent.gamesTotal += gamesTotal }
  }

  function addPlayed(names){
    if(mode === 'teams'){
      const normalized = normalizeTeamNames(names)
      if(normalized.length < 2) return
      if(registered && normalized.some(name=>!registered.has(name))) return
      const key = normalized.join(' / ')
      ensure(key, key)
      const ent = stats.get(key)
      if(ent) ent.played++
      return
    }
    for(const name of names){
      if(!name || !isRegisteredName(name)) continue
      ensure(name, name)
      const ent = stats.get(name)
      if(ent) ent.played++
    }
  }

  function addOutcome(names, result){
    if(mode === 'teams'){
      const normalized = normalizeTeamNames(names)
      if(normalized.length < 2) return
      if(registered && normalized.some(name=>!registered.has(name))) return
      const key = normalized.join(' / ')
      ensure(key, key)
      const ent = stats.get(key)
      if(!ent) return
      if(result==='win') ent.wins++
      else if(result==='loss') ent.losses++
      else ent.draws++
      return
    }
    for(const name of names){
      if(!name || !isRegisteredName(name)) continue
      ensure(name, name)
      const ent = stats.get(name)
      if(!ent) continue
      if(result==='win') ent.wins++
      else if(result==='loss') ent.losses++
      else ent.draws++
    }
  }

  for(const m of matches){
    const p1a = (m.p1a||'').trim()
    const p1b = (m.p1b||'').trim()
    const p2a = (m.p2a||'').trim()
    const p2b = (m.p2b||'').trim()

    const team1Names = [p1a,p1b].filter(Boolean)
    const team2Names = [p2a,p2b].filter(Boolean)

    const format = String(m.format || '').trim()
    if(format === 'timed_games' || format === 'timed_games_long'){
      const team1Games = toIntStrict(m.s11)
      const team2Games = toIntStrict(m.s21)
      if(team1Games === null || team2Games === null) continue

      // normal case: one team has more games
      if(team1Games > team2Games || team2Games > team1Games){
        if(mode === 'players'){
          if(team1Games > team2Games){
            addGamesOnlyForPlayer(team1Names, team1Games, team1Games + team2Games)
            addGamesOnlyForPlayer(team2Names, team2Games, team1Games + team2Games)
            addPlayed(team1Names)
            addPlayed(team2Names)
            addOutcome(team1Names, 'win')
            addOutcome(team2Names, 'loss')
          } else {
            addGamesOnlyForPlayer(team2Names, team2Games, team1Games + team2Games)
            addGamesOnlyForPlayer(team1Names, team1Games, team1Games + team2Games)
            addPlayed(team1Names)
            addPlayed(team2Names)
            addOutcome(team2Names, 'win')
            addOutcome(team1Names, 'loss')
          }
        } else {
          if(team1Games > team2Games){
            addGamesOnlyForTeam(team1Names, team1Games, team1Games + team2Games)
            addGamesOnlyForTeam(team2Names, team2Games, team1Games + team2Games)
            addPlayed(team1Names)
            addPlayed(team2Names)
            addOutcome(team1Names, 'win')
            addOutcome(team2Names, 'loss')
          } else {
            addGamesOnlyForTeam(team2Names, team2Games, team1Games + team2Games)
            addGamesOnlyForTeam(team1Names, team1Games, team1Games + team2Games)
            addPlayed(team1Names)
            addPlayed(team2Names)
            addOutcome(team2Names, 'win')
            addOutcome(team1Names, 'loss')
          }
        }
        continue
      }

      // empate a juegos: comprobar marca de desempate en s12/s22
      const s12 = String(m.s12 || '').trim()
      const s22 = String(m.s22 || '').trim()
      if(s12 === '1' || s22 === '1'){
        if(s12 === '1'){
          addPlayed(team1Names)
          addPlayed(team2Names)
          addOutcome(team1Names, 'win')
          addOutcome(team2Names, 'loss')
        } else {
          addPlayed(team1Names)
          addPlayed(team2Names)
          addOutcome(team2Names, 'win')
          addOutcome(team1Names, 'loss')
        }
      }

      // otherwise (no tiebreak flag) do not count this match
      continue
    }

    let team1Sets = 0
    let team2Sets = 0
    for(let i=1;i<=3;i++){
      const a = toIntStrict(m['s1'+i])
      const b = toIntStrict(m['s2'+i])
      if(a === null || b === null) continue

      // Ignore incomplete placeholder sets like 0-0 for non-timed formats
      if(a === 0 && b === 0) continue

      if(a > b) team1Sets++
      else if(b > a) team2Sets++

      if(mode === 'players'){
        addSetStatsForPlayer(team1Names, a, a + b, a > b)
        addSetStatsForPlayer(team2Names, b, a + b, b > a)
      } else {
        addSetStatsForTeam(team1Names, a, a + b, a > b)
        addSetStatsForTeam(team2Names, b, a + b, b > a)
      }
    }

    if(team1Sets === 0 && team2Sets === 0) continue

    addPlayed(team1Names)
    addPlayed(team2Names)

    if(team1Sets > team2Sets){
      addOutcome(team1Names, 'win')
      addOutcome(team2Names, 'loss')
    } else if(team2Sets > team1Sets){
      addOutcome(team2Names, 'win')
      addOutcome(team1Names, 'loss')
    } else {
      addOutcome(team1Names, 'draw')
      addOutcome(team2Names, 'draw')
    }
  }

  const out = Array.from(stats.values()).filter(s=>s.played>0)
  out.forEach(s=>{
    s.record = `${s.wins}-${s.losses}-${s.draws||0}`
    const denom = (s.wins||0) + (s.losses||0)
    s.winPct = denom>0 ? (s.wins/denom) : null
    s.setsPct = s.setsTotal>0 ? (s.setsWon/s.setsTotal) : null
    s.gamesPct = s.gamesTotal>0 ? (s.gamesWon/s.gamesTotal) : null
  })

  return out
}

// sorting/filter state
let currentView = 'players'
let statsCache = {players:[], teams:[]}
let sortState = {players:{key:'played',dir:-1}, teams:{key:'played',dir:-1}}
function getCurrentSort(){ return sortState[currentView] }
function sortStats(arr){
  const currentSort = getCurrentSort()
  arr.sort((a,b)=>{
    const k = currentSort.key
    if(k==='name'){
      const va = a.name || ''
      const vb = b.name || ''
      const cmp = va.localeCompare(vb, 'es', {sensitivity:'base', numeric:true})
      return cmp * currentSort.dir
    }
    if(k==='winPct'){
      const va = (a.winPct===null || a.winPct===undefined) ? -Infinity : a.winPct
      const vb = (b.winPct===null || b.winPct===undefined) ? -Infinity : b.winPct
      if(va < vb) return -1*currentSort.dir
      if(va > vb) return 1*currentSort.dir
      const wa = a.wins||0
      const wb = b.wins||0
      if(wa < wb) return -1*currentSort.dir
      if(wa > wb) return 1*currentSort.dir
      return 0
    }
    if(k==='setsPct'){
      const va = (a.setsPct===null || a.setsPct===undefined) ? -Infinity : a.setsPct
      const vb = (b.setsPct===null || b.setsPct===undefined) ? -Infinity : b.setsPct
      if(va < vb) return -1*currentSort.dir
      if(va > vb) return 1*currentSort.dir
      const sa = a.setsWon||0
      const sb = b.setsWon||0
      if(sa < sb) return -1*currentSort.dir
      if(sa > sb) return 1*currentSort.dir
      return 0
    }
    if(k==='gamesPct'){
      const va = (a.gamesPct===null || a.gamesPct===undefined) ? -Infinity : a.gamesPct
      const vb = (b.gamesPct===null || b.gamesPct===undefined) ? -Infinity : b.gamesPct
      if(va < vb) return -1*currentSort.dir
      if(va > vb) return 1*currentSort.dir
      const ga = a.gamesWon||0
      const gb = b.gamesWon||0
      if(ga < gb) return -1*currentSort.dir
      if(ga > gb) return 1*currentSort.dir
      return 0
    }
    let va = a[k]
    let vb = b[k]
    if(va===null || va===undefined) va = -Infinity
    if(vb===null || vb===undefined) vb = -Infinity
    if(va < vb) return -1*currentSort.dir
    if(va > vb) return 1*currentSort.dir
    return 0
  })
}

function renderTable(statsArr){
  const container = document.getElementById('tableContainer')
  if(!statsArr || statsArr.length===0){
    const emptyMessage = currentView === 'teams' ? 'No hay parejas con partidos registrados' : 'No hay jugadores con partidos registrados'
    container.innerHTML = `<div class="muted">${emptyMessage}</div>`
    return
  }

  sortStats(statsArr)

  const table = document.createElement('table')
  const thead = document.createElement('thead')
  const nameLabel = currentView === 'teams' ? 'Pareja' : 'Jugador'
  thead.innerHTML = '<tr>'+
    `<th class="name-col" data-key="name">${nameLabel}<span class="ms sortable-ind notranslate" translate="no" aria-hidden="true">swap_vert</span></th>`+
    '<th class="center" data-key="played">Partidos<span class="ms sortable-ind notranslate" translate="no" aria-hidden="true">swap_vert</span></th>'+
    '<th class="metric-col" data-key="winPct">Victorias (%)<span class="ms sortable-ind notranslate" translate="no" aria-hidden="true">swap_vert</span></th>'+
    '<th class="metric-col" data-key="setsPct">Sets (%)<span class="ms sortable-ind notranslate" translate="no" aria-hidden="true">swap_vert</span></th>'+
    '<th class="metric-col" data-key="gamesPct">Juegos (%)<span class="ms sortable-ind notranslate" translate="no" aria-hidden="true">swap_vert</span></th>'+
    '</tr>'
  table.appendChild(thead)

  const tbody = document.createElement('tbody')
  function createMetricCell(wins, losses, draws, pct, showDraw){
    const td = document.createElement('td')
    td.className = 'metric-cell'
    if(pct===null || pct===undefined || isNaN(pct)){
      if(showDraw && draws && draws>0){
        const drawPart = `-${draws}`
        td.classList.remove('empty')
        td.innerText = `${wins}-${losses}${drawPart}`
        return td
      }
      td.classList.add('empty')
      td.innerText = '-'
      return td
    }
    const percent = Math.round(pct*100)
    const bar = document.createElement('div')
    bar.className = 'bar'
    bar.style.width = Math.max(4, percent) + '%'
    bar.style.background = `color-mix(in oklab, var(--vt-loss), var(--vt-win) ${percent}%)`

    td.appendChild(bar)
    const lblWrap = document.createElement('div')
    lblWrap.className = 'label'
    lblWrap.style.position = 'relative'
    lblWrap.style.zIndex = '1'
    const drawPart = showDraw ? `-${draws||0}` : ''
    lblWrap.innerText = `${wins}-${losses}${drawPart} (${percent}%)`
    td.appendChild(lblWrap)
    return td
  }

  statsArr.forEach(s=>{
    const tr = document.createElement('tr')
    const tdName = document.createElement('td')
    tdName.className = 'td-name'
    tdName.title = s.name
    tdName.innerText = s.name

    const tdPlayed = document.createElement('td')
    tdPlayed.innerText = String(s.played)
    tdPlayed.style.textAlign = 'center'

    const matchesWins = s.wins||0
    const matchesLosses = s.losses||0
    const matchesPct = s.winPct
    const matchesDraws = s.draws||0
    const tdMatches = createMetricCell(matchesWins, matchesLosses, matchesDraws, matchesPct, true)

    const setsWins = s.setsWon||0
    const setsLosses = (s.setsTotal||0) - setsWins
    const setsPct = (s.setsTotal>0) ? (s.setsWon/s.setsTotal) : null
    const tdSets = createMetricCell(setsWins, setsLosses, 0, setsPct, false)

    const gamesWins = Math.round(s.gamesWon||0)
    const gamesLosses = Math.round((s.gamesTotal||0) - (s.gamesWon||0))
    const gamesPct = (s.gamesTotal>0) ? (s.gamesWon/s.gamesTotal) : null
    const tdGames = createMetricCell(gamesWins, gamesLosses, 0, gamesPct, false)

    tr.appendChild(tdName)
    tr.appendChild(tdPlayed)
    tr.appendChild(tdMatches)
    tr.appendChild(tdSets)
    tr.appendChild(tdGames)
    tbody.appendChild(tr)
  })

  table.appendChild(tbody)
  const panel = document.createElement('div')
  panel.style.overflow = 'auto'
  panel.style.borderRadius = '12px'
  panel.style.background = 'var(--card)'
  panel.style.padding = '8px'
  panel.style.border = '1px solid rgba(15,23,42,0.04)'
  panel.style.boxShadow = '0 8px 30px rgba(16,24,40,0.04)'
  panel.appendChild(table)
  container.innerHTML = ''
  container.appendChild(panel)

  Array.from(thead.querySelectorAll('th')).forEach(th=>{
    th.onclick = ()=>{
      const key = th.getAttribute('data-key') || 'name'
      const currentSort = getCurrentSort()
      if(currentSort.key===key) currentSort.dir = -currentSort.dir
        else { currentSort.key = key; currentSort.dir = (key==='name') ? 1 : -1 }
      if(key==='record'){ currentSort.key='wins' }
      if(key==='winPct'){ currentSort.key='winPct' }
      if(key==='setsPct'){ currentSort.key='setsPct' }
      if(key==='gamesPct'){ currentSort.key='gamesPct' }
      renderTable(statsArr)
    }
  })
}

function switchView(view){
  currentView = view
  document.querySelectorAll('.view-btn').forEach(btn=>{
    btn.classList.toggle('active', btn.getAttribute('data-view') === view)
  })
  renderTable(statsCache[view] || [])
}

async function refresh(){
  try{
    const raw = await loadData()
    if(!Array.isArray(raw)){
      console.error('Unexpected loadData result (not an array):', raw)
    }
    const names = await loadNames()
    window._registeredNames = new Set((names||[]).map(n=>String(n).trim()).filter(x=>x))
    const parsed = (Array.isArray(raw) ? raw : []).map(m=>Object.assign({},m,{__date:parseDateStr(m.date)}))
    const includeInactive = !!(document.getElementById('includeInactiveCheckbox') && document.getElementById('includeInactiveCheckbox').checked)
    const playersStats = computeStats(parsed, 'players', includeInactive)
    const teamsStats = computeStats(parsed, 'teams', includeInactive)
    statsCache = {players:playersStats, teams:teamsStats}
    renderTable(statsCache[currentView] || [])
  }catch(err){
    console.error('Error in refresh():', err)
    const container = document.getElementById('tableContainer')
    container.innerHTML = '<div class="muted">Error cargando estadísticas. Mira la consola.</div>'
  }
}

document.querySelectorAll('.view-btn').forEach(btn=>{
  btn.onclick = ()=> switchView(btn.getAttribute('data-view'))
})

document.getElementById('refreshStatsBtn').addEventListener('click', refresh)

vtCargando.arranque(refresh, 'Calculando las estadísticas')
