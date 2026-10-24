# Avisos push: la campanita con la app cerrada

Desde el 2026-10-18. Cada aviso de la campanita sale también como notificación
del móvil, en el mismo momento en que nace.

**Desde el 2026-10-24, para los avisos guardados (tabla `avisos`) esto no es
una convención, es la única puerta.** `crearAviso(playerIds, texto, enlace)`
en `_avisos.js` guarda la fila y manda el push a la vez; nadie hace el
`INSERT INTO avisos` por su cuenta. `avisarEdicion`, `avisarResultadoNuevo` y
`marcarProcesado` (`_buzon.js`, el «gracias» de una queja procesada) la
llaman. Antes `_buzon.js` repetía el mismo `INSERT` + `pushAJugadores` que
`_avisos.js`: si un aviso nuevo se guardaba sin pasar por ahí, no llevaba push
y nadie lo notaba hasta que alguien preguntaba por qué no le había llegado
nada (así se encontró el hueco de `avisarResultadoNuevo`, más abajo). Los
avisos que **no** se guardan (valorar, alta pendiente, buzón sin leer: se
calculan al vuelo) siguen mandando su push a mano desde donde nace el hecho,
porque no hay fila que los obligue a pasar por `crearAviso`.

## Qué manda push y cuándo

| Aviso | Nace en | A quién |
| --- | --- | --- |
| «¿Qué tal el partido del dd/mm? Valora a tus compañeros.» | `submitResult` al **insertar** un partido (`write.js`) | los otros tres jugadores, no quien lo subió |
| «<Nombre> metió el resultado de vuestro partido del dd/mm…» | `avisarResultadoNuevo` (`_avisos.js`), al **insertar** un partido, desde el 2026-10-24 | los otros tres, siempre (lo meta un jugador o un administrador) |
| «Ya están los resultados de <torneo>. Valora a tus compañeros.» | `crearTorneo` (`league-admin.js`), pozo y compás | cada jugador del torneo, **uno** por jugador, no uno por partido |
| «<Nombre> cambió el resultado de vuestro partido del dd/mm…» | `avisarEdicion` (`_avisos.js`), sólo si cambia el marcador y lo cambia un jugador del partido | los mismos que reciben el aviso guardado |
| «<Nombre> pide entrar» | `register` y alta con Google (`auth.js`) | los administradores |
| «Queja nueva de <Nombre> en el buzón» (o «Sugerencia») | `guardarMensaje` (`_buzon.js`) | los administradores, sin el texto ([[buzon_de_quejas]]) |

Los avisos de valorar de la campanita **no se guardan**: se calculan al vuelo
([[valoraciones_y_avisos]]). Por eso el push no puede salir de la tabla
`avisos` y sale del sitio donde se crea el partido. Un partido de hace más de
14 días no manda nada: `/valorar` ya no lo abriría.

En la campanita sale una entrada por partido, «Valora el partido del dd/mm»
(hasta el 2026-10-18 eran dos, ambiente y nivel), y el push también es uno.

## Piezas

| Pieza | Fichero |
| --- | --- |
| Tabla `push_subscriptions` y el envío | `api/_push.js` |
| Alta y baja de un dispositivo, clave pública | `api/push.js` (`clave`, `suscribir`, `baja`) |
| Mostrar la notificación y abrirla | `sw.js`, `push` y `notificationclick` |
| Pregunta de la primera vez, botón de la campanita | `avisos-push.js` |
| Lo carga | `auth-client.js`, sólo con sesión |
| Dar de baja al cerrar sesión | `cuenta.html`, `btnSalir` |

## Decisiones que parecen errores

- **La suscripción es de la cuenta, no del jugador.** Hay administradores sin
  ficha y las altas pendientes les llegan a ellos.
- **`avisos-push.js` no está en ningún `<head>`.** Lo inyecta `auth-client.js`
  cuando hay sesión, así que llega a las 18 páginas sin tocarlas.
- **La pregunta sale una vez por cuenta y dispositivo** (`localStorage`,
  `vt-push-preguntado:<correo>`), no al pulsar nada. Petición de Adrián: al
  entrar por primera vez tras ser aceptado. Si dice que no, queda el botón de
  la campanita. No sale en `/cuenta`, `/inscripcion` ni `/group-normativa`, y
  espera a que termine la pantalla de bienvenida.
- **El permiso del navegador se pide sólo desde un clic.** iOS lo exige y
  Chrome silencia a las webs que lo piden al cargar. Por eso la pregunta es un
  `<dialog>` propio con un botón, no `requestPermission()` directo.
