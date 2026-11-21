// El disparador de los recordatorios de partido. Lo llama un cron, no una
// persona: es la unica funcion del proyecto que no exige sesion y la unica
// que no se alcanza desde ninguna pantalla.
//
// Sin CRON_SECRET en el entorno responde 503 y no hace NADA. Es a proposito:
// un endpoint que manda pushes a todo el grupo no puede quedarse abierto
// porque alguien olvidara una variable.
//
// Detalle: ai_context/recordatorios_y_cron.md
import { timingSafeEqual } from 'node:crypto';
import { sinCache } from './_auth.js';
import { ensurePartidosSchema } from './_partidos.js';
import { pasada } from './_partidos-cron.js';
import { recalcularSinRuido } from './_rating.js';

// Comparacion en tiempo constante, como las contrasenas: un `===` filtra el
// secreto por el tiempo que tarda en fallar.
function autorizado(req) {
  const esperado = process.env.CRON_SECRET || '';
  if (!esperado) return null;
  const dado = String(req.headers?.authorization || '').replace(/^Bearer\s+/i, '');
  const a = Buffer.from(dado);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

export default async function handler(req, res) {
  sinCache(res);
  const permiso = autorizado(req);
  if (permiso === null) {
    res.status(503).json({ ok: false, error: 'sin_configurar' });
    return;
  }
  if (!permiso) {
    res.status(401).json({ ok: false, error: 'unauthorized' });
    return;
  }
  try {
    await ensurePartidosSchema();
    const hecho = await pasada();
    // Red de seguridad del rating guardado: lo normal es que se recalcule al
    // meter o editar un resultado, pero si una de esas veces fallo, la tabla
    // se queda vieja y callada. Aqui se vuelve a intentar.
    const rating = await recalcularSinRuido('pasada del cron');
    res.status(200).json({ ok: true, ...hecho, rating });
  } catch (err) {
    console.error('cron-partidos error', err);
    if (!res.headersSent) res.status(500).json({ ok: false, error: 'server_error' });
  }
}
