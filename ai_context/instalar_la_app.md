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

Dos ramas, porque los dos navegadores dan cosas distintas:

- **Android/Chrome**: el evento `beforeinstallprompt`, guardado y disparado
  desde el botón «Instalar», que instala en un toque. La fila no se pinta hasta
  recibirlo.
- **iPhone/Safari**: no hay evento ni API que instale, así que la fila son
  instrucciones —Compartir → «Añadir a pantalla de inicio»—, sin botón, y se
  pinta al cargar.

Nada se pinta si la app está abierta desde su icono (`display-mode: standalone`,
o `navigator.standalone` en Safari). La detección de iOS es la misma que la de
`avisos-push.js`, con su `MacIntel` + `maxTouchPoints` para el iPad.

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

El aspa es «ahora no», no «nunca más»: guarda el cierre en **`sessionStorage`**
(`vt-instalar-cerrado`), así que la fila vuelve en la siguiente apertura.
Empezó en `localStorage` y duraba para siempre; se cambió el 2026-11-03 porque
mientras no esté instalada sigue habiendo algo que ofrecer, y un «no» de hace
tres semanas no es la respuesta de hoy. Lo que de verdad la calla es
instalarla: `appinstalled` quita la fila y el evento ya no vuelve a llegar.

## En iPhone se pregunta, porque allí no se puede saber

En Android la regla es que la fila sólo sale si **no** la tienes instalada. En
Safari eso no se puede saber:

- La app instalada en la pantalla de inicio tiene su **propio almacenamiento**.
  Ni `localStorage` ni una cookie escritos desde dentro de la app se leen desde
  Safari, así que no sirve que la app se marque a sí misma.
- `navigator.standalone` sólo es `true` dentro de la app; desde Safari no dice
  nada de si existe.
- `navigator.getInstalledRelatedApps()` no está en iOS.
- No hay `appinstalled`: iOS no avisa de que se añadió a la pantalla de inicio.

La única vía que quedaría es marcarlo en el servidor cuando la cuenta abre la
app en modo standalone, y eso diría «esta **cuenta** la abrió instalada alguna
vez», no «este **teléfono** la tiene». A quien entra desde el iPad le mentiría.

**Se asume el punto ciego, y por eso el texto pregunta.** Del 2026-11-03 al
mismo día, en iPhone no se pintaba nada; se añadió la rama porque el grupo
reparte los enlaces por WhatsApp y en iOS ésos abren Safari, así que quien no
tiene la app no se entera nunca de que existe. Lo que **no** se puede hacer es
decirle «instala la app» a quien ya la tiene abriendo ese mismo enlace: el
título es `¿Tienes la app en el móvil?` y el detalle empieza por «Si aún no».
Pregunta, no afirma, que es la diferencia entre una fila inútil y una etiqueta
falsa (`AGENTS.md`, «ningún dato de la pantalla es inventado»). El aspa la
calla hasta la siguiente apertura.

Mismo punto ciego, y la misma explicación, en el diálogo de `avisos-push.js`
(estado `instalar`), que es donde de verdad importa —en iPhone sin instalar no
hay push— y que además sólo sale con la sesión abierta, una vez por sesión, y
lleva su «no volver a recordármelo».

## El manifiesto no recarga en caliente

`site.webmanifest` está en la raíz y **no** en los `volumes:` de
`docker-compose.yml`: vive dentro de la imagen. Editarlo y recargar el navegador
no cambia nada hasta `docker compose up -d --build`. Es la trampa de
[[entorno_local_docker_y_proxies_neon]], y aquí pica fácil porque el fichero de
al lado —`front/comun/instalar.js`— sí recarga solo.

Relacionado: [[service_worker]], [[iconos_pwa]], [[avisos_push]].
