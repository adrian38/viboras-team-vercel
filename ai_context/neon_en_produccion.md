# Neon en producción: variables, región y restauración

La base de producción es **Neon Postgres** creada desde el marketplace de Vercel
(recurso `neon-rose-bridge`, región **Frankfurt / fra1**), conectada al proyecto
`viboras-team-vercel`. Migrada desde el Postgres local el 2026-10-08.

## Tiene que ser Neon, no cualquier Postgres

`@vercel/postgres` usa el API HTTP de Neon y valida que el host lleve
`-pooler.`. Un Supabase o un Postgres gestionado cualquiera **no conecta**. Es
la misma razón por la que el entorno local necesita dos proxies
([[entorno_local_docker_y_proxies_neon]]).

## El prefijo de las variables tiene que ir vacío

Al conectar la integración, Vercel ofrece un «Custom Prefix». Si se rellena, las
variables se llaman `<PREFIJO>_URL` y la app arranca con
`missing_connection_string`, porque `@vercel/postgres` busca el nombre exacto
**`POSTGRES_URL`**. Dejarlo vacío.

Variables que inyecta la integración (no se crean a mano):
`POSTGRES_URL` (pooled, la que usa la app), `POSTGRES_URL_NON_POOLING`
(directa), `DATABASE_URL`, `PGHOST`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`.

Tampoco se marcan las casillas «Create database branch for deployment»: crean
una rama de Neon por despliegue, y los datos viven en la rama principal.

## La región de la base y la de las funciones tienen que coincidir

Cada petición al API hace varias consultas SQL, y cada una es un viaje de ida y
vuelta. `vercel.json` no fija `regions`, así que las funciones corren en la
región por defecto del proyecto. Con la base en Frankfurt y las funciones en
Washington, cada consulta cruza el Atlántico.

Se ajusta en **Settings → Functions → Function Region**, o fijándolo en el repo
con `"regions": ["fra1"]` en `vercel.json`.

## Restaurar un volcado en Neon

Con la URL **directa** (`POSTGRES_URL_NON_POOLING`, sin `-pooler`), no la
pooled. El host no tiene `psql`; se usa el del contenedor:

```bash
docker compose exec -T -e NEON="$NEON" postgres \
  sh -c 'psql "$NEON" -v ON_ERROR_STOP=1 -q -f /backups/<fichero>.sql'
```

`backups/` está montado como `/backups:ro` dentro del contenedor.

Dos cosas que hacen fallar la restauración:

- El volcado trae `CREATE SCHEMA public;` y en Neon ya existe: hay que
  comentarlo o `ON_ERROR_STOP` aborta en la línea 26.
- El proxy `local-neon-http-proxy` crea un esquema `neon_control_plane` en el
  Postgres local. Volcar con `-n public` para no arrastrarlo.

Verificación que de verdad prueba algo: comparar md5 de los datos, no sólo
contar filas.

```sql
SELECT md5(string_agg(x,'|' ORDER BY x)) FROM (SELECT md5(matches::text) x FROM matches) s;
```

## Credenciales

`.env.local` guarda las cadenas de conexión y está en `.gitignore` (`.env*`).
`backups/` también está ignorado: contiene nombres de personas.

Relacionado: [[rama_viboras_es_produccion]], [[esquema_duplicado_y_desfasado]].
