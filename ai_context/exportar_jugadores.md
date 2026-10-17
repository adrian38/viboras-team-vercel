# Exportar jugadores: el CSV de los administradores

Desde el 2026-10-17, `/rating` tiene un botón «Exportar jugadores» que
descarga `jugadores-AAAA-MM-DD.csv`. Lleva el rating, la fiabilidad, la
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
activos», fiabilidad «Cualquiera») coinciden en rating y categoría con el CSV.
Los demás no tienen rating porque no tienen partidos: altas pendientes,
cuentas sin jugador y jugadores de baja que nunca jugaron.

## Filas y estados

Una fila por cuenta, más una por cada jugador sin cuenta. La columna `estado`:

| Estado | Cuándo |
| --- | --- |
| De baja | El jugador tiene `active = false`. Gana sobre lo demás. |
| Activo / Pendiente / Bloqueado | El `status` de la cuenta. |
| Sin cuenta | Jugador sin ninguna cuenta: los antiguos piratas que aún no se han registrado. |

**No hay «Rechazado»**: rechazar **borra** la cuenta
([[cuentas_y_sesiones]]), así que no queda nada que exportar. Para tenerlo
habría que marcar en vez de borrar, y eso choca con el correo de rechazo, que
dice que sus datos se han borrado.

Un jugador puede salir dos veces: su cuenta activa y otra pendiente que
reclama el mismo nombre. Es lo que hay en la base.

## El CSV

Separador `;`, con BOM, como el de resultados de `history.html`: así Excel en
castellano lo abre en columnas y con las tildes bien. Las respuestas de la
inscripción van con sus **códigos** (`avanzado`, `tardes-findes`), no con los
textos de la página: los textos están copiados en `cuenta.html` y no hacía
falta una tercera copia.

Lo que empieza por `= + - @` se exporta con un `'` delante, porque Excel lo
ejecutaría como fórmula. Ese texto lo escribe quien se registra. Por eso los
teléfonos salen como `'+34 …`.
