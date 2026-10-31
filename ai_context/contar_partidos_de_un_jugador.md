# Contar los partidos de un jugador

Escrito el 2026-10-31, al conectar el perfil de `/cuenta` con `/api/perfil`.

Sacar «partidos jugados, ganados y sets» de la tabla `matches` parece un
`count(*)` y una resta. No lo es: las seis columnas de marcador
(`set1_team1` … `set3_team2`) **no siempre contienen sets**, y hay filas que
no son partidos jugados.

## Las dos trampas

### 1. En los torneos esas columnas son juegos, no sets

`matches.format` admite cinco valores. Tres guardan sets:

- `bo3_regular`, `bo3_stb`, `bo1_regular`

Los otros dos, que son los de torneo, guardan **juegos** en las mismas
columnas:

- `timed_games`, `timed_games_long`

Lo dice `api/_score.js` en su cabecera: la validación al mejor de tres deja
fuera «los torneos (`timed_games`, pozo y cuadros), que sí admiten marcadores a
juegos».

Comparar las dos columnas para saber quién ganó sigue valiendo en los cinco
formatos —más juegos es ganar igual que más sets—, pero **sumarlas en un
marcador de sets mezcla dos unidades**. Medido el 2026-10-31 sobre la base
local con el jugador 43: contando los cinco formatos salían 24-9, y contando
sólo los tres de sets, 19-5. Nueve de sus 26 filas eran de torneo.

### 2. Un partido organizado y sin jugar está en la tabla, con 0-0

Al formar las parejas de un día, la fila entra en `matches` con el marcador a
cero. Esa fila no es un partido jugado: no tiene resultado todavía.

Y no se distingue por un NULL, que es lo que uno buscaría. `set1_team1` y
`set1_team2` valen **0 los dos**, así que `set1_team1 IS NULL` no la encuentra.
En la misma medición, 6 de las 26 filas del jugador 43 eran de estas; contarlas
las metía todas en los perdidos y dejaba el porcentaje de victorias en 54% en
vez de 70%.

La comprobación que sí sirve: **un partido cuenta si alguna de las dos parejas
ganó algo**, es decir, si la suma de sets (o juegos) ganados por las dos es
mayor que cero. Es lo que hace `decidido()` en `api/perfil.js`.

## Qué hacer

Antes de contar nada sobre `matches`:

1. quitar las filas sin resultado (`sets1 + sets2 > 0`);
2. para el marcador acumulado, quedarse con los tres formatos de sets;
3. para ganados y perdidos, valen los cinco.

El motor de rating hace su propia cuenta en las páginas y no pasa por aquí:
ver `motor_de_rating_duplicado.md`.
