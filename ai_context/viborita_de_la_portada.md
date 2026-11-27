# La viborita de la portada

`front/pantallas/portada/viborita.js` pinta, de vez en cuando, una serpiente
dorada que cruza la portada. Es adorno puro: no enseña ningún dato, ni texto,
ni responde al toque.

Sale de una maqueta de Stitch (noviembre de 2026) a la que se le quitó todo
lo que no era la animación: los bocadillos («¡A por esa bola!» y compañía), la
pelota y su persecución, el botón «¡Invocar Viborita!» y la huida al tocarla.

## Qué hace

Dos recorridos, elegidos al azar (70/30):

- **Entre tarjetas**: entra por la derecha y hace zigzag por los bordes de las
  dos primeras `.site .block` que se vean, y sale por la izquierda. Si no hay
  ninguna a la vista, un zigzag por la pantalla.
- **Asomo**: sube desde detrás de `.vt-nav`, a un lado del centro (en el centro
  está la pestaña elevada), mira un momento y se vuelve a esconder.

El primero sale 2,5 s después de la bienvenida y luego uno cada 10–15 s,
contados desde que termina el anterior. Constantes a ojo, arriba del fichero.

## Decisiones que parecen descuidos

- **El lienzo es `pointer-events: none`.** En la maqueta era `auto` y ocupaba
  toda la pantalla, así que se comía los toques a las tarjetas. Por eso ya no
  se puede tocar a la serpiente.
- **Capa: `calc(var(--vt-z-flotante) - 1)`.** Encima del contenido (las
  tarjetas usan `--vt-z-contenido`), debajo de la barra, que está en
  `--vt-z-flotante`. Si fuera por encima de la barra no podría asomarse desde
  detrás.
- **La velocidad va por tiempo.** La maqueta sumaba por fotograma y en un móvil
  de 120 Hz iba al doble. Las constantes siguen expresadas «por fotograma de
  60 Hz» y se multiplican por `k = dt / 16,7 ms`, con `dt` topado a 50 ms.
- **El bucle se para.** Sin serpiente ni chispas no hay `requestAnimationFrame`;
  con la pestaña oculta tampoco hay temporizador. Con `prefers-reduced-motion`
  el script sale en la primera línea.
- **Sin `ctx.filter = 'blur()'`.** La sombra son dos trazos con alfa; el blur
  costaba un filtro entero en cada fotograma.
- **Acaba cuando sale entera**, cola incluida. La maqueta paraba con la cabeza
  fuera y cortaba la serpiente a medio cuerpo.
- **La pala de la cola apunta hacia fuera.** En la maqueta giraba `+π/2` y la
  pala se dibujaba encima del propio cuerpo.
- **Colores de `theme.css`**, leídos con `getComputedStyle` al arrancar. El rojo
  de la lengua tiene su token, `--vt-lengua`, para no tomar prestado el de
  error ni el de partido perdido. Los `rgba()` se construyen desde el token
  con `conAlfa()`.
- **Espera a que acabe la bienvenida**, con el mismo `MutationObserver` sobre
  `vt-splash` que `avisos-push.js`.
