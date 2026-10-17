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

**Un alta sin partidos no sale en `/rating` por defecto**: el filtro de
fiabilidad mínima viene en «muy baja» (RD < 350) y una fiabilidad 0 es RD 350.
Aparece con su primer partido, o eligiendo «cualquiera» en el filtro. Era así
antes de este cambio.
