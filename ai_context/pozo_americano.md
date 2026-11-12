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
`getPozos`, `getPozo`, `createPozo`, `submitPozoResult` y `editPozoPlayers`.

## El formato, tal cual lo hace la hoja

Reproducido celda a celda y comprobado contra las fórmulas del Excel. Con 4
pistas y 16 jugadores:

- **La siembra es una lista ordenada**, y es la primera ronda entera: cada
  cuatro puestos son una pista, dentro de la pista el 1.º y el 2.º son una
  pareja y el 3.º y el 4.º la otra, y **dentro de la pareja el primero juega
  al drive y el segundo al revés**.
- **Los cuatro primeros empiezan en la última pista**, los cuatro siguientes
  una más arriba, y los cuatro últimos en la pista 1. La 1 es la de arriba:
  hacia ella se sube.
- **Cómo llena el grupo esa lista** (Adrián al grupo, 2026-11-12, para el
  torneo del 14): el ranking partido en dos columnas, la de los que juegan al
  drive y la de los que juegan al revés. Los dos mejores de cada columna
  empiezan juntos en la última pista, los dos siguientes una más arriba, y
  dentro de la pista cruzados: **1R-2D contra 1D-2R**. Con la siembra en orden
  de pareja eso es `[2D, 1R, 1D, 2R]`, con el 2.º drive abriendo el puesto
  porque el primero de cada pareja es el drive. Lo hace el botón, en
  `colocaPorColumnas()` de `front/pantallas/pozo-nuevo/pozo-nuevo.js`.
- **Las columnas se reparten, no se exigen.** `dosColumnas()` necesita tantos
  de un lado como del otro: quien no eligió lado en `/cuenta` cae en la
  columna que vaya más corta, y si un lado declarado se pasa de la mitad, los
  últimos de esa columna se van a la otra y la lista los pinta en naranja.
  Después cada columna se reordena por ranking, para que quien cambió de lado
  entre por donde le toca y no al final. Con los que juegan sin ser múltiplo
  de cuatro no hay pistas que llenar y la lista se queda en orden de ranking.
- **«Ordenar por ranking» usa el ranking de verdad.** El botón de la pantalla
  de crear llama al motor de `front/comun/vt-glicko.js` con el rating de
  partida y los votos de nivel, arrancado igual que `rating.js`, y deja a los
  mejores arriba de la lista: con eso los cuatro primeros empiezan en la
  pista de abajo, que es como lo monta el grupo. Por eso `pozo-nuevo` está
  en `tools/rating-parity.mjs`: si algún día se trae su propio Glicko,
  ordenaría por un número que no es el que el grupo ve en `/rating`.
- **El lado del perfil es una ayuda, no una regla.** La pantalla de crear
  enseña junto a cada nombre el `players.court_side` que esa persona eligió en
  `/cuenta` —llega por `getComunidad`— y pinta en naranja el puesto cuyo lado
  no coincide. El lado que se juega es **el puesto**, no el perfil: nada de
  esto se guarda en el torneo, y quien no lo ha elegido no lleva etiqueta.
  Tocar el lado de un puesto lo cambia con su pareja, porque en una pareja hay
  un drive y un revés y no se puede mover uno solo.
- **La primera ronda no se cruza.** Se juega lo que puso quien creó el
  torneo. La hoja sí la cruzaba (`[baja.a + alta.b]` contra
  `[alta.a + baja.b]`), y eso hacía que nadie jugase con quien la pantalla de
  crear le había puesto de pareja: lo vio Dani el 2026-11-12 y lo cambió
  Adrián. Las parejas de salida, con su lado, las decide el administrador.
