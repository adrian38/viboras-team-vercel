# El ranking son tres categorías

Desde el 2026-11-12. `/ranking` dejó de ser una sola tabla y pasó a tres
clasificaciones independientes —Actividad, Fair play y Revelación— con su
pódium cada una. El reglamento que las describe es `/ranking-info`, con el
texto que escribió Adrián.

## Qué puntúa cada una

| Categoría | Cómo puntúa | De dónde sale |
| --- | --- | --- |
| Actividad | 1 punto por partido competitivo jugado **y** 1 punto por torneo jugado | `getResults`, vía `vtGlicko.leerPartidos()` |
| Fair play | La calificación de 1 a 5 del jugador, la misma de /cuenta | `getComunidad` + `vt-calificacion.js` |
| Revelación | Rating de hoy menos el de la víspera del periodo | `vtGlicko.calcularRatings()`, dos pasadas |

Dos reglas que el texto recibido no fijaba las decidió Adrián el 2026-11-12:

- **Un torneo es una unidad, no sus partidos.** Los tipos `pozo`, `compas` y
  `doble_ko` se cuentan por `event_id`: un pozo de quince partidos da 1 punto.
  Los demás (`ranked`, `grupo_liga`, `legacy`) dan 1 punto por partido.
- **Fair play es la calificación, no un recuento.** Adrián lo cambió el mismo
  día: en vez de contar «buen rollo» del periodo, puntúa el valor actual de la
  calificación de estrellas ([[calificacion_de_estrellas]]). Lleva dentro la
  proporción de buen rollo y la fiabilidad del ranking, así que dos opiniones
  no dan un 5. Las columnas de detalle enseñan las dos mitades: opiniones
  recibidas y fiabilidad.

## Lo que había antes

Dos mejores torneos puntuados por puesto (tablas de 12, de 16 y de compás),
una tabla de liga de 50/45/41… que **no aplicaba nadie** (`ligasPts` valía 0
siempre, y la columna «Ligas» del detalle enseñaba un cero para todo el
mundo), y 2 puntos por partido `ranked` con un máximo de uno por día y tope de
20. El periodo no se filtraba por fecha: se excluían a mano los `event_id` 23
y 24. Por eso todos los puntos que se veían eran pares.

## Decisiones que parecen errores

- **`PERIODO` está escrito a mano** en `ranking.js`. El reglamento dice que
  cada trimestre las puntuaciones se reinician, pero **no lo reinicia nadie**:
  al empezar un periodo nuevo hay que cambiar esas dos fechas. Antes el
  periodo era un texto en el HTML que no entraba en ningún cálculo; ahora es
  la única fuente, y de él sale también la chapa de la pantalla.
- **El texto de Adrián dice «trimestre natural» y el periodo vigente es
  01/09–30/11**, que no lo es. Se dejó su redacción tal cual; cuando se
  programe el reinicio habrá que resolverlo.
- **Fair play no se reinicia cada trimestre, y las otras dos sí.** La
  calificación se calcula sobre todas las opiniones recibidas y sobre el RD de
  hoy, así que es un valor actual, no acumulado en el periodo. El reglamento
  lo dice. Hubo una acción `getFairPlay` que contaba los «buen rollo» del
  periodo; duró un commit y se quitó al cambiar la regla.
- **`/ranking` y `/cuenta` dan la misma calificación; `/comunidad` puede dar
  una décima más.** No es de esta pantalla: las tres usan la misma fórmula,
  pero cortan el motor en fechas distintas. `/cuenta` (`isoDeHace(0)`) y
  `/ranking` usan el RD de **hoy**; `/comunidad` llama a `calcularRatings` sin
  fecha de corte, que para en el **último partido**. El decaimiento diario sube
  el RD entre esas dos fechas y baja la calificación. Medido el 2026-11-12 con
  el último partido el 31/10: Rodrigo RD 232,12 → 237,87 y calificación 3,87 →
  3,83; Adrián C 187,26 → 194,34 y 4,21 → 4,15. Está así desde antes; unificar
  las dos pantallas es una decisión de Adrián.
- **Revelación sólo lista a quien jugó en el periodo.** Sin partidos la
  diferencia es cero exacto, y cuarenta ceros no son una clasificación. Por
  eso Actividad y Revelación tienen las mismas filas.
- **Quien se dio de alta con el periodo empezado arranca en su rating de
  partida**, no en 1500: lo pone `rating-inicial.js`, que `/ranking` carga
  ahora igual que `/rating` y `/players` ([[rating_de_partida]]).
- **Un partido organizado y sin jugar no cuenta.** No hace falta filtrarlo
  aquí: `partidoDelApi` (`vt-glicko.js`) descarta los que no tienen juegos
  ([[contar_partidos_de_un_jugador]]).
- **`/ranking` usa el motor común.** Carga `vt-glicko.js`, `nivel-votos.js` y
  `rating-inicial.js` como `/comunidad` y `/cuenta`, así que Revelación da
  exactamente el mismo número que `/rating` ([[motor_de_rating_duplicado]]).

## Cómo se comprobó (2026-11-12, entorno local, 13 partidos y 60 opiniones)

- **Actividad** contra un `SELECT` que cuenta partidos jugados por jugador en
  el periodo: las dieciséis primeras filas idénticas (Adrián C 8, Eli Pastor,
  Oti y Silvia 4, cinco con 3…).
- **El torneo como unidad**, insertando un pozo de prueba de 3 partidos entre
  cuatro jugadores: los cuatro sumaron **1** en Torneos y su columna Partidos
  no se movió. Borrado después; la base local volvió a 13 partidos.
- **Fair play** contra `/comunidad`, que enseña la misma calificación: Adrián
  C 4,2, Oti 4,0, Jorge S 3,9, Silvia 3,9, Diego Gonzalez 3,8. Rodrigo salió
  3,9 allí y 3,8 aquí, que es la diferencia de corte explicada arriba. Las 17
  filas son las de quien ha recibido alguna opinión.
- **Revelación** contra `/rating`: Eli Pastor 2097,25 → +297 sobre 1800; Rober
  hd 1692,15; ANDER G 1546,17; Silvia 1515,06. El mismo motor, el mismo
  número.
- **Layout** medido en el DOM a 375 px: la página no se desplaza de lado en
  ninguna de las tres pestañas. Con «Ver detalle» abierto la tabla se desplaza
  dentro de su caja, que es el `overflow-x` que `.table-container` ya tenía.

## Dónde vive

| Pieza | Fichero |
| --- | --- |
| Las tres categorías y el periodo | `front/pantallas/ranking/ranking.js` |
| Pestañas y tabla | `front/pantallas/ranking/index.html` |
| Reglamento | `front/pantallas/ranking-info/index.html` |
| Fórmula de la calificación | `front/comun/vt-calificacion.js` |
| Opiniones de ambiente | `api/read.js` `getComunidad` |
| Motor de rating | `front/comun/vt-glicko.js` |
