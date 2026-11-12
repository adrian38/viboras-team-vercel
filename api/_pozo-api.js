// Las cuatro acciones del pozo. Viven aqui y no dentro de read.js y write.js
// para que esos dos no crezcan: alli solo esta el `case` que llama.
//
// Quien puede que:
//   - crear un pozo: solo un administrador.
//   - apuntar el marcador de una pista: los cuatro que juegan en ella, y un
//     administrador. Pero solo mientras no exista una ronda posterior: una vez
//     formada la siguiente, cambiar el resultado deshace emparejamientos de
//     otra gente, y eso es de administrador.
//
// Detalle: ai_context/pozo_americano.md
import { sql } from '@vercel/postgres';
import { ensureSchema, getPlayerId, readBody, toInt } from './_db.js';
import {
  crearPozo, ensurePozoSchema, eventoPozo, guardarMarcador, leerPozo,
  partidosDelPozo, problemaDeLaConfig, sincronizarRondas
} from './_pozo.js';

const JUEGOS_MAX = 99;

async function preparar() {
  await ensureSchema();
  await ensurePozoSchema();
}

function fechaValida(texto) {
  const p = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(texto);
  if (!p) return false;
  const d = new Date(Date.UTC(Number(p[3]), Number(p[2]) - 1, Number(p[1])));
  return d.getUTCDate() === Number(p[1]) && d.getUTCMonth() === Number(p[2]) - 1;
}

async function nombresDe(ids) {
  if (!ids.length) return new Map();
  const { rows } = await sql`SELECT id, name FROM players WHERE id = ANY(${ids})`;
  return new Map(rows.map((r) => [r.id, r.name]));
}

function conNombres(ids, nombres) {
  return ids.map((id) => ({ id, nombre: nombres.get(id) || 'Jugador ' + id }));
}

// --- getPozos ------------------------------------------------------------

export async function getPozos(req, res) {
  try {
    await preparar();
    const { rows } = await sql`
      SELECT e.id, e.name, e.start_date, e.pozo_config,
             count(m.id) AS partidos,
             count(m.set1_team1) AS jugados
      FROM events e
      LEFT JOIN matches m ON m.event_id = e.id
      WHERE e.type = 'pozo' AND e.pozo_config IS NOT NULL
      GROUP BY e.id
      ORDER BY e.id DESC`;
    const pozos = rows.map((r) => ({
      id: r.id,
      nombre: r.name,
      fecha: r.start_date,
      pistas: r.pozo_config.pistas,
      rondas: r.pozo_config.rondas,
      partidos: Number(r.partidos),
      jugados: Number(r.jugados)
    }));
    res.setHeader('cache-control', 'no-store');
    res.status(200).json({ ok: true, pozos });
  } catch (err) {
    console.error('read:getPozos error', err);
    res.status(500).json({ ok: false, pozos: [] });
  }
}

// --- getPozo -------------------------------------------------------------

function pintaRondas(partidos, nombres, config) {
  const rondas = [];
  for (let r = 1; r <= config.rondas; r++) {
    const deLaRonda = partidos.filter((p) => p.round === r);
    if (!deLaRonda.length) { rondas.push({ numero: r, formada: false, partidos: [] }); continue; }
    rondas.push({
      numero: r,
      formada: true,
      partidos: deLaRonda.map((p) => ({
        id: p.id,
        pista: p.court,
        team1: conNombres(p.team1, nombres),
        team2: conNombres(p.team2, nombres),
        juegos1: p.juegos1,
        juegos2: p.juegos2,
        tieWinner: p.tieWinner,
        puntos: config.puntos[p.court - 1] || [0, 0]
      }))
    });
  }
  return rondas;
}

