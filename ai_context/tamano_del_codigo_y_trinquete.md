# Tamaño del código: el techo y su trinquete

`node tools/code-size.mjs` impone **60 líneas por función y 600 de JavaScript
por fichero**, con una lista de perdonados en `tools/code-size-baseline.json`
que sólo puede encoger. Entró en `npm run check` el 2026-10-08.

No es estética, es el coste de leer: una función de 60 líneas son unos 700
tokens y tres caben en la ventana sin pensarlo. Por encima, cambiar tres líneas
obliga a cargar el fichero entero.

## Lo que ya existe está perdonado y no hay que partirlo

El baseline nació con **34 funciones y 6 ficheros** por encima del techo. Eso no
es deuda que haya que pagar antes de seguir: es el estado del repositorio el día
que se puso la guarda, grabado para que lo nuevo no se esconda entre lo viejo.

La regla es la dirección, no una campaña de refactor:

- **Lo nuevo cumple.** Una función o un fichero nuevo por encima del techo se
  parte. No se añade al baseline — la guarda ni siquiera ofrece esa puerta.
- **El baseline sólo encoge.** `--write` recorre las entradas existentes y
  escribe `min(actual, registrado)`; nunca añade una entrada ni sube un número.
  Una regresión sigue fallando después de ejecutarlo, y así se comprobó al
  montarlo: con el valor bajado a mano a 100 y la función real en 218, `--write`
  dejó el 100 y salió con error.
- **Una entrada caducada falla.** Si algo perdonado encoge, desaparece o baja
  del techo, la guarda lo dice y pide `node tools/code-size.mjs --write`. Es lo
  que hace que el trinquete apriete en vez de quedarse de adorno.

## Por qué en un `.html` se mide el JavaScript y no el fichero

`players.html` tiene 1061 líneas, pero 738 son JavaScript: el resto es HTML y
CSS. Medir el total empujaría a trocear el marcado, que no abarata nada —
`AGENTS.md` ya dice que el trabajo real es sacar el JavaScript a un fichero
propio. Midiendo sólo el JavaScript de los `<script>` en línea, el número baja
exactamente cuando se hace ese refactor y no cuando se mueve un `<div>`.

Los seis ficheros perdonados, en líneas de JavaScript: `index.html` 813,
`league-results.html` 809, `rating-test.html` 790, `players.html` 738,
`api/league-admin.js` 626, `rating.html` 604.

## Lo que la guarda no ve

Antes de medir se enmascaran cadenas, plantillas, comentarios y regex, porque un
`'{'` dentro de una cadena descuadraba el conteo de llaves — pasaba con
`tools/rating-parity.mjs`, que tiene justo eso. Con la máscara ningún fichero
queda sin medir, pero quedan huecos conocidos:

- **Métodos de objeto y funciones anónimas no se detectan.** Se ven
  `function f(`, `const f = (…) => {` y `const f = function(`. Un método largo
  dentro de un objeto literal pasa invisible.
- **Dentro de una plantilla no se mira.** El `${…}` se blanquea entero para no
  descuadrar las llaves; una función definida ahí no existe para la guarda.
- Por eso el techo de fichero es la red de seguridad del de función: aunque una
  función se escape, sus líneas siguen contando para el total de la página.

Un resultado vacío no prueba que no haya código, igual que con el grafo de
`codebase-memory-mcp`.

## Cómo se parte, cuando toque

Partir es **pasos con nombre**, no trocear por líneas:

- **Mover el bloque literal.** Un refactor y un cambio de comportamiento nunca
  van en el mismo commit; aquí además no hay pruebas que respalden un refactor
  amplio.
- **Los nombres de los parámetros son contrato.** Renombrar al extraer rompe en
  silencio a quien llama con argumentos con nombre.
- **Buscar las guardas que nombran el fichero antes de repartirlo**
  (`rg -l <fichero> tools/`). `tools/rating-parity.mjs` lee `rating.html`,
  `players.html` y `rating-test.html` por su nombre: partir una de esas páginas
  sin tocarlo dejaría la guarda pasando mientras comprueba la mitad. Una guarda
  que se debilita en silencio es peor que una que se rompe.
- **Partir un fichero en más funciones lo hace crecer**, así que los dos techos
  tiran en direcciones opuestas: lo que de verdad baja el coste de leer es sacar
  el JavaScript a su propio fichero.
