# La transición entre pantallas

Cambiar de pantalla ya no es un corte: la que se va se funde al color del
fondo y la que llega entra desde ese mismo color. Lo hace
`front/comun/vt-transicion.js` con las reglas `.vt-transicion` de
`front/comun/theme.css`, y está en las veinte páginas.

Son 160 ms de salida. Es un coste real: cada clic en un enlace tarda esos
160 ms más en empezar a cargar la página siguiente. El número está en dos
sitios —`DURACION` en el script y la `transition` del CSS— y tienen que
seguir siendo el mismo: si el script esperara menos, la página se iría a
medio fundido.

## Por qué no es `@view-transition`

Una transición entre documentos se declara hoy en una línea de CSS:

```css
@view-transition { navigation: auto; }
```

Eso en `theme.css` habría servido para las veinte páginas de golpe, sin
JavaScript, sin interceptar nada y sin los 160 ms de retardo, porque el
navegador hace el fundido con la página siguiente ya pintada. Pero **Firefox
la ignora entera** y ahí la navegación se quedaría como estaba. Se pidió
expresamente que funcionara en todos, así que el fundido se hace a mano con
opacidad y una clase, que es lo que entiende cualquier navegador que abra el
resto de la aplicación.

Si algún día Firefox la soporta, esto se tira y se queda la línea de CSS.

## El velo es un `::before` del `<html>`

No es un `<div>`, y las dos razones importan:

- El script va en el `<head>` y **sin `defer`**, igual que `splash.js` y
  `vt-cargando.js`: la clase que tapa tiene que estar puesta antes del primer
  pintado o la página asomaría un instante antes del velo. Cuando corre
  todavía no hay `body` donde colgar un elemento.
- Un elemento más dentro del `body` con opacidad crea contexto de
  apilamiento, y eso descoloca las barras fijas: la de pestañas de abajo y
  las cabeceras de las páginas. Un pseudoelemento del `<html>` no toca el
  apilamiento del contenido.

Su `z-index` es `--vt-z-transicion` (2003): por encima del velo de carga y de
los modales —la página se está yendo, da igual lo que tenga delante— y por
debajo del splash, que es el único que manda sobre todo.

## Lo que no hace

- **Sólo intercepta el clic en un enlace de esta web.** Un salto hecho por
  código (`location.href = ...`, un formulario que se envía, el botón atrás)
  no se funde al salir: la página se va de golpe. La que llega sí entra con su
  fundido, porque la entrada no depende de cómo se llegó.
- **No mueve nada de una pantalla a la otra.** Son dos documentos distintos y
  no hay elemento compartido: el fundido es al color del fondo, no de una
  pantalla a la siguiente. Para eso haría falta `@view-transition`, o una sola
  página con enrutado propio, que esta web no tiene.
- **No se activa con «reducir movimiento»**, ni cuando sale el splash del
  arranque, que ya tapa la pantalla con su propio negro.

Todo lo que el script no reconoce como un cambio de página nuestro se queda
exactamente como estaba antes de que el fichero existiera: otra pestaña,
descargas, `rel="external"`, `mailto:`, otro dominio, un ancla de la misma
página, la misma URL otra vez, y cualquier clic con Ctrl, Cmd, Shift o Alt.

## El fundido de entrada no puede depender sólo de `requestAnimationFrame`

Para que quitar el velo sea una transición y no un corte, el navegador tiene
que haber pintado el velo opaco una vez. De ahí los dos `requestAnimationFrame`
encadenados, el mismo recurso que usa `vt-cargando.js`.

El problema es que **`requestAnimationFrame` no corre si el navegador no está
pintando**, y eso pasa más de lo que parece: una pestaña que no se ve. Medido
el 2026-11-02 con el panel del navegador oculto, `document.hidden` decía
`false` y `document.visibilityState` decía `visible` —la pestaña era la activa
de su panel— y aun así no hubo ni un cuadro en 600 ms, así que el velo se
quedó puesto hasta que lo quitó el reloj de rescate.

Por eso el rescate son **350 ms y no un segundo largo**: si en 350 ms no ha
habido dos cuadros, no hay fundido que perder, y lo que se evita es que la
pantalla se quede del color del fondo mientras tanto. La página aparece
entonces como aparecía antes de todo esto.

## Tres redes de seguridad

Un velo opaco que no se quita deja la pantalla del color del fondo, así que
hay tres, las tres con la misma idea que el `RESCATE` de `vt-cargando.js`:

- `document.hidden` al llegar: en una pestaña de fondo no se espera a ningún
  cuadro, se destapa y listo.
- `RESCATE` (350 ms): lo de arriba.
- `VUELTA` (2500 ms): si el salto no llega a ocurrir —un `beforeunload` que
  lo cancela, un enlace que no carga—, la página se destapa y se puede seguir
  usando.

Y el `pageshow` con `persisted`: volver con el botón atrás devuelve la página
tal como se dejó, velo incluido, y hay que quitarlo a mano.

## Qué se comprobó

En el entorno local, el 2026-11-02, con `getComputedStyle(document.documentElement, '::before')`:

- Las veinte páginas cargan el fichero: `grep -c` da 1 en las veinte.
- El velo es el que se quería: `position: fixed`, `z-index: 2003`,
  `background: rgb(18, 19, 22)` —que es `--vt-bg`—, `pointer-events: none` y
  `transition-duration: 0.16s`.
- Al terminar de entrar, `opacity: 0` y la página se ve entera.
- Un clic en un enlace de la barra de pestañas pone el velo y lleva a su
  página.
- Un ancla de la misma página (`#algo`) y un `mailto:` no lo activan: el hash
  cambia, el `click` no se cancela y el velo no aparece.
- La consola no da ningún error de este fichero. Los que salen son de antes:
  el service worker no se registra en este navegador y la sesión caducada da
  401.

Lo que **no** se comprobó: el fundido en movimiento. El panel del navegador
estaba oculto —no pintaba— así que se midió el estado final, no la animación.
Tampoco se probó en un móvil de verdad, ni con la app instalada, ni sobre la
latencia de Vercel: el navegador congela la pantalla vieja hasta que la nueva
puede pintar, y eso con red real no es lo mismo que en `localhost`.