- **En iPhone sólo hay push con la app instalada** en la pantalla de inicio
  (iOS 16.4 o posterior). En Safari normal `PushManager` no existe: la pregunta
  explica cómo instalarla, y al abrirla instalada se pregunta otra vez (el
  almacenamiento de la app instalada es otro).
- **La campanita siempre dice en qué estado están los avisos** (desde el
  2026-10-18): «Activar…», «bloqueados», «instala la app» o «Avisos activados
  en este dispositivo.». Antes, con el permiso concedido no salía nada, y no se
  distinguía de un servidor sin claves VAPID, que tampoco enseñaba nada.
  **Sin claves, a los administradores les dice «Avisos al móvil sin
  configurar: faltan VAPID_PUBLIC_KEY y VAPID_PRIVATE_KEY en Vercel.»**; a los
  demás, nada, porque no pueden arreglarlo. Así se vio en producción el
  2026-10-18: Adrián no veía ni el botón ni la pregunta, y en local, simulando
  `clave: null` desde un Android emulado, la campanita quedaba idéntica a su
  captura.
- **Con el permiso concedido, cada carga reenvía la suscripción.** Cubre el
  cerrar sesión y volver a entrar, y que el navegador la renueve.
- **Al cerrar sesión el dispositivo se da de baja** y la suscripción se
  deshace: si no, en un móvil compartido seguirían llegando los avisos del
  anterior. Si otra cuenta registra el mismo dispositivo, la fila pasa a ella.
- **Sólo se aceptan direcciones de los servicios de push** (Google, Apple,
  Mozilla y Windows). El servidor hace un POST a la dirección que manda el
  navegador; sin esa lista, cualquier miembro haría que la función llamase a
  donde quisiera.
- **Un push que falla nunca tumba la petición.** `mandar` no lanza y
  `avisarAltaPendiente` tiene su `try`: la cuenta ya está creada cuando se
  avisa. Un 404 o 410 del servicio borra esa suscripción.
- **Se espera a que salgan antes de responder**: en Vercel la función se
  congela al responder y un envío pendiente se perdería. Medido en local: unos
  130 ms más al subir un partido (821 ms sin push, 949 ms con él).
- **Las cuentas bloqueadas no reciben nada**: el envío filtra por
  `status = 'active'`, aunque la suscripción siga en la tabla.

## Configuración

Tres variables en Vercel, **todos los entornos**:

- `VAPID_PUBLIC_KEY` y `VAPID_PRIVATE_KEY`: `npx web-push generate-vapid-keys`.
  Sin ellas no falla nada: `clave` devuelve null, la página no ofrece activar
  y el servidor no manda.
- `VAPID_SUBJECT` (opcional): `mailto:` de contacto. Si falta, el primer
  correo de `ADMIN_EMAILS`. Apple rechaza un asunto que no sea `mailto:` o
  `https://`.

**Cambiar el par de claves invalida todas las suscripciones**: los navegadores
las firmaron con la pública vieja. Hay que volver a activarlas.

En local, el par va en `.env` (ignorado) y `docker-compose.yml` lo pasa.

## Cómo se probó (2026-10-18, en local)

El navegador integrado no registra service workers sobre `localhost`
([[service_worker]]), así que el camino entero se probó por partes:

1. **API**: sin sesión 401; `clave` devuelve la del `.env`; una dirección de
   FCM se guarda; `http://169.254.169.254`, `https://evil.example/...` y
   `https://evilgoogleapis.com` dan 400; `baja` la borra.
2. **Envío**: un servicio push falso por HTTPS dentro del contenedor y una
   segunda instancia de la app en el 3001 con
   `NODE_TLS_REJECT_UNAUTHORIZED=0` (web-push sólo habla HTTPS). Lo recibido
   se descifró con las claves del «navegador»: `aes128gcm`, TTL 86400, firma
   VAPID válida contra la pública. Partido nuevo → al compañero, no a quien lo
   subió; edición → al resto; partido de 40 días → nada; alta → sólo al admin;
   torneo con un jugador repetido → un push; dirección que responde 410 →
   borrada.
3. **Service worker**: arnés en `vm` con 8 comprobaciones (notificación con
   texto y enlace, texto suelto si no es JSON, abrir o reutilizar la ventana,
   un enlace de fuera abre la portada).
4. **Interfaz**: a 375 px la pregunta cabe (18–357 px) y es modal; «Activar»
   pide el permiso una vez; recargando no vuelve a preguntar y la campanita
   ofrece el botón; con el permiso denegado explica cómo desbloquearlo.

**Lo que falta, en producción con un móvil de verdad**: que llegue una
notificación a Android (Chrome) y a un iPhone con la app instalada.

Relacionado: [[valoraciones_y_avisos]], [[service_worker]],
[[cuentas_y_sesiones]].
