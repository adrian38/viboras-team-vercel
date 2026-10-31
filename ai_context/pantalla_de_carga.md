# La pantalla de carga: primero el cargado, y con todo pintado, la página

`vt-cargando.js`, en las trece páginas que piden datos o calculan. Escrito el
2026-10-31 tras arreglarlo por segunda vez.

## La regla

**El velo no se quita hasta que está pintado todo lo que la página va a
enseñar, cálculos incluidos.** No vale destapar cuando han llegado los datos y
dejar que las tarjetas que tardan aparezcan después: eso es un flashazo, y se
lee peor que esperar.

Lo pidió Adrián dos veces. La primera, porque la página se pintaba antes que el
velo. La segunda, el 2026-10-31, porque en `/cuenta` el rating se lanzaba
**fuera** de la carga.

## Cómo se cumple

`arranque(tarea, texto)` es la carga con la que nace la página: el velo está
puesto desde que se carga el fichero —tapa con la clase `vt-cargando-pagina` en
el `<html>`— y se va cuando la promesa de `tarea` termina. De ahí sale todo lo
demás:

- **Lo que la tarea no espera, no cuenta.** Una llamada sin `await` dentro de
  la tarea de arranque devuelve el control enseguida, el velo se quita, y lo
  que esa llamada pinte aparece encima de la página ya visible.
- Por eso en `cuenta.html` `pintarSesion` es `async` y espera a
  `cargarPendientes()` y a `pintarPerfil()`, y `pintarPerfil` espera a
  `pintarRating()`, que es el que tarda: once pasadas del motor para la curva
  de 30 días, y además la calificación de estrellas, que necesita el RD
  ([[calificacion_de_estrellas]]).
- Si un cálculo falla, se traga el error y la página sale sin esa tarjeta: el
  velo nunca se queda puesto por eso (`.catch()` en el `await`, y `ocultar()`
  va en un `finally`).

`mientras(tarea, texto)` es para una carga **posterior**, con la página ya
delante (pulsar «Actualizar», cambiar de mes). Espera 250 ms antes de aparecer.
Dentro de una carga de arranque no se usa: ya hay velo.

El módulo cuenta las llamadas, así que dos cargas a la vez no se destapan la
una a la otra, y una vez visible se queda 400 ms como mínimo.

## Medirlo, que mirarlo no vale

Un flashazo dura dos décimas: en una captura no se ve. Se mide con un bucle que
anota el milisegundo en que desaparece el velo y el milisegundo en que aparece
lo que se calcula, y se compara el orden.

Medido en local el 2026-10-31 en `/cuenta`, misma sesión y mismos datos:

| | velo fuera | tarjeta de rating | estrellas y curva |
| --- | --- | --- | --- |
| Antes | **1459 ms** | 1643 ms | 1644 ms |
| Después | 2080 ms | **1868 ms** | 1871 ms |

Antes había **184 ms de página sin la tarjeta**, y luego aparecía de golpe.
Después el velo es lo último, 209 ms después de que esté todo pintado. Lo que
se compara es el orden dentro de cada fila, no los totales entre filas.
