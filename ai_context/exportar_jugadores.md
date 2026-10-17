# Exportar jugadores (y las descargas a Excel)

Desde el 2026-10-17, `/rating` tiene un botón «Exportar jugadores» que
descarga `jugadores-AAAA-MM-DD.xlsx`. Lleva el rating, la fiabilidad, la
categoría y los partidos jugados de cada jugador, más su cuenta y lo que
rellenó en la inscripción (nivel BK y demás). Las piezas:

| Fichero | Qué hace |
| --- | --- |
| `api/read.js`, `exportPlayers` | Jugadores y cuentas, **sólo admin** (`exigirAdmin`: 401 sin sesión, 403 si no es admin). |
| `rating-export.js` | Enseña el botón a los admin, cruza los datos con los ratings y descarga el fichero. |

## Por qué en `/rating` y no en el panel de `/cuenta`

El rating **no está en la base**: lo calcula el navegador, y cada página tiene
su copia del motor ([[motor_de_rating_duplicado]]). Exportar desde `/cuenta`
obligaría a meter una cuarta. `rating-export.js` usa las funciones de
`rating.html`: `calculateEngineRatings`, `filterMatchesForCutoff`,
`getFiabilidadConfig` y `TIER_DEFINITIONS`. Las dos últimas salieron de dentro
de `renderTable` para eso: los cortes de categoría siguen en un solo sitio
([[categorias_de_rating]]).

El botón oculto es comodidad. Quien protege los datos es el 403 del servidor.

## El rating es el de la fecha más reciente, sin filtros

Se calcula a la **primera fecha del desplegable**, que es la que enseña la
tabla al abrir, con todos los jugadores, sin fijarse en la fiabilidad mínima.
**No vale `'latest'`**: el desplegable lo cambia por fechas al cargar, y
`calculateEngineRatings` lo toma por fecha y devuelve a todos 1500. Pasó en la
primera versión.

Comprobado el 2026-10-17 en local: los 68 jugadores de la tabla («Incluir no
activos», fiabilidad «Cualquiera») coinciden en rating y categoría con la exportación.
Los demás no tienen rating porque no tienen partidos: altas pendientes,
cuentas sin jugador y jugadores de baja que nunca jugaron.

## Filas y estados

Una fila por cuenta, más una por cada jugador sin cuenta. La columna `estado`:

| Estado | Cuándo |
| --- | --- |
| Rechazado | Cuenta rechazada por un administrador. Gana sobre lo demás. La columna «Rechazada» lleva la fecha. |
| De baja | El jugador tiene `active = false`. |
| Activo / Pendiente / Bloqueado | El `status` de la cuenta. |
| Sin cuenta | Jugador sin ninguna cuenta (o sólo con una rechazada): los antiguos piratas que aún no se han registrado. |

**«Rechazado» existe desde el 2026-10-17**, cuando rechazar pasó a marcar la
cuenta en vez de borrarla ([[cuentas_y_sesiones]]). Las rechazadas antes se
borraron y no salen. Un rechazado que reclamaba un jugador no le cuenta como
cuenta: el jugador sale además en su propia fila, como «Sin cuenta».

Un jugador puede salir dos veces: su cuenta activa y otra pendiente que
reclama el mismo nombre. Es lo que hay en la base.

## La pantalla «Jugadores» del panel lee la misma lista

Desde el 2026-10-17, el panel de administración (`index.html`) tiene una
entrada propia **«Jugadores»**, aparte de «Nuevo jugador», que se quedó sólo
con el formulario de registrar. La pinta `admin-jugadores.js` con
`exportPlayers`; por eso las filas llevan `userId`, `playerId`,
`playerActive` y `status`, y la respuesta trae `inscripcion`: las preguntas y
los textos de sus opciones, que salen de `describirInscripcion()` en
`api/_inscripcion.js`. Todo lo pidió Adrián:

- **Todas las cuentas, rechazadas incluidas**, con el estado en color: verde
  activo, amarillo pendiente, rojo rechazado, gris de baja o sin cuenta.
