# CLAUDE.md

@AGENTS.md

Las reglas de trabajo están en `AGENTS.md`. Aquí sólo lo que depende de **este
equipo**: cómo se llama el proyecto en el índice, cómo se levanta el entorno y
cómo desatascar `codebase-memory-mcp` cuando falla.

## Nombre del índice en este equipo

La herramienta lo deriva de la ruta, así que cambia de equipo: confirmar con
`list_projects` antes de darlo por bueno. Comprobar frescura con `index_status`.

| Proyecto | Nombre en el índice |
| --- | --- |
| Este repositorio | `C-Users-Adrian-Adrian-REPOSITORIO-viboras-team-vercel` |

## Comandos

```bash
docker compose up -d --build        # entorno local -> http://localhost:3000
docker compose logs -f app          # ver las peticiones al API
npm run check                       # las dos guardas mecanicas
```

`/health` del entorno local dice contra qué base está hablando y cuántos
jugadores y partidos ve.

Para hablar con la base de producción no hay `psql` en el host; se usa el del
contenedor, con la URL directa de `.env.local`:

```bash
NEON=$(grep '^POSTGRES_URL_NON_POOLING=' .env.local | cut -d= -f2-)
docker compose exec -T -e NEON="$NEON" postgres sh -c 'psql "$NEON" -c "SELECT count(*) FROM matches;"'
```

## `codebase-memory-mcp` en este equipo

`.mcp.json` fija `CBM_CACHE_DIR` y `CBM_RUNTIME_DIR` en `C:\cbm`, igual que los
demás proyectos de este equipo. Desde la 0.10.8 el servidor **se niega a
arrancar si su caché cuelga del perfil**, y el síntoma es que se queda en
«connecting» sin dar error ni mostrar ninguna de sus herramientas.

### El servidor no aparece en una sesión abierta en otra carpeta

`.mcp.json` es de ámbito de proyecto: se carga al abrir la sesión en este
directorio. Si la sesión se abrió en otro sitio, sus herramientas **no existen**
aunque el fichero esté aquí. Hay que abrir la sesión en este proyecto y aprobar
el servidor cuando lo pregunte.

### «outside the allowed root» al reindexar

El servidor confina la indexación a las raíces grabadas en
`C:\cbm\cache\allowed_roots`, un fichero de texto con una ruta por línea. **No
es el `CBM_ALLOWED_ROOT` de `.mcp.json`**, que es otro mecanismo. Si este
repositorio no está en esa lista, su grafo se queda congelado:

```
codebase-memory-mcp allow-root "C:\Users\Adrian\Adrian\REPOSITORIO\viboras-team-vercel"
```

Mirar `allowed_roots` **antes** de grabar: con el fichero vacío, grabar una raíz
dejaría fuera a todas las demás.

### Reindexar por CLI

El CLI y el servidor son ejecutables y versiones distintas (0.9.0 contra
0.10.8), así que **que el CLI funcione no demuestra que el servidor arranque**.

```
"C:\Users\Adrian\AppData\Local\Programs\codebase-memory-mcp\codebase-memory-mcp.exe" cli index_repository --repo-path "C:\Users\Adrian\Adrian\REPOSITORIO\viboras-team-vercel" --mode full
```

El parámetro obligatorio es `repo_path`, no `project`.

### El síntoma es silencioso

Un grafo congelado no dice que lo está: contesta con rutas y líneas viejas, y un
símbolo recién escrito simplemente «no existe». Ante una respuesta que no cuadra
con el código, comprobar `index_status`.
