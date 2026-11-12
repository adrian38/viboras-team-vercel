# Exportar las encuestas desde el escritorio

Desde el 2026-11-12, `npm run export:encuestas` (`scripts/exportar-encuestas.mjs`)
deja en `backups/encuestas-AAAA-MM-DD-HHMM/` cuatro CSV y un `.xlsx` de cuatro
hojas con las valoraciones de partido, los jugadores, los partidos y las
cuentas. Lo pidió Adrián para gestionar fuera de la app: la pantalla
«Jugadores» del panel enseña el resumen, pero no quién votó a quién.

Es un script de escritorio, no una pantalla: no hay nada en la web que lo
llame, y por eso puede sacar la matriz entera sin pasar por `exigirAdmin`.

## Lee de producción, y sólo lee

Carga el fichero de entorno que se le pase (`.env.local` por defecto, que son
**las URL de producción**: [[neon_en_produccion]]) y conecta con
`POSTGRES_URL_NON_POOLING`. **La pooled no vale**: `createClient` la rechaza
con `invalid_connection_string`, y además `SET SESSION` sólo se mantiene entre
consultas en una conexión directa.

Lo primero que hace al conectar:

```
SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY
SHOW default_transaction_read_only   -- si no dice 'on', aborta
```

No es un adorno: comprobado el 2026-11-12 contra producción, un
`CREATE TEMP TABLE` en esa sesión muere con «cannot execute CREATE TABLE in a
read-only transaction». La garantía la da Postgres, no el cuidado de quien
escribe la consulta.

Para leer el clon de pruebas se le pasa otro fichero de entorno
(`npm run export:encuestas -- .env.dev`), nunca se apunta el de producción a
otra base: [[entorno_dev_y_clon_neon]].

## La salida va a `backups/`, que está en `.gitignore`

Lleva nombres, correos y las respuestas de la inscripción (teléfono incluido).
No se commitea y no se manda por un canal del grupo sin pensarlo.

## La trampa: 210 filas son 171 opiniones

`match_feedback` tiene una fila por partido, y una revancha es otro partido con
la misma pantalla de valoración, así que **la misma opinión está repetida**. El
2026-11-12 había 210 filas y 171 opiniones lógicas; 78 filas son copias. Es el
doble conteo que ya se corrigió una vez en la app (commit `b3053ba`).

La hoja **Opiniones** es la tabla cruda, con dos columnas para no tropezar:

| Columna | Qué dice |
| --- | --- |
| `mas reciente` | `Si` en la fila que manda de su grupo. Filtrando `Si` salen 171, exactamente las filas de `match_feedback_por_dia`. |
| `copias ese dia` | Cuántas filas forman esa misma opinión. |

El grupo es el mismo que el de la vista: mismo día, los mismos cuatro
jugadores, mismo votante y mismo votado ([[valoraciones_y_avisos]]).

La hoja **Jugadores** no usa la tabla sino la vista, para que sus columnas
`buen rollo`, `neutro` y `no tan bien` cuadren con la pantalla del panel.

## Qué no lleva, y por qué

- **El ambiente no tiene puntuación.** Son tres etiquetas (`Buen rollo`,
  `Neutro`, `No tan bien`) y en el código no hay ningún número detrás. El nivel
  sí: `nivel valor` es −1 / 0 / +1, el mismo que `api/perfil.js` usa para
  `nivel_neto`.
- **El rating no sale.** No está en la base: lo calcula el navegador
  ([[motor_de_rating_duplicado]]). Para eso está «Exportar jugadores» de
  `/rating`: [[exportar_jugadores]]. Lo que sí sale es `rating de partida`
  (`players.initial_rating`), que es otra cosa ([[rating_de_partida]]).
- **Quién votó a quién no se enseña en ninguna pantalla**, ni siquiera a los
  administradores. Este fichero sí lo lleva.

## El `.xlsx` lo escribe `tools/xlsx.mjs`

Mismo zip *store* de unos pocos XML que `front/comun/excel-export.js`, el del
navegador, con dos diferencias: escribe un fichero en vez de un `Blob` y
admite varias hojas. Sin librerías.

Comprobado el 2026-11-12: las cuatro hojas se abren con openpyxl sin avisos y
coinciden celda a celda con los CSV. **Excel de escritorio no se ha probado**,
igual que con el del navegador.

## Los números del 2026-11-12

Contrastados contra la base en la misma ejecución:

| | Base | Exportación |
| --- | --- | --- |
| Filas de `match_feedback` | 210 | 210 |
| Con ambiente contestado | 207 | 207 |
| Con nivel contestado | 196 | 196 |
| Opiniones lógicas (la vista) | 171 | 171 (`mas reciente` = Si) |
| Votante o votado fuera del partido | 0 | 0 |
| Partidos con alguna opinión | 30 de 32 | 30 de 32 |
| Jugadores | 42 | 42 |
| Cuentas | 42 | 42 |