- **El movimiento** de la ronda siguiente, por pista:
  - pista 1: los que ganan en la 1 y los que ganan en la 2;
  - pistas de enmedio: los que pierden arriba contra los que ganan abajo;
  - última pista: los que pierden en la penúltima y los que pierden en ella.
  Y siempre cruzados, el primero de un sitio con el segundo del otro. Ese
  cruce es el que **conserva los lados**: el primero de cada pareja es el
  drive y el segundo el revés, así que cada pareja nueva sale con uno de cada
  y cada uno sigue en su lado toda la mañana.
- **Los puntos salen de la pista donde se juega**, no del marcador ni de la
  pista a la que vas después. Con la tabla del grupo: pista 1 → 8/6,
  pista 2 → 8/4, pista 3 → 6/2, pista 4 → 4/2.

El movimiento entre rondas se fijó contra las fórmulas del Excel
(`D6=J2 E6=K3 F6=J3 G6=K2` y sus hermanas) y no ha cambiado. Lo que ya no sale
como en la hoja es la **primera** ronda, que ahora se juega tal cual.
Comprobado el 2026-11-12 con la siembra `A…P` y cuatro pistas, ganando siempre
el equipo 1:

```
RONDA 1   pista 4: A+B vs C+D   pista 3: E+F vs G+H
          pista 2: I+J vs K+L   pista 1: M+N vs O+P
RONDA 2   pista 1: M+J vs I+N   pista 2: O+F vs E+P
          pista 3: K+B vs A+L   pista 4: G+D vs C+H
```

El primero de cada pareja es siempre el mismo jugador que empezó al drive, y
en la ronda 2 no se repite ninguna pareja de la 1.

## El desempate: la pista de salida ya no cuenta

El orden es: **partidos ganados → puntos → diferencia de juegos → orden de la
siembra**.

El cuarto criterio no es adorno: sin él dos jugadores empatados en todo caerían
en el mismo puesto y la tabla no tendría un orden estable.

**Hasta el 2026-11-12 había un criterio más**, entre los partidos ganados y los
puntos: la pista de salida, de abajo arriba. Lo quitó Adrián ese día, después
de que Silvia dijera que nadie entendía la clasificación: la tabla enseñaba una
columna «Pista» que no se podía leer sin esta nota. Con él se fue la columna de
`/pozo` y el campo `pistaInicio` del motor.

Lo que sigue queda escrito porque **las dos versiones del Excel dicen cosas
contrarias** y alguien volverá a mirarlas:

- La hoja del 2026-11-14 que llegó primero usaba
  `SUMPRODUCT((D=D)*(E<E2))`: ponía por delante a quien empezó en la **pista
  1**.
- La segunda, la que manda, usa `(E>E2)` y lo escribe al lado: *«2º pista de
  inicio más baja (P4 > P3 > P2 > P1)»*. Por delante va quien empezó **abajo**,
  porque subir desde la 4 cuesta más.

Valía la segunda. Hoy no vale ninguna: el criterio no existe.

## Lo que la hoja hacía mal y aquí no

**El empate a juegos se lo quedaba el equipo 2 en silencio.** La fórmula
`J2 = IF(H2>I2, D2, F2)` da ganador al equipo 2 cuando los juegos son iguales,
mientras la celda de al lado avisaba «EMPATE: decidid quién gana» y la
clasificación ya había contado la victoria.

Aquí un empate **no resuelve el partido**: `resultadoDe()` devuelve `null` y la
ronda siguiente no se forma. Hasta el 2026-11-12 la pantalla preguntaba qué
pareja se llevaba la pista y lo guardaba en `matches.tie_winner`; **ahora no
se empata**: lo dijo Adrián el 2026-11-12, la ronda a reloj deja veinte minutos
de sobra y descansos. La redacción que fue al grupo esa tarde es de Silvia:
cuando suena el silbato con los juegos y los puntos iguales, **se juega la bola
de oro** y se apunta cómo queda. La pantalla avisa y deja el botón de guardar
apagado mientras los dos números sean iguales, y el API rechaza el marcador
igualado.
La columna `tie_winner` ya no la lee ni la escribe nadie; sigue en las bases
donde se llegó a crear, vacía.

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
- **Apuntar o corregir el marcador de una pista**: solo un administrador,
  cualquier marcador, también el de una ronda cerrada. Corregir una ronda ya
  cerrada vuelve a formar las posteriores y **pierde sus resultados**, porque
  ya no son los mismos partidos.
