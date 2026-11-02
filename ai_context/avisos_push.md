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
| Pregunta de la primera vez, botones de «Tus avisos» | `avisos-push.js` |
| Lo carga | `auth-client.js`, sólo con sesión |
| Dar de baja al cerrar sesión | `cuenta.html`, `btnSalir` |

## Decisiones que parecen errores

- **La suscripción es de la cuenta, no del jugador.** Hay administradores sin
  ficha y las altas pendientes les llegan a ellos.
- **`avisos-push.js` no está en ningún `<head>`.** Lo inyecta `auth-client.js`
  cuando hay sesión, así que llega a las 18 páginas sin tocarlas.
- **La pregunta sale una vez por cuenta y dispositivo** (`localStorage`,
  `vt-push-configurado-v2:<correo>`), no al pulsar nada. Petición de Adrián: al
  entrar por primera vez tras ser aceptado. La versión `v2` fuerza una única
  comprobación guiada también a quienes ya habían aceptado el permiso antes
  del 2026-11-02. Si dice que no o la entrega falla, queda el botón de la
  tarjeta «Tus avisos» de `/tablon`. No sale en `/cuenta`, `/inscripcion` ni `/group-normativa`, y
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

## Una suscripción se muere sola, y el silencio es el único síntoma

El 2026-10-27 Adrián avisó de que no le llegaba al móvil el «pide entrar» de
un alta. En la base de producción estaban sus cuatro dispositivos: el del PC
(WNS, del 18/10) vivo y avisando, y los dos del móvil **muertos**, con el
servicio contestando 410 a cada envío. Nadie había tocado nada.

El navegador rota la suscripción por su cuenta —caduca, o se renueva al
actualizarse— y emite `pushsubscriptionchange`. Hasta ese día `sw.js` no
escuchaba ese evento, así que la única reposición era la de `avisos-push.js`
al cargar la página con sesión: es decir, **sólo al abrir la app**. Un móvil
que no se abre se queda mudo para siempre y no hay nada que lo delate, porque
`mandarUno` borra la fila del 410 y sigue adelante sin un mal aviso.

Dos arreglos, copiados del manager de MT5 (`web_push.js`, `sw.js`), que ya
los tenía:

- **`pushsubscriptionchange` en `sw.js`**: pide la clave, se vuelve a
  suscribir y manda la nueva dirección. Corre con la app cerrada, que es
  justo cuando hace falta.
- **Comprobar la clave antes de reusar la suscripción** (`mismaClave` en
  `avisos-push.js`): una suscripción firmada con otro par VAPID hace que el
  servicio rechace **todos** los avisos con un 403, y eso tampoco se ve.

**Lo que esto no arregla**: ese mismo día, con una suscripción viva y cuatro
envíos aceptados (201), el aviso sólo aparecía en el móvil al abrir la app.
Entre el 201 del servicio y el `push` del service worker no hay código
nuestro, así que eso es del teléfono (entrega diferida de FCM o el canal de
avisos de la app instalada) y queda sin resolver.

## Prioridad alta y diagnóstico por etapas (2026-11-02)

El envío usaba la prioridad Web Push predeterminada: `web-push` genera
`Urgency: normal` si no se le pasa nada. Eso permite que el servicio retrase el
mensaje por batería o reposo. Todos los avisos de esta app son visibles y muy
infrecuentes, así que `mandarUno` los envía ahora con `urgency: 'high'`; el
aviso de prueba también. No es una garantía del sistema operativo, pero sí la
indicación estándar para intentar entrega inmediata.

La tarjeta «Tus avisos» de `/tablon` tiene «Probar aviso» cuando este
dispositivo ya está suscrito. La
prueba no llama «entregado» a un HTTP 201: crea una fila por dispositivo en
`push_delivery_tests` y distingue cuatro etapas reales:

1. **Aceptado por el servicio**: Google, Apple, Mozilla o Microsoft respondió
   al POST del servidor. Todavía no prueba que el móvil lo recibiera.
2. **Recibido por el navegador**: el evento `push` arrancó el service worker y
   éste confirmó el token aleatorio de esa entrega.
