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
| `?action=players` | **Abierto a propósito.** Quien se registra no tiene sesión con la que pedir la lista de jugadores. Enseña lo mismo que `getNames` enseñaba a cualquiera hasta el 2026-10-16. |
| Las 17 páginas `.html` | **Se descargan igual**: son estáticas y están en un CDN. Llegan vacías, porque los datos vienen del API. |

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

## `league-admin.js` no tiene ni una línea de margen

Mide **626 líneas** y `tools/code-size-baseline.json` lo tiene registrado
exactamente ahí: el trinquete sólo deja encoger
([[tamano_del_codigo_y_trinquete]]). El guardia entró ocupando las dos líneas
en blanco que había —la de después de los `import` y la de dentro del
`handler`—, de modo que el fichero no creció.

**Quien quiera añadir algo ahí tiene que sacar algo primero.** El arreglo de
verdad es partirlo: `createLeague` (91), `createPozoTournament` (95),
`createCompasTournament` (83) y `createLeagueBracket` (64) son 333 líneas que
cabrían en un `api/_torneos.js`. Es un refactor sin pruebas que lo respalden,
así que va solo, en su commit, y se verifica creando una liga y un pozo de
verdad contra el Postgres local.

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

## Antiguo pirata elige de la lista; el resto escribe su nombre

La lista de nombres es **sólo para los antiguos piratas**, los que ya jugaban
antes de que hubiera cuentas. Por eso el alta abre con el campo de nombre
libre, y la lista sólo aparece al marcar «Soy antiguo pirata». Hasta el
2026-10-16 era al revés: un desplegable obligatorio con «No estoy en la lista»
escondido al final, y quien era nuevo no encontraba por dónde entrar. Lo pidió
así Adrián.

**La lista no enseña a quien ya tiene cuenta activa** (`?action=players`
filtra con `NOT EXISTS` sobre `users.status = 'active'`). Los pendientes **sí**
salen, a propósito: el alta es pública, y si un pendiente ocultase el nombre,
cualquiera podría apartar el de otro hasta que un administrador lo rechazase.
Con el nombre visible, los dos compiten y decide quien aprueba (ver el índice
parcial, más abajo).

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

Cinco negativas, cada una con su motivo, porque «error» a secas haría que la
persona lo intentase otra vez igual:

| Caso | Qué dice |
| --- | --- |
| El nombre de la lista ya tiene cuenta activa (ya no sale, pero una página abierta de antes aún lo tiene) | «Ese jugador ya tiene una cuenta.» |
| Escribe el nombre de alguien que ya tiene cuenta | «Ese nombre ya es de otro usuario (…). Elige otro.» |
| Escribe un nombre que ya está en la lista | «Ese nombre ya está en la lista como «…»: marca «Soy antiguo pirata» y elígelo.» |
| Escribe el nombre de un jugador dado de baja | «Ese nombre existe pero está dado de baja.» |
| Otro pendiente pidió ya ese nombre | «Ya hay una cuenta esperando con ese nombre.» |

El correo se comprueba **antes** que el nombre: si ya tiene cuenta, el nombre
da igual y decirlo primero evita el mensaje equivocado.

## El límite del jugador es un índice parcial, no un `UNIQUE`

```sql
CREATE UNIQUE INDEX users_player_activo_idx ON users(player_id) WHERE status = 'active';
```

Con un `UNIQUE` liso, cualquiera registra una cuenta reclamando el jugador de
otro —el alta es pública— y lo deja fuera para siempre aunque su cuenta no se
apruebe nunca. Con el índice parcial, varios pendientes compiten por el mismo
jugador y decide el administrador. Por lo mismo, **rechazar borra la fila**: si
la marcase, el jugador quedaría ocupado.

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

## Normativa y formulario de acceso en el alta

- **Todos aceptan la normativa** con una casilla obligatoria que enlaza a
  `/group-normativa`. Quien la exige es el **servidor** (`comprobarAlta`,
  `acceptRules === true`), porque el alta con Google no pasa por la validación
  del formulario. La fecha queda en `users.rules_accepted_at`; las cuentas
  anteriores al 2026-10-16 la tienen a NULL.
- **El formulario de inscripción está dentro del alta y es obligatorio para
  todos**, también para los antiguos piratas (lo dijo Adrián). Sustituye al
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
avisos; hoy sólo la llenan las altas pendientes, y sólo para administradores.
Un jugador ve la campana sin número y «No tienes avisos». Sin sesión
responde vacío, no 401.

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
Google**. El alta con contraseña no verifica el correo (no hay servicio de
correo contratado), así que si la lista valiese para esa vía bastaría con saber
la dirección para hacerse administrador.

Hoy es `131995adrian@gmail.com`, atado al jugador `Adrián C` (`players.id = 43`
en producción).

En local, donde no hay credencial de Google, se promociona a mano:

```sql
UPDATE users SET status='active', role='admin', approved_at=now() WHERE email='...';
```

## Correo: aprobada, restablecer y confirmar

Desde el 2026-10-16 la app manda tres correos (`api/_correo.js`):

| Cuándo | Qué | Enlace |
| --- | --- | --- |
| Alta con contraseña | «Confirma tu correo» | `/cuenta?verificar=…`, vale 7 días |
| Un admin aprueba la cuenta | «Tu cuenta está aprobada» | `/cuenta` |
| «¿Has olvidado la contraseña?» | «Restablecer tu contraseña» | `/cuenta?restablecer=…`, vale 1 hora |

Los dos últimos endpoints viven en **`api/correo.js`**, no en `auth.js`, que
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
obligatorio, mientras no haya SMTP en producción nadie podría entrar. Las
altas con Google nacen confirmadas.

Mientras no haya SMTP en producción, la vía manual para una contraseña
olvidada sigue siendo un `UPDATE` con un hash generado a mano:

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

**Lo que el panel de `history.html` no protege.** Ahí se borran y editan
resultados, pero `deleteResult` y `submitResult` sólo exigen sesión, no rol:
cualquier miembro puede llamarlas directamente. `submitResult` no puede ser
sólo de admin, porque es como cualquiera sube su partido desde la portada.
Si se quiere cerrar `deleteResult`, es pasarle `user` igual que a
`deleteName`, en su propio commit.
