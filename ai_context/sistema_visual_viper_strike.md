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
raíz, y lo cargan las 18 páginas. Salieron del *frontmatter* de
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
cada una de las 18 páginas, en un sitio estático sin build y con service worker.
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
  cabecera fija con avatar de usuario, que entonces era una app sin usuarios
  (desde el 2026-10-14 sí los hay: [[cuentas_y_sesiones]], y la portada lleva
  un chip de sesión arriba a la derecha, no un avatar ni una barra fija) y un chip «Live Feed Online» que no refleja nada.
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

Lo descartado es esa navegación, no toda. El 2026-11-02 Adrián trajo una
maqueta nueva con una **barra de pestañas inferior**, cuyos cinco destinos sí
son páginas que existen, y esa sí se portó: [[barra_de_navegacion]].

## Los iconos: Material Symbols recortada a la lista (53 glifos el 2026-11-12)

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

**Lo vigila `node tools/iconos.mjs`**, dentro de `npm run check` desde el
2026-11-12. Lee el `icon_names=` del `@import` y lo compara con todo nombre de
icono escrito en los `.html` y `.js` de `front/`: los `<span class="ms">` y las
llamadas a un ayudante que monte el icono, que hoy son `icono()` en las
pantallas del pozo y `simbolo()` en `instalar.js`. Se puso después de que
pasara cuatro veces: `install_mobile` y `close`, `home`, y `save` y `sort` el
mismo 2026-11-12.

No ve un nombre que venga en una variable, ni comprueba que el icono exista de
verdad en Material Symbols: un nombre inventado entra en la lista, Google lo
ignora y la palabra sale igual. Eso se ve abriendo la pantalla, y se mide
comparando el ancho del texto con el de la fuente —un glifo ocupa 1 em—:

```js
const at = n => { const r = document.createRange(); r.selectNodeContents(n); return r.getBoundingClientRect().width };
[...document.querySelectorAll('.ms')].filter(e => at(e) > parseFloat(getComputedStyle(e).fontSize) * 1.6)
```

El ancho del elemento no vale: en `/` los iconos van en una caja de 40 px con
fuente de 20 y darían un falso positivo.

Los iconos que sólo existían en el cromo descartado no se portaron. Los que
quedaron fuera a propósito aunque la maqueta los ponga sobre algo real son dos:
el `workspace_premium` junto al primero de `rating.html`, porque colocarlo
obliga a tocar `renderTable`, que está en el techo de líneas; y los
`expand_more` de los desplegables y el `play_arrow` de los spoilers, que ya se
dibujan con CSS y no necesitan fuente.

## Por qué `.ms` lleva `vertical-align:middle`

Un icono al lado de un texto se centra solo **si su contenedor es flex**, que
es como está montada la mayoría de la aplicación: `align-items:center` cuadra
el centro del icono con el centro de la caja de línea del texto. En cuanto el
contenedor es normal —un `<span>` con el icono y la fecha dentro, como la
cabecera de cada aviso del tablón— el icono es un `inline-block` y el navegador
lo pega a la línea base. Y ahí no queda centrado: el glifo está centrado dentro
de su caja, la caja mide lo que el icono (17 o 20 px) y el texto mide 12 o 13,
así que el icono le saca la cabeza a la línea.

Medido en `/tablon` sobre `02/11/2026, 17:10` a 13 px con el icono a 17: el
centro del reloj caía 8,5 px sobre la línea base y el centro de la tinta del
texto a 3,5 px. **Cinco píxeles de desfase**, que es lo que se ve.

`vertical-align:middle` en `.ms` pone el centro del icono a media altura de la
x del texto: medido otra vez, 3,55 px contra 3,5. Sirve para cualquier tamaño
de texto, y **dentro de un flex o un grid no hace nada** —ahí `vertical-align`
se ignora—, así que no toca los iconos que ya estaban bien.

Queda ~1 px por debajo del centro de las mayúsculas, que es a donde apunta el
flex. Es la diferencia entre media x (0,273 em) y media mayúscula (0,364 em) y
no se puede igualar con una sola regla: el desfase exacto depende del tamaño
del texto y `vertical-align` sólo sabe del tamaño del icono.

Si un icono suelto aparece descolocado, mirar primero el `display` de su padre:

```js
[...document.querySelectorAll('.ms')]
  .filter(e => !/flex|grid/.test(getComputedStyle(e.parentElement).display))
```

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

El modal de `league-results.html` (retirada con las ligas el 2026-10-16)
inyectaba su propio `<style>` al abrirse, y
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

## La normalización de colores del 2026-11-01

Hasta ese día había **95 usos de un color que no estaba en la paleta y 47 que
escribían a mano un valor que sí tenía token**, en 12 de las 20 páginas.
Ninguno daba error y la app seguía siendo de carbono y oro, que es por lo que
duró tanto: un color suelto no se nota de uno en uno.

