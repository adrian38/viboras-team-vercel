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

## Una sola copia del marcado

`front/comun/vt-nav.js` construye la barra y la añade al `body`; su aspecto son
las reglas `.vt-nav*` de `front/comun/theme.css`. El `<script>` va con `defer`
en el `<head>` de las veinte páginas, detrás del de `pwa.js`.

Es a propósito que el marcado no esté en el HTML. Con veinte `<head>` copiados
a mano, cualquier cambio en la barra serían veinte ediciones que no fallan
cuando se olvida una: simplemente esa página se queda con la barra vieja. Aquí
el marcado es uno.

**El hueco que la barra necesita no lo pone el script, lo pone el `body` de
`theme.css`**, con `padding-bottom: calc(var(--vt-nav-alto) + var(--vt-md) +
env(safe-area-inset-bottom, 0px))`. Si lo pusiera `vt-nav.js`, la página ya se
habría pintado y daría un salto al montarse la barra. Funciona porque las
veinte cargan las dos cosas: si alguna vez una página carga `theme.css` y no
`vt-nav.js`, se quedará con 57 px de hueco vacío al pie.

`--vt-nav-alto` es un token de `theme.css` y lo usan tres sitios: la barra, ese
hueco y `.vt-toast`, que con sus antiguos `bottom: 24px` quedaba justo detrás
de la barra.

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

`/cuenta`, `/tablon`, `/group-normativa` y `/inscripcion` **no encienden
ninguna**, y eso es la respuesta correcta, no un hueco: ninguna de ellas es una
de estas cinco secciones. Encender «Inicio» por descarte diría que estás en la
portada cuando no lo estás.

La maqueta pone además un punto naranja sobre el icono del buzón, como aviso de
mensajes sin leer. **No se portó**: no hay ningún dato que lo sostenga, y
pintarlo siempre sería un aviso inventado. Lo que sí cuenta mensajes es la
campanita de la portada, que tiene su número de verdad.

## La ruta se normaliza antes de comparar

La misma página se abre por tres caminos y los tres tienen que encender la
misma pestaña:

```
/rating                      URL limpia, la que sirve Vercel
/rating.html                 la que todavia escriben algunos botones
/front/pantallas/rating      la ruta real del arbol, si se entra a pelo
```

`rutaActual()` recorta `.html`, la barra final y el prefijo
`/front/pantallas/`, y `portada` vuelve a ser `/`. Un camino nuevo que no pase
por ahí no da error: deja la barra sin pestaña encendida, que es un fallo
silencioso.

## El icono nuevo

`home` hubo que añadirlo a la lista `icon_names=` del `@import` de
`theme.css`. Los otros cuatro —`emoji_events`, `group`, `query_stats`,
`feedback`— ya estaban. Un icono que no esté en la lista no falla: se ve el
nombre escrito en texto ([[sistema_visual_viper_strike]]).

## Capas

La barra va en `--vt-z-flotante` (100). Queda por debajo del panel de
administración (velo de 2000), del toast (2002) y del splash (3000), que es lo
que tiene que pasar; y por encima del contenido de las tarjetas, que usan
`--vt-z-contenido`.

`sw.js` subió a `viboras-v6` con este cambio: `theme.css` está en el
`PRECACHE`, así que sin subir la caché un móvil podría montar la barra nueva
con los estilos viejos y verla sin ningún aspecto.
