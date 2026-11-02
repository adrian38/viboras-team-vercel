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
  sin maqueta; y la pantalla de bienvenida: el vídeo del grupo recortado, por
  qué se cierra si no arranca en 1,5 s y por qué `sw.js` deja pasar los
  `Range`.
- `barra_de_navegacion.md`: la barra de pestañas inferior de las veinte
  páginas; por qué el marcado vive en `vt-nav.js` y el hueco en el `body` de
  `theme.css`, a dónde lleva cada pestaña y en qué páginas se enciende, por qué
  cuatro páginas no encienden ninguna y por qué no se portó el punto de avisos
  del buzón.
- `transicion_entre_pantallas.md`: el fundido al cambiar de pantalla, hoy tres
  reglas de CSS y ningún JavaScript; por qué duró un día el fundido a mano que
  iba al color del fondo, qué se gana (funde también los saltos con
  `window.location`), qué se paga (en Firefox no hay fundido) y por qué con el
  panel del navegador oculto no ocurre ninguna transición.
- `pantalla_de_carga.md`: el velo no se quita hasta que está pintado todo,
  cálculos incluidos; por qué lo que la tarea de arranque no espera aparece
  después y se ve como un flashazo, y cómo se mide en milisegundos.
- `boton_atras_y_parametro_volver.md`: sin router, el botón de atrás va a donde
  diga su `onclick`, y escribir `/` deja de valer en cuanto una pantalla tiene
  dos entradas; la convención `?volver=` y su regla contra el redirect abierto,
  por qué `history.back()` no sirve en una pestaña abierta con `target="_blank"`
  y por qué la etiqueta «Volver al inicio» tiene que cambiar con ella.

## El rating

- `motor_de_rating_duplicado.md`: el motor Glicko estaba implementado tres
  veces y desde el 2026-10-31 vive en `vt-glicko.js`; qué se quedó en cada
  página (el bucle de días), cuál era la única diferencia escondida, por qué
  en `players.html` los nombres van con `let`, y cómo /players reparte el
  cambio del día entre sus partidos sin tocar el motor.
- `valoraciones_y_avisos.md`: valorar a los compañeros tras un partido
  (ambiente y nivel), cómo los votos de nivel mueven el RD sin tocar el motor
  por dentro, quién puede editar un resultado y el aviso a los demás, y por
  qué sus tablas no están en `ensureSchema()`.
- `calificacion_de_estrellas.md`: la calificación de 1 a 5 del perfil no se
  vota, se calcula con las opiniones de ambiente y la fiabilidad del ranking
  (el RD del motor); por qué la proporción de opiniones a secas daba un 5,0 a
  todo el grupo, por qué se calcula en el navegador y en dos mitades, y qué
  fiabilidad inventada se quitó de en medio.
- `rating_de_partida.md`: las altas nuevas arrancan en el rating de su nivel BK
  (Entreno en 2000,01, no 2000), sólo si no tenían partidos, y por qué un alta
  sin partidos no sale en `/rating` por defecto.
- `categorias_de_rating.md`: las cuatro categorías, a qué categoría pertenece un
  límite exacto y por qué una categoría nueva sin su CSS no falla, sólo se ve
  gris.
- `tabla_de_rating_en_movil.md`: por qué la tabla lleva `table-layout: fixed`,
  qué hace la media query de 560 px y cómo se mide un desborde en el DOM en vez
  de mirarlo a ojo. También por qué `/statistics` se desplaza de lado con el
  nombre fijo.
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
  `ensureSchema()`, cómo un jugador antiguo se enlaza escribiendo su nombre,
  por qué rechazar marca la cuenta y no la borra, por qué `league-admin.js` se partió y qué se quedó dentro, de
  dónde sale el primer administrador, la campanita, y los correos de aprobar,
  restablecer y confirmar (y por qué los enlaces nunca salen de la cabecera Host).
- `marcador_incompleto_se_rechaza.md`: qué cuenta como partido terminado, por
  qué la regla vive sólo en `api/_score.js` y no en las tres páginas que suben
  resultados, por qué los torneos quedan fuera y qué pasa con lo ya guardado.
