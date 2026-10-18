# Cuentas y sesiones: la app entera va detrás de la sesión

Desde el 2026-10-14 hay cuentas: `/cuenta` registra y entra, con correo y
contraseña o con Google. Desde el **2026-10-16 no se ve nada sin entrar**.

Nació al revés —la sesión sólo decía quién eras y no impedía nada— y duró dos
días: con la portada visible sin estar logueado, la cuenta no tenía sentido.
Si encuentras un comentario o una nota que diga que los endpoints están
abiertos, es de esos dos días.

## Qué está cerrado y qué no

| | |
| --- | --- |
| `api/read.js`, `api/write.js`, `api/league-admin.js` | **Cerrado.** Sesión activa o 401, antes de mirar el `action`. |
| `api/auth.js` | Abierto, obviamente: es por donde se entra. |
| Las 18 páginas `.html` | **Se descargan igual**: son estáticas y están en un CDN. Llegan vacías, porque los datos vienen del API. |

`/group-normativa` **no** redirige a `/cuenta`: el alta pide aceptar la
normativa, así que tiene que poder leerse antes de tener cuenta. No llama al
API, de modo que no enseña nada del grupo.

El redirect de `auth-client.js` a `/cuenta` es **comodidad, no seguridad**.
Lo único que cierra la app es el 401. Si alguna vez se quita el guardia de los
handlers «porque ya redirige la página», la app queda abierta otra vez y nada
lo avisa.

## El guardia

`exigirSesion(req, res)` en `api/_auth.js`. **No lanza nunca**: los tres
handlers no tienen `try/catch` propio —cada acción monta el suyo por dentro— y
una excepción saldría como un 500 sin cuerpo. Devuelve el usuario o `null`,
habiendo respondido ya.

Crea el esquema él mismo (`ensureSchema` y `ensureAuthSchema`, las dos
memoizadas) porque corre **antes** del `switch`, y las acciones lo hacían por
dentro, después.

## `league-admin.js` se partió para tener margen

Medía **626 líneas**, registradas así en `tools/code-size-baseline.json`, y el
trinquete sólo deja encoger ([[tamano_del_codigo_y_trinquete]]): no admitía ni
una línea más. El 2026-10-17 sus auxiliares —fechas de liga y fases, nombre de
cada evento, lectura de los tres CSV— salieron **sin cambiar** a
`api/_ligas.js`, y el fichero bajó a 392.

Las cuatro `create*` se quedaron dentro a propósito: estaban perdonadas por su
nombre `api/league-admin.js:<función>`, y movidas a otro fichero contarían como
nuevas por encima del techo de 60. El mismo día bajaron al hacerlas atómicas
(abajo); sólo `createLeague` sigue perdonada, con 83.

**Crear una liga, un cuadro o un torneo es una sola sentencia SQL** (desde el
2026-10-17). El driver HTTP de Neon manda cada `sql` suelto, sin
transacción, y antes cada partido iba en su `INSERT` con `Promise.all`: un
fallo a mitad dejaba una liga sin eventos o un torneo con parte de sus
partidos. Ahora un `WITH … INSERT … RETURNING` mete el evento y sus partidos
con `unnest` de arrays (`crearTorneo`, y su equivalente en `createLeague` y
`createLeagueBracket`). Probado en local: un nombre repetido o un número que
no cabe en un `integer` en la segunda fila no dejan nada creado. Un nombre
repetido se explica («Ya hay un torneo o un grupo de liga con ese nombre»)
en vez del error de Postgres (`motivo`).

## Las piezas

| Fichero | Qué es |
| --- | --- |
| `api/_auth.js` | Esquema, contraseñas, cookies, sesiones, `exigirAdmin`. |
| `api/_google.js` | Verificación del token de Google. |
| `api/auth.js` | El endpoint, con el mismo `switch (action)` que los otros tres. |
| `cuenta.html` | La página, en `/cuenta` por `cleanUrls`. |
| `auth-client.js` | `window.vtMe` y la preselección, para las páginas que la usan. |

Tres tablas: `users` (una persona), `identities` (sus puertas de entrada) y
`sessions`.

## Las tablas NO están en `ensureSchema()`

