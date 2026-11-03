# La barra de pestañas inferior

Desde el 2026-11-02 las veinte páginas llevan una barra fija abajo con cinco
pestañas: Inicio, Partidos, Avisos, Comunidad y Perfil. Sale de una maqueta
de Stitch que trajo Adrián (`code.html` del paquete
`stitch_navigation_bar_component`, fuera del repositorio, como las demás
exportaciones).

Nació ese mismo día con otras cinco —Inicio, Partidos, Comunidad, Rendimiento y
Buzón— y Adrián la cambió a las de la maqueta unas horas después. El cambio no
es sólo de nombres: **Avisos y Perfil son las dos cosas que antes sólo existían
en la barra de arriba de la portada**, la campanita y el chip de cuenta, y que
desde ninguna otra página se alcanzaban. Al subir a la barra, la normativa se
quedó sola arriba y bajó al pie de las tarjetas de la portada (`.normativa`).

Esto **no contradice** lo que dice [[sistema_visual_viper_strike]] sobre
descartar la navegación de los mockups: allí lo descartado es la barra lateral
«Command Hub» y la barra **superior** con su pie, seis entradas en inglés que no
correspondían a ninguna página real. Ésta la pidió Adrián y sus cinco destinos
son páginas que existen.

## El marcado está copiado en las veinte páginas, y es a propósito

Nació al revés: un `front/comun/vt-nav.js` con `defer` que la montaba, una
copia del marcado y ninguna duplicación. **Duró unas horas**, y es el camino
que no hay que volver a andar.

El problema es que una barra montada por JavaScript **no existe en el primer
pintado del documento**. Entre que la página pinta y que corre el script, la
barra no está: un parpadeo, más largo cuanto más grande la página —la portada
era con diferencia la peor, que es justo lo que notó Adrián—. Y con el fundido
del navegador ([[transicion_entre_pantallas]]) es peor todavía: la instantánea
de la pantalla que entra se toma antes de que corra el script, así que el
navegador no encuentra la barra nueva y desvanece la vieja.

Ningún truco de CSS lo arregla, porque el problema no es que algo la tape: es
que no está. Así que hoy el marcado está escrito en el `<html>` de las veinte,
**justo detrás de `<body>`** —no al final, para que esté puesta antes de
cualquier pintado— con su `aria-current="page"` ya puesto. Cero peticiones,
cero JavaScript.

### La guarda

Veinte copias de un marcado que cambia a la vez es el error caro de este
repositorio: quitar una pestaña en diecinueve páginas no da ningún error.

```bash
node tools/barra-navegacion.mjs     # va dentro de npm run check
```

Comprueba tres cosas: que las veinte tienen su `<nav class="vt-nav">`, que lo
tienen **igual byte a byte** salvo el `aria-current`, y que el `aria-current`
de cada una es el que le toca por su ruta. Probado que muerde: cambiando
«Buzón» por «Correo» en una sola página, falla y la señala.

Compara sin los `\r`: once de estos ficheros están en CRLF y nueve en LF desde
antes de que existiera la barra. Uniformarlo reescribiría once ficheros enteros
por nada.

## A dónde lleva cada pestaña, y cuál se enciende

«Partidos» no tiene una página única detrás: en la portada es una tarjeta con
varios botones. La pestaña lleva a la más representativa y se enciende en toda
su sección:

| Pestaña | Lleva a | Se enciende en |
| --- | --- | --- |
| Inicio | `/` | `/` |
| Partidos | `/history` | `/history`, `/results`, `/submit-result`, `/tournaments`, `/day` |
| Avisos | `/tablon` | `/tablon` |
| Comunidad | `/comunidad` | `/comunidad`, `/valorar` |
| Perfil | `/cuenta` | `/cuenta` |

Esa tabla está dos veces: en el `aria-current` de cada página y en
`SECCIONES`, dentro de la guarda, que es quien comprueba que coinciden. Al
cambiar una hay que cambiar la otra, y la guarda lo dice.

`/rating` y sus seis hermanas (`/rating-info`, `/rating-test`, `/ranking`,
`/ranking-info`, `/players`, `/statistics`), `/buzon`, `/group-normativa` e
`/inscripcion` **no encienden ninguna**, y eso es la respuesta correcta, no un
hueco: ninguna de ellas es una de estas cinco secciones. Encender «Inicio» por
descarte diría que estás en la portada cuando no lo estás. Se llega a todas
desde las tarjetas de la portada, que es de donde se llegaba antes de que la
barra existiera; lo que perdieron el 2026-11-02 es el atajo desde cualquier
página, no el acceso.

