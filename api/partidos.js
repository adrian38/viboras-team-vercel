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
  ensurePartidosSchema, sedesParaLaPagina, nivelesParaLaPagina, sedeValida, nivelesParaGuardar, NIVELES,
  DURACIONES, SEDE_LIBRE_MAXIMA, MARGEN_MINUTOS, DIAS_MAXIMOS, POR_DIA,
  instanteDe, partidoQueSePisa, creadosHoy, crearPartido, tomarPlaza, soltarPlaza,
  partidoVivo, partidoPasadoIncompleto, cancelarPartido, cerrarPartido, jugadoresDe, enEsperaDe,
  jugadorIncorporable, incorporables, cambiarDePlaza, ladoDe, puestoQueTomaria, apuntadoEn
} from './_partidos.js';
import { misPartidos, partidosAbiertos, unPartido } from './_partidos-lista.js';
import { avisarApuntado, avisarBaja, avisarCancelado, avisarIncorporado, avisarQuitado } from './_partidos-avisos.js';
import { categoriaDe } from './_rating.js';
import {
  editarPartido, recalcularAvisos, olvidarSegundaFranja, avisarCambio,
  entrarEnEspera, salirDeEspera, avisarPlazaLibre
} from './_partidos-editar.js';
import { sellarVencidos } from './_partidos-cron.js';

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
// Hora EN PUNTO. Las pistas se reservan por franja horaria, asi que las y
// veinte no existen: no son una hora rara, son una hora que no se puede
// reservar. Y los recordatorios de la reserva cuentan franjas enteras.
const HORA = /^([01]\d|2[0-3]):00$/;

function error(res, codigo, estado, mensaje) {
  res.status(estado).json({ ok: false, error: codigo, message: mensaje });
  return null;
}

