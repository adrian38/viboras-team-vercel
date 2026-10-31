# La nota de estrellas del perfil

Escrito el 2026-10-31. Vive en `api/perfil.js` (`fiabilidadDe`, `estrellasDe`)
y se enseña en la tarjeta «Valoración del jugador» de `/cuenta`.

## Nadie puntúa de 1 a 5

Es lo primero que hay que saber, porque invita a equivocarse: **no existe una
pregunta de estrellas**. El grupo sólo vota dos cosas al terminar un partido
(`/valorar`): un pulgar de ambiente (👍 / 👎) y el nivel. La nota de estrellas
es un cálculo encima del pulgar.

Convertirla en una pregunta sería un cambio de producto, no un arreglo, y
Adrián lo descartó: el 2026-10-31 se intentó y se revirtió entero.

## Por qué no vale la proporción de pulgares a secas

Porque todo el mundo tiene un 100%. El 2026-10-31, sobre los datos de
producción: **72 votos de ambiente, 72 👍 y ningún 👎**. La proporción da 1,0
para todos, y multiplicada por cinco deja a todo el grupo con un 5,0 plano,
que es lo que enseñaba la tarjeta el día que se conectó.

## La fórmula

```
buenRollo  = 👍 / (👍 + 👎)                        0..1
fiabilidad = 0,6 · v/(v+6)  +  0,4 · p/(p+10)      0..1
estrellas  = 3 + 2 · fiabilidad · (2 · buenRollo − 1)
```

con `v` = votos de ambiente recibidos y `p` = partidos jugados (los decididos:
ver `contar_partidos_de_un_jugador.md`). El resultado se recorta a [1, 5].

Lo que hace cada pieza:

- **El 3 es el centro, no un relleno.** Sin fiabilidad la nota se queda en 3:
  no se sabe lo suficiente para subir ni para bajar.
- **La fiabilidad multiplica, no suma.** Es lo que evita que dos pulgares den
  un 5 redondo. Con más votos y más partidos, la nota se separa del centro
  hacia 5 (todo 👍) o hacia 1 (todo 👎).
- **Las dos constantes son puntos medios**: con 6 votos se alcanza la mitad
  del peso de los votos; con 10 partidos, la mitad del suyo. Elegidas a ojo
  sobre el grupo que hay, **no medidas**. Cambiarlas mueve a todo el mundo a
  la vez, así que no se tocan sin mirar antes qué le pasa al grupo entero.

Medido el 2026-10-31 con los datos de producción, jugador 43: 12 votos (12 👍,
0 👎) y 8 partidos → fiabilidad 0,578 y **4,2 estrellas**, en vez del 5,0 de
antes. Poniendo 3 de esos 12 votos a 👎, baja a 3,6.

## La tarjeta enseña las dos partes

«Buen rollo» y «Fiabilidad», cada uno sobre 5, debajo de las estrellas. No es
decoración: una nota compuesta que no dice de qué se compone parece un
veredicto. El texto del pie cambia según la fiabilidad.

## Lo que no es

La palabra «fiabilidad» ya significa otra cosa en este repositorio: lo seguro
que es tu rating, el RD de Glicko, que calcula el navegador en `/rating`
(`motor_de_rating_duplicado.md`). **No son lo mismo y no comparten código.**
La de aquí es «cuánto se sabe de ti» y se calcula en el servidor, porque el
RD no existe fuera del navegador.
