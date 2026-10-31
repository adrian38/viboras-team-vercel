# El tablón de avisos

Fecha: 2026-10-31. Pantalla `/tablon`, API `api/tablon.js`, módulo
`api/_tablon.js`, tabla `tablon`.

## Qué es

Los administradores publican comunicados y todo el grupo los lee: título,
mensaje, una categoría y, si el aviso lo pide, una foto. Nació de la maqueta
de Stitch «Tablón de avisos — vista admin».

Leer es de cualquiera con sesión. Publicar, editar y borrar es de
administradores, y **lo comprueba el servidor**, no la página: `ACCIONES` en
`api/tablon.js` marca las tres escrituras como de admin y devuelve 403 a los
demás. Esconder el panel en el HTML no cierra nada, igual que en
[[disponibilidad_quien_la_ve]].

## Publicar avisa al grupo; editar, no

`publicar()` llama a `crearAviso(jugadores, 'Tablón de avisos: <título>',
'/tablon')`. Eso no es una convención de esta pantalla: `crearAviso` es la
única puerta para dejar una entrada en la campanita, y de ella no se sale sin
el push ([[avisos_push]]). Así que un aviso del tablón llega a la campanita y
al móvil a la vez.

`editar()` **no avisa a nadie**: corregir una falta no es una novedad. Lo
único que queda es `updated_at`, que la página enseña como «editado el …».

A quién avisa: a los jugadores activos cuya cuenta está activa
(`jugadoresConCuenta`). Sin cuenta no hay campanita ni dispositivo.

## La foto va dentro de la fila, y eso tiene consecuencias

El proyecto **no tiene almacenamiento de ficheros**: no hay Vercel Blob ni
nada equivalente, así que la imagen se guarda como data URL en
`tablon.imagen`. De ahí salen tres decisiones que parecen raras:

- **La página reescala antes de subir.** `reescalar()` en `tablon.html` pasa la
  foto por un `<canvas>` a 1280 px de lado mayor y la vuelve a codificar en
  JPEG al 75 %. Sin eso, una foto de móvil no entraría.
- **El servidor tiene su propio tope**, `IMAGEN_MAXIMA` = 400 000 caracteres
  de base64 (unos 300 KB de imagen), y sólo acepta `data:image/(jpeg|png|webp)`.
  El tope del servidor es el que manda: la página puede mentir.
- **`imagen` no viaja en la lista.** `avisosDelTablon()` devuelve
  `tiene_imagen` y nada más; cada foto se pide aparte
  (`action=imagen&id=…`) cuando su tarjeta se acerca a la pantalla, con un
  `IntersectionObserver`. Con diez avisos, mandar todas juntas haría la
  respuesta inmanejable en un móvil.

Si algún día hay Blob, lo que cambia es `imagenValida` y el `INSERT`; la
página seguiría igual salvo la subida.

## Tres estados de la foto al editar, no dos

El cuerpo de `editar` distingue:

| `imagen` en el cuerpo | Qué hace |
| --- | --- |
| no viene | deja la que hubiera |
| `''` o `null` | la quita |
| data URL | la cambia |

Por eso `fotoNueva` en la página es `null` (no se toca), `''` (quitarla) o el
data URL, y `cuerpoDelAviso()` sólo mete la clave `imagen` cuando hay algo que
decir. Confundir «no viene» con «quítala» borraría la foto cada vez que un
administrador corrige una tilde.

## Decisiones que parecen errores

- **El esquema no está en `ensureSchema()`** (`_db.js`), como `avisos`, `buzon`
  y `push_subscriptions`: esa función está en el techo de tamaño y el trinquete
  no la deja crecer ([[tamano_del_codigo_y_trinquete]],
  [[esquema_duplicado_y_desfasado]]). `scripts/schema.sql` tampoco la tiene.
- **`categoria` no tiene `CHECK`.** `CREATE TABLE IF NOT EXISTS` no migraría
  uno nuevo sobre una tabla que ya existe, así que la lista válida vive en
  `CATEGORIAS` (`_tablon.js`) y la valida la función. Mismo motivo que el
  `tipo` del buzón.
- **`editar()` son dos consultas y no un `CASE`.** Con `imagen` a null,
  Postgres no sabe de qué tipo es el parámetro y habría que escribir el cast a
  mano; dos ramas se leen mejor.
- **Las categorías con cero avisos no salen como filtro.** Un filtro que
  enseña una lista vacía no dice por qué está vacía.
- **No hay contador de «nuevos» en la portada.** Haría falta guardar qué ha
  visto cada uno, y para avisar de una publicación nueva ya está la campanita,
  que es donde el grupo lo mira. El «2 NUEVOS» de la maqueta no tenía de dónde
  salir.

## Lo que la maqueta traía y se quedó fuera

Por «ningún dato de la pantalla es inventado» (`AGENTS.md`):

| En la maqueta | Por qué no está |
| --- | --- |
| «16 Parejas Máx», «Pack de Socio», «Tallas S a XXL» | No hay campo ninguno detrás |
| «Inscripciones en recepción», «Afecta martes mañana» | Igual: texto suelto sin dato |
| «Notificaciones del club activas» en el pie | Prometía un estado que la página no comprueba |
| «Actualizado en tiempo real» | No lo está: se recarga al entrar |
| Filtros «Urgentes / Torneos / Pistas» fijos | Las categorías reales son las de `CATEGORIAS`, y sólo salen las usadas |

Relacionado: [[avisos_push]], [[valoraciones_y_avisos]],
[[comunidad_de_jugadores]], [[buzon_de_quejas]].
