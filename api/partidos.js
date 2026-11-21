// Partidos previstos (/partidos): convocar, apuntarse y borrarse. Todo exige
// sesion; crear o apuntarse exige ademas ficha de jugador, porque una plaza es
// de un jugador y no de una cuenta.
//
// La prohibicion de crear en el pasado vive aqui y solo aqui: /submit-result y
// el resto de la app siguen aceptando fechas pasadas, que es lo que hacen.
// Detalle: ai_context/partidos_previstos.md
import { readBody, toInt } from './_db.js';
import { exigirSesion, sinCache } from './_auth.js';
import {
  ensurePartidosSchema, sedesParaLaPagina, sedeValida, nombreDeSede,
  DURACIONES, COMENTARIO_MAXIMO, SEDE_LIBRE_MAXIMA, MARGEN_MINUTOS, DIAS_MAXIMOS, POR_DIA,
  instanteDe, partidoQueSePisa, creadosHoy, crearPartido, tomarPlaza, soltarPlaza,
  partidoVivo, cancelarPartido, cerrarPartido, jugadoresDe, enEsperaDe
} from './_partidos.js';
import { misPartidos, partidosAbiertos, unPartido } from './_partidos-lista.js';
import { avisarApuntado, avisarBaja, avisarCancelado } from './_partidos-avisos.js';

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

function error(res, codigo, estado, mensaje) {
  res.status(estado).json({ ok: false, error: codigo, message: mensaje });
  return null;
}

// Quien provoca el movimiento, como lo nombran los avisos. El nombre sale de
// la ficha y no del correo: un aviso al grupo con un correo dentro seria
// repartir el correo de alguien.
function quienEs(user) {
  return { id: user.player_id, nombre: user.player_name || 'Alguien' };
}

// Nadie se apunta ni convoca sin ficha: la plaza se guarda contra players.
function exigirFicha(res, user) {
  if (user.player_id) return true;
  error(res, 'no_player', 403, 'Tu cuenta todavía no está enlazada con un jugador.');
  return false;
}

