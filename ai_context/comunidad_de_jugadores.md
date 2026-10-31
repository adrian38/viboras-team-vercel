# La comunidad: el directorio del grupo

Fecha: 2026-10-31. Pantalla `/comunidad`, datos en `getComunidad`
(`api/read.js`). Nació de la maqueta de Stitch «Comunidad de jugadores».

## Qué enseña, y de dónde sale cada cosa

| En la tarjeta | De dónde |
| --- | --- |
| Nombre | `players.name` |
| Iniciales del círculo | calculadas del nombre, en la página |
| Lado de pista | `players.court_side`, con `ambos` por defecto |
| Nivel BK | `users.signup_form->>'bkLevel'` |
| Horarios | `users.signup_form->>'availability'` |
| Partidos jugados y ganados | `matches`, contados en SQL |

Nada se calcula a ojo y nada se rellena. **Una casilla sin dato no se pinta**:
las cuentas anteriores al formulario de inscripción (2026-10-17) no tienen
nivel ni horarios, y ahí la tarjeta enseña dos casillas en vez de cuatro.

## Esto abrió al grupo tres datos que antes eran de admin

Decidido por Adrián el 2026-10-31, al pedir la pantalla: «lo que ves en la
tarjeta del Stitch».

- **`players.court_side` tenía por fin un lector.** Hasta ese día se guardaba
  y no lo leía nadie, y `/cuenta` lo decía con esas palabras (es el tercer
  ejemplo de dato inventado de `AGENTS.md`). Ahora `/cuenta` dice que lo verá
  el grupo en `/comunidad`, y sigue diciendo que `/day` no lo mira al formar
  las parejas, porque no lo mira.
- **Nivel BK y disponibilidad general** salían sólo en la pantalla Jugadores
  del panel (`admin-jugadores.js`). El pie de la ficha de `/cuenta` lo
  distingue ahora: esos dos los ve el grupo, el resto —nombre y apellidos,
  teléfono, liga, torneos, ranking por semana— sigue siendo de los
  administradores.

**Lo que NO se abrió: las horas de `/day`.** Son privadas y la restricción
está en el API, no en la pantalla ([[disponibilidad_quien_la_ve]]). La maqueta
traía «Libre para 20:00 hoy», «Disponible previa reserva» y un filtro
«Disponibles hoy»: los tres salían de ahí y están fuera. La pantalla lo dice
en voz alta, encima del buscador.

## Por qué no hay rating ni estrellas en la tarjeta

La maqueta enseñaba «1.842 RATING PTS» y «FIABILIDAD 4,9 ★». Las dos cosas
existen, pero **se calculan en el navegador**: el rating y el RD los saca el
motor recorriendo el histórico día a día ([[motor_de_rating_duplicado]],
[[calificacion_de_estrellas]]). Traerlas aquí obligaría a escribir un cuarto
bucle de días —`calculateEngineRatings` es de cada página, no está en
`vt-glicko.js`—, que es justo la divergencia callada contra la que avisa ese
documento: un número que cambia en `/rating` y no aquí.

Así que el rating se queda donde ya está calculado y verificado, y
`/comunidad` lleva un enlace a `/rating`. Si algún día hace falta el número
aquí, el camino es sacar el bucle de días a `vt-glicko.js` primero, en su
propio commit, y comparar la tabla de `/rating` antes y después.

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

## Lo que la maqueta traía y se quedó fuera

| En la maqueta | Por qué no está |
| --- | --- |
| «Pala Babolat Technical», «Especialista Bandejas», «Juego agresivo de volea» | No hay ningún campo de pala ni de estilo de juego |
| «#4 TOP», «#2 CLUB», «TOP PARTNER» | El puesto sale del rating, que no se calcula aquí; «TOP PARTNER» no sale de nada |
| «Puntualidad 100% en partidos» | No se mide la puntualidad |
| «Libre para 20:00 hoy», «Disponibles hoy» | Las horas de `/day` son privadas |
| «FIABILIDAD 4,9 ★» | Necesita el RD del motor, que vive en el navegador |
| «Temporada Oficial 2025» en el pie | No hay temporadas en el modelo, y además el año estaba mal |

Relacionado: [[disponibilidad_quien_la_ve]], [[cuentas_y_sesiones]],
[[contar_partidos_de_un_jugador]], [[motor_de_rating_duplicado]],
[[tablon_de_avisos]].
