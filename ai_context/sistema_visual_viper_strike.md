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

## Los iconos: Material Symbols recortada a 32 glifos

Las maquetas usan Material Symbols. La fuente entera son unos 300 KB, que en
una PWA que carga red primero no se sostiene; pero Google Fonts acepta
`&icon_names=` y devuelve **sólo los glifos de la lista: 5,6 KB medidos**. Con
eso sí se sostiene.

El `@import` está en `theme.css`, al principio del fichero, que es donde la
regla lo obliga. Está ahí y no como `<link>` en cada página para no repetir una
URL de 400 caracteres dieciséis veces.

**Al añadir un icono nuevo hay que añadir su nombre a esa lista.** Si no, no
falla: se ve el nombre escrito en texto, porque estos iconos se pintan por
ligadura —el contenido del elemento es `arrow_back` y la fuente lo convierte en
flecha—. El `display:block` del `@import` tapa el caso mientras carga, pero no
el de un nombre que no está en la lista.

Para comprobar que ninguno se quedó en texto, los glifos miden ~24 px y una
palabra mucho más:

```js
[...document.querySelectorAll('.ms')].filter(e => e.getBoundingClientRect().width > 44)
```

Los iconos que sólo existían en el cromo descartado no se portaron. Los que
quedaron fuera a propósito aunque la maqueta los ponga sobre algo real son dos:
el `workspace_premium` junto al primero de `rating.html`, porque colocarlo
obliga a tocar `renderTable`, que está en el techo de líneas; y los
`expand_more` de los desplegables y el `play_arrow` de los spoilers, que ya se
dibujan con CSS y no necesitan fuente.

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

## Medir desbordes: `scrollWidth` de la página no basta

Las tarjetas llevan `overflow: hidden` para recortar su barra dorada contra las
esquinas redondeadas. Eso tiene una consecuencia que cuesta ver: **lo que se
sale de una tarjeta no desborda la página, se corta**. El documento mide lo
mismo que la ventana y la comprobación habitual —`scrollWidth` contra
`clientWidth`— da verde mientras en el teléfono falta medio botón.

Pasó con la fila de acciones del historial: a 390 px «Atrás» se salía 45 px y a
320 px, 115. Todas las medidas de desborde de esta carpeta habían dado limpio.

La comprobación correcta compara cada elemento con la caja de su **ancestro que
recorta**, saltándose los que sí tienen scroll legítimo (`overflow-x: auto`,
como la tabla de estadísticas o las fórmulas de MathJax) y los interiores de
MathJax, que desbordan sus propias cajas por diseño:

```js
const recorta = (el) => {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const cs = getComputedStyle(p);
    if (/auto|scroll/.test(cs.overflowX)) return null;          // scroll legitimo
    if (/hidden|clip/.test(cs.overflowX + cs.overflowY)) return p;
  }
  return null;
};
[...document.querySelectorAll('body *')].filter(el => {
  if (el.tagName.startsWith('MJX')) return false;
  const cs = getComputedStyle(el);
  if (cs.position === 'absolute' || cs.position === 'fixed') return false;
  const anc = recorta(el);
  return anc && el.getBoundingClientRect().right > anc.getBoundingClientRect().right + 1;
});
```

Hay que correrlo a 320 px, no sólo a 375: ahí salió además el selector de fecha
de `rating.html`, que se salía 13 px.

Las filas de botones al pie de una tarjeta usan `.vt-acciones`, que envuelve y
por debajo de 560 px apila a lo ancho completo.

## El traductor del navegador rompe los iconos

Los iconos se pintan **por ligadura**: el contenido del elemento es el nombre
(`arrow_back`) y la fuente lo convierte en flecha. Para un traductor automático
eso es texto normal, así que lo reescribe —`arrow_back` → `flecha_atrás`—, deja
de ser ligadura y se pinta la palabra. En un botón, además, se sale de la caja.

Ocurrió de verdad en un teléfono: el botón «Atrás» de `submit-result.html` salía
como `LECHA_ATRáS`, «SET 1» como «CONJUNTO 1» y «Fecha» como «CERCA».

Son dos problemas distintos y hacen falta los dos arreglos:

- **Que no se traduzca sola.** Nueve páginas no declaraban `lang`, así que el
  navegador adivinaba; con `arrow_back`, `download` y «Set 1» por medio, decidía
  que la página no estaba en español y la traducía. Ahora las 16 llevan
  `<html lang="es">`.
- **Que aguante si alguien la traduce a mano.** Cada icono lleva
  `translate="no"` y `class="notranslate"`, que es lo que respeta Google
  Translate. Al añadir un icono nuevo hay que ponérselos.

Se comprueba simulando lo que hace el traductor —reescribir el texto de los
nodos que no están marcados— y mirando que los iconos sigan midiendo ~24 px:

```js
const no = (n) => { for (let p = n.parentElement; p; p = p.parentElement)
  if (p.getAttribute?.('translate') === 'no') return true; return false; };
const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
const ns = []; while (w.nextNode()) ns.push(w.currentNode);
ns.forEach(n => { if (n.textContent.trim() && !no(n)) n.textContent = n.textContent.toUpperCase(); });
[...document.querySelectorAll('.ms')].filter(e => e.getBoundingClientRect().width > 44);  // vacio
```

## Las capas: usar `--vt-z-*`, nunca un número suelto

Las tarjetas del rediseño llevan un resplandor dorado en un pseudoelemento
absoluto, y su contenido usa `z-index: 1` para quedar por encima de él. Eso
parece inofensivo y no lo es: **un elemento con `z-index: 1` pinta por encima
de uno con `z-index: auto`**, aunque el segundo sea `position: fixed` y venga
después en el DOM.

Pasó justo eso. `openAdmin()` crea el panel de administración con
`position: fixed` y sin `z-index`, así que los títulos de las tarjetas y el
botón de normativa —que arrastraba un `z-index: 1101` de cuando la barra
superior era fija— se dibujaban por encima del panel. La página se veía a
través del menú.

Hay cuatro variables en `theme.css` y cualquier capa usa una de ellas:

| Variable | Valor | Para qué |
| --- | --- | --- |
| `--vt-z-contenido` | 1 | contenido de tarjeta sobre su propio resplandor |
| `--vt-z-flotante` | 100 | menús, cabeceras pegajosas |
| `--vt-z-velo` | 2000 | el velo oscuro de un overlay |
| `--vt-z-modal` | 2001 | el panel que va dentro del velo |

Los dos overlays de la app son el panel de administración de `index.html` y el
modal de indicar resultado de `league-results.html`.

Mirarlo no basta, porque un panel medio tapado sigue pareciendo un panel. Se
comprueba preguntándole al navegador **qué elemento está realmente arriba** en
una rejilla de puntos sobre el panel; todos tienen que caer dentro del overlay:

```js
const o = document.getElementById('adminOverlay');   // o '#editBackdrop'
const r = o.firstElementChild.getBoundingClientRect();
const ajenos = [];
for (let i = 1; i <= 19; i++) for (let j = 1; j <= 7; j++) {
  const el = document.elementFromPoint(r.left + r.width*j/8, r.top + r.height*i/20);
  if (!o.contains(el)) ajenos.push(el);
}
ajenos;   // tiene que quedar vacio
```

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
