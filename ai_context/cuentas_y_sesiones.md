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
  botón. Es lo que pasa en el entorno local.

El `client_id` llega por `GET /api/auth?action=config`: aquí no hay paso de
build que lo inyecte en un `.html` estático, y no es un secreto.

El enlace por correo (quien se registró con contraseña y luego entra con
Google) **exige `email_verified === true`**. Sin esa comprobación sería
suplantación: Google emite el token igualmente para un correo sin confirmar.

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

## Lo que falta, y que va a hacer falta

**No hay forma de recuperar una contraseña olvidada.** Sin servicio de correo,
el único camino es `changePassword` con la sesión abierta, o un `UPDATE` manual
con un hash generado a mano:

```bash
docker compose exec -T app node -e "import('./api/_auth.js').then(async m => console.log(await m.hashPassword('la-nueva')))"
```

Y luego `UPDATE users SET password_hash='scrypt$...' WHERE email='...'`. Quien
entre con Google no tiene este problema.

## El día que se despliegue, el grupo se queda fuera

En producción las cuentas empiezan a cero. En cuanto el 401 llega al grupo,
**nadie puede hacer nada** hasta registrarse y que un administrador lo apruebe.
No es un fallo, es lo que significa cerrar la app, pero hay que avisar antes y
estar disponible para aprobar.

## Dos puertas de administración, y por qué

El panel de `index.html` sigue abriéndose con la clave `'4F7K9Q2Z'`, que está
**publicada en el HTML** (`index.html:350`, `history.html:285`) y sólo protege
de verdad una acción en el servidor, `deleteName` (`api/write.js:167`).

Las aprobaciones de cuentas **no** están ahí, están en `/cuenta`, y
`api/auth.js` no acepta `adminKey` en ninguna acción. Poner `approveUser`
detrás de una clave pública permitiría a cualquiera aprobarse solo y atarse a
la identidad de otro miembro.

Pendiente, cada cosa en su commit: que `deleteName` acepte sesión de
administrador, y retirar la clave de los tres ficheros.