3. **Mostrado por el navegador**: resolvió `showNotification()`.
4. **Pulsado**: el usuario tocó la notificación.

El botón consulta el estado cada dos segundos durante cincuenta segundos. El
token de confirmación es un UUID impredecible incluido dentro del payload
cifrado; por eso `/api/push?action=confirmar` no depende de la cookie de sesión:
el worker puede despertarse mucho después de que caduque. El token sólo permite
marcar las tres horas de su propia fila y las pruebas se borran a los siete
días. Consultar el resultado sí exige la cuenta que creó la prueba.

El `fetch` del acuse sí usa `credentials: 'same-origin'`: no para autenticar la
cuenta, sino porque el Preview protegido necesita su cookie de Vercel antes de
dejar que la petición alcance la función. Con `omit`, la notificación podía
mostrarse y el diagnóstico seguía diciendo «no recibido».

Así se interpreta un fallo:

- aceptado, pero no recibido: retraso o bloqueo entre el servicio push y el
  navegador/WebAPK;
- recibido, pero no mostrado: fallo de `showNotification`;
- mostrado, pero el teléfono no alertó: canal de Android silencioso, permisos
  del sistema o política del fabricante;
- pulsado: el camino entero funciona.

Para medir la app cerrada, la prueba se lanza desde otro dispositivo con la
misma cuenta y se deja el móvil bloqueado. Lanzarla desde el propio móvil lo
despierta y falsea justo el caso que se quiere comprobar.

### La prueba es del dispositivo actual y repara un endpoint muerto

El 2026-11-02 se instaló el WebAPK de `dev` en un Android que ya había usado el
Preview desde Chrome. El permiso seguía concedido y `getSubscription()` devolvía
una suscripción FCM, así que la campana decía «Avisos activados» y la volvía a
guardar. Pero FCM respondía 410: el endpoint local estaba muerto. El servidor lo
borraba y la siguiente apertura lo reinsertaba, formando un bucle.

Además, «Probar aviso» enviaba a **todos** los dispositivos de la cuenta. En el
clon aparecían el WNS y los FCM copiados de producción, y la pantalla mezclaba
sus 401/410 con el teléfono que se quería comprobar. Eso no probaba «este
dispositivo», pese a que la interfaz lo daba a entender.

Ahora el botón manda el endpoint actual y el servidor limita la prueba a esa
fila de esa cuenta. Si responde 404 o 410, el cliente hace una sola reparación:
desuscribe el endpoint muerto, crea otro con la VAPID vigente, lo guarda y
repite la prueba. La campana tampoco llama «activo» al mero permiso: primero
espera a que el alta del endpoint responda bien y, si no, ofrece reintentar.

### Activación verificada y acuse para todos los avisos (2026-11-02)

Conceder el permiso y guardar un endpoint ya no significa «avisos activados».
La activación completa hace este recorrido desde el mismo diálogo:

1. pide el permiso desde el clic del usuario;
2. crea o renueva la suscripción y la guarda para esa cuenta;
3. manda una prueba sólo a ese endpoint;
4. enseña en directo si el servicio la aceptó, el worker la recibió y el
   navegador la mostró;
5. sólo guarda `verified_at` y dice «activados» después de `mostrado`.

Si el navegador no implementa Web Push, la interfaz lo declara expresamente y
la campanita interna sigue siendo el respaldo. En iOS se conserva el requisito
de instalar la web en la pantalla de inicio; en cualquier plataforma el sistema
operativo aún puede silenciar o retrasar una notificación pese a que
`showNotification()` haya resuelto, algo que una web no puede sobreescribir.

El acuse ya no pertenece sólo al botón de prueba. Cada envío real crea su fila
en `push_delivery_tests`, mete un `receiptToken` en el payload y actualiza en
`push_subscriptions` el último estado del servicio, error, recibido, mostrado y
pulsado. Las filas de entrega se conservan siete días. Así se puede distinguir
un fallo de la app, del servicio push y del teléfono sin adivinar ni llamar
«entregado» a un 201.

