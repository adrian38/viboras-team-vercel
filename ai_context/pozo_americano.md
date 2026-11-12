# El pozo americano

Escrito el 2026-11-12, al convertir en pantalla el Excel
`Pozo_16_Jugadores_14.11.26.xlsx` que el grupo venía usando a mano.

Un pozo no es un cuadro ni una liga: **las rondas se encadenan**. Quién juega
contra quién en la ronda 3 no se sabe hasta que las cuatro pistas de la 2
tienen resultado. Eso cambia el modelo entero respecto a los demás partidos de
esta app, donde cualquiera sube el suyo cuando quiere.

## Dónde vive

| Pieza | Fichero |
| --- | --- |
| Emparejamientos y clasificación, sin base de datos | `api/_pozo-motor.js` |
| Esquema, crear, leer y encadenar rondas | `api/_pozo.js` |
| Las cuatro acciones del API | `api/_pozo-api.js` |
| Pantalla del torneo | `front/pantallas/pozo/` |
| Crear el torneo (administradores) | `front/pantallas/pozo-nuevo/` |
| Las normas, explicadas | `front/pantallas/pozo-info/` |

`read.js` y `write.js` solo tienen el `case` que llama. Las acciones son
`getPozos`, `getPozo`, `createPozo` y `submitPozoResult`.

## El formato, tal cual lo hace la hoja

Reproducido celda a celda y comprobado contra las fórmulas del Excel. Con 4
pistas y 16 jugadores:

- **La siembra es una lista ordenada.** El 1.º con el 2.º forman la pareja 1,
  el 3.º con el 4.º la pareja 2, y así hasta ocho parejas.
- **Las parejas 1 y 2 empiezan en la última pista**, las 3 y 4 una más arriba,
  y las 7 y 8 en la pista 1. La 1 es la de arriba: hacia ella se sube.
- **Dentro de cada pista las dos parejas se cruzan**: `[baja.a + alta.b]`
  contra `[alta.a + baja.b]`.
- **El movimiento** de la ronda siguiente, por pista:
  - pista 1: los que ganan en la 1 y los que ganan en la 2;
  - pistas de enmedio: los que pierden arriba contra los que ganan abajo;
  - última pista: los que pierden en la penúltima y los que pierden en ella.
  Y siempre cruzados, el primero de un sitio con el segundo del otro.
- **Los puntos salen de la pista donde se juega**, no del marcador ni de la
  pista a la que vas después. Con la tabla del grupo: pista 1 → 8/6,
  pista 2 → 8/4, pista 3 → 6/2, pista 4 → 4/2.

La prueba que lo fijó: con la siembra del Excel y ganando siempre el equipo 1,
la ronda 2 sale `Guillermo+Adrian vs Silvia+Jaime`, `Harald+Dave vs
InakiM+Rodrigo`, `Oti+Eli vs Txirla+Lara` y `Aitor+Dani vs Emilio+Lander`, que
es lo que dan las fórmulas `D6=J2 E6=K3 F6=J3 G6=K2` y sus hermanas.

## El desempate va al revés de lo que parece

El orden es: **partidos ganados → pista de salida más alta de número (la 4
antes que la 1) → puntos → diferencia de juegos → orden de la siembra**.

El quinto criterio no es adorno: sin él dos jugadores empatados en todo caerían
en el mismo puesto y la tabla no tendría un orden estable.

Lo de la pista hay que leerlo despacio, porque **las dos versiones del Excel
dicen cosas contrarias**:

- La hoja del 2026-11-14 que llegó primero usaba
  `SUMPRODUCT((D=D)*(E<E2))`: ponía por delante a quien empezó en la **pista
  1**.
- La segunda, la que manda, usa `(E>E2)` y lo escribe al lado: *«2º pista de
  inicio más baja (P4 > P3 > P2 > P1)»*. Por delante va quien empezó **abajo**,
  porque subir desde la 4 cuesta más.

Vale la segunda. Si alguien vuelve a mirar la hoja vieja y ve lo contrario,
no es un error de aquí.

## Lo que la hoja hacía mal y aquí no

**El empate a juegos se lo quedaba el equipo 2 en silencio.** La fórmula
`J2 = IF(H2>I2, D2, F2)` da ganador al equipo 2 cuando los juegos son iguales,
mientras la celda de al lado avisaba «EMPATE: decidid quién gana» y la
clasificación ya había contado la victoria.

Aquí un empate **no resuelve el partido**: `resultadoDe()` devuelve `null`
hasta que alguien dice qué pareja gana (`matches.tie_winner`), la pantalla lo
pregunta con los dos nombres y la ronda siguiente no se forma. No es una regla
de pádel inventada: es la que la propia hoja pedía a gritos sin aplicarla.

