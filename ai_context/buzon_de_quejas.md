# Buzón de quejas y sugerencias

Desde el 2026-10-18, en `/buzon`. Se llega por el bloque «Buzón» de la portada,
por la campanita y, los administradores, también por el botón «Buzón» del
panel de Administración: es la misma página, con «Recibidos» debajo del
formulario sólo para ellos. Lo pidió
Adrián: los miembros escriben quejas y sugerencias, sólo los administradores
las leen, y a los administradores les llega aviso de cada una.

## Piezas

| Pieza | Fichero |
| --- | --- |
| Tablas `buzon` y `buzon_leidos`, guardar, listar, aviso | `api/_buzon.js` |
| Endpoint: `enviar` (POST, cualquiera), `lista` (GET) y `leidos` (POST), éstas dos sólo admin | `api/buzon.js` |
| Entrada en la campanita de cada admin | `avisosDeCampana` en `api/_campana.js`, con `avisosDelBuzon` |
| Push a los admin | `guardarMensaje` → `pushAAdmins` ([[avisos_push]]) |
| La página: formulario para todos, «Recibidos» para admin | `buzon.html` |

## Decisiones que parecen errores

- **No es anónimo.** Se guarda `user_id` y el administrador ve el nombre de
  la ficha (o el correo, si la cuenta no tiene ficha). La página lo avisa
  encima del formulario. Si el grupo lo quiere anónimo hay que decidir antes
  qué se hace con el abuso, porque entonces no hay a quién preguntar.
- **«Leído» es de cada administrador** (`buzon_leidos`, una fila por mensaje
  y admin). Que uno lo lea no se lo quita de la campanita a los demás.
- **Se da por leído al abrir `/buzon`**, no con un botón. La página manda
  `leidos` con el id más alto que ha pintado, no «todo»: lo que llegue
  mientras está abierta sigue nuevo.
- **El push no lleva el texto**, sólo tipo y nombre: saldría en la pantalla
  bloqueada del móvil del administrador.
- **Cinco mensajes por cuenta y hora** (`POR_HORA`, 429 al sexto). Cada
  mensaje es un push a todos los administradores.
- **`tipo` sin `CHECK`.** Lo valida `TIPOS` en `_buzon.js`; un `CHECK` quedaría
  congelado por `CREATE TABLE IF NOT EXISTS`, igual que
  `identities.provider` ([[cuentas_y_sesiones]]).
- **Las tablas no están en `ensureSchema()`**, por el techo de tamaño
  ([[tamano_del_codigo_y_trinquete]]): nacen con la primera petición a
  `/api/buzon` o a la campanita de un admin.
- **Un fallo del buzón no rompe la campanita**: `avisosDeCampana` envuelve
  `avisosDelBuzon` en un `catch` que devuelve vacío.
- **La campanita salió de `api/auth.js`** a `api/_campana.js` el 2026-10-19:
  `auth.js` había llegado al techo de 600 líneas.
- **Es la octava función de Vercel.** El plan Hobby admite 12.

No se puede borrar ni responder desde la app. Para borrar, un `DELETE` a
mano.

## Marcar como procesado (desde el 2026-10-19)

Lo pidió Adrián: el administrador marca el mensaje y al autor le llegan las
gracias. Cada mensaje de «Recibidos» lleva «Marcar como procesada» o, si ya
lo está, «✓ Procesada por X el …».

- `procesar` (POST, sólo admin) en `api/buzon.js` → `marcarProcesado` en
  `_buzon.js`. Columnas `procesado_at` y `procesado_por` añadidas con `ALTER`
  en `crearTablas`.
- **El aviso va a la tabla `avisos`** ([[valoraciones_y_avisos]]), que es por
  jugador: «Gracias por tu queja del 18/10: ya la hemos procesado.», con
  enlace a `/buzon`, más un push con el mismo texto. Como el push a los
  administradores, **no lleva el texto del mensaje**.
- **Sólo la primera vez.** El `UPDATE` exige `procesado_at IS NULL`: si dos
  administradores pulsan a la vez, uno recibe 409 y el autor un solo aviso.
  No hay «desmarcar».
- **Sin aviso si el autor no tiene ficha** o la cuenta se borró: se marca
  igual. Hoy toda cuenta activa tiene ficha, así que es el caso raro.
- La página pide confirmación (`confirm`) porque el aviso sale en el acto.

Probado en local: el miembro recibe 403 y un `GET` 405; repetir da 409, igual
que un id inexistente, no numérico o enorme; la campanita del autor muestra
el agradecimiento; un mensaje de cuenta borrada se marca sin crear aviso; a
375 px no desborda. **No probado**: que el push llegue a un móvil real.

## Cómo se probó (2026-10-18, en local)

- API: sin sesión 401; un miembro pidiendo `lista` o `leidos`, 403; tipo
  inventado, texto de 2 o de 2001 caracteres, 400; `GET` a `enviar`, 405; el
  sexto mensaje en una hora, 429; un `hasta` no numérico o enorme no da 500.
- Campanita: el admin ve una entrada por mensaje con enlace a `/buzon`; el
  miembro, nada. Marcar leídos hasta el 1 deja el 2 en la campanita.
- Push: con `web-push` sustituido dentro del contenedor y una suscripción de
  admin y otra de miembro, sale una sola, la del admin, con «Queja nueva de
  … en el buzón» y enlace `/buzon`.
- Navegador: un texto con `<b>` sale como texto; al abrir `/buzon` como admin
  la campanita de la portada pasa de 2 a 0; sin desbordes a 375 px ni en
  escritorio. La fila vacía `organization` de la rejilla de la portada (un
  resto sin bloque) se quitó porque sumaba un hueco de más encima del buzón.

**Lo que falta**: que el push llegue a un móvil de verdad, igual que el resto
de avisos ([[avisos_push]]).