// Lee y valida el formulario. Devuelve los datos ya limpios o null, habiendo
// contestado ya el error. La sede libre es obligatoria con «otro» y tiene que
// faltar con cualquier otra: la misma regla de caracteres que un nombre de
// jugador, porque la sede se pinta con innerHTML y va en los avisos.
async function leerFormulario(req, res) {
  const data = await readBody(req);
  const fecha = String(data?.fecha || '').trim();
  const hora = String(data?.hora || '').trim();
  const duracion = toInt(data?.duracion);
  const sede = String(data?.sede || '').trim();
  const sedeLibre = String(data?.sedeLibre || '').trim();
  const comentario = String(data?.comentario || '').trim();
  if (!FECHA.test(fecha) || !HORA.test(hora)) {
    return error(res, 'bad_date', 400, 'Pon una fecha y una hora.');
  }
  if (!DURACIONES.includes(duracion)) {
    return error(res, 'bad_duration', 400, 'El partido dura una hora o dos.');
  }
  if (!sedeValida(sede)) return error(res, 'bad_venue', 400, 'Elige dónde se juega.');
  if (sede === 'otro' && (sedeLibre.length < 2 || sedeLibre.length > SEDE_LIBRE_MAXIMA || /[<>"'`&]/.test(sedeLibre))) {
    return error(res, 'bad_venue', 400, `Escribe dónde se juega, entre 2 y ${SEDE_LIBRE_MAXIMA} caracteres y sin signos raros.`);
  }
  if (comentario.length > COMENTARIO_MAXIMO) {
    return error(res, 'bad_text', 400, `El comentario no pasa de ${COMENTARIO_MAXIMO} caracteres.`);
  }
  return { fecha, hora, duracion, sede, sedeLibre: sede === 'otro' ? sedeLibre : null, comentario: comentario || null };
}

// El instante, con sus dos fronteras. Null si no cuadra, ya contestado.
async function leerInstante(res, fecha, hora) {
  let fila;
  try {
    fila = await instanteDe(fecha, hora);
  } catch {
    return error(res, 'bad_date', 400, 'Esa fecha no existe.');
  }
  if (fila.pronto) {
    return error(res, 'bad_date', 400, `Ese partido ya ha empezado o empieza en nada: pon al menos ${MARGEN_MINUTOS} minutos de margen.`);
  }
  if (fila.lejos) return error(res, 'bad_date', 400, `No se puede convocar con más de ${DIAS_MAXIMOS} días.`);
  return fila.t;
}

async function mios(req, res, user) {
  if (!exigirFicha(res, user)) return;
  res.status(200).json({ ok: true, partidos: await misPartidos(user.player_id), sedes: sedesParaLaPagina() });
}

async function abiertos(req, res, user) {
  if (!exigirFicha(res, user)) return;
  res.status(200).json({ ok: true, partidos: await partidosAbiertos(user.player_id) });
}

async function uno(req, res, user) {
  if (!exigirFicha(res, user)) return;
  const partido = await unPartido(toInt(req.query?.id), user.player_id);
  if (!partido) return error(res, 'not_found', 404, 'Ese partido ya no existe.');
  res.status(200).json({ ok: true, partido, sedes: sedesParaLaPagina() });
}

async function crear(req, res, user) {
  if (!exigirFicha(res, user)) return;
  const datos = await leerFormulario(req, res);
  if (!datos) return;
  const empieza = await leerInstante(res, datos.fecha, datos.hora);
  if (!empieza) return;
  if (await creadosHoy(user.player_id) >= POR_DIA) {
    return error(res, 'too_many', 429, 'Has convocado varios partidos seguidos. Prueba mañana.');
  }
  const choque = await partidoQueSePisa(user.player_id, empieza, datos.duracion, null);
  if (choque) return error(res, 'overlap', 409, 'Ya estás en otro partido a esa hora.');
  const id = await crearPartido({ ...datos, playerId: user.player_id, empieza });
  res.status(200).json({ ok: true, id });
}

async function apuntarme(req, res, user) {
  if (!exigirFicha(res, user)) return;
  const data = await readBody(req);
  const partido = await partidoVivo(toInt(data?.id));
  if (!partido) return error(res, 'too_late', 409, 'Ese partido ya no admite gente.');
  const choque = await partidoQueSePisa(user.player_id, partido.empieza_at, partido.duracion_min, partido.id);
  if (choque) return error(res, 'overlap', 409, 'Ya estás en otro partido a esa hora.');
  const puesto = await tomarPlaza(partido.id, user.player_id);
  if (puesto === 'full') return error(res, 'full', 409, 'Se ha ocupado la última plaza.');
  if (puesto === 'already_in') return error(res, 'already_in', 409, 'Ya estabas apuntado.');
  await avisarApuntado(partido, quienEs(user), await jugadoresDe(partido.id));
  res.status(200).json({ ok: true, puesto });
}

async function borrarme(req, res, user) {
  if (!exigirFicha(res, user)) return;
  const data = await readBody(req);
  const partido = await partidoVivo(toInt(data?.id));
  if (!partido) return error(res, 'too_late', 409, 'Ese partido ya ha empezado o no existe.');
  if (!await soltarPlaza(partido.id, user.player_id)) {
    return error(res, 'not_joined', 409, 'No estabas apuntado a ese partido.');
  }
  await avisarBaja(partido, quienEs(user), await jugadoresDe(partido.id));
  res.status(200).json({ ok: true });
}

// Cancelar es del creador o de un administrador. Borrarse uno mismo es otra
// cosa y la hace `borrarme`.
async function cancelar(req, res, user) {
  if (!exigirFicha(res, user)) return;
  const data = await readBody(req);
  const partido = await partidoVivo(toInt(data?.id));
  if (!partido) return error(res, 'not_found', 404, 'Ese partido ya no existe.');
  if (partido.creador_player_id !== user.player_id && user.role !== 'admin') {
    return error(res, 'forbidden', 403, 'Solo puede cancelarlo quien lo convocó.');
  }
  const jugadores = await jugadoresDe(partido.id);
  const esperando = await enEsperaDe(partido.id);
  if (await cancelarPartido(partido.id)) {
    await avisarCancelado(partido, quienEs(user), jugadores, esperando);
  }
  res.status(200).json({ ok: true });
}

// Lo llama /submit-result al guardar: un fallo aqui no puede tirar nada, asi
// que devuelve ok aunque el partido ya estuviera cerrado.
async function cerrar(req, res, user) {
  if (!exigirFicha(res, user)) return;
  const data = await readBody(req);
  const id = toInt(data?.id);
  if (id > 0) await cerrarPartido(id, toInt(data?.matchId));
  res.status(200).json({ ok: true });
}

// [metodo, funcion]
const ACCIONES = {
  mios: ['GET', mios],
  abiertos: ['GET', abiertos],
  uno: ['GET', uno],
  crear: ['POST', crear],
  apuntarme: ['POST', apuntarme],
  borrarme: ['POST', borrarme],
  cancelar: ['POST', cancelar],
  cerrar: ['POST', cerrar]
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
  try {
    await ensurePartidosSchema();
    await entrada[1](req, res, user);
  } catch (err) {
    console.error(`partidos:${action} error`, err);
    if (!res.headersSent) res.status(500).json({ ok: false, error: 'server_error' });
  }
}
