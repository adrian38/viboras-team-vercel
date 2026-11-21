# Los torneos no puntúan para el rating

Escrito el 2026-11-21. Regla de Adrián: **un partido de torneo no da rating ni
mueve la fiabilidad.** Un torneo entero vale su punto de Actividad en
`/ranking` ([[ranking_tres_categorias]]) y nada más.

Hasta hoy sí los daba, y no era un descuido reciente: `pozo_americano.md` decía
—y lleva diciéndolo desde el 2026-11-12— que «el pozo no toca el rating
Glicko», porque entonces `/rating` pedía `eventType=ranked,legacy`. Cuando el
motor pasó a `front/comun/vt-glicko.js` su `leerPartidos()` se escribió con la
lista larga (`ranked,grupo_liga,pozo,compas,doble_ko,legacy`) y los torneos
entraron en el Glicko sin que nadie lo decidiera. La nota se quedó describiendo
lo que ya no pasaba.

## Lo que movía, medido

Contra la base de producción del 2026-11-21 (44 partidos `ranked` y los 20 del
«Pozo noviembre» del 14/11), corriendo el motor fuera del navegador con los dos
`vt-glicko.js`, el de antes y el de ahora:

**24 de los 42 jugadores cambiaban de rating.** Los cinco mayores:

| Jugador | Antes | Ahora | Diferencia | RD antes | RD ahora |
| --- | --- | --- | --- | --- | --- |
| Emilio GG | 1877,80 | 1752,40 | −125,40 | 169,80 | 235,59 |
| Iñaki M | 1686,40 | 1800,00 | +113,60 | 253,87 | 350,00 |
| Guillermo P | 1410,90 | 1310,02 | −100,88 | 191,06 | 213,35 |
| Rodrigo | 1595,61 | 1664,13 | +68,52 | 164,00 | 194,16 |
| Harald | 1243,10 | 1305,23 | +62,13 | 192,31 | 221,38 |

El RD sube en todos: menos partidos es menos fiabilidad, que es justo lo que se
pedía. **Iñaki M y Jaime N. sólo habían jugado el pozo**, así que vuelven a su
rating de partida con RD 350 y fiabilidad 0%: para el motor no han jugado nada.

## Dónde está el filtro, y por qué ahí

En `calcularRatings()` (`front/comun/vt-glicko.js`), no en `leerPartidos()`:

```js
const puntuables = (matches || []).filter(m => !esDeTorneo(m));
```

`leerPartidos()` tiene que seguir devolviendo los torneos porque **`/ranking`
los necesita** para contar cada uno como una unidad de Actividad. Filtrar al
pedirlos habría dejado a los torneos sin su punto, que sí es regla del grupo.

La lista está escrita dos veces a propósito: `EVENTOS_DE_TORNEO` en
`api/_db.js` para el servidor y `TORNEOS` en `vt-glicko.js` para el front, que
no importa del API. Son `pozo`, `compas` y `doble_ko`.

`/players` arma su propia serie diaria con su propio bucle (el motor común no
incluye `calculateEngineRatings`: `motor_de_rating_duplicado.md`), así que
**tiene su propio filtro**, con el mismo `window.vtGlicko.esDeTorneo`. Va en el
`.filter()` de `buildDailyHistoricalSeries` y no en el `fetch`, porque la lista
de partidos del día sí los enseña, con su etiqueta «Torneo».

## La fiabilidad se arregla sola, hoy

Los votos de «¿estaban en su nivel?» mueven el RD día a día
(`front/comun/nivel-votos.js`), y `ajustar()` sólo toca a quien aparece en los
partidos de ese día. Si el día sólo tuvo torneo, el día ya no existe para el
motor y sus votos no se aplican. En producción el 14/11 **no hubo más partidos
que los 20 del pozo**, así que las 90 valoraciones de ese pozo dejan de mover
la fiabilidad sin tocar la base.

**Pero `getNivelVotos` (`api/read.js`) no sabe de torneos**: suma por día y
jugador sobre `match_feedback_por_dia`, que agrupa por fecha y cuatro
jugadores, sin mirar el evento. El día que un pozo caiga en la misma fecha que
un partido `ranked`, los votos del pozo se aplicarán al jugador que jugó los
dos. No está arreglado; está medido y escrito aquí.

## Lo que esto no cambia

- **Las valoraciones del pozo siguen en la base** (90 en producción, 17
  partidos): las de actitud cuentan para fair play y para la calificación de
  estrellas ([[calificacion_de_estrellas]]). Que un torneo dé o no fair play es
  regla del grupo, no se decidió aquí.
- **Actividad sigue contando el torneo**: comprobado en local, Adrián C con 8
  partidos y 1 torneo sigue sumando 9.
- **`/statistics` y `/tournaments` siguen viendo los torneos**: no calculan
  rating.
- **El peso 0,3 de `timed_games`** sigue en `pesoDelPartido()`. Para los
  torneos ya no se usa; se deja porque el formato no es exclusivamente suyo y
  quitarlo sería otro cambio.

## No hay guarda mecánica

Una pantalla nueva que lea `leerPartidos()` y haga su propio bucle de días
volverá a sumar los torneos sin que `npm run check` diga nada, igual que pasó
aquí. `tools/rating-parity.mjs` vigila que nadie se traiga su propio Glicko,
no que todos filtren igual.

## Cómo se comprobó (2026-11-21)

- **Antes y después**, con un arnés en Node que carga `vt-glicko.js`,
  `rating-inicial.js` y `nivel-votos.js` con un `fetch` de mentira y los datos
  de producción: la tabla de arriba.
- **El arnés dice lo mismo que la página**: con los datos locales, `/rating`
  enseña Eli Pastor 2097,25, Dani 2038,17, Jon S 1968,50, Charles L 1961,85,
  Dave 1927,02 — los mismos números, a la centésima, que el arnés.
- **`/players` y `/rating` siguen dando el mismo número**: Adrián C 1659,46 en
  las dos.
- **El rating no se mueve en el torneo**: en `/players`, Adrián C vale 1659,46
  el 08/11 (día del compás, con sus dos partidos en la lista, etiquetados
  «Torneo») y 1659,46 el 12/11. Sólo cambia el RD, que decae solo.
- **Actividad intacta**: `/ranking` sigue dando Adrián C 8 + 1 = 9.