La prueba no envía el encabezado Web Push `Topic`. El 2026-11-02 Apple rechazó
con `BadWebPushTopic` una suscripción creada con la VAPID correcta, aunque el
valor usado cumplía aparentemente el alfabeto y tamaño de RFC 8030. El tema sólo
sirve para reemplazar mensajes pendientes y una prueba no necesita esa
optimización; omitirlo evita una diferencia innecesaria entre Apple y FCM.

Safari instalado no siempre expone `subscription.options.applicationServerKey`.
Eso no significa que la suscripción use otra VAPID: tratarlo como distinto hizo
que una sola activación de iPhone renovara tres veces y dejara cada endpoint
anterior en la base. Si Apple oculta la clave, se conserva la suscripción; sólo
se fuerza la renovación si la prueba devuelve 404, 410 o
`VapidPkHashMismatch`. Al renovar se llama primero a `baja` con el endpoint
anterior para que tampoco quede una fila huérfana.

### Herramienta de avisos propios en `dev`

`tools/notificarme-dev.mjs` crea plantillas marcadas `[Prueba]` solamente para
el jugador del administrador indicado, mediante la puerta canónica
`crearAviso`: aparecen en la pestaña y el badge y a la vez salen por push. No
usa `.env.local`: exige estar en la rama Git `dev`,
confirma el ID de `viboras_dev` y los overrides de Vercel, obtiene de Neon una
conexión a esa rama, crea una sesión de cinco minutos y la borra en `finally`.
La acción `notificarme` de `api/push.js` también exige administrador y
`VERCEL_ENV=preview` con `VERCEL_GIT_COMMIT_REF=dev`, así que no existe en
producción aunque alguien conserve el script.

Los comandos interactivos (piden el correo) son `npm run push:dev:partido`,
`npm run push:dev:opinion`, `npm run push:dev:torneo` y
`npm run push:dev:todas`. También aceptan `-- --email=correo`. La respuesta no
se da por buena sólo porque la API contestó: exige al menos un 2xx del servicio
push e imprime cuántos dispositivos lo aceptaron.

El primer envío del 2026-11-02 llamó directamente a `pushAUsuario`: Android
recibió las tres notificaciones, pero la pestaña y el badge quedaron a cero
porque no había filas en `avisos`. Esa vía se eliminó; una plantilla que sólo
empuja vuelve a crear dos verdades y no es una prueba válida del sistema.

## El entorno local manda avisos a móviles de verdad

Esto no es una advertencia teórica. El 2026-11-01, antes de probar la
publicación del tablón en local, se comprobó qué pasaría:

- `.env` le da al contenedor **las claves VAPID de producción**, no unas de
  juguete. `docker-compose.yml` las deja vacías por defecto, pero en cuanto
  están en `.env` el contenedor las coge.
- El Postgres local tiene **13 filas en `push_subscriptions`**, restauradas
  del volcado. No son de mentira: apuntan a Apple (5), Google (4), Microsoft
  (3) y Mozilla (1). Son los móviles del grupo.
- Publicar en `/tablon` llama a `crearAviso` (`api/_tablon.js`), y ésa es
  **la única puerta**: siempre empuja.

O sea que un «aviso de prueba» escrito en `http://localhost:3000` sale a
Internet y suena en trece teléfonos ajenos. Lo mismo vale para `/valorar`,
`/buzon` y todo lo que acabe en `crearAviso`.

Correo no: `SMTP_HOST` apunta a Mailpit y se queda en
`http://localhost:8025`. El peligro es sólo el push.

**Cómo probar sin despertar a nadie.** Dos vías, y conviene no improvisar
una tercera:

- Sembrar las filas **por SQL directo**, que no pasa por `crearAviso`. Es lo
  que se hizo para verificar la extracción del tablón.
- O vaciar `push_subscriptions` en la base local antes de tocar nada.

**Se vació el 2026-11-01**, y por eso hoy el entorno local es seguro: las dos
vías de envío (`pushAJugadores` y `pushAAdmins`, `api/_push.js:103` y `:110`)
leen sólo de esa tabla, así que sin filas no sale nada a Internet. El precio
es que el push no se puede probar en local —pero tampoco se podía antes sin
molestar a trece personas.

