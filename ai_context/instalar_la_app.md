# Instalar la app: lo que se ofrece y lo que no se puede ofrecer

Puesto el 2026-11-03. El grupo reparte los enlaces por WhatsApp, así que mucha
gente usa la web en el navegador sin saber que la app existe.

## Abrir la app instalada desde el navegador no se puede

No hay API. Ningún navegador deja que una página lance su propia PWA, y por eso
no existe aquí ningún botón «Abrir en la app»: sería prometer un comportamiento
que no existe, que es una de las tres maneras de inventar que prohíbe
`AGENTS.md`.

Lo que sí se puede es que el enlace **no llegue al navegador**. Eso lo pide
`"handle_links": "preferred"` en `site.webmanifest`: cuando Chrome en Android
tiene instalado el WebAPK, un enlace a un sitio dentro de `scope` pulsado desde
fuera del navegador —WhatsApp, que es el caso del grupo— puede abrirse en la app
en vez de en una pestaña.

**No está comprobado.** Es una línea declarativa y no se puede medir en local:
hace falta el WebAPK real instalado desde un despliegue con HTTPS, y el entorno
de Docker sirve `http://localhost:3000`. Si alguna vez se comprueba en el móvil,
el resultado va aquí. En iPhone no hay nada que esperar: Safari nunca cede el
enlace a la app instalada.

## La oferta de instalar: `front/comun/instalar.js`

Pinta una fila fina en el hueco `<div id="vtInstalar">`, que hoy sólo tiene la
portada, entre el logo y las tarjetas. Fuera de `.site` a propósito: en
escritorio `.site` es una rejilla con áreas con nombre y una fila más
descuadraría las cuatro tarjetas.

El script no hace nada si no encuentra su hueco, así que llevarlo a otra página
son dos ediciones: su `<script>` en el `<head>` y el `<div>` donde toque. Va en
el `<head>` con `defer` y no al pie porque tiene que estar escuchando antes de
que Chrome emita `beforeinstallprompt`.

Dos ramas, porque los dos móviles del grupo no se parecen en esto:

| Dónde | Qué ofrece |
| --- | --- |
| Android, Chrome | El evento `beforeinstallprompt`, guardado y disparado desde el botón «Instalar»: instala en un toque. |
| iPhone | No hay API. Sólo dice dónde está: Compartir → «Añadir a pantalla de inicio». |

Nada de esto se pinta si la app está abierta desde su icono
(`display-mode: standalone`, o `navigator.standalone` en Safari).

Sus dos iconos, `install_mobile` y `close`, hubo que añadirlos a `icon_names`
del `@import` de `theme.css`. El síntoma de olvidarlo no es un hueco: la fila
salía con la palabra `install_mobile` escrita en texto, 238 px de ancho, y se
comía el sitio del botón. Lo avisa el comentario del `@import`, y se ve midiendo
el ancho del `.ms` (17 px si es glifo).

## Que `beforeinstallprompt` no llegue es la señal de que ya está instalada

Chrome no emite el evento cuando la app ya está puesta. Por eso en Android la
fila no se pinta hasta recibirlo, y quien la tiene instalada no recibe la oferta
aunque entre por el navegador.

Eso ahorró `navigator.getInstalledRelatedApps()`, que era la otra vía: obliga a
declarar `related_applications` en el manifiesto, en iOS devuelve siempre vacío
y no se puede comprobar en local. La ausencia del evento dice lo mismo y no
cuesta nada.

En iPhone no hay ninguna señal: alguien que la tenga instalada y además entre
por Safari verá la fila. Para eso está el aspa, que guarda la decisión en
`localStorage` (`vt-instalar-no-ofrecer-v1`). En Android el aspa también está,
pero ahí sobra en cuanto acepta: `appinstalled` quita la fila.

## Se dice dos veces en el iPhone

`avisos-push.js` ya tiene un estado `instalar` que pide lo mismo —instalar la
app— en el diálogo que sale al abrir, porque en iPhone **sin instalar no hay
push** ([[avisos_push]]). Son dos sitios con el mismo mensaje, cada uno por su
motivo: el diálogo habla de los avisos y sale una vez por sesión y sólo con la
sesión abierta; la fila habla de la app y se queda. Si alguna vez molesta, lo
que se quita es el estado `instalar` del diálogo, no la fila.

## El manifiesto no recarga en caliente

`site.webmanifest` está en la raíz y **no** en los `volumes:` de
`docker-compose.yml`: vive dentro de la imagen. Editarlo y recargar el navegador
no cambia nada hasta `docker compose up -d --build`. Es la trampa de
[[entorno_local_docker_y_proxies_neon]], y aquí pica fácil porque el fichero de
al lado —`front/comun/instalar.js`— sí recarga solo.

Relacionado: [[service_worker]], [[iconos_pwa]], [[avisos_push]].
