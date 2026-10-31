# La calificación de estrellas del perfil

Escrito el 2026-10-31. Vive en `cuenta-perfil.js` (`fiabilidadDeRd`,
`calificacionDe`, `pintarCalificacion`) y se enseña en la tarjeta «Valoración
del jugador» de `/cuenta`.

## Nadie puntúa de 1 a 5

Es lo primero que hay que saber, porque invita a equivocarse: **no existe una
pregunta de estrellas**. El grupo sólo vota dos cosas al terminar un partido
(`/valorar`): una opinión de ambiente (buen rollo / mal rollo) y el nivel. La
calificación es un cálculo encima de esa opinión.

Convertirla en una pregunta sería un cambio de producto, no un arreglo, y
Adrián lo descartó: el 2026-10-31 se intentó y se revirtió entero.

## Por qué no vale la proporción de opiniones a secas

Porque todo el mundo tiene un 100%. El 2026-10-31, sobre los datos de
producción: **72 opiniones de ambiente, 72 de buen rollo y ninguna de mal
rollo**. La proporción da 1,0 para todos, y multiplicada por cinco deja a todo
el grupo con un 5,0 plano, que es lo que enseñaba la tarjeta el día que se
conectó.

## La fórmula

```
buenRollo   = buen rollo / (buen rollo + mal rollo)        0..1
fiabilidad  = (350 − RD) / (350 − 80)        recortada a   0..1
calificación = 3 + 2 · fiabilidad · (2 · buenRollo − 1)    recortada a 1..5
```

**La fiabilidad es la del ranking**: el RD de Glicko, el mismo número que la
tarjeta de rating enseña como «Media» o «Alta». No hay dos fiabilidades. Los
dos extremos son los del motor —`MAX_RD` 350 y `MIN_RD` 80, en `vt-glicko.js`—,
así que no hay ninguna constante elegida aquí.

Hasta ese mismo día hubo otra fiabilidad, calculada en el servidor con los
votos recibidos y los partidos jugados, con tres constantes a ojo. Era un
invento —no medía nada que existiera— y además **chocaba de nombre** con la del
ranking en la misma pantalla. Fuera: `AGENTS.md`, «Ningún dato de la pantalla
es inventado».

Lo que hace cada pieza:

- **El 3 es el centro, no un relleno.** Con RD 350, que es el de quien no ha
  jugado nada, la calificación se queda en 3: el motor no sabe lo suficiente de
  ti para subirla ni para bajarla.
- **La fiabilidad multiplica, no suma.** Es lo que evita que dos opiniones den
  un 5 redondo. Según el motor se fía más de tu ranking, la calificación se
  separa del centro hacia 5 (todo buen rollo) o hacia 1 (todo mal rollo).

Medido el 2026-10-31 en local, jugador 43 (Adrián C): RD 153,59 → fiabilidad
0,727 y **4,5 estrellas**, con sus 12 opiniones de buen rollo. Con la fórmula
anterior daba 4,2.

## Dónde se calcula, y por qué no en el servidor

En el navegador, y no por capricho: **el RD sólo existe ahí**. Lo saca el motor
(`vt-glicko.js`) recorriendo el histórico día a día, y calcularlo también en el
servidor sería una cuarta copia del motor
([[motor_de_rating_duplicado]]).

Así que la cuenta llega en dos mitades: `api/perfil.js` devuelve las opiniones
en crudo (`buenRollo` de 0 a 1, o `null` si no le ha votado nadie) y
`cuenta-rating.js` llama a `window.pintarCalificacion(rd)` cuando el motor
termina. **La caja de la calificación nace escondida** y se enseña en esa
llamada: antes falta la mitad del cálculo.

## La tarjeta enseña la fiabilidad, no las opiniones

Debajo de las estrellas va la **fiabilidad del ranking**, con la misma palabra
y el mismo corte que `/rating` (`getFiabilidadConfig`, en `vt-categorias.js`) y
la barra al tanto por ciento de la fórmula. Las opiniones en crudo no se
enseñan: lo pidió Adrián el 2026-10-31, porque es lo que han votado de ti y la
calificación ya lo lleva dentro.
