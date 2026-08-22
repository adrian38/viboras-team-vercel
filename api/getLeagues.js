import { sql } from '@vercel/postgres'
import { ensureSchema } from './_db.js'

export default async function handler(req, res){
  try{
    await ensureSchema()
    const q = await sql`SELECT id, name, start_date, end_date FROM leagues ORDER BY name`
    res.status(200).json(q.rows || [])
  }catch(e){
    console.error('getLeagues error', e)
    res.status(500).json([])
  }
}
