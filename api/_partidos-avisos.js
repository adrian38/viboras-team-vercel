// Los avisos de un partido previsto: quien se apunta, quien se borra, cuando
// se llena y cuando se cancela.
//
// Todos salen por crearAviso (api/_avisos.js), que es la unica puerta de la
// campanita y manda el push en la misma llamada. Aqui no se inserta en
// `avisos` ni se llama a `pushAJugadores` por separado.
//
// Los destinatarios se calculan SIEMPRE despues de que la plaza se haya
// tomado o liberado, leyendolos de la base: asi la cuenta de plazas libres
// que lleva el texto es la de verdad y no la de antes del cambio.
//
// Detalle: ai_context/partidos_previstos.md
import { crearAviso } from './_avisos.js';
import { nombreDeSede } from './_partidos.js';

// «sáb, 5 dic, 19:00-21:00». En hora peninsular y no en la del servidor, que
// en Vercel es UTC: en verano se iria una hora.
export function cuandoDice(fila) {
  const empieza = new Date(fila.empieza_at);
  const termina = new Date(empieza.getTime() + fila.duracion_min * 60000);
  const opciones = { timeZone: 'Europe/Madrid' };
  const fecha = empieza.toLocaleDateString('es-ES', { ...opciones, weekday: 'short', day: 'numeric', month: 'short' });
  const hora = (d) => d.toLocaleTimeString('es-ES', { ...opciones, hour: '2-digit', minute: '2-digit' });
  return `${fecha}, ${hora(empieza)}-${hora(termina)}`;
}

// «jue 5 dic, 19:00-21:00 en San Inazio», que es como se nombra un partido en
// todos los avisos. Una sola forma, para que no haya dos maneras de decirlo.
export function partidoDice(fila) {
  return `${cuandoDice(fila)} en ${nombreDeSede(fila)}`;
}

function plazasDice(libres) {
  if (libres <= 0) return 'Ya sois cuatro.';
  return libres === 1 ? 'Queda 1 plaza.' : `Quedan ${libres} plazas.`;
}

const enlaceDe = (id) => `/partido?id=${id}`;

// Alguien ocupa una plaza. Si con ella se llena, sale el aviso de completo a
// los cuatro y no ademas el de «se ha apuntado»: un solo push por hecho.
export async function avisarApuntado(fila, quien, jugadores) {
  const libres = 4 - jugadores.length;
  const otros = jugadores.filter((id) => id !== quien.id);
  if (libres <= 0) {
    const texto = `¡Partido completo! ${partidoDice(fila)}. Ya sois cuatro.`;
    await crearAviso(jugadores, texto, enlaceDe(fila.id));
    return;
  }
  const texto = `${quien.nombre} se ha apuntado al partido del ${partidoDice(fila)}. ${plazasDice(libres)}`;
  await crearAviso(otros, texto, enlaceDe(fila.id));
}

// El organizador incorpora a alguien. Dos avisos distintos a proposito: al
// incorporado se le dice que le han apuntado —que es lo que le ha pasado, y
// no se ha enterado por su cuenta— y a los demas, quien ha entrado. Uno solo
// con el texto de «se ha apuntado» seria falso para el incorporado, que no
// se apunto.
export async function avisarIncorporado(fila, quien, aQuien, jugadores) {
  const libres = 4 - jugadores.length;
  const cierre = libres <= 0 ? 'El partido está completo.' : plazasDice(libres);
  await crearAviso([aQuien.id], `${quien.nombre} te ha apuntado al partido del ${partidoDice(fila)}. ${cierre}`, enlaceDe(fila.id));
  const otros = jugadores.filter((id) => id !== quien.id && id !== aQuien.id);
  const texto = `${quien.nombre} ha apuntado a ${aQuien.nombre} al partido del ${partidoDice(fila)}. ${cierre}`;
  await crearAviso(otros, texto, enlaceDe(fila.id));
}

// Alguien suelta su plaza: lo saben los que quedan. Si no queda nadie no hay
// a quien avisar, y crearAviso con la lista vacia no hace nada.
export async function avisarBaja(fila, quien, jugadores) {
  const libres = 4 - jugadores.length;
  const texto = `${quien.nombre} se ha borrado del partido del ${partidoDice(fila)}. ${plazasDice(libres)}`;
  await crearAviso(jugadores, texto, enlaceDe(fila.id));
}

// Se cancela el partido entero. Lo saben los apuntados que quedan y tambien
// quienes esperaban una plaza, que si no se quedarian esperando algo que ya
// no va a pasar. Menos quien lo cancela.
export async function avisarCancelado(fila, quien, jugadores, enEspera) {
  const destinos = [...jugadores, ...enEspera].filter((id) => id !== quien.id);
  const texto = `${quien.nombre} ha cancelado el partido del ${partidoDice(fila)}.`;
  await crearAviso(destinos, texto, enlaceDe(fila.id));
}
