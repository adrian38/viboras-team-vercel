# El esquema está escrito dos veces y una copia está desfasada

Hay dos definiciones del mismo esquema y **sólo una se ejecuta**:

| Fichero | Quién lo usa | Autoridad |
| --- | --- | --- |
| `api/_db.js` → `ensureSchema()` | Todas las funciones de `api/`, en cada arranque en frío | **Sí** |
| `scripts/schema.sql` | `npm run schema` (`scripts/apply-schema.js`), a mano | No |

`ensureSchema()` es idempotente (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF
NOT EXISTS`) y se memoiza por instancia de lambda, así que corre una vez por
arranque en frío, no por petición.

## La divergencia (comprobada el 2026-10-08)

El `CHECK` de `matches.format` no coincide:

- `api/_db.js`: `bo3_regular`, `bo3_stb`, `bo1_regular`, `timed_games`,
  **`timed_games_long`**.
- `scripts/schema.sql`: los cuatro primeros. **Le falta `timed_games_long`.**

Y en la base de datos de producción hay **12 partidos** con ese formato:

```
bo3_regular      186
timed_games       58
timed_games_long  12
bo3_stb            2
```

Consecuencia práctica: crear una base desde `scripts/schema.sql` da un esquema
que **rechaza datos que ya existen**. Si alguien restaura un volcado sobre él,
el `COPY` de `matches` falla con violación de restricción.

`schema.sql` tampoco tiene los índices ni el `substitution_groups` que
`ensureSchema()` añade por `ALTER TABLE`.

## Regla

- Para cambiar el esquema, se edita `api/_db.js`. Es lo que corre.
- `scripts/schema.sql` se actualiza en el mismo commit o no se toca; lo que no
  vale es dejarlo a medias, porque no falla: espera a que alguien lo use.
- Para montar una base nueva, preferir un volcado de la real
  (`pg_dump -n public --no-owner --no-privileges`) antes que `schema.sql`.
  Al restaurar en Neon hay que comentar el `CREATE SCHEMA public;` del volcado,
  que allí ya existe.

Relacionado: [[neon_en_produccion]], [[entorno_local_docker_y_proxies_neon]].
