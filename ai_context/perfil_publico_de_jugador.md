# El perfil público de un jugador (`/jugador`)

Fecha: 2026-11-27. Pedido por Adrián: «cuando ves el perfil de un jugador en
la comunidad y tocas la tarjeta, accedas a su pantalla de perfil
simplificada: nada de sus contactos personales, pero lo demás sí».

## Cómo se llega

Desde `/comunidad`: **la tarjeta entera** es pulsable (y se aclara al
tocarla), y su botón dorado dice «Ver perfil ›». Va a `/jugador?id=<players.id>`.
El botón «Ver evolución» que había ahí (a `/players`) no se perdió: está
dentro del perfil, en el pie de la tarjeta de rating, con `?volver=` de vuelta
al perfil. `/players` aprendió a leer `?volver=` ese mismo día; antes su
«Atrás» iba siempre a la portada.

El clic de la tarjeta es un `addEventListener('click')`, **no** el truco de un
`::after` del enlace estirado sobre la tarjeta. El `:active` de `.vt-btn` lleva
`transform:scale(.9)`, y un `transform` convierte al botón en el bloque
contenedor de su `::after`: en mitad del toque la capa se encoge al botón y el
`pointerup` cae fuera del enlace. El clic se perdía.

## Qué enseña y qué no

Lo decide el API (`jugadorPublico` en `api/perfil.js`, `action=jugador`), no
la página: lo que no está en la respuesta no se puede filtrar desde fuera.

| Sale | De dónde |
| --- | --- |
| Nombre, iniciales | `players.name` |
| Lado de pista | `players.court_side` (ya público en `/comunidad`) |
| Horarios generales | `signup_form->>'availability'` (ya público en `/comunidad`) |
| Rating, categoría, puesto, fiabilidad, curva de 30 días | el motor compartido, con `cuenta-rating.js` |
| Salida | `players.initial_rating` |
| Partidos, victorias, racha, sets, compañero y rival más frecuentes | `partidos()` de `api/perfil.js`, la misma de `/cuenta` |
| Estrellas, nº de opiniones, «Nivel» votado | `opiniones()`, sólo agregados |

| No sale | Por qué |
| --- | --- |
| Correo, teléfono, nombre y apellidos | contactos personales: lo pidió Adrián |
| Resto de la ficha de inscripción (liga, torneos, ranking semanal, nivel BK) | `/cuenta` dice que esa ficha sólo la ven los administradores |
| Horas votadas en `/day` | privadas ([[disponibilidad_quien_la_ve]]) |
| Partidos pendientes de valorar, dispositivos, push, buzón | son de uno mismo |
| Fecha de alta de la cuenta, correo verificado | no aportan nada a otro jugador |

Un jugador de baja (`players.active = FALSE`) da 404, igual que no sale en
`/comunidad`. Hace falta sesión, como el resto del API.

**El «Nivel» votado sí se abrió**: «Su nivel real es superior/inferior/
coincide», el neto de los votos de nivel. Es un agregado, nunca quién votó
qué, y entra en el «lo demás sí» de la petición; si alguien lo ve delicado, se
quita de `opiniones()` en la respuesta pública.

## Las tarjetas no están copiadas

`/jugador` carga `cuenta/cuenta-perfil.js` y `cuenta/cuenta-rating.js` y pinta
con sus funciones (`window.vtPerfil.pintarPartidos`, `pintarValoracion`,
`window.pintarRating`). Por eso **los `id` de las tarjetas son los mismos que
en `cuenta/index.html`** (`pJugados`, `pRating`, `pSpark`…). Cambiar un `id`
en `/cuenta` rompe `/jugador` sin dar error: sus `texto()` y `ver()` no fallan
si el nodo no existe, simplemente no pintan. El CSS de esas tarjetas sí está
copiado en `jugador/index.html` (no hay hoja compartida para ellas).

Relacionado: [[comunidad_de_jugadores]], [[boton_atras_y_parametro_volver]],
[[barra_de_navegacion]].
