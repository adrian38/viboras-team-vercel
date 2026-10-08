# Categorías de rating: seis niveles y a quién pertenece el límite

`TIER_DEFINITIONS`, en `rating.html`. Son **presentación**: agrupan en tablas lo
que calcula el motor, no intervienen en el cálculo ([[motor_de_rating_duplicado]]).

| Categoría | Rango | Clase CSS |
| --- | --- | --- |
| Entreno | > 1900 | `.tier-entreno` |
| Avanzado alto | 1800,01 – 1900 | `.tier-avanzado-alto` |
| Avanzado medio | 1600,01 – 1800 | `.tier-avanzado-medio` |
| Intermedio alto | 1400,01 – 1600 | `.tier-intermedio-alto` |
| Intermedio medio | 1200,01 – 1400 | `.tier-intermedio-medio` |
| Iniciación | ≤ 1200 | `.tier-iniciacion` |

Propuestas por el grupo y aplicadas el 2026-10-08, sustituyendo a cuatro
categorías (Entreno > 1800, Avanzado, Intermedio, Iniciación).

## El límite pertenece a la categoría de arriba

El filtro es `rating > tier.min && rating <= tier.max`. Un 1800,00 clavado es
**Avanzado alto**, no Avanzado medio.

Importa porque la propuesta llegó con los rangos solapados («1.900 – 1.800»,
«1.800 – 1.600»), así que el criterio no venía dado: se mantuvo el que ya usaba
el código. Si alguien vuelve a proponer rangos, hay que resolver el solape del
mismo modo o cambiarlo en los seis a la vez.

## Cada categoría necesita su CSS

`key` se usa como clase (`tier-${tier.key}`). Una categoría nueva sin su pareja
de reglas `.tier-<key>` y `.tier-<key> .tier-title` sale sin color de fondo ni
de título, y no falla: simplemente se ve gris.

## Reparto actual

Con los datos del 2026-10-08: 2 / 2 / 10 / 17 / 16 / 3. Las categorías vacías no
se pintan (`if (tierRows.length === 0) continue`), así que una categoría mal
definida puede desaparecer sin error visible.

Relacionado: [[tabla_de_rating_en_movil]].
