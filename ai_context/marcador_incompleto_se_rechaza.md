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

**Está sólo en el servidor a propósito.** Las páginas que escriben
resultados —`submit-result.html` e `history.html` (añadir y editar); hasta el
2026-10-16 también `league-results.html`, que se retiró con las ligas— pasan
por el mismo endpoint, y en este repositorio el
motor de rating ya enseña lo que cuesta tener la misma regla escrita tres veces
(`motor_de_rating_duplicado.md`). Las tres se limitan a enseñar `message` en un
`alert`. Si mañana se añade otra página que escriba resultados, hereda la regla
sin tocar nada; lo único que tiene que hacer es mirar la respuesta.

Ojo con eso último: `history.html` **no miraba la respuesta** y recargaba la
tabla como si hubiera guardado. Un rechazo del API se veía como un partido que
desaparece sin explicación.

## Qué se considera terminado

- Los sets 1 y 2 son obligatorios y tienen que estar terminados.
- **Un set acaba en 6-0, 6-1, 6-2, 6-3, 6-4, 7-5 o 7-6, y en nada más.** Aquí
  siempre se juega el tie-break, así que de 7 juegos no se pasa: 8-6 y 9-7 se
  rechazan igual que 3-0, 6-5 o 7-4. La lista es tan corta que la regla se lee
  entera de un vistazo, y conviene que siga así.
- El super tie-break (set 3 con `format = 'bo3_stb'`) es la excepción: 10
  puntos y dos de diferencia, sin techo (12-10 vale).
- Si cada pareja ganó un set, **falta** el tercero.
- **Si la misma pareja ganó los dos primeros, ahí se acabó el partido y el
  tercero sobra.** Da igual que esté bien jugado: el rating suma los juegos de
  los tres sets, así que un tercer set apuntado después mueve el ranking con
  juegos que no contaban. Esto es exactamente lo que el grupo estaba pidiendo
  que diera error, y confundirlo con «el tercero es opcional» costó una
  entrega.

## Lo que queda fuera

Los torneos. `pozo` y `compas` guardan un marcador a juegos
(`timed_games`, `timed_games_long`: 4-3, 5-1) que no es un set y que esta regla
rechazaría. No pasan por aquí: se cargan por CSV desde `api/league-admin.js`, y
ningún `.html` los edita por `submitResult`. Antes de abrir esa puerta hay que
decidir qué hacer con ellos.

## Lo ya guardado

Comprobado el 2026-10-13 contra producción, pasando `validateBo3Score` por los
263 partidos de la base. De los 136 que tienen un marcador al mejor de tres,
**pasan 132 y fallan 4**:

| `id` | Marcador | Por qué |
| --- | --- | --- |
| 92 | 9-11 4-6 | sets de más de 7 juegos, de la carga antigua |
| 114 | 8-6 12-10 | lo mismo |
| 145 | 6-8 6-2 6-2 | lo mismo |
| 310 | 6-1 6-2 3-6 | el tercero sobra: el partido estaba ganado en dos |

Los otros 127 rechazados no son historial roto, son filas que no vuelven por
`submitResult`: 70 de `pozo` y `compas`, que guardan juegos y se editan por
`league-admin`, y 57 partidos de liga aún sin jugar, con el 0-0 que les puso el
cuadro. **Esos 57 son el calendario**: borrarlos se llevaría por delante los
cuadros de octubre y noviembre. Se abrían desde `league-results.html`, cuyo
formulario pedía los dos primeros sets antes de enviar.

**Desde el 2026-10-16 no hay ligas en la app**: se quitaron sus páginas y sus
opciones del panel de administración. Esos 57 partidos siguen en la base,
porque no se borró ningún dato, pero ya nadie puede ponerles resultado. El
rating los ignora, porque un 0-0 no es un partido terminado. El API de ligas
(`api/league-admin.js`, `api/read.js`) sigue ahí; los torneos usan el mismo
`league-admin.js`.

También había dos filas `ranked` sin fecha, sin jugadores y sin marcador
(`id` 305 y 306): se borraron ese día; la cuenta de 263 ya las descuenta.

El `7-5 4-6 3-0` que destapó todo esto no está: lo borró el grupo antes de que
llegara la guarda. Si vuelve a aparecer un partido así, ya no entra.
