# Exportar las encuestas desde el escritorio

Desde el 2026-11-12, la carpeta `exportar-encuestas/` saca a Excel y CSV las
valoraciones de partido: quién votó a quién, con qué y en qué partido, más los
jugadores, los partidos y las cuentas. Lo pidió Adrián para gestionar fuera de
la app: la pantalla «Jugadores» del panel enseña el resumen, pero no la matriz.

```
npm run export:encuestas          desde el proyecto
exportar-encuestas\exportar.bat   doble clic, también fuera del proyecto
```

No hay nada en la web que lo llame, y por eso puede sacar la matriz entera sin
pasar por `exigirAdmin`.

## Es una carpeta que se le puede dar a alguien

Esa es la razón de que no esté en `scripts/` y de que no use
`@vercel/postgres`: **la carpeta se copia a otro ordenador tal cual y funciona
con Node a secas**, sin `npm install` y sin `node_modules`.

| Fichero | Qué hace |
| --- | --- |
| `exportar.mjs` | Busca la conexión, pide los datos y escribe la salida. |
| `neon.mjs` | Habla con la base por HTTP. |
| `consultas.mjs` | El SQL, una consulta por hoja. Lo único que se toca para cambiar lo que sale. |
| `xlsx.mjs` | El `.xlsx`, sin librerías. |
| `exportar.bat` | Doble clic en Windows; avisa si no hay Node. |
| `LEEME.md` | Las instrucciones para quien reciba la carpeta. |

La conexión se busca en cuatro sitios, en este orden: el argumento de la línea
de órdenes, `conexion.txt` al lado del script, la variable
`POSTGRES_URL_NON_POOLING`, y el `.env.local` del proyecto (que es lo que usa
`npm run export:encuestas`). La salida va a `salida/` dentro de la propia
carpeta. `conexion.txt` y `salida/` están en `.gitignore`.

## SQL por HTTP, que es lo que quita las dependencias

`neon.mjs` hace un `POST https://<host>/sql` con la cadena de conexión en la
cabecera `Neon-Connection-String`. Es el mismo endpoint que usa por dentro
`@neondatabase/serverless`, y con `fetch`, que Node trae de serie desde la 18,
no hace falta nada más. El host sale de la propia cadena.

Las consultas van en un lote (`queries`) con la cabecera
`Neon-Batch-Read-Only: true`: **Postgres abre la transacción en sólo lectura**.
Antes de la primera consulta el script pregunta `SHOW transaction_read_only` y
para si no contesta `on`. La garantía la da Postgres, no el cuidado de quien
escriba el SQL.

Neon devuelve **todos los valores como texto**. `exportar.mjs` mira el
`dataTypeID` de cada columna y convierte a número las que la base declara
numéricas (`int2/4/8`, `float4/8`, `numeric`), para que en Excel se puedan
sumar y ordenar. Sin eso, los ids y los votos serían texto.

## Quien reciba la carpeta recibe la base entera

La cadena de conexión no es de sólo lectura: lo de sólo lectura es esta
herramienta. Con la cadena y cualquier otro programa se escribe en producción.
Para dársela a alguien de fuera, lo suyo es un usuario de sólo lectura en el
panel de Neon ([[neon_en_produccion]]). Está dicho en el `LEEME.md`, que es lo
que esa persona va a leer.

Lo que sale lleva nombres, correos y teléfonos: `salida/` no se commitea.

Para leer el clon de pruebas se le pasa su cadena como argumento; nunca se
apunta la de producción a otra base ([[entorno_dev_y_clon_neon]]).

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

## El `.xlsx` lo escribe `xlsx.mjs`

Mismo zip *store* de unos pocos XML que `front/comun/excel-export.js`, el del
navegador, con dos diferencias: escribe un fichero en vez de un `Blob` y
admite varias hojas. Vive dentro de `exportar-encuestas/` y no en `tools/`
porque la carpeta tiene que poder viajar sola.

Comprobado el 2026-11-12: las cuatro hojas se abren con openpyxl sin avisos y
coinciden celda a celda con los CSV. **Excel de escritorio no se ha probado**,
igual que con el del navegador.

## Los números del 2026-11-12

Contrastados contra la base, con la carpeta copiada fuera del repositorio y
corriendo con su `conexion.txt`:

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

Los tres errores que se pueden dar están probados y dicen qué hacer: sin
`conexion.txt`, con una cadena que no es una URL, y con la contraseña
equivocada.
