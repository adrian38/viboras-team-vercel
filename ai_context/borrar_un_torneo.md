# Borrar un torneo

Escrito el 2026-11-12, el día que se añadió. Hasta entonces **un torneo creado
no se podía deshacer desde la app**: `league-admin.js` sólo sabía crear, el
botón «Borrar» de `/pozo` borra el marcador de una pista y no el torneo, y
`deleteResult` de `write.js` tiene vetados los partidos de torneo desde ese
mismo día (`ai_context/partidos_de_torneo_no_se_editan_como_sueltos.md`).
Quitar un pozo equivocado era SQL a mano contra Neon.

## Dónde vive

| Pieza | Fichero |
| --- | --- |
| La lista de tipos que son un torneo | `EVENTOS_DE_TORNEO`, en `api/_db.js` |
| El listado para el panel (sólo admin) | `getTournaments`, en `api/read.js` |
| El borrado | `deleteTournament`, en `api/league-admin.js` |
| La pantalla | «Borrar torneo» del panel de `/`, en `front/pantallas/portada/portada.js` |

Está en el panel de administración de la portada, debajo de «Nuevo torneo
Pozo», porque es donde se crean: deshacer vive al lado de hacer. `/tournaments`
sigue siendo de sólo lectura.

## Qué borra, exactamente

El evento y **todos sus partidos**. Con ellos se van en cascada las
valoraciones de esos partidos (`match_feedback.match_id` es `ON DELETE
CASCADE`). No tiene vuelta atrás y no hay papelera.

**No queda ningún aviso suelto apuntando al torneo**, y conviene saber por qué,
porque a primera vista parece que sí:

- `avisarTorneo()` (`api/_avisos.js`) **no pasa por `crearAviso()`**: llama
  directo a `pushAJugadores`. Es decir, manda el push al móvil y **no guarda
  nada** en la tabla `avisos`. Un push ya entregado no se puede retirar, pero
  tampoco deja fila que borrar.
- Lo que sí se ve en la campanita y en `/valorar` son las valoraciones
  pendientes, y ésas **no son filas**: `partidosParaValorar()` las calcula al
  vuelo leyendo `matches`. Sin los partidos, desaparecen solas.

Medido el 2026-11-12 en la base local: cero filas en `avisos` cuyo texto
empiece por «Ya están los resultados de», y los únicos enlaces guardados son
`/buzon`, `/tablon` y `/history`.

Y ese push casi nunca ha salido. `avisarTorneo()` tiene **un solo sitio que lo
llama**: `crearTorneo()` de `api/league-admin.js`, o sea los torneos que entran
por CSV desde el panel (Pozo y Compás). El pozo de `/pozo-nuevo` va por
`crearPozo()` de `api/_pozo.js`, que **no avisa a nadie**. Además, aunque se
llame, el push se queda en nada si la fecha del torneo cae fuera de los
`DIAS_PARA_VALORAR` (14) o si quien debería recibirlo no tiene ningún
dispositivo en `push_subscriptions`.

Si llegó a salir, sigue en los móviles que lo recibieron y al tocarlo lleva a
`/valorar`, que estará vacío o con otros partidos. Eso no tiene arreglo desde
aquí.

## Sólo torneos, y sólo administradores

- El handler de `league-admin.js` ya responde 403 a quien no es admin, antes de
  mirar la acción. `getTournaments` lo repite con `exigirAdmin` porque vive en
  `read.js`, que sólo exige sesión.
- Se borran sólo los tipos de `EVENTOS_DE_TORNEO`: `pozo`, `compas` y
  `doble_ko`. Un `grupo_liga` no, porque se llevaría una fase de la liga por
  delante dejando la fila de `leagues` coja; un `ranked` o un `legacy` tampoco,
  porque esos son los partidos sueltos del grupo entero y se borran de uno en
  uno desde `/history`.
- La lista de tipos vivía copiada en `write.js`. Desde hoy está en `_db.js` y
  la comparten el veto de edición, el listado y el borrado: tres copias serían
  tres listas que se separan.

## El borrado va en UNA sentencia

`matches.event_id` es `ON DELETE RESTRICT`, así que hay que borrar los partidos
antes que el evento. Con el driver HTTP de Neon cada `sql` suelto es su propia
transacción: dos sentencias y un fallo en medio dejarían el torneo vacío con el
nombre cogido —`events.name` es único en toda la tabla—, que es el atasco que
ya describe `ai_context/pozo_americano.md`. Por eso los dos `DELETE` van en un
CTE con un `SELECT` final, igual que `createLeague` y `crearTorneo`.

**Que eso funcione con `RESTRICT` no es evidente y está medido**, no deducido:
la comprobación de la clave ajena es un disparador que corre al terminar la
sentencia, cuando los partidos ya no están. En el Postgres 17 del entorno local
borró evento, 3 partidos y la valoración de uno de ellos sin tocar nada más.

## Lo comprobado el 2026-11-12, en local

Contra `localhost:3001` con Postgres propio (42 jugadores, 25 partidos):

| Prueba | Resultado |
| --- | --- |
| `getTournaments` como admin | 200 con los dos torneos y sus partidos |
| `getTournaments` como miembro | 403 |
| `getTournaments` sin sesión | 401 |
| `deleteTournament` como miembro | 403, el torneo sigue |
| `deleteTournament` sobre el evento `ranked` | 400 «no es un torneo» |
| `deleteTournament` sobre un id que no existe | 404 |
| `deleteTournament` sin `event_id` | 400 |
| `deleteTournament` como admin | 200, y en la base no quedan ni el evento, ni sus partidos, ni valoraciones huérfanas |
| Por la pantalla, con el modal | borró el torneo y refrescó la lista; la base volvió a 25 partidos y 5 eventos |

El modal se probó también cancelando y con Esc: en los dos casos no se borra
nada.

## El aviso es un `<dialog>`, no un `confirm()`

Lo pidió Adrián el mismo día. El `confirm()` del navegador sale con la
tipografía del sistema, no se puede escribir en dos partes —título y
consecuencias— y en la app instalada en el móvil aparece como un cuadro del
navegador, no de la pantalla que lo pide.

Es un `<dialog>` nativo (trae fondo, foco y Esc hechos) con la clase
`.vt-dialogo`, que son las mismas reglas de `theme.css` que la pregunta de los
avisos push: se generalizó el selector en vez de copiar el bloque. **El foco
arranca en «Cancelar»**, para que un Enter de más no borre un torneo, y Esc
equivale a cancelar.

El texto dice el torneo, su fecha y cuántos partidos se lleva: ese número sale
de `getTournaments`, no de una estimación, y es lo único que avisa de lo que se
va a perder.
