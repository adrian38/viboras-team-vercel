// Tablon de avisos (/tablon). Leer: cualquier cuenta con sesion. Publicar,
// editar y borrar: solo administradores, comprobado aqui y no en la pagina.
// Detalle: ai_context/tablon_de_avisos.md
import { readBody, toInt } from './_db.js';
import { exigirSesion, sinCache } from './_auth.js';
import {
  ensureTablonSchema, CATEGORIAS, TITULO_MAXIMO, TEXTO_MAXIMO,
  categoriaValida, imagenValida, avisosDelTablon, imagenDelAviso,
  publicar, editar, borrar
} from './_tablon.js';

const malo = (res, error, message) => res.status(400).json({ ok: false, error, message });

// Lo que mandan las dos escrituras, validado igual. Devuelve { datos } o
// { error, message }. `imagen` queda en undefined cuando la peticion no la
// trae, que en una edicion significa «dejala como esta».
function leerAviso(data) {
  const titulo = String(data?.titulo || '').trim();
  const texto = String(data?.texto || '').trim();
  const categoria = String(data?.categoria || '');
  if (titulo.length < 3 || titulo.length > TITULO_MAXIMO) {
    return { error: 'bad_title', message: `El título va de 3 a ${TITULO_MAXIMO} caracteres.` };
  }
  if (texto.length < 5 || texto.length > TEXTO_MAXIMO) {
    return { error: 'bad_text', message: `El mensaje va de 5 a ${TEXTO_MAXIMO} caracteres.` };
  }
  if (!categoriaValida(categoria)) {
    return { error: 'bad_category', message: `Elige una categoría: ${Object.values(CATEGORIAS).join(', ')}.` };
  }
  if (!Object.prototype.hasOwnProperty.call(data || {}, 'imagen')) {
    return { datos: { titulo, texto, categoria, imagen: undefined } };
  }
  const imagen = imagenValida(data.imagen);
  if (imagen === undefined) {
    return { error: 'bad_image', message: 'La foto no vale: tiene que ser JPG, PNG o WEBP y pesar menos.' };
  }
  return { datos: { titulo, texto, categoria, imagen } };
}

async function lista(req, res) {
  res.status(200).json({ ok: true, categorias: CATEGORIAS, avisos: await avisosDelTablon() });
}

// La foto aparte de la lista: con diez avisos el base64 de todas haria la
// respuesta inmanejable en un movil.
async function imagen(req, res) {
  const id = toInt(req.query?.id);
  const datos = id ? await imagenDelAviso(id) : null;
  if (!datos) {
    res.status(404).json({ ok: false, error: 'not_found' });
    return;
  }
  res.status(200).json({ ok: true, imagen: datos });
}

async function crear(req, res, user) {
  const { datos, error, message } = leerAviso(await readBody(req));
  if (error) { malo(res, error, message); return; }
  const id = await publicar(user, { ...datos, imagen: datos.imagen ?? null });
  res.status(200).json({ ok: true, id });
}

async function cambiar(req, res) {
  const data = await readBody(req);
  const id = toInt(data?.id);
  const { datos, error, message } = leerAviso(data);
  if (error) { malo(res, error, message); return; }
  if (!(id > 0) || !await editar(id, datos)) {
    res.status(404).json({ ok: false, error: 'not_found', message: 'Ese aviso ya no existe.' });
    return;
  }
  res.status(200).json({ ok: true });
}

async function eliminar(req, res) {
  const id = toInt((await readBody(req))?.id);
  if (!(id > 0) || !await borrar(id)) {
    res.status(404).json({ ok: false, error: 'not_found', message: 'Ese aviso ya no existe.' });
    return;
  }
  res.status(200).json({ ok: true });
}

// [metodo, funcion, solo administradores]
const ACCIONES = {
  lista: ['GET', lista, false],
  imagen: ['GET', imagen, false],
  crear: ['POST', crear, true],
  editar: ['POST', cambiar, true],
  borrar: ['POST', eliminar, true]
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
    res.status(403).json({ ok: false, error: 'forbidden', message: 'Solo los administradores publican en el tablón.' });
    return;
  }
  try {
    await ensureTablonSchema();
    await entrada[1](req, res, user);
  } catch (err) {
    console.error(`tablon:${action} error`, err);
    if (!res.headersSent) res.status(500).json({ ok: false, error: 'server_error' });
  }
}
