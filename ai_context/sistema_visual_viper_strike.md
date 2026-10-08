# El sistema visual «Viper Strike Athletic» y qué se descartó de los mockups

El rediseño de octubre de 2026 cambió las 16 páginas de un tema claro azul a uno
oscuro de carbono y oro. Vino en dos exportaciones de Stitch, `stitch_*/`, con
16 maquetas en total y el mismo `DESIGN.md` en las dos.

Esta nota existe porque la exportación **no se puede copiar tal cual**: trae
navegación que la app no tiene, y sus maquetas se contradicen entre ellas.

Las exportaciones están en `.gitignore`: son material de referencia, no código.
Lo que había que deducir de ellas está aquí y los valores en `theme.css`.

## `theme.css` es la única copia de los valores

Los tokens —colores, tipografías, radios, espaciado— viven en `theme.css`, en la
raíz, y lo cargan las 16 páginas. Salieron del *frontmatter* de
`viper_strike_athletic/DESIGN.md`.

No se tomaron de las maquetas **porque las maquetas no coinciden entre sí**. Cada
una traía su propio `tailwind.config` escrito a mano:

| Valor | 05 ligas | 08 torneos | 06 normativa | 07 enviar | 09/11/12/15/16 |
| --- | --- | --- | --- | --- | --- |
| Oro | `#f59e0b` | `#E5A93C` | `#f59e0b` | `#f59e0b` | `#f59e0b` |
| Fondo tarjeta | `#16171b` | `#1b1b1f` | `#18191d` | `#18191e` | `#1f1f23` |
| Fondo página | `#0d0e11` | `#0d0e11` | `#121316` | `#0d0e11` | `#121316` |

Elegir «el color del mockup» no es una operación bien definida. Ante una duda de
color, la respuesta está en `DESIGN.md`, y si hay que cambiarla se cambia en
`theme.css` y en ningún otro sitio.

## Sin Tailwind, a propósito

Las maquetas cargan `cdn.tailwindcss.com` más un `<script>` de configuración.
Portarlo serían ~100 KB bloqueantes y un bloque de configuración repetido en
cada una de las 16 páginas, en un sitio estático sin build y con service worker.
Además ese bloque contaría como JavaScript en línea para `tools/code-size.mjs`.

Las variables CSS hacen el mismo trabajo. Las clases del sistema llevan prefijo
`vt-` (`vt-card`, `vt-btn`, `vt-table`, `vt-badge`…); lo específico de una
página se queda en su `<style>`.

## Lo que se descartó de las maquetas

Esta es la parte que más fácil se vuelve a colar. Stitch envuelve sus pantallas
en plantillas de producto y las rellena con cosas verosímiles que **no existen
en la app**. Nada de esto se portó:

- **La barra lateral «Víboras · Command Hub»** (maquetas 09, 11, 12, 15, 16):
  seis entradas en inglés —Overview, Tournaments, Ratings & Ranks, Statistics,
  Club History, Squad Roster— que no corresponden a las páginas reales, una
  cabecera fija con avatar de usuario en una app sin usuarios
  ([[api_sin_autenticacion]]) y un chip «Live Feed Online» que no refleja nada.
- **La barra de navegación superior** (maquetas 01, 09, 10) y su pie de página.
- **Toda la capa de federación** (maquetas 01 y 10): «Circuito federado FEP»,
  «FEP puntos activos», «Puntos FEP», «Validación FEP activa», una temporada
  2026/2027 y un reglamento federado. El grupo no está federado.
- **Resúmenes y controles inventados** (maqueta 10): tres tarjetas de cabecera
  (plata compartida, líder absoluto, perseguidor directo), un buscador de
  jugadores y leyendas de zona (oro, clasificación, open circuit).
- **La tira de «último encuentro registrado»** con actas pendientes y «ver en
  directo» (maqueta 01).

Si alguien compara una captura con la página y echa algo de esto en falta, **es
deliberado**.

## Los iconos tampoco se portaron

Las maquetas usan Material Symbols. En la portada eso serían varios cientos de
KB de fuente en una PWA que carga red primero y cachea como respaldo
([[service_worker]]). Las tarjetas se leen igual sin ellos. Es la única
diferencia visible con la maqueta 01 que no viene de descartar algo inventado.

## La página sin maqueta

`rating-test.html` no tiene maqueta en ninguna de las dos exportaciones. Se
derivó de `rating.html`, que es de lo que es un banco de pruebas.

## El color que el script escribe en línea

Buena parte de estas páginas pinta desde JavaScript, y ahí la hoja de estilos
no siempre gana. Tres casos, de menos a más molesto:

- **Atributo de presentación de un SVG** (`fill="#667085"` en `renderChart`, el
  lápiz de `league-results.html`): el CSS lo gana sin `!important`. Basta una
  regla. Cuidado en `players.html`: cada punto de la gráfica son dos círculos y
  el segundo es la zona de click, que tiene que seguir transparente.
- **`var(--card)` y `var(--muted)`** (panel de administración de `index.html`,
  tabla de `statistics.html`): se redefinen en `:root` y el script no se toca.
- **Color literal dentro de una plantilla de cadena** (`getFiabilidadConfig` en
  `rating.html`, el delta de `players.html`, el modal de `league-results.html`):
  no hay forma desde la hoja, se cambia el literal.

El modal de `league-results.html` inyecta su propio `<style>` al abrirse, y
como entra en el DOM después, gana a igualdad de especificidad: sus reglas
llevan `!important` a propósito.

Al cambiar un literal, ojo con `tools/code-size.mjs`: `getFiabilidadConfig`
vive dentro de `renderTable`, que está perdonada y **sólo puede encoger**. Dos
líneas de comentario la hicieron fallar. La explicación va en el CSS, que no se
mide ([[tamano_del_codigo_y_trinquete]]).

## Al tocar el `<head>`

El rediseño añadió a las 16 páginas la fuente Barlow Condensed y
`<link rel="stylesheet" href="/theme.css">`, y cambió `theme-color` de `#000000`
a `#121316`. Son elementos copiados dieciséis veces, con la trampa de siempre:
añadirlos a una sola página no da error, simplemente no funciona en las otras
quince. Tres páginas se quedaron con el `theme-color` viejo hasta que se contó.
Contar antes de darlo por bueno:

```bash
grep -l 'theme.css' *.html | wc -l          # tienen que ser 16
grep -l 'content="#000000"' *.html          # tiene que estar vacio
```

`theme.css` también entró en el `PRECACHE` de `sw.js` (y con él, `CACHE` subió
a `viboras-v2`): sin él la portada abre sin estilos cuando no hay cobertura.
