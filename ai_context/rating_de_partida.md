# Rating de partida: las altas nuevas arrancan en su nivel BK

Desde el 2026-10-17. `rating-info.html` ya lo prometía y el motor no lo hacía:
todo el mundo arrancaba en 1500.

## La regla (de Adrián)

| Nivel BK de la inscripción | Arranca en |
| --- | --- |
| Iniciación | 1200 |
| Intermedio | 1400 |
| Avanzado | 1800 |
| Entreno | **2000,01** |

- **Fiabilidad 0 para todos**: RD 350, que ya era el de cualquier jugador nuevo.
- **Sólo altas nuevas.** Quien ya jugaba sigue arrancando en 1500 y su historia
  no cambia.
- **Entreno va a 2000,01 y no a 2000**: la categoría Entreno es «más de 2000»
  ([[categorias_de_rating]]) y con 2000 justos saldría en Avanzado.
  `rating-info.html` sigue diciendo 2.000 a propósito.

## Dónde vive

- `players.initial_rating` (NULL = 1500). La columna la añade
  `ensureAuthSchema` (`api/_auth.js`), no `ensureSchema`, que está en el techo
  de tamaño.
- Se fija **al aprobar el alta** (`approveUser` → `fijarRatingDePartida` en
  `api/_inscripcion.js`), y sólo si ese jugador no tiene ningún partido ni
  rating de partida. Así quien reclama una ficha con historia la conserva
  aunque rellenara el nivel. Un jugador creado a mano o subiendo un resultado
  tampoco lo recibe.
- **El alta de `ADMIN_EMAILS` por Google no pasa por `approveUser`**: nace
  activa. Hasta el 2026-10-18 eso la dejaba en 1500 (y sin ficha si pedía un
  nombre nuevo); ahora `crearCuentaDeGoogle` hace lo mismo que aprobar:
  `crearFichaSiHaceFalta` y `fijarRatingDePartida`. Se notó al vaciar
  producción: Adrián se dio de alta en Avanzado y salió con 1500.
  `api/auth.js` quedó en 600 líneas justas: la próxima línea obliga a partirlo.
- El motor lo lee de `getRatingsDePartida` (`api/read.js`) mediante
  `rating-inicial.js`, cargado **antes** del script de `rating.html` y
  `players.html`, como `nivel-votos.js` ([[valoraciones_y_avisos]]). Cada
  `new GlickoPlayer()` que crea un jugador pasó a `window.vtInicial.crear(nombre)`
  sin añadir líneas. `rating-test.html` no lo usa.

## Comprobado en local

Tres altas aprobadas por el API: Avanzado → 1800, Entreno → 2000,01, y una que
reclamaba a Álvaro (con partidos) → sin rating de partida. Tras un partido
ganado, el de Avanzado quedó en 1867,55 (RD 303,29); arrancando en 1500 habría
quedado en 1602,90. `/rating` y `/players` dieron lo mismo y no cambió ningún
jugador ajeno al partido.

**Un alta sin partidos sale en `/rating` desde el 2026-10-18**, con «Sin
fiabilidad» (RD 350, 0 barras). Hasta entonces el filtro de fiabilidad mínima
venía en «muy baja» (RD < 350) y la escondía: tras vaciar producción, `/rating`
salía en blanco con un jugador dentro. Ahora viene en «cualquiera» (decidido
por Adrián: quiere ver a todos desde el principio). «Sin fiabilidad» sigue
siendo su propia categoría, no se fundió con «muy baja».
