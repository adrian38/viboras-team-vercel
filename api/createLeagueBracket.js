import { sql } from '@vercel/postgres'
import { ensureSchema, getPlayerId, readBody } from './_db.js'

function normalizeCsvText(text){
  return String(text||'').replace(/\r\n/g,'\n').replace(/\r/g,'\n')
}

function parseRows(csvText){
  const normalized = normalizeCsvText(csvText).trim()
  if(!normalized) throw new Error('El CSV está vacío')
  const lines = normalized.split('\n').filter(l=>l.trim()!== '')
  if(lines.length===0) throw new Error('El CSV está vacío')

  const rows = []
  for(let i=0;i<lines.length;i++){
    const raw = lines[i].trim()
    const cells = raw.split(';').map(c=>c.trim())
    // expected format: group;phase;jug1;jug2;jug3;jug4  => 6 cells
    if(cells.length !== 6){
      throw new Error(`Línea ${i+1}: formato inválido. Debe tener 6 columnas: nombre_grupo;numero_fase;jugador1;jugador2;jugador3;jugador4`)
    }
    const [group, phaseRaw, p1, p2, p3, p4] = cells
    if(!group) throw new Error(`Línea ${i+1}: falta nombre de grupo`)
    if(!phaseRaw || !/^\d+$/.test(phaseRaw)) throw new Error(`Línea ${i+1}: número de fase inválido`)
    const phase = parseInt(phaseRaw,10)
    if(!p1) throw new Error(`Línea ${i+1}: falta jugador 1`)
    if(!p2) throw new Error(`Línea ${i+1}: falta jugador 2`)
    if(!p3) throw new Error(`Línea ${i+1}: falta jugador 3`)
    if(!p4) throw new Error(`Línea ${i+1}: falta jugador 4`)
    rows.push({ group, phase, p1, p2, p3, p4 })
  }
  return rows
}

export default async function handler(req, res){
  try{
    await ensureSchema()
    const data = await readBody(req)
    const leagueId = data && data.league_id ? Number(data.league_id) : null
    const csvText = String(data?.csv || '')
    if(!leagueId) { res.status(400).json({ ok:false, error:'Falta league_id' }); return }
    const rows = parseRows(csvText)

    // fetch league
    const leagueQ = await sql`SELECT id, name FROM leagues WHERE id = ${leagueId}`
    if(!leagueQ.rows || leagueQ.rows.length === 0){ res.status(400).json({ ok:false, error:'Liga no encontrada' }); return }
    const league = leagueQ.rows[0]

    // existing active player names
    const playersQ = await sql`SELECT id, name FROM players WHERE active = TRUE`
    const activeNames = new Map(playersQ.rows.map(r=>[r.name, r.id]))

    // validate player names exist and are active
    for(let ri = 0; ri < rows.length; ri++){
      const r = rows[ri]
      for(const name of [r.p1, r.p2, r.p3, r.p4]){
        if(!activeNames.has(name)){
          res.status(400).json({ ok:false, error:`Línea ${ri+1}: No existe el jugador con nombre "${name}" o no está activo` })
          return
        }
      }
    }

    // for each row, find the corresponding event by constructed name
    const inserts = []
    for(let ri = 0; ri < rows.length; ri++){
      const r = rows[ri]
      const eventName = `${league.name}_${r.group}_Fase${r.phase}`
      const evQ = await sql`SELECT id, start_date FROM events WHERE league_id = ${leagueId} AND name = ${eventName} LIMIT 1`
      if(!evQ.rows || evQ.rows.length === 0){
        res.status(400).json({ ok:false, error:`Línea ${ri+1}: No existe el grupo ${r.group} y fase ${r.phase} para la liga seleccionada` })
        return
      }
      const ev = evQ.rows[0]

      // resolve player ids
      const p1id = activeNames.get(r.p1)
      const p2id = activeNames.get(r.p2)
      const p3id = activeNames.get(r.p3)
      const p4id = activeNames.get(r.p4)
      if(!p1id || !p2id || !p3id || !p4id){
        throw new Error(`No se pudieron resolver ids de jugadores para la fila: ${JSON.stringify(r)}`)
      }

      inserts.push(sql`
        INSERT INTO matches (
          date, format, event_id, round,
          player1a_id, player1b_id, player2a_id, player2b_id,
          set1_team1, set1_team2, set2_team1, set2_team2, set3_team1, set3_team2
        ) VALUES (
          ${ev.start_date}, 'bo3_regular', ${ev.id}, NULL,
          ${p1id}, ${p2id}, ${p3id}, ${p4id},
          0, 0, NULL, NULL, NULL, NULL
        )
      `)
    }

    await Promise.all(inserts)

    res.status(200).json({ ok:true, inserted: inserts.length })
  }catch(err){
    console.error('createLeagueBracket error', err)
    res.status(400).json({ ok:false, error: err && err.message ? err.message : 'Error al crear el cuadro' })
  }
}