- **Cambiar los jugadores de un pozo ya creado**: solo un administrador, desde
  la sección plegada «Cambiar jugadores» de `/pozo`. Ver abajo.

**Hasta el 2026-11-12 lo apuntaban también los cuatro de la pista**, mientras
su ronda fuera la última formada. Lo cerró el grupo ese día: durante las dos
horas nadie anda con el móvil, así que cada pista apunta parejas y resultado en
una hoja y después unos pocos administradores los suben. Quedó en
`puedeTocar()` de `api/_pozo-api.js` y en `puedoEditar()` de
`front/pantallas/pozo/pozo.js`, que ya no miran ni el partido ni la ronda.

## Cambiar los jugadores de un pozo ya creado

Hasta el 2026-11-12 la lista solo se podía escribir al crear el torneo: un
jugador que no aparecía, un nombre metido por equivocación o dos puestos al
revés no tenían arreglo, y tampoco se puede borrar un pozo. Lo pidió Adrián
—«debería dejarme, por si acaso»— y es la sección plegada **«Cambiar
jugadores»** de `/pozo`, que solo ve un administrador.

- **Se manda la lista entera**, los mismos puestos y en el mismo orden que la
  pantalla de crear, y no el cambio suelto. Así la valida el mismo
  `problemaDeLaConfig()` y no hay una segunda manera de describir una siembra.
- **El número de pistas y de rondas no se toca.** Eso movería el torneo entero
  y no hay pantalla que lo explique; si hacen falta otras pistas, se crea otro
  pozo. El servidor lo garantiza porque `problemaDeLaConfig()` exige tantos
  jugadores como puestos hay.
- **Elegir en un puesto a alguien que ya juega los cambia de sitio**; elegir a
  alguien de fuera sustituye, y quien sale se queda fuera del torneo. Las
  flechas mueven el puesto, igual que en `/pozo-nuevo`.
- **El desplegable son los activos de `getNames` más los que ya juegan.** Un
  jugador del torneo dado de baja después no sale en `getNames`, y sin añadirlo
  su desplegable no tendría su nombre: lo cambiaría por otro sin que nadie lo
  pidiera.
- **Vale lo mismo que corregir una ronda cerrada.** `cambiarSiembra()` de
  `api/_pozo.js` guarda la siembra nueva, vuelve a montar la ronda 1 con ella
  por el mismo `ajustarRonda()` y deja que `sincronizarRondas()` encadene el
  resto: la pista cuyos cuatro jugadores se quedan igual conserva su resultado,
  la que cambia lo pierde, y las rondas posteriores se vuelven a formar. La
  respuesta dice cuántos resultados se han perdido y la pantalla lo enseña.
  **Cambiar de lado a alguien con su pareja también pierde el resultado de esa
  pista**, aunque el marcador siga siendo el mismo: `mismosJugadores()` compara
  puesto por puesto. Es el precio de tener un solo camino; la pantalla avisa
  antes de guardar cuando el torneo ya tiene resultados.
- **La clasificación se recalcula sola**: sale de `matches` y de la siembra,
  no hay nada acumulado que arreglar. Quien sale del torneo desaparece de la
  tabla y quien entra hereda el puesto, con los resultados que ese puesto
  conserve.

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
- `matches.tie_winner` existió para decir qué pareja ganaba una pista
  igualada. **Desde el 2026-11-12 no se usa**: no se empata, se juega un punto
  más. El `ALTER TABLE` que la creaba ya no está, así que una base nueva no la
  tiene y las viejas la conservan vacía.

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
- **Un marcador igualado no cuenta en `/cuenta`.** `decidido()` en
  `api/perfil.js` da por no jugado todo partido con `sets1 + sets2 = 0`, y un
  5-5 lo es. Ya no se pueden guardar, así que solo afecta a los pozos de antes
  del 2026-11-12. Es la misma limitación que describía
  `contar_partidos_de_un_jugador.md`, no una nueva.
