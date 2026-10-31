# El motor de rating: una sola copia desde el 2026-10-31

**Ya no son tres.** El Glicko vive en `vt-glicko.js`, que cargan sin `defer`
las tres páginas que lo usan —`rating.html`, `players.html` y
`rating-test.html`— y que publica sus nombres en `window.vtGlicko`. Cada
página los trae a su ámbito con un `const {…} = window.vtGlicko` y el resto
de su código se lee igual que cuando el motor estaba pegado dentro.

No hizo falta reestructurar nada ni usar módulos: es un `<script>` clásico
más, como `splash.js`.

Lo que **sigue** siendo de cada página es `calculateEngineRatings`, el bucle
de días: en `rating-test.html` acepta `extraDecayDays` y en `players.html` ni
existe. Juntarlos sería un cambio de comportamiento, no un refactor.

## La única diferencia de motor que había, y estaba escondida

`getPlayerOrCreate` no era igual en las tres, y la guarda vieja no lo
miraba: `rating.html` y `players.html` creaban al jugador nuevo con
`window.vtInicial.crear(nombre)` —su rating de partida según el nivel BK— y
`rating-test.html` con un `GlickoPlayer()` en blanco, porque es un banco de
pruebas y no tiene esa tabla detrás.

Ahora esa diferencia es una línea a la vista, en `rating-test.html`:

```js
window.vtGlicko.usarJugadorNuevo(() => new GlickoPlayer());
```

## Lo que había antes

Las tres páginas implementaban cada una su propio Glicko en JavaScript
embebido, y una guarda comparaba los md5 de las funciones normalizadas para
que no se separaran.

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

1. Si el cambio es en el motor, se toca `vt-glicko.js` y ya está: las tres
   páginas lo cargan. **No se copia nada a una página**, por cómoda que
   parezca la copia; `node tools/rating-parity.mjs` falla si aparece una.
2. Si el cambio es en `calculateEngineRatings`, hay que llevarlo a mano a
   `rating-test.html` conservando `extraDecayDays`. Eso sigue igual.
3. Comprobar el resultado comparando la tabla de `/rating` antes y después:
   no hay pruebas, y esa tabla es el único testigo. Al sacar el motor, las
   42 filas salieron idénticas y `/players` mantuvo «1679,34 ± 153,59» para
   Adrián C.

### Un detalle de JavaScript que muerde

En `players.html` los nombres se traen con `let`, no con `const`:
`players-aportes.js` envuelve `updatePeriod` reasignándolo, y con `const`
eso revienta con «Assignment to constant variable». Cuando el motor estaba
pegado dentro eran declaraciones de función y se dejaban reasignar sin
quejarse.
4. Un número que cambia en `/rating` y no en `/players` casi siempre es esto, no
   un bug de datos.

La guarda sólo cubre las primitivas, que es lo que de verdad tiene que coincidir.
No intenta vigilar `calculateEngineRatings`, porque ahí la divergencia es
intencionada.

## El aporte de cada partido en `/players` (una cuarta copia, vigilada)

Desde el 2026-10-16, en el detalle de un día de `/players`, cada partido
lleva al lado lo que aportó al cambio del día (lo pidió Dani). Lo hace
`players-aportes.js`.

El motor no calcula por partido: `updatePeriod` actualiza **una vez por día**
con todos los partidos juntos. Pero el cambio del día es
`K · Σ (peso · g · (resultado − esperado))`, con un sumando por partido y una
`K` común al día. El aporte de un partido es `K · su sumando`, y **los
aportes de un día suman exactamente el cambio del día**. No es una
aproximación ni «lo que habría pasado si sólo hubiese jugado ese partido».

Tres cosas que no se ven desde el código:

- **No toca `players.html`.** El fichero está en el techo de 738 líneas y
  `updatePeriod` en el suyo de 66 ([[tamano_del_codigo_y_trinquete]]).
  `players-aportes.js` **envuelve** `updatePeriod`, `buildMatchLineHtml` y
  `buildDailyHistoricalSeries`, que son globales del `<script>` de la página.
  Por eso su `<script src>` tiene que ir **después** de ese script y sin
  `defer`.
- **Repite el cálculo de las observaciones de `updatePeriod`**, así que es
  una cuarta copia de esa parte del motor. Para que no pueda mentir, **cada
  día se contrasta con el resultado real de `updatePeriod`**: si los aportes
  no suman el cambio del día, ese día no se enseña y sale un aviso en la
  consola (`players-aportes: los aportes no suman…`). **Si cambias
  `updatePeriod`, cambia también `players-aportes.js`**; si no, los aportes
  desaparecen sin romper nada más.
- **`updatePeriod` no sabe de qué día es ni de qué partido viene cada
  registro.** El día se deduce porque el motor recorre los días en orden. El
  partido se busca por las dos parejas, en el mismo orden que `allMatches`.
  Si dos partidos iguales caen el mismo día y uno no tiene marcador válido,
  ese emparejamiento no es seguro y no se enseña.

Comprobado el 2026-10-16 sobre la base local (73 jugadores, 258 partidos): en
los 189 días-jugador con partidos, los aportes suman el cambio del día. La
peor diferencia fue de 0,01, y viene sólo de redondear cada aporte a dos
decimales. Los 272 partidos llevan su aporte. El caso de la captura de Dani
(06/09/2026, +81,15) se reparte en +47,88 y +33,27.

Relacionado: [[categorias_de_rating]], que es presentación y no motor.
