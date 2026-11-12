// El pozo: quien juega contra quien en cada ronda, y en que orden acaba la
// clasificacion. Aqui no hay base de datos ni HTTP: entran y salen objetos.
//
// El formato es el del Excel que usa el grupo (Pozo_16_Jugadores, 14/11/2026).
// Lo que la hoja hace con formulas, esto lo hace con indices, y reproduce su
// movimiento de pistas celda a celda. Si algun dia cambia el formato, cambia
// aqui y en ningun otro sitio.
//
// Detalle, y las dos cosas que la hoja hacia mal:
// ai_context/pozo_americano.md

// Una pista llena son dos parejas.
export const JUGADORES_POR_PISTA = 4;

// Limites del formato. No son reglas del padel: son lo que esta pantalla sabe
// pintar y lo que una manana de pistas aguanta.
export const PISTAS_MIN = 2;
export const PISTAS_MAX = 6;
export const RONDAS_MIN = 1;
export const RONDAS_MAX = 12;

// La tabla del grupo, la de la hoja `Puntos` del Excel: [gana, pierde] por
// pista, de la 1 a la 4. Solo vale para cuatro pistas; con otro numero de
// pistas no hay tabla decidida y la tiene que escribir quien crea el torneo.
export const PUNTOS_DEL_GRUPO = [[8, 6], [8, 4], [6, 2], [4, 2]];

// Quien gana un partido.
//
// Un empate a juegos no lo decide el marcador: en la hoja lo avisaba un
// «EMPATE: decidid quien gana» mientras la formula ya le daba la victoria al
// equipo 2 por detras. Aqui, mientras nadie diga quien gano, el partido
// simplemente no esta resuelto y la ronda no se cierra.
export function resultadoDe(partido) {
  const j1 = partido.juegos1;
  const j2 = partido.juegos2;
  if (j1 === null || j1 === undefined || j2 === null || j2 === undefined) return null;

  let ganaEl1;
  if (j1 === j2) {
    if (partido.tieWinner !== 1 && partido.tieWinner !== 2) return null;
    ganaEl1 = partido.tieWinner === 1;
  } else {
    ganaEl1 = j1 > j2;
  }

  return ganaEl1
    ? { ganan: partido.team1, pierden: partido.team2 }
    : { ganan: partido.team2, pierden: partido.team1 };
}

// La primera ronda sale de la siembra, que es una lista ordenada de jugadores:
// el 1 con el 2 forman la pareja 1, el 3 con el 4 la pareja 2, y asi.
//
// Las parejas 1 y 2 empiezan en la ultima pista y las dos ultimas en la 1, que
// es la de arriba: hacia ella suben los que ganan. Dentro de cada pista las
// dos parejas se cruzan, igual que en la hoja.
export function rondaInicial(siembra, pistas) {
  const partidos = [];
  for (let p = 0; p < pistas; p++) {
    const baja = [siembra[4 * p], siembra[4 * p + 1]];
    const alta = [siembra[4 * p + 2], siembra[4 * p + 3]];
    partidos.push({
      round: 1,
      court: pistas - p,
      team1: [baja[0], alta[1]],
      team2: [alta[0], baja[1]]
    });
  }
  return partidos.sort((a, b) => a.court - b.court);
}

// El movimiento de pistas, tal cual lo encadena la hoja:
//
//   pista 1          los que ganan en la 1 y los que ganan en la 2
//   pistas de enmedio los que pierden arriba y los que ganan abajo
//   ultima pista     los que pierden en la penultima y los que pierden en ella
//
// Y en las tres, cruzados: el primero de un sitio con el segundo del otro.
// Devuelve null si falta algun resultado, que es lo que mantiene cerrada la
// ronda siguiente.
export function rondaSiguiente(partidosDeLaRonda, pistas, numeroDeRonda) {
  const ganan = new Map();
  const pierden = new Map();

  for (const partido of partidosDeLaRonda) {
    const r = resultadoDe(partido);
    if (!r) return null;
    ganan.set(partido.court, r.ganan);
    pierden.set(partido.court, r.pierden);
  }
  for (let c = 1; c <= pistas; c++) {
    if (!ganan.has(c)) return null;
  }

  const partidos = [];
  for (let c = 1; c <= pistas; c++) {
    const arriba = c === 1 ? ganan.get(1) : pierden.get(c - 1);
    const abajo = c === 1 ? ganan.get(2) : (c < pistas ? ganan.get(c + 1) : pierden.get(c));
    partidos.push({
      round: numeroDeRonda,
      court: c,
      team1: [arriba[0], abajo[1]],
      team2: [abajo[0], arriba[1]]
    });
  }
  return partidos;
}

// Los puntos de un partido salen de la pista donde se juega, no del marcador:
// ganar en la pista 1 vale mas que ganar en la 4.
function puntosDeLaPista(tablaDePuntos, court) {
  const fila = tablaDePuntos[court - 1];
  return Array.isArray(fila) ? fila : [0, 0];
}

function filaVacia(playerId, orden) {
  return {
    playerId,
    orden,
    jugados: 0,
    ganados: 0,
    puntos: 0,
    difJuegos: 0,
    pistaInicio: 0
  };
}

// Suma un partido ya resuelto a las filas de sus cuatro jugadores.
function anotaPartido(filas, partido, tablaDePuntos, resultado) {
  const [puntosGana, puntosPierde] = puntosDeLaPista(tablaDePuntos, partido.court);
  const diferencia = partido.juegos1 - partido.juegos2;

  for (const [equipo, signo] of [[partido.team1, 1], [partido.team2, -1]]) {
    for (const id of equipo) {
      const fila = filas.get(id);
      if (!fila) continue;
      fila.jugados += 1;
      fila.difJuegos += signo * diferencia;
      const gano = resultado.ganan.includes(id);
      if (gano) fila.ganados += 1;
      fila.puntos += gano ? puntosGana : puntosPierde;
    }
  }
}

// El orden del Excel, con el desempate ya corregido: a igualdad de partidos
// ganados va por delante el que empezo mas abajo (pista 4 antes que pista 1),
// porque subir desde abajo cuesta mas. Despues los puntos, despues la
// diferencia de juegos, y al final el orden de la siembra, para que no haya
// dos jugadores en el mismo puesto.
export function ordenDeLaClasificacion(a, b) {
  return (b.ganados - a.ganados)
    || (b.pistaInicio - a.pistaInicio)
    || (b.puntos - a.puntos)
    || (b.difJuegos - a.difJuegos)
    || (a.orden - b.orden);
}

export function clasificacion(partidos, siembra, tablaDePuntos) {
  const filas = new Map(siembra.map((id, i) => [id, filaVacia(id, i)]));

  for (const partido of partidos) {
    if (partido.round === 1) {
      for (const id of [...partido.team1, ...partido.team2]) {
        const fila = filas.get(id);
        if (fila) fila.pistaInicio = partido.court;
      }
    }
    const resultado = resultadoDe(partido);
    if (resultado) anotaPartido(filas, partido, tablaDePuntos, resultado);
  }

  const orden = [...filas.values()].sort(ordenDeLaClasificacion);
  return orden.map((fila, i) => Object.assign({ puesto: i + 1 }, fila));
}
