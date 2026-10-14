# Categorías de rating: cuatro niveles y a quién pertenece el límite

`TIER_DEFINITIONS`, en `rating.html`. Son **presentación**: agrupan en tablas lo
que calcula el motor, no intervienen en el cálculo ([[motor_de_rating_duplicado]]).

| Categoría | Rango | Clase CSS |
| --- | --- | --- |
| Entreno | > 1900 | `.tier-entreno` |
| Avanzado | 1550,01 – 1900 | `.tier-avanzado` |
| Intermedio | 1200,01 – 1550 | `.tier-intermedio` |
| Iniciación | ≤ 1200 | `.tier-iniciacion` |

Propuestas por el grupo y aplicadas el 2026-10-14. Antes fueron seis
(2026-10-08: Entreno, Avanzado alto, Avanzado medio, Intermedio alto,
Intermedio medio, Iniciación) y antes de eso cuatro con otros cortes (Entreno
> 1800). El número de categorías ha cambiado dos veces en una semana: conviene
no esparcir los umbrales fuera de `TIER_DEFINITIONS`.

## El límite pertenece a la categoría de arriba

El filtro es `rating > tier.min && rating <= tier.max`. Un 1550,00 clavado es
**Avanzado**, no Intermedio.

Importa porque las propuestas llegan con los rangos solapados («1.900 – 1.550»,
«1.550 – 1.200»), así que el criterio no viene dado: se mantiene el que ya usaba
el código. Lo mismo con el extremo de abajo: la propuesta decía «< 1.200» pero
un 1200,00 clavado es **Iniciación**, porque `max: 1200` lo incluye.

## Cada categoría necesita su CSS

`key` se usa como clase (`tier-${tier.key}`). Una categoría nueva sin su pareja
de reglas `.tier-<key>` y `.tier-<key> .tier-title` sale sin color de fondo ni
de título, y no falla: simplemente se ve gris. Al pasar de seis a cuatro
desaparecieron `.tier-avanzado-alto`, `.tier-avanzado-medio`,
`.tier-intermedio-alto` y `.tier-intermedio-medio`, y la escalera de opacidad
ámbar se repartió entre las cuatro que quedan (0,30 / 0,22 / 0,14 / 0,06).

## Reparto actual

Medido el 2026-10-14 sobre la copia local (73 jugadores, 258 partidos; la
base de producción tenía 71 y 260, así que es orientativo): 2 Entreno,
17 Avanzado, 28 Intermedio y 3 Iniciación. Las categorías vacías no se pintan
(`if (tierRows.length === 0) continue`), así que una categoría mal definida
puede desaparecer sin error visible.

Relacionado: [[tabla_de_rating_en_movil]].