// El filtro de nivel. Devuelve el mensaje que impide entrar, o null.
//
// Se compara contra la CATEGORIA GUARDADA, que sale del mismo motor que
// /rating (api/_rating.js). Decisión de Adrián: no se salta nadie, ni quien
// convoca ni los administradores. Lo único que no hace es echar a quien ya
// está dentro: el filtro actúa al entrar, y un rating que se mueva luego no
// saca a nadie de un partido al que ya le dijeron que sí.
//
// Sin categoría calculada se deja pasar. Es lo honrado: significa que el
// recálculo nunca ha corrido, no que el jugador no dé el nivel, y dejar
// fuera a alguien por una tabla vacía sería inventarse un motivo.
async function nivelQueFalta(partido, playerId) {
  if (!Array.isArray(partido.niveles) || !partido.niveles.length) return null;
  const categoria = await categoriaDe(playerId);
  if (!categoria) return null;
  const permitidos = partido.niveles.map((n) => NIVELES[n]).filter(Boolean);
  if (permitidos.includes(categoria)) return null;
  return `Este partido es para ${permitidos.join(', ')} y tu nivel ahora es ${categoria}.`;
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
  const niveles = nivelesParaGuardar(data?.niveles);
  if (!FECHA.test(fecha) || !HORA.test(hora)) {
    return error(res, 'bad_date', 400, 'Pon una fecha y una hora en punto.');
  }
  if (!DURACIONES.includes(duracion)) {
    return error(res, 'bad_duration', 400, 'El partido dura una hora o dos.');
  }
  if (!sedeValida(sede)) return error(res, 'bad_venue', 400, 'Elige dónde se juega.');
  if (sede === 'otro' && (sedeLibre.length < 2 || sedeLibre.length > SEDE_LIBRE_MAXIMA || /[<>"'`&]/.test(sedeLibre))) {
    return error(res, 'bad_venue', 400, `Escribe dónde se juega, entre 2 y ${SEDE_LIBRE_MAXIMA} caracteres y sin signos raros.`);
  }
  if (niveles === false) return error(res, 'bad_level', 400, 'Ese nivel no existe.');
  return { fecha, hora, duracion, sede, sedeLibre: sede === 'otro' ? sedeLibre : null, niveles };
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
  if (fila.lejos) return error(res, 'bad_date', 400, `No se puede crear con más de ${DIAS_MAXIMOS} días.`);
  return fila.t;
}

async function mios(req, res, user) {
  if (!exigirFicha(res, user)) return;
  // `soyAdmin` para que la pantalla solo ofrezca cancelar a quien `cancelar`
  // se lo va a aceptar.
  res.status(200).json({ ok: true, yo: user.player_id, soyAdmin: user.role === 'admin', partidos: await misPartidos(user.player_id), sedes: sedesParaLaPagina(), niveles: nivelesParaLaPagina() });
}

async function abiertos(req, res, user) {
  if (!exigirFicha(res, user)) return;
  res.status(200).json({ ok: true, yo: user.player_id, partidos: await partidosAbiertos(user.player_id) });
}

async function uno(req, res, user) {
  if (!exigirFicha(res, user)) return;
  const partido = await unPartido(toInt(req.query?.id), user.player_id);
  if (!partido) return error(res, 'not_found', 404, 'Ese partido ya no existe.');
  // El hueco en el que entraria si se apuntara ahora, con su lado de pista:
  // la pantalla le pinta ahi su nombre «sin guardar», y tiene que ser el
  // mismo sitio en el que luego le pone el servidor.
  const propuesto = partido.estoyDentro ? null : puestoQueTomaria(partido.plazas, await ladoDe(user.player_id));
  // `puedoQuitar` es la misma regla que comprueba `sacar`: la pantalla solo
  // ofrece lo que el servidor va a aceptar.
  const puedoQuitar = partido.soyElCreador || user.role === 'admin';
  res.status(200).json({ ok: true, yo: user.player_id, yoSoy: user.player_name, partido, propuesto, puedoQuitar, sedes: sedesParaLaPagina(), niveles: nivelesParaLaPagina() });
}

async function crear(req, res, user) {
  if (!exigirFicha(res, user)) return;
  const datos = await leerFormulario(req, res);
  if (!datos) return;
  const empieza = await leerInstante(res, datos.fecha, datos.hora);
  if (!empieza) return;
  if (await creadosHoy(user.player_id) >= POR_DIA) {
    return error(res, 'too_many', 429, 'Has creado varios partidos seguidos. Prueba mañana.');
  }
  const choque = await partidoQueSePisa(user.player_id, empieza, datos.duracion, null);
  if (choque) return error(res, 'overlap', 409, 'Ya estás en otro partido a esa hora.');
  // Convocar te apunta en la plaza 1, asi que el filtro te alcanza a ti el
  // primero: poner unos niveles en los que no estas te dejaria fuera de tu
  // propio partido. Se dice aqui, antes de crearlo.
  const yoNoEntro = await nivelQueFalta({ niveles: datos.niveles }, user.player_id);
  if (yoNoEntro) return error(res, 'bad_level', 400, `${yoNoEntro} Quítate o cambia los niveles.`);
  const id = await crearPartido({ ...datos, playerId: user.player_id, empieza });
  await sellarVencidos(id);
  res.status(200).json({ ok: true, id });
}

async function apuntarme(req, res, user) {
  if (!exigirFicha(res, user)) return;
  const data = await readBody(req);
  const partido = await partidoVivo(toInt(data?.id));
  if (!partido) return error(res, 'too_late', 409, 'Ese partido ya no admite gente.');
  const choque = await partidoQueSePisa(user.player_id, partido.empieza_at, partido.duracion_min, partido.id);
  if (choque) return error(res, 'overlap', 409, 'Ya estás en otro partido a esa hora.');
  const falta = await nivelQueFalta(partido, user.player_id);
  if (falta) return error(res, 'bad_level', 403, falta);
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
  await darmeDeBaja(res, partido, user);
}

// La baja de uno mismo, con su aviso. La usan `borrarme` y `sacar` cuando
// quien quita y quien sale son el mismo: uno siempre puede quitarse.
async function darmeDeBaja(res, partido, user) {
  const estaba = await jugadoresDe(partido.id);
  if (!await soltarPlaza(partido.id, user.player_id)) {
    return error(res, 'not_joined', 409, 'No estabas apuntado a ese partido.');
  }
  const quedan = await jugadoresDe(partido.id);
  await avisarBaja(partido, quienEs(user), quedan);
  // Solo si el partido estaba lleno: si ya tenia huecos, los que esperan no
  // esperaban nada y un aviso de «ha quedado una plaza» seria mentira.
  if (estaba.length === 4) await avisarPlazaLibre(partido, await enEsperaDe(partido.id));
  res.status(200).json({ ok: true });
}

// Quitar a alguien del partido. Lo pueden hacer quien lo creo y los
// administradores, decision de Adrian: el que se apunta por error, o el que
// no va a venir y no se borra, dejaba el partido atascado hasta que el
// quisiera.
//
// A diferencia de `apuntar-a`, aqui SI valen los administradores: incorporar
// dice «he quedado con este», que solo lo sabe quien convoco; quitar es
// poner orden, que es lo que hace un administrador.
//
// Quitarse a uno mismo siempre se puede, aqui tambien: es una baja, con el
// aviso de «se ha borrado» y no el de «te ha quitado». Y quien lo hace no
// ocupa la plaza: queda libre, y si el partido estaba lleno se avisa a la
// lista de espera igual que en una baja.
async function sacar(req, res, user) {
  if (!exigirFicha(res, user)) return;
  const data = await readBody(req);
  const partido = await partidoVivo(toInt(data?.id));
  if (!partido) return error(res, 'too_late', 409, 'Ese partido ya ha empezado o no existe.');
  const playerId = toInt(data?.playerId);
  if (playerId === user.player_id) return darmeDeBaja(res, partido, user);
  if (partido.creador_player_id !== user.player_id && user.role !== 'admin') {
    return error(res, 'forbidden', 403, 'Solo pueden quitar a alguien quien creó el partido y los administradores.');
  }
  const jugador = await apuntadoEn(partido.id, playerId);
  if (!jugador) return error(res, 'not_joined', 409, 'Esa persona ya no está en el partido.');
  const estaba = await jugadoresDe(partido.id);
  if (!await soltarPlaza(partido.id, jugador.id)) {
    return error(res, 'not_joined', 409, `${jugador.name} ya no está en el partido.`);
  }
  await avisarQuitado(partido, quienEs(user), { id: jugador.id, nombre: jugador.name }, await jugadoresDe(partido.id));
  if (estaba.length === 4) await avisarPlazaLibre(partido, await enEsperaDe(partido.id));
  res.status(200).json({ ok: true });
}

// Me cambio a otra plaza libre del mismo partido. Mueve solo al que lo pide
// y solo dentro de su partido: no saca a nadie ni mete a nadie.
//
// No avisa al grupo. Apuntarse y borrarse cambian quien juega, que es lo que
// el grupo necesita saber; cambiarse de hueco no cambia nada de eso, y un
// push por cada baile de sitio seria ruido.
async function moverme(req, res, user) {
  if (!exigirFicha(res, user)) return;
  const data = await readBody(req);
  const partido = await partidoVivo(toInt(data?.id));
  if (!partido) return error(res, 'too_late', 409, 'Ese partido ya ha empezado o no existe.');
  const puesto = toInt(data?.puesto);
  if (!(puesto >= 1 && puesto <= 4)) return error(res, 'bad_request', 400, 'Esa plaza no existe.');
  const r = await cambiarDePlaza(partido.id, user.player_id, puesto);
  if (r === 'ocupada') return error(res, 'taken', 409, 'Esa plaza ya está ocupada.');
  res.status(200).json({ ok: true, puesto });
}

// El organizador incorpora a alguien con quien ya ha quedado. Es la UNICA
// via por la que una plaza la ocupa alguien que no la pidio, y por eso es
// una accion aparte en vez de un parametro de `apuntarme`: asi nadie puede
// apuntar a otro por descuido ni anadiendole un campo al cuerpo.
//
// Solo el organizador. No los administradores: lo que esto hace es decir
// «he quedado con este», y eso solo lo sabe quien convoco.
//
// Al incorporado se le aplican las mismas reglas que si se apuntara el: el
// solape con otro partido suyo y el nivel. No es burocracia —el organizador
// no sabe si el otro tiene ya partido a esa hora, y el filtro de nivel no se
// lo salta nadie—.
async function apuntarA(req, res, user) {
  if (!exigirFicha(res, user)) return;
  const data = await readBody(req);
  const partido = await partidoVivo(toInt(data?.id));
  if (!partido) return error(res, 'too_late', 409, 'Ese partido ya no admite gente.');
  if (partido.creador_player_id !== user.player_id) {
    return error(res, 'forbidden', 403, 'Solo quien creó el partido puede apuntar a otros.');
  }
  const jugador = await jugadorIncorporable(toInt(data?.playerId));
  if (!jugador) return error(res, 'not_found', 404, 'Ese jugador no está disponible.');
  if (await partidoQueSePisa(jugador.id, partido.empieza_at, partido.duracion_min, partido.id)) {
    return error(res, 'overlap', 409, `${jugador.name} ya tiene otro partido a esa hora.`);
  }
  const falta = await nivelQueFalta(partido, jugador.id);
  if (falta) return error(res, 'bad_level', 403, falta.replace('tu nivel ahora es', `el nivel de ${jugador.name} es`));
  const puesto = await tomarPlaza(partido.id, jugador.id);
  if (puesto === 'full') return error(res, 'full', 409, 'Ya no quedan plazas.');
  if (puesto === 'already_in') return error(res, 'already_in', 409, `${jugador.name} ya estaba apuntado.`);
  await avisarIncorporado(partido, quienEs(user), { id: jugador.id, nombre: jugador.name }, await jugadoresDe(partido.id));
  res.status(200).json({ ok: true, puesto });
}

// A quien puede incorporar el organizador: activos, con cuenta y que no
// esten ya dentro. Solo se la damos a el, que es el unico que puede usarla.
async function aQuienApuntar(req, res, user) {
  if (!exigirFicha(res, user)) return;
  const partido = await partidoVivo(toInt(req.query?.id));
  if (!partido) return error(res, 'not_found', 404, 'Ese partido ya no existe.');
  if (partido.creador_player_id !== user.player_id) {
    return error(res, 'forbidden', 403, 'Solo quien creó el partido puede apuntar a otros.');
  }
  res.status(200).json({ ok: true, jugadores: await incorporables(partido.id) });
}

// Editar no toca las plazas. El solape se mira para los cuatro apuntados y
// basta uno para rechazar el cambio: mover el partido no puede meter a nadie
// en dos sitios a la vez.
async function editar(req, res, user) {
  if (!exigirFicha(res, user)) return;
  const data = await readBody(req);
  const partido = await partidoVivo(toInt(data?.id));
  if (!partido) return error(res, 'not_found', 404, 'Ese partido ya no se puede cambiar.');
  if (partido.creador_player_id !== user.player_id && user.role !== 'admin') {
    return error(res, 'forbidden', 403, 'Solo puede cambiarlo quien lo creó.');
  }
  const datos = await leerFormulario(req, res);
  if (!datos) return;
  const empieza = await leerInstante(res, datos.fecha, datos.hora);
  if (!empieza) return;
  const jugadores = await jugadoresDe(partido.id);
  for (const jugador of jugadores) {
    if (await partidoQueSePisa(jugador, empieza, datos.duracion, partido.id)) {
      return error(res, 'overlap', 409, 'A esa hora alguno de vosotros ya tiene otro partido.');
    }
  }
  const antes = await editarPartido(partido.id, { ...datos, empieza });
  if (!antes) return error(res, 'not_found', 404, 'Ese partido ya no se puede cambiar.');
  await recalcularAvisos(partido.id);
  if (datos.duracion < 120) await olvidarSegundaFranja(partido.id);
  await sellarVencidos(partido.id);
  const ahora = { id: partido.id, empieza_at: empieza, duracion_min: datos.duracion, sede: datos.sede, sede_libre: datos.sedeLibre };
  await avisarCambio(antes, ahora, quienEs(user), jugadores);
  res.status(200).json({ ok: true });
}

// Entrar en la lista de espera de un partido completo. No es apuntarse: al
// liberarse una plaza se avisa a todos los que esperan, a la vez.
async function esperarme(req, res, user) {
  if (!exigirFicha(res, user)) return;
  const data = await readBody(req);
  const partido = await partidoVivo(toInt(data?.id));
  if (!partido) return error(res, 'too_late', 409, 'Ese partido ya no admite gente.');
  if ((await jugadoresDe(partido.id)).includes(user.player_id)) {
    return error(res, 'already_in', 409, 'Ya tienes plaza en ese partido.');
  }
  await entrarEnEspera(partido.id, user.player_id);
  res.status(200).json({ ok: true });
}

async function noEsperarme(req, res, user) {
  if (!exigirFicha(res, user)) return;
  const data = await readBody(req);
  const id = toInt(data?.id);
  if (id > 0) await salirDeEspera(id, user.player_id);
  res.status(200).json({ ok: true });
}

// Cancelar es del creador o de un administrador. Borrarse uno mismo es otra
// cosa y la hace `borrarme`.
//
// Tambien quita uno que ya paso sin llegar a cuatro («Quitarlo de aqui» en
// /partidos). Ese no avisa a nadie: no se iba a jugar nada, y «ha cancelado
// el partido del lunes» un jueves no le dice nada util a nadie.
async function cancelar(req, res, user) {
  if (!exigirFicha(res, user)) return;
  const data = await readBody(req);
  const vivo = await partidoVivo(toInt(data?.id));
  const partido = vivo || await partidoPasadoIncompleto(toInt(data?.id));
  if (!partido) return error(res, 'not_found', 404, 'Ese partido ya no existe.');
  if (partido.creador_player_id !== user.player_id && user.role !== 'admin') {
    return error(res, 'forbidden', 403, 'Solo puede cancelarlo quien lo creó.');
  }
  const jugadores = await jugadoresDe(partido.id);
  const esperando = await enEsperaDe(partido.id);
  if (await cancelarPartido(partido.id) && vivo) {
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
  'apuntar-a': ['POST', apuntarA],
  'a-quien-apuntar': ['GET', aQuienApuntar],
  borrarme: ['POST', borrarme],
  sacar: ['POST', sacar],
  moverme: ['POST', moverme],
  editar: ['POST', editar],
  esperarme: ['POST', esperarme],
  'no-esperarme': ['POST', noEsperarme],
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
