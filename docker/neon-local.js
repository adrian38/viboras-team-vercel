// Redirige el driver serverless de Neon a un Postgres local.
//
// @vercel/postgres no habla el protocolo TCP de Postgres: habla el de Neon,
// sobre WebSocket. Por eso no se le puede apuntar a un Postgres normal sin mas.
// La solucion es wsproxy (de Neon), que traduce WebSocket -> TCP.
//
// neonConfig es un singleton del modulo @neondatabase/serverless. Como
// @vercel/postgres usa ese mismo modulo (deduplicado en node_modules),
// configurarlo aqui afecta tambien a las queries de api/*.js SIN tocarlas.
//
// IMPRESCINDIBLE: importar este fichero antes que cualquier cosa que use `sql`.

import { neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

if (process.env.USE_LOCAL_PG === '1') {
  const wsProxy = process.env.WS_PROXY || 'wsproxy:80';
  const httpProxy = process.env.HTTP_PROXY_NEON || 'neon-http:4444';

  // --- Camino HTTP (el que de verdad usa la app) ---------------------------
  // Dentro de @vercel/postgres, el tag `sql` NO usa el pool WebSocket:
  //
  //   async sql(strings, ...values) {
  //     const sql2 = neon(this.connectionString, { fullResults: true });
  //
  // y `neon()` hace un fetch a `https://<host>/sql`. Como todas las queries de
  // api/*.js pasan por ese tag, esto es lo imprescindible para que funcione.
  neonConfig.fetchEndpoint = `http://${httpProxy}/sql`;

  // --- Camino WebSocket (pool.query / pool.connect) ------------------------
  // La app no lo usa hoy, pero se deja configurado por si algun dia se usa
  // el pool directamente o una transaccion.
  neonConfig.webSocketConstructor = ws;
  neonConfig.wsProxy = () => `${wsProxy}/v1`;

  // En local no hay TLS: todo va por la red interna de Docker.
  neonConfig.useSecureWebSocket = false;
  neonConfig.pipelineTLS = false;
  neonConfig.pipelineConnect = false;

  console.log(`[neon-local] HTTP -> ${httpProxy} | WebSocket -> ${wsProxy}`);
} else {
  console.log('[neon-local] USE_LOCAL_PG != 1 -> conectando a Neon real');
}
