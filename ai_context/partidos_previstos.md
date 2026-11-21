# Partidos previstos: convocar antes de jugar

Hasta el 2026-11-21 la app sólo sabía de partidos **ya jugados**:
`/submit-result` los registra y `/history` los lista. Organizarlos pasaba
entero fuera, en el grupo de WhatsApp, y la app no se enteraba. Lo único que
existía era un botón «Compartir partido» en `/results` que abría
`https://wa.me/?text=…` con un texto compuesto a mano: no guardaba nada, no
llevaba ningún enlace de vuelta, y a esa pantalla ya no enlazaba nadie.

`partidos_previstos` es lo contrario: la convocatoria vive en la base, se
comparte con un enlace que vuelve a la app, y quien se apunta empieza a
recibir avisos.

## Por qué una tabla propia y no `matches`

Es la decisión de diseño más importante y la que más fácil sería deshacer por
parecer un atajo.

`matches` tiene los `set*_team*` nulables, así que una fila sin marcador «ya
funciona» como partido sin jugar — el pozo lo hace. **Y es una trampa**:
`ai_context/contar_partidos_de_un_jugador.md` cuenta que seis de los
veintiséis partidos del jugador 43 eran partidos organizados y sin jugar
guardados a 0-0, y que contarlos le bajaba el porcentaje de victorias del 70 %
al 54 %. Esa trampa la pagan hoy cinco lecturas distintas (perfil, comunidad,
ranking, rating, estadísticas), cada una con su propio `sets1+sets2 > 0`.

Meter aquí las convocatorias habría multiplicado el problema: un partido que
quizá no se juegue, con jugadores que pueden cambiar hasta el último minuto.
Con tabla propia, `matches` no recibe ni una fila nueva sin resultado y nada
de lo que ya cuenta sobre `matches` se entera de que esto existe.

El puente entre las dos es `partidos_previstos.match_id`, que se rellena
**sólo** cuando el resultado se mete de verdad.

## `TIMESTAMPTZ`, y no el `TEXT` de `matches.date`

`matches.date` arrastra dos formatos conviviendo, `DD/MM/YYYY` y
`YYYY-MM-DD` — `seValoraTodavia` en `api/_avisos.js` prueba las dos
expresiones—, y así ni ordena ni compara. Aquí hace falta exactamente eso:
`empieza_at > now()` para «aún no jugado», orden cronológico en la lista y
aritmética de intervalos para los recordatorios. Es tabla nueva y no hay
herencia que respetar.

Se guarda el **instante absoluto**, calculado desde la hora de pared
peninsular al insertar:

```sql
((${fecha}::date + ${hora}::time) AT TIME ZONE 'Europe/Madrid')
```

y el puente a `matches` al cerrar vuelve a `DD/MM/YYYY` con
`to_char(empieza_at AT TIME ZONE 'Europe/Madrid', 'DD/MM/YYYY')`.

## La hora es en punto, y por eso es una lista

Las pistas se reservan **por franja horaria**, así que las y veinte no son una
hora rara: son una hora que no se puede reservar. El servidor lo exige
(`/^([01]\d|2[0-3]):00$/`) y la página ofrece un `<select>` de 07:00 a 23:00,
con 19:00 por defecto.

Era un `<input type="time">` y dio dos problemas a la vez. El primero es que
dejaba poner las 19:20. El segundo lo vio Adrián en su móvil: en Android ese
campo abre **el reloj del sistema**, un diálogo que la página no puede
maquetar, y ahí el botón «Establecer» salía cortado por el borde. No hay CSS
que arregle eso; lo que lo arregla es no abrir ese diálogo.

Al editar, una hora que no esté en la lista **se añade a la lista** en vez de
perderse: tocar el comentario de un partido viejo no puede moverle la hora
por la espalda.

## La asimetría de las fechas, que no es un error

**En esta pantalla no se puede crear un partido en el pasado**: el servidor
exige `empieza_at >= now() + interval '15 minutes'` al crear y al editar.

**En el resto de la app las fechas pasadas siguen valiendo**, y tienen que
seguir valiendo. `isValidDateDDMMYYYY` en `submit-result.js` comprueba que la
fecha *exista*, no que sea futura, y la precarga desde `/partido` depende de
ello: el resultado que se mete es siempre el de un partido ya jugado.