## El número de la pestaña «Avisos»

La maqueta pinta un «1» dorado sobre el icono de «Avisos», y está: lo rellena
`auth-client.js` con lo que devuelve `GET /api/auth?action=notifications`
(`avisosDeCampana`, `api/_campana.js`).

**El número es honrado porque el destino es el mismo dato.** Esa cuenta son los
avisos personales —partidos por valorar, resultados editados, y para
administradores las altas pendientes y el buzón—, y lo que enseña `/tablon` es,
desde el 2026-11-02, exactamente esa lista: la tarjeta «Tus avisos», lo primero
de la pantalla. Pulsar la pestaña lleva a lo que el número cuenta. Si algún día
el número y la tarjeta dejan de salir de la misma llamada, esto vuelve a ser la
etiqueta que miente de la que avisa `CLAUDE.md`.

El primer intento del día sí lo dejó fuera, y la razón era buena mientras duró:
la pestaña llevaba a un tablón que no enseñaba esos avisos.

- El hueco (`<span class="vt-nav__num" hidden>`) está escrito en las veinte
  páginas, como el resto de la barra, y nace oculto: sin sesión, con cero
  avisos o si la petición falla, no se pinta nada. Un número inventado sería
  peor que ninguno.
- Una sola petición rellena las dos cosas (`cargarAvisos`): la tarjeta donde
  haya un `#vtAvisos` y el número en las veinte.
- El `aria-label` de la pestaña pasa a «Avisos, N sin leer» cuando hay número:
  un «3» suelto no lo lee un lector de pantalla.

La maqueta anterior ponía un punto sobre el buzón y aquél **no** se portó, por
la razón de siempre: no había dato detrás.

## Lo que se fue de la barra de arriba de la portada

La portada ya no tiene barra de arriba. Sus tres cosas se repartieron:

| Estaba arriba | Está en |
| --- | --- |
| Campanita de avisos | Tarjeta «Tus avisos» de `/tablon` (pestaña «Avisos») |
| Chip de cuenta | Pestaña «Perfil» (`/cuenta`) |
| Botón de normativa | Fila `.normativa`, al pie de las tarjetas |

Las tres estaban **sólo en la portada**: desde `/history` o `/rating` no se
llegaba a ninguna. Ahora las dos primeras están en las veinte páginas.

Con la campanita se mudó lo que colgaba de ella, que es lo que de verdad había
que mirar: su panel era el único sitio donde se **activan y se prueban los
avisos push**. `front/comun/avisos-push.js` escribía en
`#vtCampana .vt-campana__panel` y hoy escribe en `#vtAvisos .vt-avisos__lista`;
`pintarEnCampana` pasó a llamarse `pintarEnLista`. Borrar la campanita sin
mover eso habría dejado el push sin interfaz y sin dar ningún error.

Con el chip se fue `pintarChip` de `auth-client.js`, que no tenía ya ningún
`#vtSession` que pintar.

## El hueco al pie

Lo pone `body::after` en `theme.css`, con `--vt-nav-alto` más el
`env(safe-area-inset-bottom)` del iPhone.

Es un pseudoelemento y **no `padding-bottom` del `body`** a propósito: ese
padding lo reescriben con la forma corta la consulta de 720 px de la propia
hoja y tres páginas (`comunidad`, `tournaments`, `cuenta`), así que el hueco
desaparecía en móvil justo donde más se nota. Un bloque al final del flujo no
lo pisa nadie.

`--vt-nav-alto` (58 px, medido) lo usan tres sitios: la barra, ese hueco y
`.vt-toast`, que con sus antiguos `bottom: 24px` quedaba justo detrás.

## El icono nuevo

`home` hubo que añadirlo a la lista `icon_names=` del `@import` de
`theme.css`. Los otros cuatro de hoy —`emoji_events`, `notifications`, `group`,
`person`— ya estaban, igual que los dos que dejaron de usarse al cambiar las
pestañas (`query_stats` y `feedback`), que siguen en la lista porque los usan
otras pantallas. Un icono que no esté en la lista no falla: se ve el nombre
escrito en texto ([[sistema_visual_viper_strike]]).

## Capas

La barra va en `--vt-z-flotante` (100). Queda por debajo del panel de
administración (velo de 2000), del toast (2002) y del splash (3000), que es lo
que tiene que pasar; y por encima del contenido de las tarjetas, que usan
`--vt-z-contenido`. Comprobado con una rejilla de 133 puntos sobre el panel de
administración: ninguno cae fuera de él.