- **Buscador** por nombre, correo, nombre completo o teléfono, y **filtro por
  estado** que sólo ofrece los estados que hay en los datos, con cuántos.
- **«Bloqueado» no aparece.** `blockUser` existe en el API pero ninguna
  pantalla lo usa, y en la base no había ninguna cuenta bloqueada. Una
  primera versión lo ofrecía y Adrián lo señaló como estado que no existe.

**«Editar» abre su propia pantalla** (en la primera versión se desplegaba
dentro de la fila y era incómodo), con todos los datos, y guarda con
`/api/write?action=updatePlayer`, sólo de admin:

- **Jugador** (si hay ficha): el nombre en las tablas y «En activo» o «Dado
  de baja». Al renombrar se rechaza un nombre que choque con otro jugador sin
  mayúsculas, tildes ni espacios de más. `claveDeNombre` está copiada de
  `auth.js` a `write.js`: si cambia una, cambia la otra.
- **Cuenta**: estado, correo, nombre que pidió (si no tiene ficha), correo
  confirmado y fechas de alta y aprobación o rechazo, sólo para ver. **El
  estado no se cambia aquí**: aprobar y rechazar siguen en `/cuenta`, que
  crea la ficha y manda el correo. Lo único editable es el **tipo de
  usuario**, y sólo en una cuenta activa. Nadie cambia el de su propia
  cuenta: un admin podría quedarse fuera.
- **Inscripción**: las ocho respuestas, editables, con las mismas reglas que
  el alta (`validarInscripcion`, todas obligatorias) y un teléfono que no
  esté en otra cuenta (`telefonoLibre`, sin contar la propia). Si están todas
  vacías, como en las cuentas anteriores al formulario, no se manda nada.

Sustituye al botón «Eliminar», que daba de baja: ahora eso es «Dado de baja»
dentro de Editar. `deleteName` sigue en `write.js`, sin nadie que lo llame.
Los textos de las opciones están en tres sitios: `inscripcion.html`,
`cuenta.html` (`TEXTO_INSCRIPCION`) y `api/_inscripcion.js`.

## Es un Excel, y lo escribe `excel-export.js`

Desde el 2026-10-17 las dos descargas de la app son `.xlsx`: esta y
«Descargar resultados» de `history.html`. Las dos fueron CSV con `;` y BOM.
Las dos usan `vtExcel.descargar(fichero, hoja, filas)` de `excel-export.js`.

**Sin librerías.** Un `.xlsx` es un zip con seis XML. `excel-export.js` lo
escribe a mano, sin comprimir (zip *store*, con su CRC32). Una librería como
SheetJS ocuparía cientos de KB y vendría de un CDN ajeno.

Lo que hace por su cuenta:

- **Un número de JavaScript sale como número**, y cualquier otra cosa como
  texto. Por eso `rating-export.js` pasa el rating como `Number` (con formato
  `0.00`) y `history.html` convierte los juegos, que el API manda como texto.
- **El texto nunca es fórmula** (`inlineStr`). Un nombre que empiece por `=`
  sale tal cual y no se ejecuta, así que ya no hace falta el `'` delante que
  llevaba el CSV.
- Cabecera en negrita, fija al desplazarse y con filtros. Anchos de columna
  según el contenido, con un tope de 50.

Comprobado el 2026-10-17: un fichero generado con tildes, `<&>`, comillas,
`=HYPERLINK(…)` y celdas vacías se abre con openpyxl sin avisos. Las descargas
reales, leídas en el navegador, coinciden con la tabla (73 jugadores) y con
`getResults` (35 partidos). **Excel de escritorio no se ha probado**: no hay
uno en el equipo donde se hizo.

Las respuestas de la inscripción van con sus **códigos** (`avanzado`,
`tardes-findes`), no con los textos de la página: esos textos están copiados
en `cuenta.html` y no hacía falta una tercera copia.