Aunque `api/_db.js` sea «el esquema que corre»
([[esquema_duplicado_y_desfasado]]), las tres tablas se crean en
`ensureAuthSchema()`, en `api/_auth.js`. El motivo es mecánico:
`tools/code-size-baseline.json` tiene `api/_db.js:ensureSchema` clavada en
**122 líneas** y el trinquete sólo deja encoger
([[tamano_del_codigo_y_trinquete]]), así que una sola línea dentro de su cuerpo
rompe `npm run check`.

Consecuencia: **las tablas nacen la primera vez que alguien toca `/api/auth`**,
no en el primer arranque en frío. Y el orden importa, porque `users.player_id`
referencia `players(id)`: `ensureSchema()` primero, `ensureAuthSchema()`
después. El handler de `api/auth.js` las llama en ese orden.

## Todos escriben su nombre; el de un jugador antiguo se enlaza solo

Desde el 2026-10-17 **no hay casilla «Soy antiguo pirata» ni lista de
nombres**: lo pidió Adrián. Se quitaron también el endpoint abierto
`?action=players`, que sólo servía para esa lista, y `playerName` en la
página (el servidor aún lo acepta, por si queda alguna pestaña antigua
abierta).

Quien ya jugaba escribe su nombre como sale en las tablas. Si coincide
(sin mayúsculas, tildes ni espacios de más) con un jugador activo **que aún no
tiene cuenta activa**, `comprobarNombreNuevo` devuelve su `playerId` y la
cuenta queda enlazada a esa ficha, igual que cuando lo elegía de la lista.
Varios pendientes pueden reclamar el mismo jugador: compiten y decide quien
aprueba (ver el índice parcial, más abajo). Antes del 2026-10-16 era un
desplegable obligatorio, y del 16 al 17 un campo libre con la lista detrás de
la casilla.

Quien es nuevo escribe su nombre, que se guarda en
`users.requested_player_name` **sin crear la fila en `players`**: un alta que
nadie apruebe no debe dejar un jugador suelto en las tablas, y el registro es
la única puerta abierta de la app.

La ficha la crea `approveUser` con `getOrCreatePlayerId`. Si entre medias
alguien creó ese nombre a mano o subiendo un resultado, devuelve el que ya
existe y deciden las comprobaciones de siempre.

El nombre escrito se compara con **todos** los jugadores y con los nombres
pedidos por cuentas pendientes, **sin mayúsculas, tildes ni espacios de más**
(`claveDeNombre` en `api/auth.js`): «adrian  c» choca con «Adrián C». Se
compara en JavaScript porque `LOWER()` no quita tildes y `unaccent` habría que
instalarlo en Neon y en local. Al probarlo con `curl` desde Git Bash, las
tildes llegan mal codificadas y el caso parece fallar: hay que escaparlas en
el JSON (`ó`).

Tres negativas por el nombre, cada una con su motivo, porque «error» a secas
haría que la persona lo intentase otra vez igual:

| Caso | Qué dice |
| --- | --- |
| Escribe el nombre de alguien que ya tiene cuenta | «Ese nombre ya es de otro usuario (…). Elige otro.» |
| Escribe el nombre de un jugador dado de baja | «Ese nombre existe pero está dado de baja.» |
| Otro pendiente pidió ya ese nombre | «Ya hay una cuenta esperando con ese nombre.» |

El correo se comprueba **antes** que el nombre: si ya tiene cuenta, el nombre
da igual y decirlo primero evita el mensaje equivocado.