No es una incoherencia que arreglar. `matches` registra lo que ya pasó;
`partidos_previstos` convoca lo que va a pasar. Un partido previsto con fecha
pasada no es un dato histórico: es un partido al que nadie puede apuntarse y
cuyos recordatorios nacen todos vencidos.

Los 15 minutos no son 0 ni una hora. Para dentro de diez minutos no da tiempo
a que nadie vea el aviso y se apunte, que es para lo que existe la pantalla;
pero «hoy más tarde» es el caso normal del grupo —alguien monta a mediodía el
partido de esa tarde— y prohibirlo devolvería a WhatsApp. Además absorbe el
desfase de reloj entre el móvil, que valida el formulario, y Neon, que valida
de verdad: sin margen, un reloj adelantado un minuto daría un 400
inexplicable.

## Las sedes

`SEDES` en `api/_partidos.js` es la **única copia**. La página no escribe los
`<option>` en su HTML: los construye con lo que venga en la respuesta del API.
No cabe un fichero compartido entre `front/` y `api/` sin bundler, porque
`api/` es ESM y las páginas cargan `<script>` planos.

Son los polideportivos de Bilbao Kirolak con pista de pádel, comprobados ficha
a ficha en `bilbaokirolak.eus` el 2026-11-21: **San Inazio** (8 cubiertas, el
valor por defecto), **Artxanda** (4 cubiertas y 2 descubiertas) y **Zorrotza**
(2 cubiertas). De los once polideportivos, son los tres únicos que listan
pistas de pádel.

Atxuri, San Mamés, Miribilla y La Peña **mencionan «pádel»** en el texto
genérico de accesibilidad de su ficha, pero no en su listado específico de
instalaciones. Se dejaron fuera a propósito; si alguien confirma que las
tienen, añadirlas es una línea y ninguna migración.

`otro` existe porque el grupo también juega fuera de Bilbao Kirolak, y una
lista cerrada que no cubre un caso real acaba con la sede verdadera escrita en
el comentario, donde ni se filtra ni sale en el mensaje de WhatsApp. Obliga a
`sede_libre`, que tiene que ser NULL en cualquier otra sede.

El número de pistas **no se guarda**: es texto de la constante, para pintar
«San Inazio · 8 pistas cubiertas». No es un dato del partido.

## El esquema no está en `ensureSchema()`

`api/_db.js:ensureSchema` está clavado en 122 líneas en
`tools/code-size-baseline.json` y el trinquete no deja que crezca. Las cuatro
tablas se crean en `ensurePartidosSchema()`, memoizado, igual que ya hacen
`avisos`, `buzon`, `tablon` y `push_subscriptions`.

Los topes (`duracion_min` de 60 o 120, la sede en la lista, el comentario)
**no son `CHECK`**: `CREATE TABLE IF NOT EXISTS` no migraría un `CHECK` nuevo
sobre una tabla que ya existe, la misma razón por la que `tipo` en `_buzon.js`
y `categoria` en `_tablon.js` tampoco lo tienen. Los valida la función.

## La carrera de las plazas la arbitra el índice

El proyecto **no usa transacciones en ningún sitio**: el `sql` de
`@vercel/postgres` es una sentencia suelta y no hay ni un `BEGIN` ni un
`FOR UPDATE` en todo `api/`. Así que apuntarse es una sola sentencia que toma
la plaza libre más baja, y la clave primaria `(partido_id, puesto)` hace de
candado: si dos se apuntan a la vez, el segundo choca con un **23505**, se
reintenta una vez y, si vuelve a chocar, es que ya no hay sitio.

Es la misma lectura de `err.code === '23505'` que ya hacen
`api/league-admin.js` y `api/_pozo-api.js`.

**Apuntar a otro es imposible por construcción**: la acción no acepta ningún
parámetro de jugador, el `player_id` sale siempre de la sesión. No añadir ese
parámetro «por comodidad».

## El `sql` no compone fragmentos

En `_partidos-lista.js` la lista de columnas está repetida en las tres
consultas. No es descuido: el `sql` de `@vercel/postgres` convierte cada `${}`
en un parámetro, así que una constante con el trozo de SELECT dentro no
pegaría texto, pasaría una cadena como valor y rompería la consulta. Para
componer hay que bajar a `sql.query(texto, valores)`, que sólo se usa en
`api/_partidos-cron.js` y por un motivo que su nota explica
(`ai_context/recordatorios_y_cron.md`).