**La pista 4 perdía dos jugadores por ronda.** En la primera versión, la
ronda 2 de la pista 4 solo recogía `N5` y `M5` —los dos perdedores de la pista
4—; `D9` y `G9` estaban vacías y los perdedores de la pista 3 (`M4`, `N4`) no
los recogía nadie. Pasaba igual en las rondas 3, 4 y 5. La segunda versión lo
arregló, y el motor lo hace completo por construcción.

**El texto de la hoja `Puntos` no decía lo que hace su tabla.** `E2` dice
«Pista 1 = 8, 2 = 6, 3 = 4, 4 = 2» y «según la pista donde acabas», y ni los
números ni el criterio coinciden con `B2:C5` ni con el `INDEX` que los lee. La
tabla es la que vale.

## Las rondas no existen hasta que se pueden formar

La ronda 1 se crea con el torneo. La 2 aparece cuando las cuatro pistas de la 1
tienen resultado, y así. **No hay filas vacías esperando**, y eso es a
propósito: `matches` lo leen `/tournaments`, `/players`, `/statistics`,
`api/perfil.js` y `api/avisos.js`, y veinte partidos fantasma ensuciarían a
todos.

`sincronizarRondas()` corre después de cada marcador y hace las dos cosas:
encadena hacia delante lo que ya se puede formar y borra hacia atrás lo que ha
dejado de poder formarse. Un partido cuyos cuatro jugadores no cambian
conserva su marcador; el que cambia lo pierde, porque ya no es el mismo
partido. La respuesta del API dice cuántos resultados se han perdido y la
pantalla lo enseña.

## Quién puede qué

- **Crear un pozo**: solo un administrador.
- **Apuntar o corregir el marcador de una pista**: sus cuatro jugadores, y
  solo mientras su ronda sea la última formada. En cuanto existe la siguiente,
  cambiarlo deshace emparejamientos de otra gente.
- **Un administrador** puede tocar cualquier marcador, también el de una ronda
  cerrada, con el precio de arriba.

## El esquema

Tres columnas, y **no están en `ensureSchema()`** por lo mismo que las cuentas:
`tools/code-size-baseline.json` tiene `api/_db.js:ensureSchema` clavada en 122
líneas y el trinquete solo deja encoger, así que una línea dentro de su cuerpo
rompe `npm run check`. Viven en `ensurePozoSchema()`, en `api/_pozo.js`:

- `events.pozo_config` (JSONB): pistas, rondas, tabla de puntos y la siembra.
  Un evento de tipo `pozo` **sin** `pozo_config` es de los antiguos, cargados
  por `api/league-admin.js`, y esta pantalla lo ignora.
- `matches.court`: en qué pista se juega. No se puede deducir del marcador, y
  de ella salen los puntos y el movimiento de la ronda siguiente.
- `matches.tie_winner`: qué pareja gana cuando los juegos quedan iguales. Solo
  se mira si `set1_team1 = set1_team2`.

Los partidos entran con `format = 'timed_games'` y los juegos en
`set1_team1` / `set1_team2`, que es lo que ya hacían los torneos: ver
`contar_partidos_de_un_jugador.md`.

## Lo que esto toca sin querer

- **`/tournaments` enseñaba su propia clasificación de los eventos de tipo
  `pozo`**, ordenada por victorias y juegos. Para un pozo creado aquí eso sería
  una segunda clasificación distinta del mismo torneo, así que para esos
  `renderRating()` enseña un enlace a `/pozo` en vez de calcular. Los
  resultados sueltos se siguen viendo. La lista de cuáles son sale de
  `getPozos`, no de `getResults`: así `getResults` no depende del esquema del
  pozo.
- **Un pozo en marcha aparece en `/tournaments`** con las filas de las rondas
  ya formadas y sin marcador. Es correcto: están organizadas y sin jugar.
- **Un empate decidido por `tie_winner` no cuenta en `/cuenta`.** `decidido()`
  en `api/perfil.js` da por no jugado todo partido con `sets1 + sets2 = 0`, y
  un 5-5 lo es. Es la misma limitación que ya describía
  `contar_partidos_de_un_jugador.md`, no una nueva; cuando haya que arreglarla,
  se arregla allí.
- **El pozo no toca el rating Glicko**: `/rating` y `/history` piden
  `eventType=ranked,legacy` y no ven estos partidos.
- **No hay avisos push** cuando se cierra una ronda. Se podría colgar de
  `api/_avisos.js`, pero no se ha hecho.

## Límites del formato

De 2 a 6 pistas (8 a 24 jugadores) y de 1 a 12 rondas. No son reglas de pádel:
es lo que la pantalla sabe pintar. La tabla de puntos viene puesta solo con
cuatro pistas, que es la única que el grupo ha decidido; con otro número la
escribe quien crea el torneo, porque inventarla sería inventar un dato.
