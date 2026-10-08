// Servidor de desarrollo local: emula lo que Vercel hace en produccion.
//
// En Vercel no hay servidor: los ficheros de api/ son funciones serverless y
// los .html se sirven como estaticos. En local necesitamos algo que haga las
// dos cosas, replicando el contrato que esperan los handlers
// (req.query, req.body, res.status().json(), res.setHeader()).
//
// Los ficheros de api/ NO se modifican: se importan tal cual.

import './neon-local.js'; // <- primero: configura el driver antes de cualquier query

import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT || 3000);

const app = express();
app.use(express.json({ limit: '1mb' }));

// Log de peticiones a la API, para que se vea que pasa.
app.use('/api', (req, _res, next) => {
  const action = req.query?.action || '(sin action)';
  console.log(`-> ${req.method} ${req.path} action=${action}`);
  next();
});

// Equivalente local de las funciones serverless de Vercel.
const FUNCTIONS = {
  '/api/read': () => import('../api/read.js'),
  '/api/write': () => import('../api/write.js'),
  '/api/league-admin': () => import('../api/league-admin.js')
};

for (const [route, load] of Object.entries(FUNCTIONS)) {
  app.all(route, async (req, res) => {
    try {
      const mod = await load();
      await mod.default(req, res);
    } catch (err) {
      // En Vercel esto saldria en los Runtime Logs; aqui lo devolvemos
      // tambien en la respuesta, que para depurar en local es mas comodo.
      console.error(`[${route}] ${err?.stack || err}`);
      if (!res.headersSent) {
        res.status(500).json({
          ok: false,
          error: 'local_server_error',
          detail: String(err?.message || err)
        });
      }
    }
  });
}

// Comprobacion de conectividad con la base de datos.
app.get('/health', async (_req, res) => {
  try {
    const { sql } = await import('@vercel/postgres');
    const { rows } = await sql`
      SELECT current_database() AS db,
             current_user       AS usuario,
             version()          AS version,
             (SELECT count(*) FROM players)  AS players,
             (SELECT count(*) FROM matches)  AS matches`;
    res.status(200).json({ ok: true, ...rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
});

// Estaticos. `extensions: ['html']` reproduce el cleanUrls de vercel.json,
// que es lo que hace que /day resuelva a day.html.
app.use(express.static(ROOT, { extensions: ['html'] }));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`app escuchando en http://localhost:${PORT}`);
});
