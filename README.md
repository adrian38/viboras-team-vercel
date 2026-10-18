# Viboras Team

La web del grupo de pádel Viboras Team: resultados, rating, estadísticas,
torneos y disponibilidad. Páginas estáticas más funciones serverless en
`api/`, desplegadas en Vercel sobre Neon Postgres.

**`viboras` es la rama de producción: un push despliega al grupo sin paso
intermedio.** Las reglas de trabajo y de verificación están en `AGENTS.md`, y
lo que no se ve leyendo el código, en `ai_context/` (empezar por su
`README.md`).

## Qué hay

```
.
├── api/                   # funciones de Vercel; los _*.js son piezas, no rutas
│   ├── read.js            # lecturas: getNames, getResults, getSlots, getLeagues,
│   │                      #   getNivelVotos, getRatingsDePartida;
│   │                      #   solo admin: exportPlayers, getAmbiente
│   ├── write.js           # submitResult, submitVote;
│   │                      #   solo admin: submitName, deleteName, deleteResult, updatePlayer
│   ├── league-admin.js    # solo admin: ligas, cuadros, pozos, compás, sustituciones
│   ├── auth.js            # cuentas: alta, entrada (contraseña o Google), aprobar…
│   ├── correo.js          # restablecer contraseña y confirmar correo
│   ├── avisos.js          # valorar a los compañeros y avisos de la campanita
│   ├── _db.js             # ensureSchema(): el esquema que de verdad corre
│   └── _auth.js, _google.js, _correo.js, _avisos.js, _inscripcion.js,
│       _score.js, _ligas.js, _logo.js
├── *.html                 # 17 páginas, cada una con su <head> completo
├── *.js                   # JavaScript de las páginas que vive fuera del HTML
│                          #   (auth-client.js, pwa.js, sw.js, splash.js…)
├── theme.css              # tokens y componentes del tema oscuro
├── tools/                 # las guardas de `npm run check`
├── scripts/               # schema.sql (copia DESFASADA) y apply-schema.js
├── docker/, docker-compose.yml   # entorno local, abajo
├── .vercelignore          # lo que no se publica (docs, entorno local, tools…)
└── vercel.json            # cleanUrls: /rating sirve rating.html
```

Todo `api/` exige sesión salvo `auth.js` y `correo.js`, que son la puerta de
entrada. Las páginas se descargan sin sesión, pero llegan vacías: los datos
vienen del API.

## La base de datos

El esquema que corre es el de `ensureSchema()` en `api/_db.js`, que crea y
migra las tablas en cada arranque en frío; las de cuentas, valoraciones y
avisos las crean `ensureAuthSchema()` y `ensureAvisosSchema()`.
`scripts/schema.sql` es una copia a mano **desfasada**: no usarla para crear
una base. Detalle en `ai_context/esquema_duplicado_y_desfasado.md` y, para
Neon, en `ai_context/neon_en_produccion.md`.

## Comprobar antes de commitear

No hay pruebas automáticas. Lo mínimo:

```bash
npm run check                 # índice de ai_context, paridad del rating, tamaño del código
docker compose up -d --build  # y comprobar el cambio en http://localhost:3000
```

El resto (medir en el navegador, contrastar con un `SELECT`) está en
`AGENTS.md`.

`package.json` aún declara `npm run migrate`, de la importación desde Netlify;
`scripts/migrate.js` ya no existe.

---

## Entorno local con Docker

Levanta la app completa contra un Postgres local, sin tocar Neon ni produccion.

```bash
docker compose up -d --build
```

Servicios que arranca:

| servicio     | puerto | para que sirve                                        |
|--------------|--------|-------------------------------------------------------|
| `postgres`   | 5433   | la base de datos (volumen `pgdata`, persiste)          |
| `neon-http`  | 4444   | traduce el API HTTP de Neon -> Postgres normal         |
| `wsproxy`    | —      | lo mismo para el camino WebSocket (hoy sin uso)        |
| `app`        | 3000   | servidor Express que emula las funciones de Vercel     |
| `mailpit`    | 8025   | recoge los correos de la app sin mandarlos fuera       |

App en http://localhost:3000 y comprobacion de la conexion en
http://localhost:3000/health

### Por que hacen falta los proxies

`@vercel/postgres` **no habla el protocolo TCP de Postgres**. Internamente el tag
`sql` llama a `neon()`, que hace un `fetch` contra `https://<host>/sql`. Por eso
no se le puede apuntar a un Postgres normal sin un traductor delante.

`docker/neon-local.js` reconfigura el driver (`neonConfig.fetchEndpoint`) para que
apunte al proxy local. **Los ficheros de `api/` no se modifican**: son los mismos
que corren en produccion.

Dos detalles que hacen perder el tiempo si no se saben:

- La cadena de conexion debe contener `-pooler.` o el driver la rechaza con
  `invalid_connection_string`. La comprobacion es literalmente
  `connectionString.includes("-pooler.")`.
- Vercel/Neon exponen la variable como `DATABASE_URL`, pero este codigo solo lee
  `POSTGRES_URL`. Si se copia tal cual, todo devuelve 500.

### Cargar datos

Los dumps de `backups/` estan montados en `/backups` dentro del contenedor:

```bash
docker compose exec postgres psql -U postgres -d padel -f /backups/<fichero>.sql
```

Para sacar un backup de produccion (usar la URL **UNPOOLED** de Neon, la
pooled no sirve para `pg_dump`):

```bash
docker compose exec postgres pg_dump "$NEON_UNPOOLED_URL" --no-owner --no-privileges -f /backups/neon-$(date +%Y%m%d-%H%M).sql
```

`backups/` esta en `.gitignore`: contiene nombres reales de jugadores.

### Parar

```bash
docker compose down        # conserva los datos
docker compose down -v     # borra tambien el volumen
```
