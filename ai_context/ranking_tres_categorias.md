# El ranking son tres categorías

Desde el 2026-11-12. `/ranking` dejó de ser una sola tabla y pasó a tres
clasificaciones independientes —Actividad, Fair play y Revelación— con su
pódium cada una. El reglamento que las describe es `/ranking-info`, con el
texto que escribió Adrián.

## Qué puntúa cada una

| Categoría | Cómo puntúa | De dónde sale |
| --- | --- | --- |
| Actividad | 1 punto por partido competitivo jugado **y** 1 punto por torneo jugado | `getResults`, vía `vtGlicko.leerPartidos()` |
| Fair play | 1 punto por cada «buen rollo» recibido en el periodo | `getFairPlay` (`api/read.js`) |
| Revelación | Rating de hoy menos el de la víspera del periodo | `vtGlicko.calcularRatings()`, dos pasadas |

Dos reglas que el texto recibido no fijaba las decidió Adrián el 2026-11-12:

- **Un torneo es una unidad, no sus partidos.** Los tipos `pozo`, `compas` y
  `doble_ko` se cuentan por `event_id`: un pozo de quince partidos da 1 punto.
  Los demás (`ranked`, `grupo_liga`, `legacy`) dan 1 punto por partido.
- **Fair play no penaliza.** Sólo suman los «buen rollo»; «neutro» y
  «mejorable» no restan. La columna de detalle «Valoraciones» enseña el total
  recibido, para que se vea la diferencia.

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
- **`getFairPlay` devuelve el total del periodo, no el desglose por día**, al
  revés que `getNivelVotos`. El total de un trimestre es público porque el
  ranking lo es, pero el desglose diario dejaría deducir quién votó qué en un
  día de un solo partido ([[valoraciones_y_avisos]]).
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
- **Fair play** contra el mismo `SELECT` que ejecuta el API: las diecisiete
  filas iguales. Que «neutro» y «mejorable» no suman se probó en una
  transacción con `ROLLBACK` cambiando tres opiniones de Adrián C: las
  valoraciones siguieron en 8 y los puntos bajaron. Bajaron 2 y no 3 porque
  dos de las filas físicas eran la misma opinión lógica de una revancha.
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
| «Buen rollo» del periodo | `api/read.js` `getFairPlay` |
| Motor de rating | `front/comun/vt-glicko.js` |