**La regla del nombre vale para cualquier ficha nueva, no sólo para el alta**
(desde el 2026-10-17): entre 2 y 60 caracteres y sin `< > " ' ` &`, en
`nombreDeJugadorValido` (`api/_db.js`). La aplican `getOrCreatePlayerId` y
`submitName`. Antes, subir un resultado o una disponibilidad con un nombre
inventado creaba la ficha tal cual, y `players.html` la pintaba con
`innerHTML`: comprobado en local que un nombre con `<img onerror=…>` se
ejecutaba en el navegador del administrador. Una ficha que ya existe se sigue
aceptando aunque no cumpla, para no dejar fuera a nadie antiguo.

Las páginas también escapan: `players.html` (`escaparHtml`, en la lista de
partidos del día) y `results.html` (las opciones con `new Option`). Las demás
ya pintaban los nombres con `textContent`, `innerText` o `escapeHtml`; se
comprobó recorriendo las 13 páginas con datos con un jugador trampa.

**Tampoco puede repetirse el teléfono** (desde el 2026-10-17, lo pidió
Adrián): `telefonoLibre` en `api/_inscripcion.js`, justo después del correo.
Compara los **nueve últimos dígitos**, así que `+34 611 22 33 44`,
`0034611223344` y `611223344` son el mismo. Cuentan todas las cuentas,
**rechazadas incluidas**, para que quien fue rechazado no vuelva a pedir
entrar con otro correo. Las cuentas anteriores al formulario no tienen
teléfono y no cuentan.

## El límite del jugador es un índice parcial, no un `UNIQUE`

```sql
CREATE UNIQUE INDEX users_player_activo_idx ON users(player_id) WHERE status = 'active';
```

Con un `UNIQUE` liso, cualquiera registra una cuenta reclamando el jugador de
otro —el alta es pública— y lo deja fuera para siempre aunque su cuenta no se
apruebe nunca. Con el índice parcial, varios pendientes compiten por el mismo
jugador y decide el administrador.

## Rechazar marca la cuenta, no la borra (desde el 2026-10-17)

Hasta el 2026-10-17 rechazar **borraba** la fila. Ahora la deja con
`status = 'rejected'` y `rejected_at`, para que sus datos salgan en la
exportación de jugadores ([[exportar_jugadores]]). Lo decidió Adrián. En la
app no se ve en ningún otro sitio. Lo que cambia y por qué no rompe nada:

- **El jugador no queda ocupado.** El índice parcial sólo cuenta `active`, y
  el nombre pedido por un rechazado vuelve a quedar libre:
  `comprobarNombreNuevo` ignora `blocked` y `rejected`.
- **El `CHECK` de `status` se migra en `estadoRechazado()`** (`api/_auth.js`).
  `CREATE TABLE IF NOT EXISTS` no lo cambia en una tabla que ya existe; el
  `DO $$` lo cambia una sola vez, si al `CHECK` le falta `'rejected'`.
- **Un rechazado no entra**: «Tu solicitud no fue aprobada», tanto con
  contraseña como con Google. **No puede volver a darse de alta con el mismo
  correo** («Ese correo ya pidió entrar y no se aprobó»): antes, como la fila
  se borraba, sí podía. Tampoco recibe enlaces para restablecer la contraseña.
- **Un rechazo se deshace desde «Editar»** de la pantalla Jugadores (desde el
  2026-10-18; hasta entonces hacía falta un `UPDATE` a mano): Rechazado →
  Pendiente o → Activo ([[exportar_jugadores]]).
- Los rechazados antes del 2026-10-17 se borraron y no se pueden recuperar.

## Lo que cada decisión evita

- **La cookie es `HttpOnly` y lleva un token aleatorio**; en la tabla se guarda
  su SHA-256. Quien lea `sessions` no puede hacerse pasar por nadie.
- **`Secure` sale de `x-forwarded-proto`**, que Vercel pone y el express local
  no. Mirar el `host` buscando `localhost` fallaría con `127.0.0.1` y con
  `192.168.x.x:3000`, que es como se prueba desde el móvil. Y con `Secure`
  incondicional, `curl` no reenvía la cookie sobre `http://` y la verificación
  local parece un fallo del handler.
- **`SameSite=Lax` y no `Strict`**: los enlaces del grupo llegan por WhatsApp y
  con `Strict` aparecerías deslogueado al abrirlos.
- **`me` resuelve con un `JOIN` a `users` filtrando `status = 'active'`.** Sin
  eso, bloquear a alguien no le cierra la sesión y su cookie de 30 días sigue
  valiendo.
- **`api/auth.js` comprueba el método HTTP**, al revés que los otros tres
  endpoints. Una contraseña en la query string acaba en los Runtime Logs de
  Vercel. Por lo mismo, el `action` se lee sólo de `req.query`, nunca del
  cuerpo.
- **El bloqueo por intentos fallidos expira solo.** Los correos del grupo son
  adivinables: un bloqueo permanente sería una forma trivial de dejar fuera a
  cualquiera.
- **`identities.provider` no lleva `CHECK`.** Un `CHECK` queda congelado el día
  del primer despliegue, porque `CREATE TABLE IF NOT EXISTS` no migra lo que ya
  existe; añadir Apple mañana exigiría un `ALTER` a mano contra producción.

## Google

Se usa Google Identity Services: el botón está en el navegador y devuelve un
`credential`, que es un JWT firmado por Google y se verifica en el servidor con
`jose` contra el JWKS de Google. **No hace falta `client_secret`, ni URI de
redirección, ni cookie de estado**, así que no hay nada que reconfigurar por
entorno.

