# El sistema visual «Viper Strike Athletic» y qué se descartó de los mockups

El rediseño de octubre de 2026 cambió las 16 páginas de un tema claro azul a uno
oscuro de carbono y oro. Vino como una exportación de Stitch
(`stitch_viboras_team_ui_redesign/`) con 12 maquetas y un `DESIGN.md`.

Esta nota existe porque la exportación **no se puede copiar tal cual**: trae
navegación que la app no tiene, y sus maquetas se contradicen entre ellas.

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

## Lo que se descartó: el *shell* de Stitch

Las maquetas 09, 11, 12, 15 y 16 están envueltas en una plantilla de panel de
control que Stitch añade sola:

- una barra lateral fija «Víboras · Command Hub» con seis entradas **en inglés**
  —Overview, Tournaments, Ratings & Ranks, Statistics, Club History, Squad
  Roster— que no corresponden a las páginas que existen;
- una cabecera fija con avatar de usuario, en una app que no tiene usuarios
  (`api_sin_autenticacion.md`);
- un chip «Live Feed Online» con un punto parpadeante, que no refleja nada.

Nada de eso se portó: es navegación y estado inventados. Si alguien compara una
captura con la página y echa en falta la barra lateral, **es deliberado**.

## Las cuatro páginas sin maqueta

La exportación numera las maquetas del 03 al 16 y faltan la 01, 02, 10 y 14. Las
páginas que se quedaron sin referencia se derivaron del sistema:

- `index.html`
- `group-normativa.html`
- `ranking.html`
- `rating-test.html`

## Al tocar el `<head>`

El rediseño añadió a las 16 páginas la fuente Barlow Condensed y
`<link rel="stylesheet" href="/theme.css">`, y cambió `theme-color` de `#000000`
a `#121316`. Son elementos copiados dieciséis veces, con la trampa de siempre:
añadirlos a una sola página no da error, simplemente no funciona en las otras
quince. Contar antes de darlo por bueno:

```bash
grep -c 'theme.css' *.html | grep -v ':1$'
```
