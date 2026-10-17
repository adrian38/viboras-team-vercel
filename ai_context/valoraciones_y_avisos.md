# Valoraciones de partido, fiabilidad por votos y avisos a jugadores

Desde el 2026-10-17. Tres piezas que comparten tabla de avisos y campanita.

## Qué hace

1. **Valorar a los compañeros de pista.** Durante 14 días después de un
   partido, cada jugador con cuenta ve en la campanita dos avisos: «¿Qué tal el
   ambiente?» (buen rollo / no tan bien) y «¿Estaban en su nivel?» (por debajo
   / en su nivel / por encima). Los dos llevan a `/valorar?partido=<id>`, donde
   se contestan por separado. Cada aviso desaparece cuando se ha valorado a los
   tres. Las respuestas son anónimas: el API nunca dice quién votó qué.
2. **El nivel mueve la fiabilidad.** Regla de Adrián: «en su nivel» o «por
   encima» suben la fiabilidad (bajan el RD); «por debajo» la baja. El ambiente
   se guarda y **no cuenta** en nada todavía.
3. **Editar un resultado** lo pueden hacer los cuatro jugadores del partido y
   los administradores. A los demás jugadores del partido les llega «<Nombre>
   editó vuestro partido del dd/mm. Comprueba el resultado.», con el nombre del
   jugador que editó («Un administrador» si es un admin sin ficha).

## Dónde vive

| Pieza | Fichero |
| --- | --- |
| Tablas `match_feedback` y `avisos` | `api/_avisos.js`, `ensureAvisosSchema()` |
| Avisos de la campanita | `api/_avisos.js` `avisosDeJugador`, llamado desde `notifications` en `api/auth.js` |
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
  Medido en local el 2026-10-17: neto +1 bajó el RD de 255,82 a 248,18; neto −2
  lo subió de 255,82 a 271,12; ningún otro jugador cambió, y `/rating` y
  `/players` dieron los mismos números.
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
  cuerpos con nombres, desde Node. Hay dos jugadores así en la copia local
  (549, 550) que no son de esta prueba.
- Si la edición no encuentra la fila original (nombres que no casan), el API
  **inserta un partido nuevo** en vez de fallar. Es comportamiento anterior;
  ojo al probar.
