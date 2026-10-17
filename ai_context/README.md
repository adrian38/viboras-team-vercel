# AI context

Contexto persistente para agentes que trabajan en `viboras-team-vercel`. Recoge
las trampas que leer el código no enseña: decisiones deliberadas que parecen
errores, duplicaciones que no se ven desde un fichero, y cosas que viven en
Vercel o en Neon y no en el repositorio.

**Este índice está completo y hay una guarda que lo exige**
(`node tools/ai-context-index.mjs`). Al añadir una nota, añadir aquí su línea.
Un índice a medias es peor que ninguno: quien lo lea creerá que ya ha visto lo
que hay.

`AGENTS.md`, en la raíz, contiene el flujo de trabajo y de verificación.

## El código

- `tamano_del_codigo_y_trinquete.md`: los techos de 60 líneas por función y 600
  de JavaScript por fichero, por qué en un `.html` se mide el JavaScript y no el
  total, cómo el baseline perdona lo que ya existía y sólo encoge, y qué no ve
  la guarda.

- `sistema_visual_viper_strike.md`: `theme.css` es la única copia de los
  tokens del tema oscuro y por qué no se tomaron de las maquetas, que se
  contradicen entre sí; qué trae la exportación de Stitch que se descartó a
  propósito —una barra lateral inventada en inglés— y qué páginas se quedaron
  sin maqueta; y cómo está hecha la pantalla de bienvenida del logo.

## El rating

- `motor_de_rating_duplicado.md`: el motor Glicko está implementado tres veces
  —`rating.html`, `players.html`, `rating-test.html`—, qué partes son idénticas
  byte a byte, cuál ya divergió a propósito y cómo se toca sin romper las otras; y cómo /players reparte el cambio del día entre sus partidos sin tocar el motor.
- `categorias_de_rating.md`: las cuatro categorías, a qué categoría pertenece un
  límite exacto y por qué una categoría nueva sin su CSS no falla, sólo se ve
  gris.
- `tabla_de_rating_en_movil.md`: por qué la tabla lleva `table-layout: fixed`,
  qué hace la media query de 560 px y cómo se mide un desborde en el DOM en vez
  de mirarlo a ojo.
- `exportar_jugadores.md`: el Excel de jugadores de los administradores, por
  qué sale de `/rating` y no de `/cuenta`, qué estados tiene (y por qué no hay
  «Rechazado») y a qué fecha calcula el rating. También cómo `excel-export.js`
  escribe los `.xlsx` sin librerías, que usan las dos descargas de la app.

## Datos y base de datos

- `esquema_duplicado_y_desfasado.md`: el esquema está escrito en `api/_db.js` y
  en `scripts/schema.sql`, sólo el primero se ejecuta, y el segundo rechaza
  datos que ya existen en producción.
- `neon_en_produccion.md`: por qué tiene que ser Neon y no otro Postgres, el
  prefijo de variables que no se rellena, la región de las funciones y cómo se
  restaura un volcado sin que aborte.
- `cuentas_y_sesiones.md`: la app entera va detrás de la sesión desde el
  2026-10-16, con correo o con Google; qué está cerrado y qué no, por qué el
  redirect del navegador no es la cerradura, por qué las tablas no están en
  `ensureSchema()`, por qué la lista del alta es sólo para antiguos piratas y
  oculta a quien ya tiene cuenta, por qué `league-admin.js` no admite ni una línea más, de
  dónde sale el primer administrador, la campanita, y los correos de aprobar,
  restablecer y confirmar (y por qué los enlaces nunca salen de la cabecera Host).
- `marcador_incompleto_se_rechaza.md`: qué cuenta como partido terminado, por
  qué la regla vive sólo en `api/_score.js` y no en las tres páginas que suben
  resultados, por qué los torneos quedan fuera y qué pasa con lo ya guardado.

## Entorno y despliegue

- `entorno_local_docker_y_proxies_neon.md`: los dos proxies que imitan a Neon en
  local, la trampa del `-pooler.` en la cadena de conexión y por qué un fichero
  estático nuevo da 404 hasta reconstruir la imagen.
- `rama_viboras_es_produccion.md`: `viboras` es la rama por defecto y un push
  despliega a producción sin paso intermedio; `master` está obsoleta.

## La app en el móvil

- `service_worker.md`: por qué la estrategia es red primero, por qué `/api`
  queda fuera del service worker, cómo se invalida la caché y cómo se prueba sin
  poder registrarlo en local.
- `iconos_pwa.md`: qué iconos hay y por qué, por qué el maskable va al 72 %, la
  limitación de reescalar desde 256 px y qué mirar cuando Chrome dice
  «Instalando…» y no aparece nada.

---

Actualizar estos documentos cuando cambien invariantes, contratos de datos o
decisiones que costaría volver a deducir. No guardar secretos, cadenas de
conexión ni datos personales del grupo.
