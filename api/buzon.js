// Buzon de quejas y sugerencias (/buzon). Escribir: cualquier cuenta con
// sesion, tenga ficha o no. Leer: solo administradores, comprobado aqui y no
// en la pagina. Detalle: ai_context/buzon_de_quejas.md
import { readBody, toInt } from './_db.js';
import { exigirSesion, sinCache } from './_auth.js';
import {
  ensureBuzonSchema, TIPOS, LARGO_MAXIMO, POR_HORA,
  guardarMensaje, enviadosEnLaUltimaHora, mensajesParaAdmin, marcarLeidos, marcarProcesado
} from './_buzon.js';

async function enviar(req, res, user) {
  const data = await readBody(req);
  const tipo = String(data?.tipo || '');
  const texto = String(data?.texto || '').trim();
  if (!Object.prototype.hasOwnProperty.call(TIPOS, tipo)) {
    res.status(400).json({ ok: false, error: 'bad_type', message: 'Elige si es una queja o una sugerencia.' });
    return;
  }
  if (texto.length < 5 || texto.length > LARGO_MAXIMO) {
    res.status(400).json({ ok: false, error: 'bad_text', message: `Escribe entre 5 y ${LARGO_MAXIMO} caracteres.` });
    return;
  }
  if (await enviadosEnLaUltimaHora(user.id) >= POR_HORA) {
    res.status(429).json({ ok: false, error: 'too_many', message: 'Has enviado varios mensajes seguidos. Prueba dentro de un rato.' });
    return;
  }
  await guardarMensaje(user, tipo, texto);
  res.status(200).json({ ok: true });
}

async function lista(req, res, user) {
  res.status(200).json({ ok: true, mensajes: await mensajesParaAdmin(user.id) });
}

async function leidos(req, res, user) {
  const data = await readBody(req);
  const hasta = toInt(data?.hasta);
  if (hasta > 0 && hasta <= 2147483647) await marcarLeidos(user.id, hasta);
  res.status(200).json({ ok: true });
}

// 409 si ya estaba procesado (otro administrador se adelanto) o no existe: la
// pagina lo dice y recarga, en vez de dar por enviado un aviso que no salio.
async function procesar(req, res, user) {
  const data = await readBody(req);
  const id = toInt(data?.id);
  if (!(id > 0 && id <= 2147483647) || !await marcarProcesado(user.id, id)) {
    res.status(409).json({ ok: false, error: 'not_pending', message: 'Ese mensaje ya estaba procesado o ya no existe.' });
    return;
  }
  res.status(200).json({ ok: true });
}

// [metodo, funcion, solo administradores]
const ACCIONES = {
  enviar: ['POST', enviar, false],
  lista: ['GET', lista, true],
  leidos: ['POST', leidos, true],
  procesar: ['POST', procesar, true]
};

export default async function handler(req, res) {
  const user = await exigirSesion(req, res);
  if (!user) return;
  const action = String(req.query?.action || '').trim();
  const entrada = Object.prototype.hasOwnProperty.call(ACCIONES, action) ? ACCIONES[action] : null;
  if (!entrada) {
    res.status(404).json({ ok: false, error: 'unknown_action' });
    return;
  }
  if (req.method !== entrada[0]) {
    res.setHeader('allow', entrada[0]);
    res.status(405).json({ ok: false, error: 'method_not_allowed' });
    return;
  }
  sinCache(res);
  if (entrada[2] && user.role !== 'admin') {
    res.status(403).json({ ok: false, error: 'forbidden', message: 'Solo los administradores leen el buzón.' });
    return;
  }
  try {
    await ensureBuzonSchema();
    await entrada[1](req, res, user);
  } catch (err) {
    console.error(`buzon:${action} error`, err);
    if (!res.headersSent) res.status(500).json({ ok: false, error: 'server_error' });
  }
}
