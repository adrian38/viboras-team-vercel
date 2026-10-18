# Valoraciones de partido, fiabilidad por votos y avisos a jugadores

Desde el 2026-10-17. Tres piezas que comparten tabla de avisos y campanita.

## Qué hace

1. **Valorar a los compañeros de pista.** Durante 14 días después de un
   partido, cada jugador con cuenta ve en la campanita **un** aviso por
   partido, «Valora el partido del dd/mm», que lleva a `/valorar?partido=<id>`.
   Allí hay dos preguntas que se contestan por separado: «¿Qué tal el
   ambiente?» (buen rollo / no tan bien) y «¿Estaban en su nivel?» (por debajo
   / en su nivel / por encima). El aviso sigue mientras falte alguna de las dos
   a alguno de los tres. Hasta el 2026-10-18 eran dos avisos por partido, uno
   por pregunta; Adrián pidió uno. Dos partidos el mismo día salen como dos
   avisos con el mismo texto. Las respuestas son anónimas: el API nunca dice quién votó qué.
   Sólo cuentan partidos **jugados** (desde el 2026-10-17): los de liga sin
   jugar llevan 0-0 y salían en `/valorar` como tres «Partido del 05/10»
   iguales, y en la campanita. La lista de `/valorar` enseña también las dos
   parejas, para distinguir dos partidos del mismo día.
2. **El nivel mueve la fiabilidad.** Regla de Adrián: «en su nivel» o «por
   encima» suben la fiabilidad (bajan el RD); «por debajo» la baja. El ambiente
   se guarda y **no cuenta** en nada todavía.
3. **Editar un resultado** lo pueden hacer los cuatro jugadores del partido y
   los administradores. **Desde el 2026-10-18 sólo se avisa si cambia el
   marcador y lo cambia uno de los jugadores del partido** (lo pidió Adrián):
   a los demás jugadores les llega «<Nombre> cambió el resultado de vuestro
   partido del dd/mm. Compruébalo.». Corregir la fecha o un nombre sin tocar
   el marcador no avisa, y un administrador que no juega ese partido tampoco.
   Los sets de antes los lee el propio `UPDATE` (`UPDATE … FROM`, que ve la
   fila previa), no lo que manda la página: `editado` en `write.js`. Probado
   en local con los cuatro casos.

Además de la campanita, en `/history` cada partido propio de los últimos 14
días lleva un botón «Valorar» que entra a `/valorar` con lo ya elegido marcado
(se puede cambiar). Se reconoce el partido por su id, que `getResults` manda
desde el 2026-10-17; antes era por fecha y cuatro nombres, y una revancha
del mismo día con las mismas parejas se confundía.

El ambiente recibido se ve, por ahora, sólo en la pantalla Jugadores del panel
de administración (`admin-jugadores.js`): «👍 n · 👎 m» en la lista y una
sección «Ambiente» en Editar. Sale de `getAmbiente` en `read.js`, sólo para
admin y sólo con cuentas.

## Privacidad

Cada uno sólo ve sus propias elecciones: `/api/avisos?action=partido` devuelve
lo que votó quien pregunta y nada de los demás (comprobado en local: Álvaro
vota a Julio y Julio, al abrir el mismo partido, no ve nada). Ninguna pantalla
enseña votos ajenos.

**El límite:** el motor de rating corre en el navegador, así que
`getNivelVotos` manda a cualquier miembro la suma de votos de nivel por
jugador y día (no quién votó). Quien abra las herramientas del navegador puede
leerla, y en un día de un solo partido a veces se deduce mucho. Cerrarlo del
todo obliga a calcular el rating en el servidor.

## Dónde vive

| Pieza | Fichero |
| --- | --- |
| Tablas `match_feedback` y `avisos` | `api/_avisos.js`, `ensureAvisosSchema()` |
| Avisos de la campanita | `api/_avisos.js` `avisosDeJugador`, llamado desde `notifications` en `api/auth.js` |
| Los mismos avisos como push al móvil | [[avisos_push]] |
| Valorar y marcar visto | `api/avisos.js` (función serverless nueva) |
| Votos agregados para el motor | `api/read.js` `getNivelVotos` |
| Ajuste del RD | `nivel-votos.js`, cargado por `rating.html` y `players.html` |
| Permiso de editar y aviso | `api/write.js` `updateExistingMatch` / `editado` |
| Botón «Editar» para jugadores | `history.html` (`juegaEn`) |

## Decisiones que parecen errores