Dos consecuencias que no se ven en el código:

- **Google no funcionará en los despliegues de preview.** Tienen dominio
  aleatorio y Google exige orígenes de JavaScript autorizados fijos. Con
  `viboras` desplegando directo a producción ([[rama_viboras_es_produccion]])
  da igual, pero conviene no perseguir el fantasma.
- **Sin `GOOGLE_CLIENT_ID` la página funciona igual**, sólo que no dibuja el
  botón. En local depende de que `.env` (ignorado por git, lo lee
  `docker-compose.yml`) defina `GOOGLE_CLIENT_ID`; desde el 2026-10-16 lo define.

**El botón se dibuja con un ancho fijo en píxeles** que Google no recalcula.
Si se dibuja con su caja oculta —la otra pestaña, o el panel mientras se
comprueba la sesión— la caja mide 0 y el botón salía de 300 px: en un móvil,
más ancho que la tarjeta, cuyo `overflow: hidden` lo cortaba por los dos
lados. `dibujarBotonesGoogle()` sólo dibuja la caja visible, con su ancho, y
repite al cambiar de pestaña o de tamaño.

En local, aun con el `client_id` en `.env`, **el botón mide
0**: Google responde 400 a `localhost` mientras no esté entre los orígenes
autorizados del cliente OAuth. Lo que sí se puede medir es el `width=` de la
URL del iframe contra el ancho de la caja.

El `client_id` llega por `GET /api/auth?action=config`: aquí no hay paso de
build que lo inyecte en un `.html` estático, y no es un secreto.

El enlace por correo (quien se registró con contraseña y luego entra con
Google) **exige `email_verified === true`**. Sin esa comprobación sería
suplantación: Google emite el token igualmente para un correo sin confirmar.

**Y si la cuenta nunca confirmó su correo, Google le quita la contraseña**
(`quitarContrasenaAjena`, desde el 2026-10-17). El alta con contraseña no
verifica el correo, así que cualquiera podía registrarse con el de otro, que
un admin lo aprobase, y que el dueño, al entrar luego con Google, heredase
una cuenta cuya contraseña conocía el intruso. Ahora, al enlazar Google a una
cuenta con `email_verified_at` vacío: contraseña a `NULL`, correo verificado y
todas sus sesiones cerradas. Si el dueño quiere contraseña, la pone con
«¿Has olvidado la contraseña?»: no hay pantalla para cambiarla
(`changePassword` existe en el API pero ninguna página la llama). Una cuenta
que sí confirmó su correo conserva la contraseña.

Se probó en local llamando al handler de verdad con `api/_google.js`
simulado (`mock.module` de Node 22, `--experimental-test-module-mocks`): con
Google real no se puede, porque el botón no se dibuja en `localhost`.

## Normativa y formulario de inscripción en el alta

- **El texto de la normativa está en un solo sitio: `group-normativa.html`.**
  Todo lo demás (la casilla del alta, el correo de rechazo, el botón de la
  portada) sólo enlaza a esa página. Comprobado el 2026-10-16 al cambiar el
  texto: ninguna otra página, script, correo ni tabla de la base repite sus
  reglas. («Inactividad» en `rating-info.html` es la pérdida de fiabilidad del
  rating, no la regla del grupo.)
- **Todos aceptan la normativa** con una casilla obligatoria que enlaza a
  `/group-normativa`. Quien la exige es el **servidor** (`comprobarAlta`,
  `acceptRules === true`), porque el alta con Google no pasa por la validación
  del formulario. La fecha queda en `users.rules_accepted_at`; las cuentas
  anteriores al 2026-10-16 la tienen a NULL.
- **El formulario de inscripción es obligatorio para todos**, también para
  los antiguos piratas (lo dijo Adrián). Vive en su propia página,
  **`/inscripcion`**, que se abre en otra pestaña como la normativa y se puede
  ver sin sesión. Al guardarlo, las respuestas quedan en `localStorage`
  (`vt-inscripcion`). La pestaña del alta se entera por el evento `storage` y
  al volver a ella, y las manda con el registro. Se borran del navegador en
  cuanto la cuenta existe. En modo privado el `localStorage` puede fallar: la
  página lo dice. El navegador integrado del panel abre los `target="_blank"`
  en la misma pestaña, así que ahí no se ve el paso de una a otra.