Lo que de verdad se veía en pantalla:

- **`comunidad.html` tenía una paleta sepia propia** —`#d8c3ad`, `#a08e7a`,
  `#534434`, `#613b00`—. El nivel del jugador se pintaba `rgb(216,195,173)`
  mientras su nombre, al lado, era `rgb(227,226,230)`. ΔE 18,8 y 21,5 contra
  los grises de la paleta: marrón contra gris frío, no un matiz.
- **`valorar.html` tenía medio sistema paralelo**: cuatro oros (`#ffb000`,
  `#ffc000`, `#ea8d00`, `#ffab00`), cuatro grises de texto, cuatro bordes,
  tres blancos y un verde `#13a36f` que no se parecía a nada.
- **`history.html` tenía un panel blanco** (`background:#fff`) en una app
  oscura, con su borde en `rgba(15,23,42,0.06)`: invisible.
- **`rating-test.html` tenía un botón y un desplegable de tema claro**, con una
  etiqueta `#334155` que sobre carbono no se leía.

Y dos tokens, `--vt-outline` y `--vt-outline-variant`, que **no existían**:
`players.html`, `statistics.html` e `index.html` los usaban con reserva
(`var(--vt-outline, #a08e7a)`), así que siempre ganaba la reserva, que era
sepia. De ahí salía el color de los ejes de la gráfica.

### Lo que se decidió

- **Cuatro tokens nuevos**, y sólo cuatro: `--vt-loss`, `--vt-orange`,
  `--vt-lime` y `--vt-win`. No son inventados: `#f87171` y `#4ade80` ya los
  usaban seis ficheros a mano para ganar y perder, y los cuatro forman la
  escalera de fiabilidad que recorren `vt-categorias.js` y los distintivos de
  `rating-info.html`, que tienen que coincidir. **No se mezclan con
  `--vt-error`**: ése es el rojo de un aviso sobre `--vt-error-bg`.
- **Todo lo demás cae en un token que ya existía.** Las etiquetas de evento de
  `players.html` pasan de un lila y un celeste a plata y bronce, el mismo trío
  que las posiciones del podio. La escalera de categorías de `rating.html` deja
  sus cuatro marrones y usa `--vt-gold-soft` en los cuatro: quien ordena es la
  opacidad del fondo, que ya iba de 0,30 a 0,06.
- **La barra de `statistics.html` sigue siendo una rampa continua**, porque es
  el dato, pero ahora es `color-mix(in oklab, var(--vt-loss), var(--vt-win)
  N%)` en vez de un `hsl()` con sus propios extremos.
- **El texto sobre oro es `--vt-bg`** en todas partes. Era lo que ya hacían
  trece páginas con `#121316` escrito a mano; `comunidad` ponía `#613b00`.

### Las dos excepciones, y por qué

- **El negro del splash** (`#000`, tres veces en `theme.css`): iguala el negro
  de `splash.mp4`. Con `--vt-surface-deep` se vería el borde del vídeo.
- **El verde de WhatsApp** en `results.html`: es información sobre a dónde
  lleva el botón, no decoración.

### El contraste, medido después

Barridas las 20 páginas calculando el contraste WCAG de cada texto contra su
fondo compuesto. Quitar el sepia **sube** el contraste donde estaba peor y lo
**baja** donde sobraba, pero nada queda por debajo de 4,5:

| | antes | ahora |
| --- | --- | --- |
| `/rating-test`, etiqueta «Fecha» | 1,79 | 7,32 |
| `/comunidad`, clave del dato | 1,88 | 6,53 |
| `/results`, aviso de pocos jugadores | 3,42 | 10,94 |
| `/comunidad`, texto sobre oro | 4,58 | 8,65 |
| `/rating`, categoría más baja | 5,59 | 11,62 |
| `/comunidad`, nivel del jugador | 10,31 | 6,92 |
| `/valorar`, texto secundario | 8,09 | 6,92 |

Las bajadas son todas de un gris cálido muy claro a `--vt-muted`, que sigue
sobrado. Dos sitios se corrigieron **después** de medir, porque la primera
elección los dejaba cortos: la clave del dato de `/comunidad` y las cifras de
los ejes de `/players` estaban en `--vt-faint` (3,4 y 3,7) y pasaron a
`--vt-muted`, que además es lo que ya usaban `.jugador__nota` y las etiquetas
de `/tournaments`.

