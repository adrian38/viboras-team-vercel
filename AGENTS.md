# Instrucciones para agentes

## Alcance

- Este repositorio es `viboras-team-vercel`: la web del grupo de pádel Viboras
  Team. Estático (16 páginas HTML) más tres funciones serverless en `api/`,
  desplegado en Vercel sobre Neon Postgres.
- **`viboras` es la rama por defecto y la de producción.** Un push despliega al
  grupo sin paso intermedio. `master` existe y está obsoleta. Detalle en
  `ai_context/rama_viboras_es_produccion.md`.
- Preservar cambios ajenos; limitar cada modificación al objetivo pedido.
- No commitear nunca `.env.local` ni `backups/`: cadenas de conexión y nombres
  de personas. Ya están en `.gitignore`, no relajarlo.

## Leer `ai_context/` antes de escribir código

Es la primera consulta, no un buzón. Recoge lo que leer el código no enseña:
duplicaciones que no se ven desde un fichero, decisiones deliberadas que parecen
errores, y cosas que viven en Vercel o en Neon y no aquí.

Antes de tocar un área: `rg -il <tema> ai_context/` y leer lo que salga.

Al terminar algo que costó deducir, se escribe su nota **y se añade su línea al
`README.md` de esa carpeta**. Lo exige `node tools/ai-context-index.mjs`.

## Memoria de código

`codebase-memory-mcp` está configurado en `.mcp.json`. Configuración de este
equipo y sus fallos conocidos: `CLAUDE.md`.

1. Indexar al empezar una tarea de código.
2. `search_graph` / `search_code` para localizar símbolos y flujos, en lugar de
   `rg` para definiciones y relaciones.
3. Reindexar tras cambios estructurales y volver a consultar.

Dos límites propios de este proyecto. El primero es grande y conviene no
descubrirlo a mitad de una tarea:

- **El grafo no ve el JavaScript embebido en los `.html`, que es casi todo el
  código de la aplicación.** Comprobado el 2026-10-08 sobre un índice recién
  construido (298 nodos, 570 aristas): `search_graph "ensureSchema"` devuelve
  `api/_db.js:5-126`, mientras que `search_graph "calculateEngineRatings"`
  devuelve **0 resultados** pese a existir en `rating.html` y
  `rating-test.html`.

  Es decir: el grafo cubre `api/`, `scripts/`, `docker/`, `tools/`, `sw.js` y
  `pwa.js`, y nada más. Para el código de las páginas —rating, tablas,
  formularios, toda la interfaz— la vía fiable es `rg` sobre el nombre de la
  función. Un `search_graph` vacío **no significa que el símbolo no exista**.

- **El mismo símbolo existe varias veces.** `g`, `expected` o `formatRating`
  tienen varias definiciones legítimas y ninguna es «la buena»: ver
  `ai_context/motor_de_rating_duplicado.md`.

Nunca interpretar un resultado negativo del grafo como prueba de ausencia. Si la
memoria no arranca o queda desactualizada, continuar con lectura directa y `rg`,
y declarar la limitación en la entrega.

## Invariante: el motor de rating está triplicado

`rating.html`, `players.html` y `rating-test.html` implementan cada uno su
Glicko. Las cuatro primitivas (`g`, `expected`, `getEffectiveObservationRd`,
`getReliabilityWeight`) son **idénticas byte a byte** y tienen que seguir
siéndolo. `calculateEngineRatings` ya divergió a propósito.

- Guarda: `node tools/rating-parity.mjs`.
- Detalle y qué hacer: `ai_context/motor_de_rating_duplicado.md`.
- Un número que cambia en `/rating` y no en `/players` casi siempre es esto.

## Invariante: `api/_db.js` es el esquema que corre

`ensureSchema()` en `api/_db.js` crea y migra las tablas en cada arranque en
frío. `scripts/schema.sql` es una copia manual **desfasada** que hoy rechaza
datos existentes en producción. Para cambiar el esquema se edita `_db.js`.
Detalle: `ai_context/esquema_duplicado_y_desfasado.md`.

## Invariante: el `<head>` se cambia en las 16 páginas

No hay plantilla ni layout compartido: cada `.html` repite su `<head>`. Los
cinco elementos de la PWA —favicon, `apple-touch-icon`, `manifest`,
`apple-mobile-web-app-title`, `theme-color`— y el `<script src="/pwa.js">` están
copiados dieciséis veces.

Añadir uno a una sola página no da error: simplemente no funciona en las otras
quince. Al tocar el `<head>`, recorrer todas y comprobar el resultado:

```bash
grep -c '<etiqueta que sea>' *.html
```

## Tamaño del código: 60 líneas por función, 600 de JavaScript por fichero