- **El esquema no está en `ensureSchema()`** (`_db.js`), contra lo que dice
  [[esquema_duplicado_y_desfasado]]: esa función está en el techo de tamaño y
  el trinquete no la deja crecer ([[tamano_del_codigo_y_trinquete]]). Es el
  mismo arreglo que `ensureAuthSchema`. `scripts/schema.sql` tampoco las tiene.
- **El motor no se tocó por dentro.** `updatePeriod`, `calculateEngineRatings`,
  `buildDailyHistoricalSeries` y `players.html` entero están perdonados en el
  baseline. Se cambiaron tres líneas por página sin añadir ninguna: la llamada
  a `updatePeriod` lleva detrás `window.vtNivel.ajustar(...)` en la misma
  línea, y la carga de partidos espera a `window.vtNivel.listo`. Por eso
  `nivel-votos.js` va **antes** del script de la página, no después.
- **El ajuste es por día y jugador, no por partido.** Cada día con votos,
  después de `updatePeriod`: `RD × (1 − 0,03 × neto)`, con neto = votos a favor
  − votos en contra de ese día, entre `MIN_RD` y `MAX_RD`. El rating del día no
  cambia; lo que cambia es cuánto se moverá en los partidos siguientes.
  Auditado en local el 2026-10-17 (dos partidos el día 14 y uno el 16, con
  los mismos cuatro): neto +3 dio RD × 0,9100 exacto (254,74 → 231,82) y neto
  −4 repartido en dos partidos del mismo día, × 1,1200 (una sola vez, no
  0,97 dos veces); el rating del día 14 no cambió. En el partido del 16, que
  perdieron los dos, Julio (+3) bajó 49,34 en vez de 58,71 y Jesús C (−4)
  70,62 en vez de 58,71. Votos sólo de ambiente, de alguien que no jugó o a
  alguien que no jugó: no cuentan. `/rating` y `/players`, idénticos.
- **Los rivales también notan el voto, en el partido siguiente.** El día del
  voto sólo cambia el RD del votado. Después, quien juega contra él usa ese RD
  en el cálculo: en la auditoría, Álvaro ganó 49,54 en vez de 49,95. Es el
  motor de siempre (un rival menos fiable cuenta menos), no un efecto aparte.
- **`rating-test.html` no lo usa.** Es un banco de pruebas con partidos
  escritos a mano; las cuatro primitivas siguen idénticas
  ([[motor_de_rating_duplicado]]).
- **Un voto deja de contar si el jugador sale del partido.** Al editar y
  cambiar a alguien, `getNivelVotos` y los pendientes sólo cuentan votos entre
  los cuatro jugadores actuales.
- **La campanita sólo está en `index.html`.** Los avisos de valorar se calculan
  al vuelo; los de edición se guardan en `avisos` y se marcan vistos al
  pulsarlos (`sendBeacon` a `/api/avisos?action=visto`). Caducan a 30 días.
- **El permiso de editar mira los jugadores de antes de la edición**, no los
  de después: si no, cualquiera se metería en un partido ajeno poniéndose en él.

## Trampas al probar

- `matches.date` es texto `DD/MM/AAAA` (y algún `AAAA-MM-DD`): toda consulta
  por fecha pasa por el `CASE` que convierte los dos y deja lo demás en NULL.
- **No mandar nombres con tilde con `curl` desde Git Bash**: llegan mal
  codificados y `getOrCreatePlayerId` crea jugadores basura («�lvaro»). Los
  cuerpos con nombres, desde Node. Hay tres jugadores así en la copia local
  (549, 550, 551 «�lvaro») de antes de esta prueba. Ojo: un nombre mal
  codificado **reutiliza** el basura que ya exista, así que antes de borrar
  «lo que creó la prueba» hay que mirar si ya estaba (pasó con el 551).
- Si la edición no encuentra la fila original (otro la editó mientras tanto,
  o un nombre cambió), el API responde **409** «Alguien ha editado este
  partido… vuelve a intentarlo» y `history.html` recarga la tabla. Hasta el
  2026-10-17 insertaba un partido nuevo, que lo duplicaba. La fila se busca
  por su id y, además, por la fecha y los cuatro jugadores de antes: si no
  coinciden es que otro la cambió. Borrar funciona igual. Antes no había id
  y una revancha del mismo día se editaba y se borraba a la vez que la
  otra. La edición manda también el formato: sin él, un partido con super
  tie-break pasaba a normal y el tercer set se validaba como uno de 7 juegos.
