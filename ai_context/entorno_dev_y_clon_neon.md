# `dev` usa un clon Neon y nunca la base de producción

Configurado y auditado el 2026-11-01. El objetivo no es sólo tener una URL de
Preview: es poder crear, modificar y borrar registros desde `dev` sin tocar los
datos del grupo.

## Mapa de los dos entornos

| Uso | Git | Vercel | Neon | Identificador de rama |
| --- | --- | --- | --- | --- |
| Producción | `viboras` | Production | `main` | `br-soft-grass-b2vx7ut7` |
| Desarrollo | `dev` | Preview, rama Git `dev` | `viboras_dev` | `br-soft-dawn-b213926z` |

Ambas ramas viven en el proyecto Neon `neon-rose-bridge`, id
`empty-poetry-42127048`, en Frankfurt. `viboras_dev.parent_id` es exactamente el
id de `main`: es un clon de los datos y del esquema de producción, no una base
vacía ni un conjunto de datos inventado.

Neon conserva el mismo nombre PostgreSQL, `neondb`, dentro de las dos ramas.
Por eso mirar sólo `PGDATABASE` o el sufijo `/neondb` induce a error. La prueba
de aislamiento es que la rama y el endpoint son distintos. En la auditoría del
2026-11-01 eran:

- producción: `ep-divine-river-b2sgrlig-pooler…`;
- desarrollo: `ep-snowy-bird-b22ap65c-pooler…`.

Los endpoints pueden cambiar si se recrea el compute; los ids de rama y su
relación padre-hijo son la referencia estable. No guardar aquí usuarios,
contraseñas ni cadenas completas.

## Copia inicial comprobada

Nada se dio por bueno por tener el mismo número de filas. Se compararon tres
recuentos y una huella ordenada de todos los partidos en `main` y
`viboras_dev`:

```text
players = 42
matches = 15
users = 42
matches_md5 = 924288ee77456017cae7ec657bcae6de
```

Los cuatro valores coincidían al crear el clon. Desde ese instante las ramas
son independientes: los cambios nuevos de una no aparecen en la otra.

## La trampa que habría escrito en producción

La integración de Neon en Vercel había creado sus variables para Development,
Preview y Production a la vez. Antes de los overrides específicos, un
despliegue Preview heredaba las mismas conexiones que Production. Que la
etiqueta del despliegue dijera «Preview» no aislaba Postgres.

Para la rama Git `dev` se añadieron overrides de `Preview (dev)` para **todas**
las formas de conexión, no sólo para la que usa hoy `@vercel/postgres`:

```text
POSTGRES_URL
POSTGRES_URL_NON_POOLING
POSTGRES_URL_NO_SSL
POSTGRES_PRISMA_URL
DATABASE_URL
DATABASE_URL_UNPOOLED
PGHOST
PGHOST_UNPOOLED
PGUSER
PGPASSWORD
PGDATABASE
POSTGRES_HOST
POSTGRES_USER
POSTGRES_PASSWORD
POSTGRES_DATABASE
```

Dejar una variante heredada de producción prepara un fallo futuro: basta que
un script nuevo use `DATABASE_URL` o `PGHOST` en vez de `POSTGRES_URL`.

Todas están marcadas como `Secret`. `vercel env ls` confirma que existe el
override y su ámbito, pero muestra `Hidden`; `vercel env pull` y `vercel env
run` tampoco devuelven su valor. Por tanto **listar las variables no demuestra
el host**. La auditoría reproducible ante cualquier duda es sobrescribirlas de
nuevo a partir de las dos cadenas que entregue Neon para `viboras_dev` y crear
un despliegue nuevo.

## Regenerar la configuración de forma segura

Primero autenticar y enlazar las CLI. Las cadenas se capturan en variables de
la sesión; no se imprimen, no se pegan en el historial y no se guardan en un
fichero versionado:

```powershell
$project = 'empty-poetry-42127048'
$pooled = (npx --yes neon@latest connection-string viboras_dev --project-id $project --pooled).Trim()
$direct = (npx --yes neon@latest connection-string viboras_dev --project-id $project).Trim()
```

Antes de continuar, comparar sólo los hosts —nunca la cadena entera— contra
`main` y exigir que sean distintos. Después se sobrescriben en Vercel las 15
variables anteriores con `--environment preview --git-branch dev --force`.
Las pooled salen de `$pooled`; las directas y `PGHOST_UNPOOLED`, de `$direct`;
usuario, contraseña y base se derivan de la URL directa.

Vercel no aplica variables nuevas a un despliegue que ya existe. Hay que hacer
push de `dev` o `vercel redeploy` y esperar a `READY`. El alias estable es:

```text
https://viboras-team-vercel-git-dev-adrian38s-projects.vercel.app
```

## Variables no relacionadas con Postgres

El usuario pidió que `dev` funcione igual que producción. Se copiaron a
`Preview (dev)` `GOOGLE_CLIENT_ID`, `ADMIN_EMAILS`, las cuatro `SMTP_*` y las
dos `VAPID_*`. `APP_URL` apunta al alias estable anterior y ese origen está
autorizado en el cliente OAuth de Google.

Esto no amplía el aislamiento: los datos SQL sí están separados, pero una
acción de prueba puede enviar un correo o push real porque usa las mismas
credenciales externas y el clon contiene usuarios y suscripciones reales.

## Reglas para no volver a cruzar los entornos

- `git push origin viboras` despliega Production y usa `main`.
- `git push origin dev` despliega Preview y tiene que usar `viboras_dev`.
- No ejecutar `vercel --prod` desde el trabajo de `dev`.
- No probar migraciones o escrituras con `.env.local`: contiene producción.
- No activar «Create database branch for deployment». `dev` usa un clon
  persistente conocido, no una rama distinta y efímera por despliegue.
- Refrescar datos significa recrear/resetear `viboras_dev` desde `main`, nunca
  apuntar Preview a `main`. Es destructivo para las pruebas y requiere una
  petición expresa.
- Si no se puede demostrar el destino antes de una escritura, se para. Un 200
  del API sólo demuestra que alguna base respondió, no cuál.

Relacionado: [[neon_en_produccion]], [[rama_viboras_es_produccion]],
[[entorno_local_docker_y_proxies_neon]].
