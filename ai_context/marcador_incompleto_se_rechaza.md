# Un partido a medias se rechaza, y el motivo lo escribe el servidor

El 11/10/2026 apareció en el historial un `7-5 4-6 3-0`: un partido que se
cortó en el tercer set y que la aplicación guardó sin rechistar. No es un
detalle estético. El motor de rating cuenta 3-0 como set ganado, así que ese
partido entra en el ranking como una victoria 2-1 que nadie jugó.

El grupo decidió que **salte un error** en vez de limpiarlo por detrás, para que
quien lo sube se dé cuenta de que lo ha hecho mal.

## Dónde vive la regla

En `api/_score.js`, `validateBo3Score(data)`. Devuelve `null` si el marcador
describe un partido terminado, o el mensaje en castellano que verá quien lo
sube. `api/write.js` la llama al principio de `submitResult`, **antes** de
`getOrCreatePlayerId`, que crea jugadores: validar después dejaría nombres
nuevos sembrados por un envío rechazado.

La respuesta del rechazo es `400` con
`{ ok:false, error:'invalid_score', message:'…' }`.

**Está sólo en el servidor a propósito.** Las tres páginas que escriben
resultados —`submit-result.html`, `history.html` (añadir y editar) y
`league-results.html`— pasan por el mismo endpoint, y en este repositorio el
motor de rating ya enseña lo que cuesta tener la misma regla escrita tres veces
(`motor_de_rating_duplicado.md`). Las tres se limitan a enseñar `message` en un
`alert`. Si mañana se añade otra página que escriba resultados, hereda la regla
sin tocar nada; lo único que tiene que hacer es mirar la respuesta.

Ojo con eso último: `history.html` **no miraba la respuesta** y recargaba la
tabla como si hubiera guardado. Un rechazo del API se veía como un partido que
desaparece sin explicación.

## Qué se considera terminado

- Los sets 1 y 2 son obligatorios y tienen que estar terminados.
- Un set normal: lo gana quien llega a 6 con dos juegos de diferencia, o el
  7-6. Se aceptan los sets con ventaja (8-6, 9-7); se rechazan 3-0, 6-5 y 6-6.
- El super tie-break (set 3 con `format = 'bo3_stb'`): 10 puntos y dos de
  diferencia.
- Si cada pareja ganó un set, **falta** el tercero.
- Si el partido ya estaba decidido en dos sets, el tercero **es opcional, y se
  admite**: el grupo juega sets de más cuando queda pista. Lo que no se admite
  es dejar ese tercero a medias. El mensaje de ese caso recuerda que se puede
  dejar en blanco.

## Lo que queda fuera

Los torneos. `pozo` y `compas` guardan un marcador a juegos
(`timed_games`, `timed_games_long`: 4-3, 5-1) que no es un set y que esta regla
rechazaría. No pasan por aquí: se cargan por CSV desde `api/league-admin.js`, y
ningún `.html` los edita por `submitResult`. Antes de abrir esa puerta hay que
decidir qué hacer con ellos.

## Lo ya guardado no se tocó

Comprobado el 2026-10-13 contra producción, pasando `validateBo3Score` por los
264 partidos que devuelve `getResults`. **Los 135 que tienen un marcador al
mejor de tres pasan todos**: 71 `legacy`, 39 `ranked` y 24 `grupo_liga`.

Los 129 que no pasan no son historial roto, son filas que nunca van a volver por
`submitResult`:

| Cuántos | Qué son |
| --- | --- |
| 70 | `pozo` y `compas`: marcador a juegos, se editan por `league-admin` |
| 57 | partidos de liga aún sin jugar, con el 0-0 que les puso el cuadro |
| 2 | dos filas `ranked` sin fecha y sin marcador, basura anterior |

Las 57 de liga sí se abren desde `league-results.html`, pero su formulario pide
los dos primeros sets antes de enviar, así que se guardan ya completas. La regla
no deja atrás un historial que ya no se pueda editar.

Las dos filas vacías se borraron ese mismo día (`id` 305 y 306), así que
producción se queda en 262 partidos. **Las otras 127 siguen ahí y tienen que
seguir**: las 57 de liga son el calendario de lo que aún no se ha jugado, y
borrarlas se llevaría por delante los cuadros de octubre y noviembre.

El `7-5 4-6 3-0` que destapó todo esto tampoco está: lo borró el grupo antes de
que llegara la guarda. Si vuelve a aparecer un partido así, ya no entra.
