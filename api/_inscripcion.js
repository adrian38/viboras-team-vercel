// El formulario de inscripcion que se rellena al crear la cuenta. Sustituye al
// Google Form que el grupo usaba antes; las preguntas son las mismas, salvo
// el correo (ya lo tiene la cuenta), el nombre para el grupo (es el de la
// ficha de jugador) y la normativa (es la casilla de acceptRules).
//
// Las opciones viven aqui y en el marcado de cuenta.html. El servidor es quien
// manda: un valor que no este en la lista se rechaza, aunque la pagina lo deje.
//
// Detalle: ai_context/cuentas_y_sesiones.md

import { sql } from '@vercel/postgres';
export const OPCIONES = {
  bkTest: ['si', 'no'],
  bkLevel: ['iniciacion', 'intermedio', 'avanzado', 'entreno'],
  league: ['si', 'no'],
  tournaments: ['si', 'no'],
  rankingPerWeek: ['ninguno', '1-2', '3-4', '+4'],
  availability: [
    'mananas', 'tardes', 'turnos', 'findes',
    'mananas-findes', 'tardes-findes', 'turnos-findes'
  ]
};

const PREGUNTAS = {
  bkTest: 'si hiciste la prueba de nivel en BK',
  bkLevel: 'tu nivel de Bilbao Kirolak',
  league: 'si te interesa jugar liga',
  tournaments: 'si te interesa jugar torneos',
  rankingPerWeek: 'cuántos partidos de ranking jugarías a la semana',
  availability: 'tu disponibilidad'
};

// Las preguntas y respuestas como las lee una persona, para la pantalla
// «Jugadores» del panel (admin-jugadores.js). Mismos textos que
// inscripcion.html; si cambia una opcion alli, cambia aqui.
const TITULOS = {
  fullName: 'Nombre y apellidos', phone: 'Teléfono', bkTest: 'Prueba de nivel BK',
  bkLevel: 'Nivel BK', league: 'Liga', tournaments: 'Torneos',
  rankingPerWeek: 'Ranking por semana', availability: 'Disponibilidad'
};
const TEXTOS = {
  si: 'Sí', no: 'No', ninguno: 'Ninguno', iniciacion: 'Iniciación', intermedio: 'Intermedio',
  avanzado: 'Avanzado', entreno: 'Entreno', mananas: 'Solamente mañanas', tardes: 'Solamente tardes',
  turnos: 'Turnos mañana/tarde', findes: 'Solamente findes', 'mananas-findes': 'Mañanas + findes',
  'tardes-findes': 'Tardes + findes', 'turnos-findes': 'Turnos mañana/tarde + findes'
};

// Puntos de salida por nivel BK, los que promete rating-info.html. Entreno va
// a 2000,01 y no a 2000: la categoria Entreno es «mas de 2000» y con 2000
// justos saldria en Avanzado (decidido por Adrian el 2026-10-17).
export const RATING_DE_PARTIDA = { iniciacion: 1200, intermedio: 1400, avanzado: 1800, entreno: 2000.01 };

// Al aprobar un alta. Solo si el jugador no tiene ningun partido ni rating de
// partida: quien ya jugaba conserva su historia aunque rellenara el nivel.
export async function fijarRatingDePartida(playerId, form) {
  const rating = RATING_DE_PARTIDA[(form || {}).bkLevel];
  if (!playerId || !rating) return;
  await sql`
    UPDATE players SET initial_rating = ${rating}
    WHERE id = ${playerId} AND initial_rating IS NULL
      AND NOT EXISTS (SELECT 1 FROM matches m
        WHERE ${playerId} IN (m.player1a_id, m.player1b_id, m.player2a_id, m.player2b_id))`;
}

export function describirInscripcion() {
  return Object.keys(TITULOS).map((campo) => ({
    campo,
    titulo: TITULOS[campo],
    opciones: OPCIONES[campo] ? OPCIONES[campo].map((v) => [v, TEXTOS[v] || v]) : null
  }));
}

const fallo = (message) => ({ error: 'bad_form', message });

// Devuelve { form } con lo que se guarda, o { error, message }.
export function validarInscripcion(datos) {
  if (!datos || typeof datos !== 'object') return fallo('Rellena el formulario de inscripción antes de crear la cuenta.');
  const d = datos;
  const fullName = String(d.fullName || '').trim().replace(/\s+/g, ' ');
  if (fullName.length < 3 || fullName.length > 100 || /[<>"'`&]/.test(fullName)) {
    return fallo('Escribe tu nombre y apellidos.');
  }
  const phone = String(d.phone || '').trim();
  const digitos = phone.replace(/\D/g, '');
  if (!/^\+?[\d\s.-]+$/.test(phone) || digitos.length < 9 || digitos.length > 15) {
    return fallo('Escribe un teléfono válido para el grupo de WhatsApp.');
  }
  const form = { fullName, phone };
  for (const [campo, validas] of Object.entries(OPCIONES)) {
    const valor = String(d[campo] || '');
    if (!validas.includes(valor)) return fallo(`Falta ${PREGUNTAS[campo]}.`);
    form[campo] = valor;
  }
  return { form };
}

// Los nueve ultimos digitos: «+34 600 00 00 00», «0034600000000» y
// «600-000-000» son el mismo telefono.
function claveDeTelefono(phone) {
  return String(phone || '').replace(/\D/g, '').slice(-9);
}

// Un telefono no puede estar en dos cuentas (lo pidio Adrian, 2026-10-17).
// Cuentan todas, rechazadas incluidas: si no, quien fue rechazado volveria a
// pedir entrar con otro correo. Se compara en JavaScript porque el telefono
// vive dentro del JSONB y llega escrito de cualquier manera.
// `excepto`: la cuenta que se esta editando, que no choca consigo misma.
export async function telefonoLibre(form, excepto = null) {
  const clave = claveDeTelefono(form.phone);
  const { rows } = await sql`
    SELECT status, signup_form->>'phone' AS phone FROM users
    WHERE signup_form ? 'phone' AND id IS DISTINCT FROM ${excepto}`;
  const igual = rows.find((r) => claveDeTelefono(r.phone) === clave);
  return igual ? { error: 'phone_taken', message: mensajeDeSolicitud('ese teléfono', igual.status) } : null;
}

// Quien repite el alta se entera de en que esta la que ya hizo, en vez de un
// «ya existe» a secas (lo pidio Adrian, 2026-10-17).
const ESTADO_DE_SOLICITUD = {
  pending: 'está pendiente de que un administrador la apruebe. Te avisaremos por correo.',
  active: 'ya está aprobada: entra con tu cuenta.',
  blocked: 'está bloqueada. Habla con un administrador.',
  rejected: 'no se aprobó. Habla con un administrador.'
};

export function mensajeDeSolicitud(con, status) {
  return `Ya hay una solicitud con ${con} y ${ESTADO_DE_SOLICITUD[status] || 'no se puede repetir.'}`;
}
