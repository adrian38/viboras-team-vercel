// Envía avisos sólo al administrador indicado y sólo en Preview dev.
// No lee .env.local: obtiene una conexión efímera directamente de viboras_dev.
import { createHash, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import process from 'node:process';

const PROJECT = 'empty-poetry-42127048';
const BRANCH = 'viboras_dev';
const BRANCH_ID = 'br-soft-dawn-b213926z';
const URL = 'https://viboras-team-vercel-git-dev-adrian38s-projects.vercel.app';
const TIPOS = ['partido_terminado', 'opinion_partido', 'resultados_torneo'];

function ejecutar(programa, argumentos) {
  const binario = process.platform === 'win32' && programa === 'npx' ? 'npx.cmd' : programa;
  return execFileSync(binario, argumentos, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function comprobarEntorno() {
  const rama = ejecutar('git', ['branch', '--show-current']);
  if (rama !== 'dev') throw new Error(`Esta herramienta sólo funciona desde dev; rama actual: ${rama || '(ninguna)'}`);
  const ramas = JSON.parse(ejecutar('npx', ['neon@latest', 'branches', 'list', '--project-id', PROJECT, '--output', 'json']));
  const clon = ramas.find((r) => r.name === BRANCH);
  if (!clon || clon.id !== BRANCH_ID) throw new Error('No se pudo confirmar la rama Neon viboras_dev.');
  const vercel = JSON.parse(ejecutar('npx', ['vercel@latest', 'env', 'ls', '--environment', 'preview', '--git-branch', 'dev', '--json']));
  const claves = new Set((vercel.envs || []).map((v) => v.key));
  for (const clave of ['POSTGRES_URL', 'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY']) {
    if (!claves.has(clave)) throw new Error(`Falta ${clave} en Preview (dev).`);
  }
}

async function pedirCorreo() {
  const argumento = process.argv.find((v) => v.startsWith('--email='));
  if (argumento) return argumento.slice('--email='.length).trim().toLowerCase();
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const correo = (await rl.question('Correo del administrador en dev: ')).trim().toLowerCase();
  rl.close();
  return correo;
}

async function crearSesionTemporal(correo) {
  const conexion = ejecutar('npx', ['neon@latest', 'connection-string', BRANCH, '--project-id', PROJECT, '--database-name', 'neondb', '--pooled']);
  process.env.POSTGRES_URL = conexion;
  const { sql } = await import('@vercel/postgres');
  const { rows } = await sql`SELECT id FROM users WHERE lower(email) = ${correo} AND role = 'admin' AND status = 'active'`;
  if (rows.length !== 1) throw new Error('No existe un administrador activo con ese correo en dev.');
  const token = randomBytes(32).toString('hex');
  const hash = createHash('sha256').update(token).digest('hex');
  await sql`INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (${hash}, ${rows[0].id}, now() + interval '5 minutes')`;
  return { token, borrar: () => sql`DELETE FROM sessions WHERE token_hash = ${hash}` };
}

async function enviar(tipo, token) {
  const respuesta = await fetch(`${URL}/api/push?action=notificarme`, {
    method: 'POST', headers: { 'content-type': 'application/json', cookie: `vt_session=${token}` },
    body: JSON.stringify({ tipo })
  });
  const datos = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok || !datos.ok) throw new Error(`Falló ${tipo}: HTTP ${respuesta.status} ${datos.error || ''}`.trim());
  console.log(`✓ ${tipo}: ${datos.aceptados} dispositivo(s) aceptado(s)`);
}

async function main() {
  const pedido = process.argv[2] || '';
  const tipos = pedido === 'todas' ? TIPOS : [pedido];
  if (!tipos.length || tipos.some((t) => !TIPOS.includes(t))) throw new Error(`Tipo inválido. Usa: ${TIPOS.join(', ')} o todas.`);
  comprobarEntorno();
  const correo = await pedirCorreo();
  const sesion = await crearSesionTemporal(correo);
  try {
    for (const tipo of tipos) await enviar(tipo, sesion.token);
  } finally {
    await sesion.borrar();
  }
}

main().catch((error) => { console.error(`Error: ${error.message}`); process.exitCode = 1; });