export async function getPozo(req, res, user) {
  try {
    await preparar();
    const id = toInt(req.query?.id || req.body?.id);
    const datos = id ? await leerPozo(id) : null;
    if (!datos) { res.status(404).json({ ok: false, error: 'no_existe' }); return; }

    const { evento, partidos, clasificacion } = datos;
    const nombres = await nombresDe(evento.config.siembra);
    const mio = partidos.find((p) => user.player_id
      && [...p.team1, ...p.team2].includes(user.player_id));

    res.setHeader('cache-control', 'no-store');
    res.status(200).json({
      ok: true,
      evento: { id: evento.id, nombre: evento.nombre, fecha: evento.fecha, ...evento.config },
      rondas: pintaRondas(partidos, nombres, evento.config),
      clasificacion: clasificacion.map((f) => ({ ...f, nombre: nombres.get(f.playerId) || '' })),
      yo: {
        playerId: user.player_id || null,
        esAdmin: user.role === 'admin',
        juego: Boolean(mio)
      }
    });
  } catch (err) {
    console.error('read:getPozo error', err);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
}

// --- createPozo ----------------------------------------------------------

function problemaDeLosDatos(datos) {
  if (!datos.nombre) return 'El torneo necesita un nombre.';
  if (datos.nombre.length > 120) return 'El nombre del torneo es demasiado largo.';
  if (!fechaValida(datos.fecha)) return 'La fecha no vale. Tiene que ser DD/MM/AAAA.';
  return problemaDeLaConfig(datos);
}

function datosDelFormulario(body) {
  const lista = (v) => (Array.isArray(v) ? v : []);
  return {
    nombre: String(body?.nombre || '').trim(),
    fecha: String(body?.fecha || '').trim(),
    pistas: toInt(body?.pistas),
    rondas: toInt(body?.rondas),
    puntos: lista(body?.puntos).map((fila) => lista(fila).map((n) => toInt(n))),
    jugadores: lista(body?.jugadores).map((n) => String(n || '').trim())
  };
}

// La pagina manda nombres, como el resto de la app. Un nombre que no esta en
// `players` no crea ficha: se para el torneo y se dice cual.
async function siembraDeNombres(nombres) {
  const ids = [];
  for (const nombre of nombres) {
    const id = nombre ? await getPlayerId(nombre) : null;
    if (!id) return { error: `«${nombre || '(vacío)'}» no está en la lista de jugadores.` };
    ids.push(id);
  }
  return { ids };
}

// `events.name` es unica para toda la tabla —no solo entre pozos—, y la
// pagina propone el mismo nombre a todos los pozos de un mismo dia: el
// segundo choca. Cuando pasa, en vez de dejar al administrador adivinando, se
// le dice un nombre que si esta libre. La tabla tiene decenas de filas, asi
// que se traen todos los nombres y se compara aqui: un LIKE obligaria a
// escapar el % y el _ que pueda llevar el nombre que escribio.
async function nombreLibre(base) {
  const { rows } = await sql`SELECT name FROM events`;
  const usados = new Set(rows.map((r) => r.name));
  if (!usados.has(base)) return base;
  for (let n = 2; n <= 99; n++) {
    if (!usados.has(`${base} (${n})`)) return `${base} (${n})`;
  }
  return null;
}

export async function createPozo(req, res, user) {
  if (user.role !== 'admin') { res.status(403).json({ ok: false, error: 'forbidden' }); return; }
  let datos = null;
  try {
    await preparar();
    datos = datosDelFormulario(await readBody(req));
    const resuelta = await siembraDeNombres(datos.jugadores);
    if (resuelta.error) { res.status(400).json({ ok: false, error: 'datos', message: resuelta.error }); return; }
    datos.siembra = resuelta.ids;

    const problema = problemaDeLosDatos(datos);
    if (problema) { res.status(400).json({ ok: false, error: 'datos', message: problema }); return; }

    const id = await crearPozo(datos);
    res.status(200).json({ ok: true, id });
  } catch (err) {
    if (String(err?.code) === '23505') {
      const sugerencia = await nombreLibre(datos?.nombre || '').catch(() => null);
      res.status(409).json({
        ok: false,
        error: 'repetido',
        sugerencia: sugerencia === datos?.nombre ? null : sugerencia,
        message: 'Ya hay un torneo con ese nombre. Ponle otro.'
      });
      return;
    }
    console.error('write:createPozo error', err);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
}

// --- submitPozoResult ----------------------------------------------------

function problemaDelMarcador(juegos1, juegos2, tieWinner) {
  for (const n of [juegos1, juegos2]) {
    if (!Number.isInteger(n) || n < 0 || n > JUEGOS_MAX) {
      return `Los juegos son números enteros de 0 a ${JUEGOS_MAX}.`;
    }
  }
  if (juegos1 === juegos2 && tieWinner !== 1 && tieWinner !== 2) {
    return 'Habéis empatado a juegos: hace falta decir qué pareja gana la pista.';
  }
  return null;
}

function puedeTocar(user, partido, partidos) {
  if (user.role === 'admin') return null;
  const suyo = user.player_id && [...partido.team1, ...partido.team2].includes(user.player_id);
  if (!suyo) return 'Ese partido no es tuyo: solo lo apuntan sus cuatro jugadores o un administrador.';
  if (partidos.some((p) => p.round > partido.round)) {
    return 'Esa ronda ya está cerrada y las siguientes están formadas. Si hay que corregirla, que lo haga un administrador.';
  }
  return null;
}

export async function submitPozoResult(req, res, user) {
  try {
    await preparar();
    const body = await readBody(req);
    const evento = await eventoPozo(toInt(body?.eventId));
    if (!evento) { res.status(404).json({ ok: false, error: 'no_existe' }); return; }

    const partidos = await partidosDelPozo(evento.id);
    const partido = partidos.find((p) => p.id === toInt(body?.matchId));
    if (!partido) { res.status(404).json({ ok: false, error: 'no_existe' }); return; }

    const veto = puedeTocar(user, partido, partidos);
    if (veto) { res.status(403).json({ ok: false, error: 'forbidden', message: veto }); return; }

    if (body?.borrar) {
      await guardarMarcador(partido.id, null, null, null);
    } else {
      const juegos1 = toInt(body?.juegos1);
      const juegos2 = toInt(body?.juegos2);
      const tieWinner = toInt(body?.tieWinner) || null;
      const problema = problemaDelMarcador(juegos1, juegos2, tieWinner);
      if (problema) { res.status(400).json({ ok: false, error: 'marcador', message: problema }); return; }
      await guardarMarcador(partido.id, juegos1, juegos2, juegos1 === juegos2 ? tieWinner : null);
    }

    const perdidos = await sincronizarRondas(evento);
    res.status(200).json({ ok: true, perdidos });
  } catch (err) {
    console.error('write:submitPozoResult error', err);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
}
