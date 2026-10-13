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

// Devuelve null si el set esta terminado, o por que no lo esta.
function setUnfinishedReason(a, b, isSuperTiebreak) {
  if (a === b) return 'un set no puede quedar empatado';
  const w = Math.max(a, b);
  const l = Math.min(a, b);
  if (isSuperTiebreak) {
    if (w < 10) return 'el super tie-break se gana a 10 puntos';
    if (w - l < 2) return 'el super tie-break se gana por dos puntos de diferencia';
    return null;
  }
  if (w < 6) return 'un set se gana con 6 juegos';
  if (w - l < 2 && !(w === 7 && l === 6)) return 'un set se gana por dos juegos de diferencia, salvo el 7-6';
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
    const razon = setUnfinishedReason(a, b, false);
    if (razon) return `El set ${i + 1} (${a}-${b}) no está terminado: ${razon}.`;
  }

  // Un tercer set con el partido ya decidido no sobra: el grupo lo juega. Lo
  // que no vale es dejarlo a medias, decida o no.
  const decidido = (marcador[0][0] > marcador[0][1]) === (marcador[1][0] > marcador[1][1]);
  const [a, b] = marcador[2];
  if (a === null) {
    return decidido ? null : 'Cada pareja ganó un set: falta el tercero para que el partido esté terminado.';
  }

  const razon = setUnfinishedReason(a, b, isStb);
  if (!razon) return null;
  const salida = decidido ? ' Si se quedó a medias, déjalo en blanco.' : '';
  return `El set 3 (${a}-${b}) no está terminado: ${razon}.${salida}`;
}