## Ni el fundido ni el «cargando» se la llevan

La barra es el cromo de la aplicación: lo único que no debería moverse al
cambiar de pantalla.

### El fundido entre pantallas

Se queda fuera de él con una línea:

```css
.vt-nav{view-transition-name:vt-barra}
```

Con nombre propio, el navegador no la mete en la instantánea de la raíz, que es
la que se funde: la trata como la misma barra en las dos pantallas. El nombre
tiene que ser **único en el documento**, y lo es porque sólo hay una barra. Si
algún día hubiera dos elementos con ese nombre a la vez, el navegador descarta
la transición entera sin avisar.

Medido con el fundido alargado a 4 s en el salto de `/history` a `/`: a 1,2 s
se ven «Inicio» y «Partidos» encendidas a la vez —las dos instantáneas de la
barra cruzándose— y a partir de 2,4 s sólo «Inicio». La barra no desaparece en
ningún momento.

### El velo de «cargando»

El de [[pantalla_de_carga]] la escondía por dos sitios a la vez, y hacían falta
los dos arreglos:

- `html.vt-cargando-pagina body > *{visibility:hidden}` la escondía por ser
  hija del `body`. Ahora la regla lleva `:not(.vt-nav)`: la barra es cromo, no
  el contenido de la pantalla.
- Y el velo `.vt-cargando` la tapaba por encima. Ahora acaba donde empieza la
  barra (`inset: 0 0 calc(var(--vt-nav-alto) + env(...))`). Puede ser
  incondicional porque la barra existe desde el primer pintado; mientras la
  montaba un script había que condicionarlo, o se veía la franja de fondo vacía
  donde todavía no había barra.

La rueda queda centrada en lo que se ve, 29 px más arriba.

Medido el 2026-11-02 en `/players` con el velo puesto: el velo acaba en 754 y
la barra empieza en 754, no se solapan, la barra calcula `visibility: visible`
mientras el resto del `body` calcula `hidden`, y sobre el centro de la barra el
elemento de arriba es la barra.

## El `env(safe-area-*)` no valía nada sin `viewport-fit=cover`

Los tres `env(safe-area-inset-bottom)` de `theme.css` —el relleno de la barra,
el hueco del `body` y el tope del velo de carga— **devolvían 0 en todos los
dispositivos**, porque ninguna de las veinte páginas lo pedía: un navegador
sólo informa de los recortes si el `<meta name="viewport">` lleva
`viewport-fit=cover`, y los veinte decían sólo
`width=device-width, initial-scale=1.0`.

El comentario de la barra decía que reservaba el hueco del indicador de inicio
de iOS. No lo reservaba. Se vio el 2026-11-02 en una captura de Adrián en
Android con navegación por gestos: la raya blanca del sistema cruzaba por
encima de «Partidos», «Comunidad» y «Rendimiento».

Desde entonces las veinte cabeceras llevan `viewport-fit=cover` y, como eso
hace que la página llegue también al borde de arriba, `theme.css` añade
`body::before` con `env(safe-area-inset-top)`. Es pseudoelemento por lo mismo
que el de abajo: la consulta de 720 px y tres páginas reescriben el `padding`
del `body` con la forma corta y se lo llevarían por delante.

Hay una excepción que hay que mirar al tocar esto: `comunidad` tiene su propia
barra **fija arriba**, que no se entera del `::before`. Su `height` pasó a
`calc(64px + env(safe-area-inset-top,0px))`; con 64 px fijos el recorte se lo
quitaba a la fila en vez de sumárselo.

## El alto de la barra es un número medido

`--vt-nav-alto` tiene que valer **lo que ocupa `.vt-nav` de verdad**: lo usan
el hueco del `body`, el tope del velo y el toast. Al subir los iconos de 20 a
26 px (2026-11-02) la barra pasó de 58 a 60 px y el token con ella. Si se toca
el icono, el relleno o el texto, medir `getBoundingClientRect().height` de la
barra y volver a cuadrar el token.

## Lo que no se pudo comprobar

Los recortes no existen en el navegador de escritorio: en local `env()` sigue
valiendo 0 y el `body::before` no ocupa nada. Se comprobó **simulando** los
recortes (36 px arriba, 24 abajo) con una regla inyectada: la barra pasa de 60
a 84 px y el pie del texto queda a 32 px del borde, por encima de la raya de
gestos. En un móvil de verdad no está medido.