**`--vt-faint` no llega a 4,5 en ningún fondo** y eso es de siempre, no de este
cambio: 3,90 sobre `--vt-bg`, 3,69 sobre `--vt-surface`, 3,45 sobre
`--vt-surface-2` y 3,02 sobre `--vt-surface-3`. Lo usan el contador de letras
de `/buzon`, tres marcadores de posición, dos cosas de `/cuenta` y el estado
«De baja» de la administración de jugadores. Para que llegara a 4,5 en el peor
fondo habría que subirlo hasta `#8592ab`, y ahí ya casi no se distingue de
`--vt-silver` (`#94a3b8`) ni de `--vt-muted` (`#9ca3af`): es una decisión de
diseño, no de normalización, y se dejó sin tocar.

### Lo que la guarda no ve

`tools/palette.mjs` no mira los `rgba()`. CSS no deja meter una `var()` dentro
de `rgba()`, así que el literal es la única vía: `rgba(74,222,128,0.12)` tiene
que seguir siendo `--vt-win` a mano y nadie avisa si se separa. Al tocar un
token de color, buscar también su `rgba()`:

```bash
grep -rn 'rgba(74, \?222, \?128' *.html *.js    # --vt-win
```

Comprobado el 2026-11-01 recorriendo las 20 páginas en el navegador y leyendo
el color calculado de cada elemento: ninguna usa un color que no sea de la
paleta. Lo único que sale en ese barrido es `--vt-error-bg`, que es un `rgba()`
y por eso no cuadra con ningún hexadecimal, y el `fill` negro por defecto de
`<svg>`, `<defs>` y `<line>`, que no pinta nada.

## El toast común de los guardados

Desde el 2026-11-01, las confirmaciones breves de guardado usan
`window.vtToast(mensaje, duracion)` de `pwa.js`; su aspecto vive en `.vt-toast`
de `theme.css`. Es `position: fixed` a propósito: un texto de estado dentro del
formulario cambia el hueco entre sus botones mientras se guarda. La función
crea un único nodo con `role="status"` y `aria-live="polite"`, reutiliza ese
nodo y reinicia el temporizador si llega otro mensaje.

Lleva `width: max-content` y no es adorno: con `left: 50%` el hueco que le
queda a la caja es media pantalla, así que sin él un mensaje largo se parte en
una columna de 188 px con la pantalla a 375. Medido el 2026-11-01 con el aviso
del buzón: 343 px de ancho y dos líneas a 375, 350 px y una a 1280.

Y va en `--vt-z-toast` (2002), por encima del velo y del modal. Con los 100 de
`--vt-z-flotante` quedaba **debajo del panel de administración**, que es un
velo de 2000: los tres guardados que viven ahí —registrar jugador, torneo
Compás, torneo Pozo— enseñaban un toast que no se veía. Comprobado el
2026-11-01 con el panel abierto: `elementFromPoint` sobre el centro del toast
devuelve `adminOverlay` con z-index 100 y el toast con 2002. Por debajo sigue
el `splash` (3000), que tiene que taparlo todo.

Esto cubre valoraciones, disponibilidad, resultados, torneos, jugadores,
perfil, tablón, buzón y el formulario de inscripción. Los avisos que contienen
un siguiente paso o información que debe permanecer —por ejemplo, confirmar el
correo tras crear una cuenta— siguen siendo bloques persistentes, no toasts.
`pwa.js` y `theme.css` están en las veinte páginas; al añadir el toast se subió
la caché del service worker a `viboras-v3` para no mezclar el JavaScript nuevo
con estilos antiguos.

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
  que la página no estaba en español y la traducía. Ahora las 18 llevan
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

El overlay de la app es el panel de administración de `index.html`. Hasta el
2026-10-16 también estaba el modal de indicar resultado de
`league-results.html`, retirada con las ligas.

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

## La pantalla de bienvenida

`splash.js` + las reglas `.vt-splash*` de `theme.css`. Desde el 2026-10-18 es
**el vídeo del grupo** (`splash.mp4`): dos palas, la víbora entra desde la
izquierda y se levanta entre ellas, cae «VÍBORAS TEAM» en dorado y estalla en
chispas. Lo pidió Adrián con el vídeo de WhatsApp de 5 s; sustituyó a la
versión de CSS (una pelota que botaba, estallaba en una onda y descubría el
logo con un brillo), que está en el historial de git si se quiere volver.

**El fichero no es el vídeo original, es un recorte.** El original es de
1280×720, 5 s, 2,5 MB y con audio. `splash.mp4`:

- Empieza en el 0,8 s: antes sólo están las palas quietas. La víbora asoma
  en el 1,0 s, así que aún se ven las palas un instante. Dura 4,2 s.
- Recortado a 1000×620 (`crop=1000:620:140:60`), **centrado en el logo, no
  en la caja de todo lo que se ve.** El logo (palas, cabeza y letras) está
  centrado en el original, en x ≈ 640. La cola llega hasta x 62, así que la
  caja de lo que no es negro (x 62–1028) tiene el centro más a la izquierda.
  El primer recorte se centró en esa caja (`crop=1000:620:40:60`) y en el
  móvil el logo salía desplazado a la derecha: 100 px de 1000, unos 37 px en
  un móvil de 375 (lo vio Adrián el 2026-10-18). Ahora se pierde la punta de
  la cola, que sale por el borde izquierdo como si siguiera fuera de la
  pantalla, y chispas de los bordes. En el último fotograma el logo va de
  x 157 a 841: centro en 499.
