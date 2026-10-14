// Verificacion del token de Google.
//
// El flujo es el de Google Identity Services: el boton vive en el navegador,
// el usuario elige su cuenta en una ventana emergente y el callback recibe un
// `credential`, que es un JWT firmado por Google. Ese token llega aqui y se
// comprueba contra las claves publicas de Google.
//
// Se eligio este y no el de codigo de autorizacion porque NO necesita
// client_secret, ni URI de redireccion, ni cookie de estado: en Vercel eso
// significa que no hay nada que reconfigurar por entorno. A cambio, los
// despliegues de preview tienen dominio aleatorio y Google exige origenes
// autorizados fijos, asi que Google solo funciona en produccion y en
// localhost. Con `viboras` desplegando directo a produccion, da igual.
//
// La verificacion la hace `jose` y no esta escrita a mano a proposito: son
// seis comprobaciones (firma, alg, kid, iss, aud, exp) y olvidar una es un
// agujero que no avisa. `jose` no arrastra dependencias.
//
// Detalle: ai_context/cuentas_y_sesiones.md
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { normalizarCorreo } from './_auth.js';

// A nivel de modulo: asi la cache de claves sobrevive entre invocaciones
// calientes del mismo lambda y no se piden en cada entrada.
const CLAVES = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

const EMISORES = ['https://accounts.google.com', 'accounts.google.com'];

export function googleClientId() {
  return String(process.env.GOOGLE_CLIENT_ID || '').trim();
}

export class ErrorDeGoogle extends Error {
  constructor(codigo, mensaje) {
    super(codigo);
    this.codigo = codigo;
    this.texto = mensaje;
  }
}

export async function verificarCredencial(credential) {
  const clientId = googleClientId();
  if (!clientId) {
    throw new ErrorDeGoogle('google_no_configurado', 'La entrada con Google no está configurada.');
  }
  let payload;
  try {
    const verificado = await jwtVerify(String(credential || ''), CLAVES, {
      issuer: EMISORES,
      audience: clientId,
      algorithms: ['RS256'],
      clockTolerance: 60
    });
    payload = verificado.payload;
  } catch (err) {
    console.error('auth:google token invalido', err?.code || err?.message);
    throw new ErrorDeGoogle('bad_credential', 'Google no ha confirmado la identidad. Vuelve a intentarlo.');
  }
  const email = normalizarCorreo(payload.email);
  // Sin esto, enlazar una cuenta por el correo seria suplantacion: Google
  // emite el token igualmente para un correo que su dueno no ha confirmado.
  if (!email || payload.email_verified !== true) {
    throw new ErrorDeGoogle('email_sin_verificar', 'Google no ha verificado ese correo.');
  }
  return { sub: String(payload.sub), email, nombre: payload.name || null };
}