- **El pozo no toca el rating Glicko**: `/rating` y `/history` piden
  `eventType=ranked,legacy` y no ven estos partidos.
- **No hay avisos push** cuando se cierra una ronda. Se podría colgar de
  `api/_avisos.js`, pero no se ha hecho.

## Límites del formato

De 2 a 6 pistas (8 a 24 jugadores) y de 1 a 12 rondas. No son reglas de pádel:
es lo que la pantalla sabe pintar. La tabla de puntos viene puesta solo con
cuatro pistas, que es la única que el grupo ha decidido; con otro número la
escribe quien crea el torneo, porque inventarla sería inventar un dato.

## «Ya hay un torneo con ese nombre» eran dos fallos distintos

El 2026-11-12 Dani no pudo crear el pozo con los 16 ya metidos: ese aviso, y
ninguno se guardaba ni cambiando el nombre. Eran dos cosas a la vez, y las dos
daban el mismo `23505`, que es el único código que el `catch` miraba.

**El de verdad: la secuencia de `events.id`.** Una fila insertada con su `id`
puesto a mano no mueve la secuencia del `SERIAL` —comprobado con un
`CREATE TEMP TABLE`: tres filas con id 1, 2 y 3 dejan `last_value` en 1—, y
`ensureSchema()` siembra exactamente así los eventos 1, 2 y 3. En una base
recién hecha la secuencia se queda en 1, de modo que **los tres primeros
`INSERT` que no ponen id chocan contra `events_pkey`**. Reproducido en local
con `setval('events_id_seq', 1, true)`: tres nombres distintos, los dos
primeros 409 «ya hay un torneo con ese nombre», el tercero entró. El mismo
agujero lo tiene cualquier tabla restaurada de un volcado con sus ids.

Lo arregla `sincronizarSecuencias()` en `api/_db.js`, que pone `events.id` y
`matches.id` en su `max(id)` y la llama `ensurePozoSchema()`. **Sólo la llama
el pozo**: los demás sitios que crean eventos o partidos siguen expuestos.

Y `createPozo` ya no cuenta cualquier `23505` como nombre repetido: mira
`err.constraint`, y lo que no sea `events_name_key` sale como 500 con su
constraint en el log, que es lo honesto.

**El otro: el nombre sí es único.** `events.name` tiene un `UNIQUE` de toda la
vida y no distingue tipos: el nombre de un pozo compite con el de las ligas y
con los tres eventos fijos. Eso se queda así —dos pozos no pueden llamarse
igual—, pero **sí puede haber varios el mismo día**, y la página proponía «Pozo»
con la fecha de hoy, idéntico para todos. Desde entonces:

- `pozo-nuevo.js` pide `getPozos` al arrancar y propone el primer nombre libre:
  «Pozo 12/11/2026», «Pozo 12/11/2026 (2)», y así.
- Si aun así choca —otro móvil, un nombre escrito a mano, o un evento que no es
  un pozo y por tanto no sale en `getPozos`—, el 409 de `createPozo` viene con
  `sugerencia`, la página la deja puesta en el campo y lo dice. Hay que volver
  a darle al botón: no se crea nada con un nombre que no se ha visto.
- `crearPozo` deshace el evento si falla después del `INSERT`. El driver va por
  HTTP y cada consulta es su propia transacción: un torneo a medias no sale en
  la lista (`getPozos` pide `pozo_config`) y en cambio deja el nombre cogido,
  que era la manera de quedarse atascado sin nada que borrar por pantalla.
