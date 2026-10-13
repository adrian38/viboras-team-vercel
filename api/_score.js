// Marcadores al mejor de tres sets: que es un set terminado y que es un
// partido terminado.
//
// Un partido a medias no da error por si solo: entra en `matches` como
// cualquier otro y el motor de rating lo cuenta. Un tercer set 3-0 son dos
// sets para quien lo "gano" y el partido pasa a decidido. Por eso esto
// rechaza, en vez de corregir por detras.
//
// Vive en el servidor y no en las paginas a proposito: `submit-result.html`,
// `history.html` y `league-results.html` escriben por el mismo endpoint, y el
// motor de rating ya esta triplicado en este repositorio. Las tres enseñan el
// mensaje que devuelve el API.
//
// Fuera de aqui quedan los torneos (`timed_games`, pozo y cuadros), que se
// cargan por `api/league-admin.js` y si admiten marcadores a juegos.

const NOMBRE_SET = ['set 1', 'set 2', 'set 3'];

function toScore(value) {
  const raw = String(value === undefined || value === null ? '' : value).trim();
  if (raw === '') return null;
  if (!/^\d+$/.test(raw)) return NaN;
  return parseInt(raw, 10);
}

// Dos cosas distintas que la pagina decia igual: un 3-0 es un set **sin
// terminar** y un 8-2 **no puede ser**, porque aqui siempre se juega el
// tie-break y de 7 juegos no se pasa. Devuelve null si el set esta terminado,
// o la frase que sigue a "El set 1 (8-2) ".
function setProblema(a, b) {
  const w = Math.max(a, b);
  const l = Math.min(a, b);
  if (a === b) {
    if (w === 6) return 'no está terminado: a 6-6 se juega el tie-break, y el set acaba en 7-6';
    return 'no puede ser: un set no acaba en empate';
  }
  if (w > 7) return 'no puede ser: un set no pasa de 7 juegos, que a 6-6 se juega el tie-break';
  if (w === 7 && l < 5) return 'no puede ser: un 7 solo sale de un 7-5 o de un 7-6';
  if (w < 6) return 'no está terminado: un set se gana con 6 juegos';
  if (w === 6 && l > 4) return 'no está terminado: con 6-5 el set sigue, y acaba en 7-5 o en 7-6';
  return null;
}

// El super tie-break es otra cosa: 10 puntos y dos de diferencia, sin techo.
function tiebreakProblema(a, b) {
  if (a === b) return 'no puede ser: un super tie-break no acaba en empate';
  const w = Math.max(a, b);
  const l = Math.min(a, b);
  if (w < 10) return 'no está terminado: el super tie-break se gana a 10 puntos';
  if (w - l < 2) return 'no está terminado: el super tie-break se gana por dos puntos de diferencia';
  return null;
}

function sets(data) {
  return [
    [toScore(data.s11), toScore(data.s21)],
    [toScore(data.s12), toScore(data.s22)],
    [toScore(data.s13), toScore(data.s23)],
  ];
}

// null si el marcador describe un partido terminado; si no, el mensaje que
// ve quien lo esta subiendo.
export function validateBo3Score(data) {
  const isStb = String(data.format || '').trim().toLowerCase() === 'bo3_stb';
  const marcador = sets(data);

  for (let i = 0; i < 3; i++) {
    const [a, b] = marcador[i];
    if (Number.isNaN(a) || Number.isNaN(b)) return `Los juegos del ${NOMBRE_SET[i]} tienen que ser números enteros.`;
    if ((a === null) !== (b === null)) return `Falta un marcador en el ${NOMBRE_SET[i]}.`;
  }

  if (marcador[0][0] === null || marcador[1][0] === null) {
    return 'Un partido terminado tiene al menos dos sets. Si se quedó a medias, no se sube.';
  }

  for (let i = 0; i < 2; i++) {
    const [a, b] = marcador[i];
    const problema = setProblema(a, b);
    if (problema) return `El set ${i + 1} (${a}-${b}) ${problema}.`;
  }

  // Quien gana los dos primeros sets gana el partido: ahi se acaba. Un tercer
  // set apuntado despues no es un partido mas largo, es un marcador mal metido,
  // y sus juegos entran en el rating.
  const decidido = (marcador[0][0] > marcador[0][1]) === (marcador[1][0] > marcador[1][1]);
  const [a, b] = marcador[2];
  if (decidido) {
    if (a === null) return null;
    return `La misma pareja ganó los dos primeros sets: ahí se acabó el partido, el set 3 (${a}-${b}) sobra.`;
  }
  if (a === null) {
    return 'Cada pareja ganó un set: falta el tercero para que el partido esté terminado.';
  }

  const problema = isStb ? tiebreakProblema(a, b) : setProblema(a, b);
  if (problema) return `El set 3 (${a}-${b}) ${problema}.`;
  return null;
}
