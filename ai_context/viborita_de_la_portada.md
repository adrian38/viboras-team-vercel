# La viborita de la portada

Una serpiente dorada que anda por la portada mientras nadie toca la
pantalla. Es adorno puro: no enseña ningún dato, ni texto, ni responde al
toque.

Sale de una maqueta de Stitch (noviembre de 2026) a la que se le quitó todo
lo que no era la animación: los bocadillos («¡A por esa bola!» y compañía), la
pelota y su persecución, el botón «¡Invocar Viborita!» y la huida al tocarla.

## Tres ficheros, en este orden

En `front/pantallas/portada/`, cargados con `defer` y en este orden porque
`viborita.js` usa los otros dos al arrancar:

- `viborita-dibujo.js`: pinta un fotograma a partir del estado
  (`window.vtViboritaDibujo`).
- `viborita-cuerpo.js`: física del cuerpo, funciones puras sobre la lista de
  segmentos (`window.vtViboritaCuerpo`): seguir a la cabeza, FABRIK, contorno
  de la percha, suavizar, salir de pantalla.
- `viborita.js`: qué hace y cuándo; el guion, las perchas y el bucle.

Se partieron por el techo de 600 líneas por fichero. `viborita.js` anda por
las 590: lo próximo que crezca tiene que salir de él.

## Qué hace

Encadena cosas, y cada una espera a **2 s sin tocar la pantalla**
(`QUIETO_MS`). Tocar, desplazar, teclear o la rueda reinician la cuenta: si
estás usando la portada, se queda quieta donde está.

La primera vez sigue un guion fijo: entra y **se cuelga del logo** «Víboras
Team», a los 2 s **cae a la primera tarjeta**, y a los 2 s **se va**. Si el
logo no se ve o no hay sitio debajo, se salta el guion.

Después varía al azar:

- Entrando: colgarse de una percha (50 %), cruzar en zigzag entre las
  tarjetas, a veces en espejo (25 %), o asomarse por detrás de la barra (25 %).
- Colgada: caer a una percha de más abajo, cambiarse andando a otra, o irse
  por el lado libre. A la cuarta colgada seguida se va por fuerza.

Las **perchas** son las tarjetas, sus dos iconos (`.block-icon` y la marca de
agua `.block-marca`) y el logo, siempre que se vean de ancho entero y quepa
el cuerpo debajo antes de la barra. Se engancha en un punto al azar del borde
de abajo, llegando por un lado u otro.

## Decisiones que parecen descuidos

- **El lienzo es `pointer-events: none`.** En la maqueta era `auto` y ocupaba
  toda la pantalla, así que se comía los toques a las tarjetas.
- **Capa: `calc(var(--vt-z-flotante) - 1)`.** Encima del contenido, debajo de
  la barra. Si fuera por encima de la barra no podría asomarse desde detrás.
- **Colgada, el cuerpo tiene dos puntos sujetos**: la cabeza, que hace de
  péndulo (dos senos de ritmo distinto, con amplitud, ritmo y fase al azar), y
  el segmento enganchado. Se resuelve con FABRIK. De ahí a la cola, los
  segmentos se acomodan al **contorno** de la percha: en una tarjeta quedan
  tendidos sobre el borde; en un icono le dan la vuelta a la esquina.
- **Caer** es mover la serpiente entera, rígida, con gravedad, hasta que el
  enganche llega al borde de la percha de abajo; al llegar se balancea de más.
- **Sigue al desplazamiento.** El lienzo es fijo y las perchas no: se resta el
  `scrollY` a cuerpo, puntos, cola y percha.
- **El borde va 4 px por encima del de la percha.** Con el exacto, el cuerpo
  quedaba pegado por debajo y no apoyado encima (medido en el lienzo).
- **Acaba cuando sale entera**, cola incluida, y **sin puntos sigue recta por
  su último rumbo**.
- **Colgada más de 20 s se mueve igualmente** (`COLGADA_MAX_MS`), aunque se
  siga tocando: si no, el bucle no pararía nunca mientras alguien usa la
  portada.
- **Coste.** La velocidad va por tiempo y no por fotogramas (a 120 Hz no va al
  doble). El bucle se para fuera de pantalla y con la pestaña oculta, y con
  `prefers-reduced-motion` no aparece. Sin `ctx.filter = 'blur()'`. Pero
  mientras la portada está abierta y nadie toca, **está casi siempre en
  pantalla**, con el bucle a 60 Hz: es lo que se pidió.
- **Colores de `theme.css`**, leídos con `getComputedStyle` al arrancar. El rojo
  de la lengua tiene su token, `--vt-lengua`. Los `rgba()` se construyen
  desde el token con `conAlfa()`.
- **Espera a que acabe la bienvenida**, con el mismo `MutationObserver` sobre
  `vt-splash` que `avisos-push.js`.

## Medirla

Las capturas no sirven: está 2 s en cada sitio. Se mide la caja de lo pintado
en el lienzo (`getImageData`, alfa > 200) cada 300 ms y se compara con los
`getBoundingClientRect()` de las perchas. Dos trampas del panel del navegador:
con la pestaña detrás de otra no hay fotogramas y no se pinta nada, y con el
panel oculto va a pocos fotogramas por segundo.