- `disponibilidad_quien_la_ve.md`: quién ha votado cada hora sólo lo ve un
  administrador; la restricción está en `getSlots` (`api/read.js`), no en el
  HTML, y por eso `/results` ya no se enlaza desde `/day`.
- `contar_partidos_de_un_jugador.md`: por qué `count(*)` sobre `matches` da un
  número equivocado: en los torneos las columnas de marcador son juegos y no
  sets, y un partido organizado y sin jugar está ahí con 0-0, que no es NULL.
  Con los números que salían de cada cuenta.

## Entorno y despliegue

- `entorno_dev_y_clon_neon.md`: la separación obligatoria entre `viboras` +
  Production + Neon `main` y `dev` + Preview + el clon `viboras_dev`; por qué
  `/neondb` no identifica la rama, la trampa de las variables Preview
  heredadas de producción, la auditoría reproducible y qué servicios externos
  siguen compartidos.
- `organizacion_de_carpetas.md`: una carpeta por pantalla dentro de `front/`,
  con `comun/` al lado; por qué la URL no cambió nunca y los 21 rewrites de
  `vercel.json` que lo sostienen; por qué `/index.html` tiene regla propia y
  `sw.js` no se puede mover; los cuatro botones que esto rompió; y qué guardas
  miraban a la raíz y habrían pasado verde vigilando la nada.
- `entorno_local_docker_y_proxies_neon.md`: los dos proxies que imitan a Neon en
  local, la trampa del `-pooler.` en la cadena de conexión y por qué un fichero
  estático nuevo da 404 hasta reconstruir la imagen.
- `rama_viboras_es_produccion.md`: qué publica Vercel (todo lo versionado,
  salvo `.vercelignore`) y cómo comprobarlo tras desplegar;
  `viboras` es la rama por defecto y un push
  despliega a producción sin paso intermedio; `master` está obsoleta.

## La app en el móvil

- `service_worker.md`: por qué la estrategia es red primero, por qué `/api`
  queda fuera del service worker, cómo se invalida la caché y cómo se prueba sin
  poder registrarlo en local.
- `iconos_pwa.md`: qué iconos hay y por qué, por qué el maskable va al 72 %, la
  limitación de reescalar desde 256 px y qué mirar cuando Chrome dice
  «Instalando…» y no aparece nada.
- `avisos_push.md`: los avisos de la campanita como notificación del móvil;
  qué manda push y desde dónde, por qué la pregunta sale una vez por cuenta y
  dispositivo y el permiso sólo desde un clic, el iPhone sin instalar, las
  variables VAPID de Vercel, la prioridad alta y el diagnóstico verificable
  de aceptado/recibido/mostrado/pulsado.

## Lo que escriben los miembros

- `buzon_de_quejas.md`: el buzón de quejas y sugerencias de `/buzon`; por qué
  no es anónimo, por qué «leído» es de cada administrador, por qué el push no
  lleva el texto y el límite de cinco por hora.
- `borrado_de_partidos.md`: por qué pueden eliminar un partido sus cuatro
  participantes y los administradores, y cómo la API comprueba la sesión y la
  identidad exacta de la fila antes de borrarla.

## Lo que lee el grupo

- `tablon_de_avisos.md`: el tablón de `/tablon`; por qué publicar avisa al
  grupo y editar no, por qué la foto va como data URL dentro de la fila y se
  pide aparte, los tres estados de la foto al editar, y qué traía la maqueta
  que no tenía de dónde salir.
- `comunidad_de_jugadores.md`: el directorio de `/comunidad`; de dónde sale
  cada casilla de la tarjeta, qué tres datos de admin se abrieron al grupo y
  qué no (las horas de `/day`), y por qué no enseña rating ni estrellas.

---

Actualizar estos documentos cuando cambien invariantes, contratos de datos o
decisiones que costaría volver a deducir. No guardar secretos, cadenas de
conexión ni datos personales del grupo.
