// Editar un partido previsto y entrar o salir de su lista de espera.
//
// Editar no toca las plazas: cambia cuando, cuanto, donde y el comentario.
// Lo delicado es lo demas, y esta todo aqui.
//
// Detalle: ai_context/partidos_previstos.md
import { sql } from '@vercel/postgres';
import { crearAviso } from './_avisos.js';
import { nombreDeSede } from './_partidos.js';
import { cuandoDice, partidoDice } from './_partidos-avisos.js';

// Cambia el partido y devuelve la fila de ANTES, que es la que hace falta
// para poder decir en el aviso que cambio. Null si ya no se puede editar.
export async function editarPartido(id, datos) {
  const { empieza, duracion, sede, sedeLibre, comentario } = datos;
  const { rows } = await sql`
    UPDATE partidos_previstos p
    SET empieza_at = ${empieza}, duracion_min = ${duracion}, sede = ${sede},
        sede_libre = ${sedeLibre}, comentario = ${comentario}
    FROM (SELECT id, empieza_at, duracion_min, sede, sede_libre FROM partidos_previstos WHERE id = ${id}) AS antes
    WHERE p.id = antes.id AND p.cancelado_at IS NULL AND p.cerrado_at IS NULL AND p.empieza_at > now()
    RETURNING antes.empieza_at, antes.duracion_min, antes.sede, antes.sede_libre`;
  return rows.length ? rows[0] : null;
}

// Al mover la hora o la duracion, los instantes de los recordatorios cambian.
//
// Las claves que ya se mandaron se quedan: un aviso enviado no se puede
// desenviar, y repetirlo porque la hora se movio media hora seria ruido. Las
// que nacieron omitidas (el partido se convoco con menos de 48 h y su aviso
// de reserva ya habia vencido) si se borran: con la hora nueva puede que
// vuelvan a tener sentido, y si no la tienen, el cron las volvera a sellar.
//
// Una clave que no existe es una que aun no se ha resuelto; no hay nada que
// borrar en ese caso.
export async function recalcularAvisos(id) {
  await sql`DELETE FROM partido_avisos WHERE partido_id = ${id} AND omitido = TRUE`;
}

// `reserva:2` solo existe en los partidos de dos horas, que son dos franjas
// que reservar. Al bajar a una hora, su marca sobra.
export async function olvidarSegundaFranja(id) {
  await sql`DELETE FROM partido_avisos WHERE partido_id = ${id} AND clave = 'reserva:2'`;
}

// Cada cosa que cambio, dicha una sola vez: el trozo de la hora usa
// `cuandoDice` y no `partidoDice`, que lleva la sede dentro y la repetiria
// cuando ademas se ha cambiado de sitio.
function cambios(antes, ahora) {
  const lista = [];
  if (new Date(antes.empieza_at).getTime() !== new Date(ahora.empieza_at).getTime()
    || antes.duracion_min !== ahora.duracion_min) {
    lista.push(`ahora es el ${cuandoDice(ahora)}`);
  }
  if (antes.sede !== ahora.sede || antes.sede_libre !== ahora.sede_libre) {
    lista.push(`se juega en ${nombreDeSede(ahora)} y no en ${nombreDeSede(antes)}`);
  }
  return lista;
}

// Solo avisa si cambio algo que afecte a quien va a jugar: tocar el
// comentario no despierta cuatro moviles.
export async function avisarCambio(antes, ahora, quien, jugadores) {
  const lista = cambios(antes, ahora);
  if (!lista.length) return;
  const texto = `${quien.nombre} ha cambiado el partido del ${partidoDice(antes)}: ${lista.join(', ')}.`;
  await crearAviso(jugadores.filter((p) => p !== quien.id), texto, `/partido?id=${ahora.id}`);
}

// Lista de espera. Entrar no es apuntarse, y la pantalla lo dice con esas
// palabras: al liberarse una plaza se avisa a todos a la vez y entra quien
// llegue antes. No se reserva la plaza para el primero de la cola.
export async function entrarEnEspera(partidoId, playerId) {
  await sql`
    INSERT INTO partido_espera (partido_id, player_id) VALUES (${partidoId}, ${playerId})
    ON CONFLICT DO NOTHING`;
}

export async function salirDeEspera(partidoId, playerId) {
  await sql`DELETE FROM partido_espera WHERE partido_id = ${partidoId} AND player_id = ${playerId}`;
}

// Se ha liberado una plaza de un partido que estaba completo: lo saben todos
// los que esperaban, a la vez.
export async function avisarPlazaLibre(fila, enEspera) {
  if (!enEspera.length) return;
  const texto = `Ha quedado una plaza libre en el partido del ${partidoDice(fila)}. Corre.`;
  await crearAviso(enEspera, texto, `/partido?id=${fila.id}`);
}