**Vuelve a aparecer cada vez que se restaura un volcado de producción.** Las
filas siguen en `backups/prod-clon-20261031-1818.sql` (14 de ellas). Después
de restaurar, vaciarla otra vez antes de tocar nada que escriba.

## `dev` tiene su propio par VAPID, y por eso no alcanza al grupo

El 2026-11-01, al montar el clon `viboras_dev`, las claves VAPID se copiaron a
`Preview (dev)` **con el mismo valor que producción**. Parecía aislado y no lo
estaba: una prueba desde el Preview creó avisos para tres jugadores a las
14:11 UTC, y sus suscripciones —copiadas del clon— seguían siendo alcanzables.
La prueba pareció inofensiva porque **la app nunca avisa a quien mete el
resultado**, así que a quien la hizo no le llegó nada.

Ese mismo día se generó un par nuevo, exclusivo de `Preview (dev)`. Ahora:

```
produccion  BFjWfHHdkRAk1gMs…
dev         BJiRe4QI_C39T6KB…
```

Una suscripción queda atada a la clave con la que se creó, así que las de los
móviles del grupo **no pueden recibir nada firmado desde `dev`**: el servicio
responde 403, y `mandarUno` sólo lo apunta en el log —borra la fila con 404 y
410, no con 403—, así que no se pierde ningún dato.

**La separación es estructural, no de datos.** Resetear el clon desde `main`
devuelve las dieciséis suscripciones, y siguen sin poder recibir nada.

**Para probar push en `dev` hay que suscribirse desde el propio Preview**: eso
crea una suscripción firmada con la clave de `dev`, a la que sólo `dev` puede
empujar. La privada de `dev` vive únicamente en Vercel y no se puede volver a
leer; si hiciera falta otra, se genera un par nuevo con
`npx web-push generate-vapid-keys` y se sustituyen las dos variables, a
sabiendas de que eso invalida las suscripciones hechas desde el Preview.

## FCM aceptaba, pero Nothing OS retenía el trabajo por estado térmico

El 2026-11-02, en un Nothing A142 con Android 16 y Chrome 155, FCM devolvía 201
con la app cerrada, pero no se ejecutaban las confirmaciones `recibido` ni
`mostrado`; al abrir la WebAPK aparecía el aviso pendiente. Logcat demostró que
FCM sí despertaba `com.android.chrome` mediante `FirebaseInstanceIdReceiver`.
No era el payload ni Doze: Chrome estaba en bucket `ACTIVE`, con
`DEVICE_NOT_DOZING`, `BACKGROUND_NOT_RESTRICTED` y cuota satisfecha.

La causa visible en `dumpsys jobscheduler com.android.chrome` era literal:
`Restricted due to: thermal` y `Ready: false`. `dumpsys thermalservice` mostraba
la contradicción que lo provocaba: estado global 3 y una muestra cacheada de
piel a 41,088 °C/status 3, mientras el HAL actual daba 28,9 °C/status 0, batería
a 27 °C y headroom 0,495. No era calor actual sino un estado térmico atascado.

La prueba causal se hizo con `thermalservice override-status 0` sólo durante un
envío: FCM respondió 201, el worker confirmó `recibido` a los 2 s y `mostrado`
a los 4 s con la app cerrada. Un `finally` ejecutó `thermalservice reset`; el
estado automático volvió a 3. **El override no es una solución**: desactiva una
protección del sistema y nunca debe dejarse activo. La salida segura es
reiniciar el teléfono y, si recurre con sensores fríos, actualizar o reportar
Nothing OS.

El reinicio devolvió `Thermal Status: 0` y `Restricted due to: none`. La primera
prueba coincidió con la cola de arranque (139 trabajos y los 8 cupos ocupados)
y caducó; al bajar la cola, una entrega nueva confirmó `recibido` y `mostrado`
con la WebAPK cerrada. Después de un reinicio hay que distinguir esa saturación
transitoria de que reaparezca una restricción térmica.

## El badge del icono (2026-11-02)

El icono de la app instalada solicita el número de avisos sin leer, el mismo que
la pestaña Avisos de la barra de abajo. **Es el mismo dato, no uno paralelo**:
sale de `/api/auth?action=notifications`, que es lo que pinta la lista de
`/tablon` y el número de la pestaña.

