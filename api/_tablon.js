// Tablon de avisos (/tablon): los administradores publican, todo el grupo lee.
// Cada publicacion nace con su aviso en la campanita y su push, porque pasa
// por crearAviso, que es la unica puerta ([[avisos_push]]).
// Detalle: ai_context/tablon_de_avisos.md
import { sql } from '@vercel/postgres';
import { ensureAuthSchema } from './_auth.js';
import { crearAviso } from './_avisos.js';

// Las categorias viven aqui y en el marcado de tablon.html. Manda el
// servidor: una que no este en esta lista se rechaza.
export const CATEGORIAS = {
  importante: 'Importante',
  torneo: 'Torneo',
  pistas: 'Pistas',
  equipacion: 'Equipación',
  general: 'General'
};

export const TITULO_MAXIMO = 120;
export const TEXTO_MAXIMO = 4000;
// La imagen va como data URL en la propia fila: el proyecto no tiene
// almacenamiento de ficheros. 400 000 caracteres de base64 son unos 300 KB de
// imagen, y la pagina reescala antes de subir para no llegar nunca al tope.
export const IMAGEN_MAXIMA = 400000;

let listo = null;

// Fuera de ensureSchema(), que esta en el techo de tamano, igual que `avisos`,
// `buzon` y `push_subscriptions` ([[tamano_del_codigo_y_trinquete]]).
// `categoria` sin CHECK: CREATE TABLE IF NOT EXISTS no migraria uno nuevo; la
// valida `categoriaValida`.
async function crearTablas() {
  await ensureAuthSchema();
  await sql`
    CREATE TABLE IF NOT EXISTS tablon (
      id SERIAL PRIMARY KEY,
      titulo TEXT NOT NULL,
      texto TEXT NOT NULL,
      categoria TEXT NOT NULL,
      imagen TEXT,
      autor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS tablon_created_idx ON tablon(created_at DESC)`;
}

export function ensureTablonSchema() {
  if (!listo) listo = crearTablas().catch((err) => { listo = null; throw err; });
  return listo;
}

export function categoriaValida(categoria) {
  return Object.prototype.hasOwnProperty.call(CATEGORIAS, categoria);
}

// Devuelve la imagen tal cual si es un data URL de imagen que cabe, null si no
// hay imagen, y undefined si lo que llega no sirve (lo rechaza quien llama).
export function imagenValida(imagen) {
  if (imagen === null || imagen === undefined || imagen === '') return null;
  const texto = String(imagen);
  if (texto.length > IMAGEN_MAXIMA) return undefined;
  return /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(texto) ? texto : undefined;
}

// `imagen` no viaja en la lista: una pagina con diez avisos traeria tres megas
// de base64. Viaja `tiene_imagen` y la pagina pide cada una por su id.
export async function avisosDelTablon() {
  await ensureTablonSchema();
  const { rows } = await sql`
    SELECT t.id, t.titulo, t.texto, t.categoria, t.created_at, t.updated_at,
      t.imagen IS NOT NULL AS tiene_imagen,
      COALESCE(p.name, u.email) AS autor
    FROM tablon t
    LEFT JOIN users u ON u.id = t.autor_id
    LEFT JOIN players p ON p.id = u.player_id
    ORDER BY t.created_at DESC, t.id DESC
    LIMIT 100`;
  return rows.map((r) => ({
    id: r.id,
    titulo: r.titulo,
    texto: r.texto,
    categoria: r.categoria,
    cuando: r.created_at,
    editado: r.updated_at,
    tieneImagen: r.tiene_imagen,
    autor: r.autor || null
  }));
}

export async function imagenDelAviso(id) {
  await ensureTablonSchema();
  const { rows } = await sql`SELECT imagen FROM tablon WHERE id = ${id}`;
  return rows.length ? rows[0].imagen : null;
}

// A quien avisa una publicacion nueva: los jugadores activos con cuenta activa.
// Sin cuenta no hay campanita ni dispositivo al que mandar nada.
async function jugadoresConCuenta() {
  const { rows } = await sql`
    SELECT DISTINCT p.id FROM players p
    JOIN users u ON u.player_id = p.id
    WHERE p.active = TRUE AND u.status = 'active'`;
  return rows.map((r) => r.id);
}

// Publicar guarda la fila y avisa al grupo. El aviso lleva el titulo, que es
// lo que la notificacion del movil puede ensenar en una linea.
export async function publicar(user, { titulo, texto, categoria, imagen }) {
  await ensureTablonSchema();
  const { rows } = await sql`
    INSERT INTO tablon (titulo, texto, categoria, imagen, autor_id)
    VALUES (${titulo}, ${texto}, ${categoria}, ${imagen}, ${user.id})
    RETURNING id`;
  await crearAviso(await jugadoresConCuenta(), `Tablón de avisos: ${titulo}`, '/tablon');
  return rows[0].id;
}

// Editar no avisa a nadie: corregir una falta no es una novedad. Lo que queda
// es `updated_at`, que la pagina ensena como «editado».
// `imagen`: un data URL la cambia, `null` la quita, `undefined` la deja.
export async function editar(id, { titulo, texto, categoria, imagen }) {
  await ensureTablonSchema();
  // Dos consultas y no un CASE: con `imagen` a null, Postgres no sabe de que
  // tipo es el parametro y la unica forma de decirselo seria un cast a mano.
  const { rowCount } = imagen === undefined
    ? await sql`
        UPDATE tablon SET titulo = ${titulo}, texto = ${texto},
          categoria = ${categoria}, updated_at = now()
        WHERE id = ${id}`
    : await sql`
        UPDATE tablon SET titulo = ${titulo}, texto = ${texto},
          categoria = ${categoria}, imagen = ${imagen}, updated_at = now()
        WHERE id = ${id}`;
  return rowCount > 0;
}

export async function borrar(id) {
  await ensureTablonSchema();
  const { rowCount } = await sql`DELETE FROM tablon WHERE id = ${id}`;
  return rowCount > 0;
}