- **Ir al formulario puede sacarte del alta**: en el móvil, o con el botón
  «Ir a crear cuenta». Por eso el alta guarda un **borrador**
  (`vt-alta-borrador`: nombre, correo, normativa) y los enlaces de vuelta
  van a **`/cuenta?alta`**. Ese parámetro, o un borrador a medias, abren
  «Crear cuenta» y no «Entrar». El borrador se borra al crear la cuenta.
- **La contraseña también se recuerda, con caducidad** (`vt-alta-contrasena`
  en `localStorage`: `{ valor, hasta }`), desde el 2026-10-17. Hasta entonces
  no se guardaba nunca, y quien iba a la normativa o al formulario volvía sin
  ella; Adrián pidió guardarla hasta completar el alta.
  - **`localStorage` y no `sessionStorage`**, a propósito. Se probó primero
    `sessionStorage`, y fallaba justo en el caso que había que resolver: la
    normativa y el formulario se abren en otra pestaña (con `noopener`, que no
    copia el `sessionStorage`), y quien vuelve desde allí con «Ir a crear
    cuenta» llegaba sin contraseña. Adrián dijo que eso tenía que funcionar.
  - **Caduca a los 30 minutos** de la última vez que se escribió, y se borra
    en cuanto la cuenta existe (`olvidarInscripcion`). `auth-client.js`, que
    cargan las 18 páginas, borra la caducada en cualquiera de ellas, no sólo
    en `/cuenta`.
  - **El precio**: mientras dura el alta, la contraseña está en claro en el
    almacenamiento de ese navegador. Comprobado el 2026-10-17 en local: llega
    a otra pestaña, una caducada desaparece al abrir `/group-normativa` y no
    queda nada tras crear la cuenta.
- **El botón «Registrarse con Google» está inhabilitado hasta tener nombre,
  formulario y normativa**, pero se ve siempre: así lo quiso Adrián, igual
  que «Crear cuenta», que avisa de lo que falta. Como es un iframe de Google
  y su clic no se puede frenar, mientras falte algo lleva una capa
  transparente encima (`.tapa-google`). La capa recibe el clic, dice «te
  falta …» y pone el foco en el primer campo pendiente. Sin la capa, el alta
  con Google arrancaría sin nada (el servidor lo rechazaría, pero después de
  pasar por Google).
- **Cuidado al tocar este script**: `pintarInscripcion()` se ejecuta al
  cargar, antes de que se declaren las variables del final del fichero. Si
  algo que llama pasa a usar un `let` declarado más abajo, la página entera
  cae con `ReferenceError`. Sustituye al
  Google Form que el grupo usaba antes, con las mismas preguntas menos tres:
  el correo (ya lo tiene la cuenta), el nombre para el grupo (es el de la
  ficha) y la normativa (es la casilla de arriba). Las respuestas se guardan
  en `users.signup_form` (JSONB, porque las preguntas las decide el grupo y
  cambiarán) y el administrador las ve plegadas en cada pendiente.
- **Las opciones están en dos sitios**: `OPCIONES` en `api/_inscripcion.js`,
  que es quien valida y rechaza lo que no esté en la lista, y el marcado de
  `cuenta.html`. Si se añade una opción sólo en la página, el servidor la
  rechaza con «Falta …».

## El correo tiene que existir

Además de la forma (`correoValido`), el alta comprueba el correo con
`problemaDeCorreo` en `api/_correo.js`:

- **Erratas de proveedores conocidos.** `gmial.com`, `gmail.co`, `hotmial.es`,
  `outlok.com`… se rechazan sugiriendo el bueno. Esto no lo caza el DNS:
  **`gmial.com` existe y tiene MX**, como muchos dominios registrados justo
  para recoger el correo mal escrito. Se considera errata lo que está a una
  letra, o a dos letras cambiadas de sitio, de un dominio de la lista
  `PROVEEDORES`.
- **Que el dominio reciba correo**: registros MX o, a falta de ellos, una
  dirección A o AAAA. Un MX «.» es el dominio diciendo que no recibe correo
  (le pasa a `example.com`). Sólo se rechaza con una respuesta clara del DNS:
  si falla o tarda más de 3 s, se deja pasar.
- **Que la dirección concreta exista no se puede saber** sin mandar un
  correo. Para eso está el enlace de confirmar.

**En el host de Windows el DNS no responde a Node** y todo pasa por el «deja
pasar». Para probar esto, hazlo dentro del contenedor:
`docker compose exec -T app node --input-type=module -e "…"`.