No es estética, es el coste de leer. Una función de 60 líneas son unos 700
tokens y tres caben en la ventana sin pensarlo; por encima, cambiar tres líneas
obliga a cargar el fichero entero.

| Techo | Medida | Guarda | Perdonados |
| --- | --- | --- | --- |
| 60 líneas por función | declaraciones y arrow asignadas | `tools/code-size.mjs` | `tools/code-size-baseline.json` |
| 600 líneas de JavaScript por fichero | los `<script>` en línea, no el `.html` entero | `tools/code-size.mjs` | `tools/code-size-baseline.json` |

En un `.html` se mide **el JavaScript, no el fichero**: `players.html` tiene
1061 líneas pero 738 de código. El marcado es presentación y trocearlo no
abarata nada; el número baja cuando el JavaScript sale a un fichero propio, que
es el refactor que de verdad reduce el coste de leer.

**El baseline nació con 34 funciones y 6 ficheros perdonados**, que es el estado
del repositorio el día que se puso la guarda. Eso no es deuda que pagar antes de
seguir: está grabado para que lo nuevo no se esconda entre lo viejo.

- **Lo nuevo cumple.** Función o fichero nuevo por encima del techo: se parte.
  No se añade al baseline; la guarda no ofrece esa puerta.
- **El baseline sólo encoge.** `--write` escribe `min(actual, registrado)` sobre
  las entradas que ya había: nunca añade una ni sube un número, y una regresión
  sigue fallando después de ejecutarlo.
- **Una entrada caducada falla.** Lo perdonado que encoge, desaparece o baja del
  techo obliga a `node tools/code-size.mjs --write`. Así el trinquete aprieta.
- **La guarda no lo ve todo**: ni métodos de objeto, ni funciones anónimas, ni
  nada dentro de una plantilla. Un resultado vacío no prueba que no haya código.
- **No reescribir una página entera de paso.** Un refactor y un cambio de
  comportamiento nunca van en el mismo commit; y en estas páginas un refactor
  amplio no se puede verificar, porque no hay pruebas que lo respalden.
- **Antes de partir un fichero, buscar las guardas que lo nombran**
  (`rg -l <fichero> tools/`). `rating-parity.mjs` lee tres páginas por su
  nombre: partir una sin tocarlo la dejaría pasando mientras comprueba la mitad.

Detalle: `ai_context/tamano_del_codigo_y_trinquete.md`.

## El código no se edita a ciegas por el shell

Reescribir con un script de Node está bien —así se añadieron las etiquetas a las
dieciséis páginas— pero:

- Nada de heredocs para texto con `\n`, comillas o `$`. El texto se escribe con
  la herramienta de edición o, dentro de un script, leyendo y escribiendo el
  fichero.
- **Después de cualquier reescritura por script, leer el diff.** Es lo único que
  caza una sustitución que pilló de más.
- Un reemplazo que debía tocar 16 ficheros y toca 15 no avisa: el script tiene
  que **contar** lo que cambió y decirlo.

## Verificación

**No hay pruebas automáticas.** No existe framework de test ni CI. Fingir lo
contrario es la peor trampa de este repositorio, así que la verificación es
manual y está descrita aquí.

1. **Guardas mecánicas**, siempre antes de commitear:

   ```bash
   npm run check
   ```

   Ejecuta `tools/ai-context-index.mjs`, `tools/rating-parity.mjs` y
   `tools/code-size.mjs`.

2. **Entorno local**, que replica Vercel con Postgres propio:

   ```bash
   docker compose up -d --build
   # -> http://localhost:3000   /health dice si la base responde
   ```

   Un fichero estático nuevo necesita `--build`; si no, da 404 sólo en local
   (`ai_context/entorno_local_docker_y_proxies_neon.md`).

3. **Comprobar en el navegador, midiendo, no mirando.** Para layout, medir
   desbordes en el DOM; para datos, contrastar la respuesta del API contra un
   `SELECT` en la base. Una captura de pantalla no prueba que algo cabe.

4. **Lo que no se puede probar en local se prueba en producción y se dice.** Los
   service workers no se registran sobre `http://localhost`; para eso está el
   arnés descrito en `ai_context/service_worker.md`.

Si una comprobación no se pudo hacer, se declara en la entrega. No se da por
buena por parecerlo.

## Definición de terminado y entrega

Una tarea no está terminada hasta que `npm run check` queda verde, el diff se ha
leído y cada cambio está en su commit. La entrega indica:

- commits creados, y **si se hizo push o no** — recordando que push es desplegar;
- qué se comprobó y cómo, con los números concretos;
- qué no se pudo comprobar y por qué;
- qué le toca hacer al usuario (ajustes en el panel de Vercel, avisar al grupo,
  rotar credenciales);
- estado del árbol: limpio, o qué cambios ajenos permanecen.
