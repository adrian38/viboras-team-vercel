# La comunidad: el directorio del grupo

Fecha: 2026-10-31. Pantalla `/comunidad`, datos en `getComunidad`
(`api/read.js`). Nació de la maqueta de Stitch «Comunidad de jugadores».

## Qué enseña, y de dónde sale cada cosa

| En la tarjeta | De dónde |
| --- | --- |
| Nombre | `players.name` |
| Iniciales del círculo | calculadas del nombre, en la página |
| Lado de pista | `players.court_side`, con `ambos` por defecto |
| Horarios | `users.signup_form->>'availability'` |
| Partidos jugados y ganados | `matches`, contados en SQL |
| Rating y categoría | `vt-glicko.js`, con las mismas entradas que `/rating` |
| Valoración en estrellas | `match_feedback` + RD, con la fórmula de `/cuenta` |

Nada se calcula a ojo y nada se rellena. **Una casilla sin dato no se pinta**:
las cuentas anteriores al formulario de inscripción (2026-10-17) no tienen
horarios, y ahí la tarjeta no deja una casilla vacía.

## Esto abrió al grupo tres datos que antes eran de admin

Decidido por Adrián el 2026-10-31, al pedir la pantalla: «lo que ves en la
tarjeta del Stitch».

- **`players.court_side` tenía por fin un lector.** Hasta ese día se guardaba
  y no lo leía nadie, y `/cuenta` lo decía con esas palabras (es el tercer
  ejemplo de dato inventado de `AGENTS.md`). Ahora `/cuenta` dice que lo verá
  el grupo en `/comunidad`. La coletilla de que `/day` no lo mira al formar
  las parejas estuvo un día y se quitó el 2026-11-01 por sobrar: el texto ya
  no promete nada de las parejas, así que no hace falta desmentirlo. **`/day`
  sigue sin leer `court_side`**, de modo que si algún día la frase vuelve a
  hablar de parejas hay que comprobar antes si eso cambió.
- **La disponibilidad general** salía sólo en la pantalla Jugadores del panel
  (`admin-jugadores.js`). El nivel BK del formulario no se reutiliza como nivel
  actual: filtros, búsqueda y tarjetas usan la categoría calculada por el
  rating. El nivel BK queda como dato histórico de inscripción para el propio
  usuario y los administradores.

**Lo que NO se abrió: las horas de `/day`.** Son privadas y la restricción
está en el API, no en la pantalla ([[disponibilidad_quien_la_ve]]). La maqueta
traía «Libre para 20:00 hoy», «Disponible previa reserva» y un filtro
«Disponibles hoy»: los tres salían de ahí y están fuera. La pantalla lo dice
en voz alta, encima del buscador.

## Rating y estrellas usan el motor compartido

La primera versión dejó fuera «RATING PTS» y las estrellas porque el bucle de
días estaba duplicado entre páginas. Esa razón caducó cuando
`calculateEngineRatings` pasó a ser `vtGlicko.calcularRatings` en
`vt-glicko.js`. Desde el 2026-11-01 `/comunidad` espera las mismas entradas que
`/rating` (`nivel-votos.js`, `rating-inicial.js` y los partidos) y une el
resultado por nombre. No hay un cuarto motor.

La estrella es la misma valoración de `/cuenta`: proporción real de buen rollo
en `match_feedback`, ponderada por la fiabilidad real del RD. `getComunidad`
devuelve sólo el agregado recibido por cada jugador, nunca quién votó qué.
En esta tarjeta se formatea con punto (`4.5`) porque así está en su HTML de
referencia. La estrella es el trazado SVG hueco `star_border` de Material, no
el carácter de texto `★`.

## Contar partidos no es un `count(*)`

`filasDeComunidad()` quita las filas sin resultado (`sets1 + sets2 > 0`) antes
de contar: un partido organizado y sin jugar está en `matches` con 0-0 y no es
un partido jugado. Para ganados y perdidos valen los cinco formatos
([[contar_partidos_de_un_jugador]]).

## Decisiones que parecen errores

- **El filtro y el buscador se cruzan.** `aplicar()` mira los dos a la vez:
  elegir «Drive» y escribir un nombre tiene que filtrar por las dos cosas, no
  quedarse con la última. La maqueta de Stitch se quedaba con la última.
- **Sólo salen los filtros que tienen a alguien.** Los de nivel se calculan de
  los datos; un filtro vacío enseña una lista vacía sin decir por qué.
- **El botón «Invitar» no está.** Lo pidió Adrián: no hay invitaciones en el
  proyecto. En la maqueta pintaba un *toast* de «convocatoria enviada» que no
  mandaba nada a ninguna parte.
- **No hay fotos de jugador.** El proyecto no guarda ninguna; el círculo lleva
  las iniciales, que es lo que la propia maqueta hacía en tres de sus cinco
  tarjetas.
- **La consulta coge una sola cuenta por jugador** (`ORDER BY u.id LIMIT 1`
  dentro de la subconsulta): un jugador con dos cuentas activas duplicaría su
  fila con un `JOIN`.
- **Los jugadores de baja no salen** (`players.active = TRUE`), igual que en
  `getNames`.

## La composición visual sí sigue la maqueta

Desde el 2026-11-01 la página usa el esqueleto visual de Stitch: barra superior
compacta, bloque «Directorio oficial», buscador, filtros horizontales y una
tarjeta independiente por jugador. Antes conservaba la cabecera antigua con el
logo grande y envolvía todo el directorio en una sola `vt-card`, por eso no se
parecía a la referencia aunque colores y datos fueran correctos.

Dentro de la ficha, la categoría va como subtítulo del nombre, el número del
motor a la derecha con la etiqueta `FIABILIDAD` y la matriz queda en
`Lado · Calificación · Horarios`. La categoría actual se usa también para
los filtros. Si falta un dato,
la rejilla cambia a una o dos columnas: no deja una casilla vacía para mantener tres huecos. Los filtros sí
desbordan horizontalmente a propósito en móvil, como la maqueta; las tarjetas
no. Medido a 375 px: tarjeta de 343 px con 16 px de margen. A 320 px: tarjeta
de 280 px y cero elementos recortados por un ancestro.

La cifra superior usa separador de miles por coma (`1,679`). El enlace «Ver
evolución» fija también su color oscuro en `hover` y `focus-visible`: la regla
global `a:hover` lo volvía dorado sobre fondo dorado y el texto desaparecía.

## Lo que la maqueta traía y se quedó fuera

| En la maqueta | Por qué no está |
| --- | --- |
| «Pala Babolat Technical», «Especialista Bandejas», «Juego agresivo de volea» | No hay ningún campo de pala ni de estilo de juego |
| «#4 TOP», «#2 CLUB», «TOP PARTNER» | No existe una clasificación de club o de compañeros en esta pantalla |
| «Puntualidad 100% en partidos» | No se mide la puntualidad |
| «Libre para 20:00 hoy», «Disponibles hoy» | Las horas de `/day` son privadas |
| «Temporada Oficial 2025» en el pie | No hay temporadas en el modelo, y además el año estaba mal |

Relacionado: [[disponibilidad_quien_la_ve]], [[cuentas_y_sesiones]],
[[contar_partidos_de_un_jugador]], [[motor_de_rating_duplicado]],
[[tablon_de_avisos]].