## La campanita de avisos

`GET /api/auth?action=notifications` devuelve `{ items: [{tipo, texto,
cuando, enlace}] }`. Es una lista genérica a propósito, para que quepan otros
avisos. A cada jugador le llegan sus partidos por valorar y los avisos de
«editó vuestro partido» (`api/_avisos.js`, [[valoraciones_y_avisos]]); a los
administradores, además, las altas pendientes y lo que no han leído del
buzón ([[buzon_de_quejas]]). Sin nada de eso, la campana
sale sin número y «No tienes avisos». Sin sesión responde vacío, no 401.

La pinta `auth-client.js` en cualquier página con un `#vtCampana`, que hoy
sólo tiene `index.html`. Con ella la barra de la portada no cabía: por debajo
de 420 px el botón dice sólo «Normativa» y el chip se queda en el icono
(medido a 320, 375, 421 y 1024 px). El icono `notifications` está en la lista
recortada de `theme.css` ([[sistema_visual_viper_strike]]).

Al aprobar, el administrador elige el rol: Jugador (`member`) o Admin.
Cualquier valor que no sea `admin` se guarda como `member`.

## El primer administrador

`ADMIN_EMAILS` es una lista de correos separados por comas, en las variables de
entorno. Quien esté en ella nace `active` y `admin` — **pero sólo entrando por
Google**. El alta con contraseña no exige confirmar el correo —manda el
enlace, pero aprobar no lo espera—, así que si la lista valiese para esa vía
bastaría con saber la dirección para hacerse administrador.

Hoy es `131995adrian@gmail.com`, atado al jugador `Adrián C` (`players.id = 43`
en producción).

En local, donde no hay credencial de Google, se promociona a mano:

```sql
UPDATE users SET status='active', role='admin', approved_at=now() WHERE email='...';
```

## Correo: aprobada, restablecer y confirmar

Desde el 2026-10-16 la app manda cuatro correos (`api/_correo.js`):

| Cuándo | Qué | Enlace |
| --- | --- | --- |
| Alta con contraseña | «Confirma tu correo» | `/cuenta?verificar=…`, vale 7 días |
| Un admin aprueba la cuenta | «Tu cuenta está aprobada» | `/cuenta` |
| Un admin rechaza la cuenta | «Tu solicitud no ha sido aprobada» | `/group-normativa` |
| «¿Has olvidado la contraseña?» | «Restablecer tu contraseña» | `/cuenta?restablecer=…`, vale 1 hora |

El de rechazo sólo sale si el `UPDATE` marcó de verdad una cuenta pendiente:
rechazar dos veces, o rechazar a alguien ya aprobado, no manda nada. No
inventa motivos ni condiciones para volver a pedirlo: dice que no se aprobó.
Hasta el 2026-10-17 añadía que sus datos se habían borrado; desde que rechazar
los guarda, esa nota se quitó.

Restablecer y confirmar, los endpoints de las filas primera y última, viven en **`api/correo.js`**, no en `auth.js`, que
está a pocas líneas del techo de 600. En la página, la lógica está en
`cuenta-correo.js` por lo mismo.

**SMTP genérico.** En producción, una cuenta de Gmail del grupo con contraseña
de aplicación: basta `SMTP_USER` y `SMTP_PASS` en Vercel, porque el host cae
en `smtp.gmail.com:465`. En local, `docker-compose.yml` levanta **Mailpit**
(`http://localhost:8025`), que recoge todo y no envía nada fuera. **Sin SMTP
configurado no falla nada**: registra un aviso y sigue. Aprobar o registrarse
no pueden romperse porque Gmail no conteste.

**Cómo se ven.** HTML con tablas y estilos en línea, que es lo único que
respetan Gmail y Outlook, más una versión en texto plano sacada del mismo
mensaje. Cabecera oscura con el logo y botón dorado, como la app. El logo va
**incrustado** (adjunto con `cid`), no enlazado a la web: se ve igual en local
y en producción, y Gmail no lo esconde como imagen externa. Sale de
`api/_logo.js`, que es `image.png` en base64 **generado**: si cambia el logo,
se regenera con la orden que lleva en la cabecera. Para ver un correo sin
mandarlo fuera, se envía a Mailpit y se abre en
`http://localhost:8025/view/<ID>.html`.

Lo que cada decisión evita:

