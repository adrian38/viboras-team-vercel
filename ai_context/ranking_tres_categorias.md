# El ranking pasa a tres categorías, y el cálculo todavía no

Desde el 2026-11-12. **El reglamento de `/ranking-info` y el cálculo de
`/ranking` describen hoy sistemas distintos.** El reglamento es el nuevo; el
cálculo sigue siendo el viejo. Quien mire sólo una de las dos cosas se
equivocará.

## Lo que dice ahora el reglamento

Adrián reescribió el sistema: tres categorías independientes, pódium mensual y
reinicio trimestral.

| Categoría | Cómo puntúa |
| --- | --- |
| Actividad | 1 punto por partido competitivo jugado (suelto o de liga) **y** 1 punto por torneo jugado, sea cual sea el número de partidos de dentro y el puesto final |
| Fair play | 1 punto por cada «buen rollo» recibido en el periodo; «neutro» y «no tan bien» no suman ni restan |
| Revelación | Puntuación de nivel actual menos la que se tenía al empezar el periodo |

Las dos primeras filas **no estaban en el texto que llegó**, que decía sólo «un
punto por partido / torneo jugado» y «se obtiene de las valoraciones». Las
decidió Adrián el 2026-11-12 al preguntárselo: el torneo cuenta como una unidad
y el fair play cuenta sólo los «buen rollo», sin penalizar.

Quien se da de alta con el periodo empezado tiene como nivel de partida el de
su prueba BK (`players.initial_rating`, [[valoraciones_y_avisos]]).

## Lo que calcula `front/pantallas/ranking/ranking.js`

El sistema anterior, intacto:

- **Torneos:** los dos mejores, con las tablas `TOURNAMENT_POINTS_12`,
  `TOURNAMENT_POINTS_16` y `COMPAS_TOURNAMENT_POINTS` (20/16/13… puntos según
  el puesto).
- **Ligas:** `pData.ligasPts = 0`, siempre. La columna «Ligas» del detalle
  enseña un cero para todo el mundo y la tabla de liga que había en el
  reglamento (50, 45, 41…) **no la aplicaba nadie**. Estuvo escrita en la
  pantalla hasta esta fecha.
- **Partidos:** 2 puntos por partido `ranked`, uno por día como mucho, con tope
  de 20.
- **El periodo no se filtra por fecha**: se excluyen a mano los `event_id` 23 y
  24 («pre-September»). La chapa «Periodo actual: 01/09/2026 - 30/11/2026» de
  `ranking/index.html` está escrita a mano y no entra en ningún cálculo.

Por eso los puntos que se ven hoy son todos pares: en la práctica sólo puntúan
los partidos.

## Qué hace falta para cerrar el desfase

- **Actividad** sale de `getResults`, que ya trae `event_type` y `event_id`.
  Cuidado: un partido de liga organizado y sin jugar está en la tabla con 0-0 y
  no es un partido jugado ([[contar_partidos_de_un_jugador]]).
- **Fair play** necesita los «buen rollo» del periodo por jugador.
  `getComunidad` (`api/read.js`) ya los da a cualquier sesión, pero **sin
  filtrar por fecha** y como proporción, no como recuento del trimestre.
  `getAmbiente` sí trae el recuento, pero exige admin. Lo que encaja es una
  acción nueva que reciba el periodo y devuelva sólo el total: devolver el
  desglose por día repetiría el límite de privacidad de `getNivelVotos`, que en
  un día de un solo partido deja deducir quién votó qué.
- **Revelación** no pide motor nuevo:
  `window.vtGlicko.calcularRatings(nombres, partidos, cutoffIso)`
  (`front/comun/vt-glicko.js`) devuelve el rating a una fecha de corte. Dos
  llamadas —la víspera del periodo y hoy— y la resta. `/ranking` tendría que
  cargar `vt-glicko.js`, `nivel-votos.js` y `rating-inicial.js` antes de su
  script, como hacen `/comunidad` y `/cuenta`.
- **El periodo tiene que dejar de estar escrito a mano** en el HTML si se va a
  usar para filtrar.

## Una contradicción que queda abierta

El texto de Adrián dice «cada trimestre natural», pero el periodo vigente en
pantalla es 01/09/2026 - 30/11/2026, que no es un trimestre natural. El
reglamento se escribió diciendo «trimestral» y remitiendo al periodo que
aparece en la cabecera de la clasificación, para no afirmar ninguna de las dos
cosas. Hay que decidirlo antes de programar el reinicio.

## Dónde vive

| Pieza | Fichero |
| --- | --- |
| Reglamento del ranking | `front/pantallas/ranking-info/index.html` |
| Cálculo actual | `front/pantallas/ranking/ranking.js` |
| Tabla y chapa del periodo | `front/pantallas/ranking/index.html` |
| Votos de ambiente | `api/read.js` (`getComunidad`, `getAmbiente`) |
| Motor de rating común | `front/comun/vt-glicko.js` |