Se pone en dos sitios, porque el badge hay que mantenerlo con la app abierta y
con la app cerrada:

| Cuándo | Dónde | Cómo |
| --- | --- | --- |
| Al cargar cualquier página con sesión, al volver al primer plano y al pulsar «Limpiar» | `auth-client.js`, `pintarBadgeDelIcono` dentro de `pintarNumero` | el mismo `items.length` que la pestaña |
| Al llegar un push con la app cerrada | `_push.js`, `mandar`, y `sw.js`, `pintarBadge` | el servidor incluye `unread` cifrado en el push y el worker lo aplica directamente |
| Al llegar un push con una página abierta | `sw.js`, `avisarClientes`, y `auth-client.js`, `escucharCambiosDeAvisos` | el worker manda `vt-avisos-actualizados`; la página relee y repinta lista y contador |

**El service worker no puede sumar uno al badge que haya**: la Badging API
escribe (`setAppBadge`, `clearAppBadge`) pero no deja leerlo. Sumar a ciegas
inventaría un número que no es el de la pestaña. Antes se preguntaba al API
desde el worker, pero eso dependía de que el navegador conservara y enviara la
cookie al despertarlo con la app cerrada: el teléfono recibía el push y podía
dejar sólo el punto del sistema. Ahora `_push.js` calcula `avisosDeCampana(user)`
antes de cada envío y mete su longitud en el payload cifrado como `unread`; el
worker llama a `setAppBadge(unread)` sin necesitar sesión. La consulta anterior
queda como respaldo para pushes antiguos y para el aviso técnico de prueba.

En Android hay un límite de plataforma que el código no puede superar: Chrome
no implementa la Badging API numérica para PWAs. El WebAPK recibe el número,
pero el lanzador sólo enseña el punto asociado a una notificación pendiente.
Un número en el icono requiere una aplicación Android nativa o un envoltorio
nativo que publique el badge; no se debe prometer desde la PWA. En iOS/iPadOS
instalado y en escritorios compatibles sí se solicita el número exacto.

Decisiones que parecen errores:

- **Sin sesión el badge se borra, no se deja.** `notifications` responde 200 con
  lista vacía tanto sin sesión como sin avisos ([[cuentas_y_sesiones]]), y las
  dos cosas se tratan igual a propósito: sin sesión la app redirige a `/cuenta`,
  que tampoco enseña ningún aviso. Al cerrar sesión el icono queda limpio.
- **Un aviso de prueba no pone badge.** La prueba de entrega no crea nada en la
  campanita, así que el API sigue contando lo que había: si no había nada, el
  push de prueba *borra* el badge. Es lo correcto —el icono no puede contar algo
  que la pestaña no enseña— y es la razón de que probar los avisos no deje un
  «1» pegado al icono.
- **Si la petición falla, el badge se queda como estaba.** Un 500, un error de
  red o un JSON sin `items` no tocan nada: el aviso se ve igual y la siguiente
  apertura de la app corrige el número.
- **El badge de este dispositivo sólo se corrige al abrir o volver a la app
  aquí.** Leer los avisos en otro móvil no lo baja mientras este dispositivo
  siga cerrado, porque no se envía un push al marcar como leído.

**Cómo se representa**: Android/Chrome sólo muestra un punto por notificación
pendiente; Safari sólo aplica el número a la app instalada en la pantalla de
inicio; Chrome de escritorio lo admite si la PWA está instalada; Firefox no
implementa la Badging API. Siempre queda el número propio de la pestaña, que
está en las veinte páginas ([[barra_de_navegacion]]).

**Lo que no se pudo comprobar en local**: el camino del service worker. El
navegador integrado no registra service workers sobre `localhost`
([[service_worker]]), así que con la app cerrada el badge sólo se puede medir
en un móvil con la app instalada.

Relacionado: [[valoraciones_y_avisos]], [[service_worker]],
[[cuentas_y_sesiones]], [[entorno_local_docker_y_proxies_neon]],
[[iconos_pwa]], [[barra_de_navegacion]].