- **Los enlaces salen de `APP_URL`**, o de `VERCEL_PROJECT_PRODUCTION_URL`,
  **nunca de la cabecera `Host`**. Si salieran de ella, cualquiera pediría un
  restablecimiento para otro con `Host: su-dominio` y el token le llegaría a él.
  Probado: con `Host: malo.example` el enlace sigue saliendo de `APP_URL`.
- **«Si ese correo tiene cuenta, te hemos enviado…»** es la misma respuesta
  exista o no la cuenta, para no revelar qué correos son del grupo. Lo que
  todavía se nota es el **tiempo**: con cuenta, la respuesta espera al SMTP.
- **En `email_tokens` se guarda el SHA-256, no el token**, y se gasta con un
  solo `UPDATE … WHERE used_at IS NULL AND expires_at > now()`: dos peticiones
  a la vez no pueden usar el mismo enlace las dos.
- **Pedir otro enlace invalida el anterior**, y en dos minutos no se manda un
  segundo correo aunque se pulse diez veces.
- **Restablecer cierra todas las sesiones** de esa cuenta y la marca
  verificada, porque abrir el enlace prueba que el correo es suyo.
- **La página borra el token de la barra** (`history.replaceState`) nada más
  leerlo.
- **nodemailer va fijado a 10.0.13.** Todas las versiones hasta la 10.0.5
  tienen avisos de seguridad, y algunos son justo de interpretar direcciones,
  que aquí escribe quien se registra.

**Confirmar el correo no bloquea nada.** El administrador ve «confirmado» o
«sin confirmar» junto al correo de cada pendiente, y decide. Si fuese
obligatorio, un fallo del SMTP, o no tenerlo configurado, dejaría fuera a
quien se registra. Las
altas con Google nacen confirmadas.

Si el SMTP no está configurado o falla, la vía manual para una contraseña
olvidada es un `UPDATE` con un hash generado a mano:

```bash
docker compose exec -T app node -e "import('./api/_auth.js').then(async m => console.log(await m.hashPassword('la-nueva')))"
```

## El día que se despliegue, el grupo se queda fuera

En producción las cuentas empiezan a cero. En cuanto el 401 llega al grupo,
**nadie puede hacer nada** hasta registrarse y que un administrador lo apruebe.
No es un fallo, es lo que significa cerrar la app, pero hay que avisar antes y
estar disponible para aprobar.

## La administración va por la sesión, no por una clave

Hasta el 2026-10-16 los paneles de `index.html` y `history.html` se abrían con
una clave escrita en el propio HTML, y `deleteName` la comprobaba en el
servidor. Estaba publicada: cualquiera que abriese el código fuente la tenía.
Ahora los dos paneles miran `window.vtMe` y `deleteName` exige
`role = 'admin'` (403 si no). Si encuentras `adminKey` en algún sitio, es
anterior.

El botón de «Administración» se sigue viendo para todos; a quien no es admin
le dice que no y no abre nada.

**Lo que sólo hace un administrador, comprobado en el servidor** (desde el
2026-10-17; antes bastaba la sesión y las páginas sólo escondían el botón):

| Acción | Dónde |
| --- | --- |
| Crear ligas, cuadros, pozos, compás y cambiar sustituciones | todo `api/league-admin.js`, en el `handler` |
| Dar de alta o reactivar un jugador (`submitName`) | `api/write.js`, `esAdmin` |
| Borrar un partido (`deleteResult`) | `api/write.js`, `esAdmin` |
| Dar de baja (`deleteName`) y editar fichas (`updatePlayer`) | `api/write.js`, ya lo eran |

A los demás les responde 403. Esconder un botón no cierra nada: un miembro
podía crear un torneo con `curl` (comprobado en local antes del cambio).

**La disponibilidad de `/day` es de cada uno** (desde el 2026-10-17):
`submitVote` sólo acepta el jugador de tu cuenta, y un admin cualquiera. El
nombre tiene que existir; antes cualquier nombre valía y se creaba la ficha.
`/day` sigue enseñando la lista entera con tu nombre puesto: si eliges otro,
avisa «Solo puedes apuntar tu propia disponibilidad».

**Editar un resultado sí está cerrado** desde el 2026-10-17: `submitResult` con
`_original` sólo deja a los cuatro jugadores del partido y a los admins (403 a
los demás). Subir un partido nuevo sigue abierto a cualquier miembro. Detalle:
[[valoraciones_y_avisos]].
