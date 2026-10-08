# Por qué la tabla de rating lleva `table-layout: fixed`

Las columnas de `/rating` tienen ancho fijo en píxeles: `rank-col` 72,
`rating-col` 96, `fiabilidad-col` 120. Suman **288 px**. En un móvil de 375 px el
hueco útil dentro de la tarjeta es ~287 px (body 16×2, `.block` 16×2,
`.tier-section` 12×2), así que la tabla no podía encoger lo suficiente y la
columna «Fiabilidad» se salía por la derecha.

Arreglado el 2026-10-08 con tres cosas:

1. **`table-layout: fixed`** en `table`. Es lo que de verdad lo resuelve: con
   layout automático una tabla no baja de su ancho mínimo de contenido y
   desborda al contenedor pase lo que pase con los anchos declarados.
2. **Media query por debajo de 560 px**: columnas a 30 / 66 / 74 px, padding de
   celda de 10 px a `8px 4px`, cabeceras a 0,72rem y las barras de fiabilidad a
   5×10 px en vez de 7×11.
3. **El título de categoría se apila** (`flex-direction: column`): compitiendo
   por la misma línea con el rango, «Avanzado medio» partía en dos líneas y el
   rango también.

`.name-col` lleva `overflow-wrap: anywhere` para que un nombre largo parta en
lugar de empujar la tabla.

## Cómo se comprueba, que no es a ojo

Mirar una captura no detecta un desborde de pocos píxeles. Se mide en el DOM:

```js
({
  desbordaPagina: document.documentElement.scrollWidth > innerWidth,
  celdasQueDesbordan: [...document.querySelectorAll('td,th')]
    .filter(c => c.scrollWidth > c.clientWidth + 1).length
})
```

Comprobado a 320, 375 y 1280 px, con los dos toggles activos («Ver RD», que mete
números de seis caracteres en esa columna, e «incluir no activos») y con los
nombres más largos del grupo. En escritorio las columnas siguen midiendo
72/632/96/120, idénticas a antes de `table-layout: fixed`.

## Lo que queda apretado

A 320 px la columna de nombre se queda en 74 px y los nombres largos parten en
dos líneas. No desborda, pero si hay que ganar sitio, lo siguiente es ocultar
«Pos» por debajo de 360 px.

Relacionado: [[categorias_de_rating]].
