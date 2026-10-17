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
export async function telefonoLibre(form) {
  const clave = claveDeTelefono(form.phone);
  const { rows } = await sql`SELECT signup_form->>'phone' AS phone FROM users WHERE signup_form ? 'phone'`;
  if (!rows.some((r) => claveDeTelefono(r.phone) === clave)) return null;
  return { error: 'phone_taken', message: 'Ese teléfono ya está en otra cuenta. Si es el tuyo, habla con un administrador.' };
}