- H.264 *main*, `yuv420p`, CRF 29, `-movflags +faststart`, sin audio: 477 KB.
  CRF 26 daba 695 KB y 32 daba 356 KB; a tamaño de móvil no se distinguían, y
  se quedó el del medio.
- `splash-final.jpg` es su último fotograma (86 KB): lo que se ve con
  «reducir movimiento».
- En este equipo no hay `ffmpeg`. Se usó el que trae el paquete de Python
  `imageio-ffmpeg`, instalado en un entorno virtual temporal. Para rehacerlo:

  ```bash
  ffmpeg -ss 0.8 -i original.mp4 -an -vf "crop=1000:620:140:60" \
    -c:v libx264 -profile:v main -pix_fmt yuv420p -preset veryslow -crf 29 \
    -movflags +faststart splash.mp4
  ```

**Cómo se comporta:**

- El vídeo espera transparente y aparece con un fundido de 0,3 s cuando llega
  `playing`: empieza con las palas ya puestas y sin fundido saldrían de golpe.
  Al acabar (`ended`) queda 0,3 s sobre el último fotograma y la capa se funde
  en 0,4 s.
- **Si en 1,5 s no ha empezado, se cierra.** Cubre la red lenta la primera
  vez, iOS en ahorro de energía (no deja reproducir solo y `play()` falla) y
  el arranque sin conexión. Mejor sin bienvenida que mirando el negro.
- **Sin conexión no hay bienvenida.** El vídeo no está en el `PRECACHE` de
  `sw.js` (medio mega en cada instalación del service worker) y el `error` o
  el plazo de 1,5 s la cierran.
- `muted` y `playsinline` se ponen **antes** del `src`: sin ellos iOS no lo
  reproduce solo o lo abre a pantalla completa.
- **`sw.js` deja pasar sin tocar las peticiones con `Range`.** Safari pide los
  vídeos siempre por trozos y la respuesta es un 206; `cache.put` rechaza las
  respuestas parciales.
- Cabe entero en cualquier pantalla (`object-fit: contain`) y no crece por
  encima de 1000 px de ancho. En un móvil en vertical ocupa todo el ancho y
  queda una franja negra arriba y abajo, que se funde con el fondo.

**La pantalla de arranque de Android va antes y no se puede quitar.** Con la
app instalada, Chrome pinta su pantalla (fondo negro del manifiesto e icono)
antes de que exista la página. La versión de CSS mostraba el logo y salía dos
veces, de distinto tamaño; por eso tenía una variante para la app instalada
(`?splash=instalada`), sin logo y con un agujero que descubría la app. El
vídeo no repite el icono y empieza sobre el mismo negro, así que esa variante
se quitó. Por qué no se puede igualar el icono del sistema: el tamaño con que
lo pinta Chrome no es fijo (aviso de Chromium 40244503, código de PWACompat).

Lo que sigue igual que antes:

- **Una vez por sesión** (`sessionStorage`): al abrir la app instalada, cada
  arranque es una sesión nueva; navegar entre páginas no la repite. Sin
  `sessionStorage` no sale nunca, para no salir en cada página.
- **Tampoco en una pestaña abierta desde la app** (desde el 2026-10-18): una
  pestaña nueva estrena `sessionStorage`, así que el «Rellenar» del alta, que
  abre `/inscripcion` con `target="_blank"`, sacaba el vídeo en mitad del
  registro. Se salta si `document.referrer` es de nuestro propio origen.
  `rel="noopener"` no quita el referrer; `noreferrer` sí, y lo rompería.
- **Va sin `defer` en el `<head>` de todas las páginas.** Tiene que poner la
  clase `vt-splash` antes de que se pinte nada; con `defer` la página asoma un
  instante antes del negro. Mientras la capa no está montada, el `body` va con
  `visibility: hidden`. `avisos-push.js` espera a que esa clase desaparezca
  para preguntar por los avisos.
- **Tocar la pantalla la salta.**
- La capa usa `--vt-z-splash` (3000), por encima de todo lo demás.
- Ojo al medir con el panel del navegador: si está oculto, la ventana mide
  0×0 y todo sale mal. Antes de medir, `resize_window` a móvil. Y con el
  panel oculto el reloj de animaciones no avanza (`document.timeline` se
  queda en 0): el vídeo se reproduce, pero su opacidad se lee 0 todo el rato.
  Se comprueba que la transición 0→1 existe (`getAnimations()`), no su valor.
