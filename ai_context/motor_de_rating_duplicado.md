# El motor de rating vive en tres copias

`players.html`, `rating.html` y `rating-test.html` implementan cada uno su
propio Glicko, en JavaScript embebido. No hay módulo compartido: no se puede
importar nada desde una página servida como estática sin reestructurar el
proyecto, así que el algoritmo está pegado tres veces.

Comprobado el 2026-10-08 comparando el md5 de cada función normalizada
(`node tools/rating-parity.mjs`):

| Función | `rating.html` | `players.html` | `rating-test.html` |
| --- | --- | --- | --- |
| `g` | `06ac7979` | `06ac7979` | `06ac7979` |
| `expected` | `5ea0ac2c` | `5ea0ac2c` | `5ea0ac2c` |
| `getEffectiveObservationRd` | `86d9b444` | `86d9b444` | `86d9b444` |
| `getReliabilityWeight` | `a9eb196b` | `a9eb196b` | `a9eb196b` |
| `calculateEngineRatings` | `10801bbb` | no existe | `426fd713` |

Las cuatro primitivas son **idénticas byte a byte** en las tres páginas. Las
constantes también: `INITIAL_RATING = 1500.0`, `INITIAL_RD = 350.0`,
`MAX_RD = 350.0`.

## Lo que ya divergió

`calculateEngineRatings` **no** coincide entre `rating.html` y
`rating-test.html`: la de la página de pruebas acepta un parámetro extra,
`extraDecayDays`, y es 81 bytes más larga. Esa divergencia es deliberada —
`rating-test.html` existe para simular el decaimiento— pero significa que
**cualquier corrección del motor hay que llevarla a las dos a mano**, y que
comparar las dos funciones enteras no sirve como guarda.

`players.html` no tiene `calculateEngineRatings`: calcula el rating por jugador
y día con su propio recorrido (`getPreviousDayRatingDelta`), apoyado en las
mismas cuatro primitivas.

## Qué hacer al tocar el rating

1. Localizar **las tres** páginas antes de editar, no la que abriste.
2. Si el cambio es en una primitiva compartida, aplicarlo idéntico en las tres y
   dejar `node tools/rating-parity.mjs` en verde.
3. Si el cambio es en `calculateEngineRatings`, llevarlo a mano a
   `rating-test.html` conservando `extraDecayDays`.
4. Un número que cambia en `/rating` y no en `/players` casi siempre es esto, no
   un bug de datos.

La guarda sólo cubre las primitivas, que es lo que de verdad tiene que coincidir.
No intenta vigilar `calculateEngineRatings`, porque ahí la divergencia es
intencionada.

Relacionado: [[categorias_de_rating]], que es presentación y no motor.
