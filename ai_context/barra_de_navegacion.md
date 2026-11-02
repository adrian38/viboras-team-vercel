# La barra de pestañas inferior

Desde el 2026-11-02 las veinte páginas llevan una barra fija abajo con cinco
pestañas: Inicio, Partidos, Comunidad, Rendimiento y Buzón. Sale de una maqueta
de Stitch que trajo Adrián (`code.html` del paquete
`stitch_navigation_bar_component`, fuera del repositorio, como las demás
exportaciones).

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

Dos de las cinco no tienen una página única detrás: en la portada, «Partidos» y
«Rendimiento» son tarjetas con varios botones. La pestaña lleva a la más
representativa y se enciende en toda su sección:

| Pestaña | Lleva a | Se enciende en |
| --- | --- | --- |
| Inicio | `/` | `/` |
| Partidos | `/history` | `/history`, `/results`, `/submit-result`, `/tournaments`, `/day` |
| Comunidad | `/comunidad` | `/comunidad`, `/valorar` |
| Rendimiento | `/rating` | `/rating`, `/rating-info`, `/rating-test`, `/ranking`, `/ranking-info`, `/players`, `/statistics` |
| Buzón | `/buzon` | `/buzon` |

Esa tabla está dos veces: en el `aria-current` de cada página y en
`SECCIONES`, dentro de la guarda, que es quien comprueba que coinciden. Al
cambiar una hay que cambiar la otra, y la guarda lo dice.

`/cuenta`, `/tablon`, `/group-normativa` y `/inscripcion` **no encienden
ninguna**, y eso es la respuesta correcta, no un hueco: ninguna de ellas es una
de estas cinco secciones. Encender «Inicio» por descarte diría que estás en la
portada cuando no lo estás.

La maqueta pone además un punto naranja sobre el icono del buzón, como aviso de
mensajes sin leer. **No se portó**: no hay ningún dato que lo sostenga, y
pintarlo siempre sería un aviso inventado. Lo que sí cuenta mensajes es la
campanita de la portada, que tiene su número de verdad.

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
`theme.css`. Los otros cuatro —`emoji_events`, `group`, `query_stats`,
`feedback`— ya estaban. Un icono que no esté en la lista no falla: se ve el
nombre escrito en texto ([[sistema_visual_viper_strike]]).

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

## Lo que no se pudo comprobar

El `env(safe-area-inset-bottom)` del iPhone no se ve en local, y nada de esto
se ha probado en un móvil de verdad ni con la app instalada.
