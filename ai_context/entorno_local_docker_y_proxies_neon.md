# El entorno local necesita dos proxies para imitar a Neon

`docker compose up -d --build` levanta cuatro contenedores, y dos de ellos
existen sólo porque `@vercel/postgres` **no habla con un Postgres normal**:

| Servicio | Para qué |
| --- | --- |
| `postgres` | Postgres 17 de verdad. Puerto **5433** en el host, para no chocar con uno instalado. |
| `wsproxy` | Traduce WebSocket (protocolo Neon) a TCP. |
| `neon-http` | Implementa el API HTTP de Neon (`POST /sql`) sobre ese Postgres. **Es el que de verdad usa la app**: el tag `sql` de `@vercel/postgres` va por HTTP, no por WebSocket. |
| `app` | Express que imita a Vercel: sirve los `.html` y enruta `api/*.js` como si fueran funciones. |

El servidor local está en `docker/server.js` y **no modifica** los ficheros de
`api/`: los importa tal cual, replicando el contrato que esperan
(`req.query`, `req.body`, `res.status().json()`). `extensions: ['html']` de
`express.static` reproduce el `cleanUrls` de `vercel.json`, que es lo que hace
que `/day` resuelva a `day.html`.

## La trampa del `-pooler.`

En `docker-compose.yml` la URL es:

```
postgres://postgres:padel_local@padel-pooler.local:5432/padel
```

Ese host no existe y el driver lo ignora —todo va por el proxy—, pero el
`-pooler.` **no es decorativo**: `@vercel/postgres` valida la cadena con
`connectionString.includes("-pooler.")` y si no aparece rechaza la conexión con
`invalid_connection_string`. Es el mismo motivo por el que en producción hay que
usar la URL *pooled* de Neon.

## Los ficheros se montan uno a uno

`docker-compose.yml` monta cada `.html` por separado, más `api/`, `docker/` y
`data/`. Consecuencia: **un fichero estático nuevo no aparece en el contenedor**
hasta que se reconstruye la imagen.

```bash
docker compose up -d --build app
```

Pasó al añadir `site.webmanifest`, los iconos y `sw.js`: servían 404 en local y
200 en producción. Si algo que acabas de crear da 404 sólo en local, es esto, no
una ruta mal escrita.

Borrar un fichero montado sin quitar su línea del `docker-compose.yml` es peor:
Docker crea un directorio vacío en su lugar.

## Los service workers no se pueden probar en local

El navegador integrado no registra service workers sobre `http://localhost`
(`An unknown error occurred when fetching the script`). Sobre HTTPS en
producción funciona. Para validar `sw.js` sin desplegar está el arnés de Node
descrito en [[service_worker]].

Relacionado: [[neon_en_produccion]], [[esquema_duplicado_y_desfasado]].
