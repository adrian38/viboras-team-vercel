# Iconos de la app: el favicon no basta

Añadida la web a la pantalla de inicio, Android generaba un icono con la inicial
del título en vez del logo. El favicon suelto (`<link rel="icon">`) no sirve para
eso: hacen falta un **web manifest** y un **apple-touch-icon**.

## Qué hay

| Fichero | Para qué |
| --- | --- |
| `image.png` (256×256) | El logo, y el favicon de las páginas (`<link rel="icon">`). |
| `favicon.ico` | El favicon de quien pide `/favicon.ico` a pelo. 16 a 256 px. |
| `icon-192.png`, `icon-512.png` | Android, `purpose: any`. |
| `icon-maskable-512.png` | Android, `purpose: maskable`: logo al **72 %** sobre fondo negro. |
| `front/iconos/site.webmanifest` | `display: standalone`, nombre corto «Viboras». |
| `front/iconos/apple-touch-icon.png` (180) | iOS. |
| `front/iconos-dev/` | Los mismos, con el fondo violeta. Ver abajo. |

Las cuatro etiquetas (`apple-touch-icon`, `manifest`,
`apple-mobile-web-app-title`, `theme-color`) están en el `<head>` de las 18
páginas.

## Por qué el maskable va reducido

Android aplica una máscara —círculo, squircle, lo que use el lanzador— sobre el
icono. El logo ocupa todo el cuadrado y el texto «TEAM» llega al borde: a tamaño
completo, la máscara se lo come. El 72 % deja la zona segura.

## Fondo negro, no transparente

Los iconos se generan **componiendo sobre negro opaco**. iOS no admite
transparencia en el apple-touch-icon: la rellena de negro por su cuenta, y el
logo ya tiene fondo oscuro, así que queda coherente.

## La rama `dev` instala un icono violeta

Quien prueba tiene las dos apps en el mismo móvil —la del grupo y la del
despliegue de `dev`— y eran idénticas. Desde el 2026-11-03 la de pruebas lleva
el fondo violeta (`#7C3AED`) y se llama «Viboras dev».

Son dos juegos de ficheros y un rewrite que elige:

```
front/iconos/       site.webmanifest, apple-touch-icon.png     produccion
front/iconos-dev/   los mismos + icon-192/512/maskable-512     ramas de pruebas
```

**Las páginas no cambian.** Siguen pidiendo `/site.webmanifest` y
`/apple-touch-icon.png`, igual en las veinte; lo que cambia es a qué fichero
resuelven esas dos URLs. El rewrite mira el host: `*-git-dev-*.vercel.app` —el
alias estable de la rama `dev`— se lleva los de pruebas, y todo lo demás los de
producción.

### Por qué el patrón nombra a `dev` y no a cualquier rama

La primera versión decía `*-git-*`, con la idea de que cualquier rama de
pruebas quedara cubierta. Está mal: **Vercel crea un alias de rama también
para `viboras`**, `viboras-team-vercel-git-viboras-<scope>.vercel.app`, y ése
lleva `-git-` igual que los demás. Por esa URL, producción habría instalado el
icono de pruebas.

El precio es que una rama de pruebas nueva no se lleva el violeta hasta que se
la añada aquí a mano. Es el lado barato de equivocarse: olvidarlo deja la rama
nueva con el icono del grupo, no al revés.

### Por qué hubo que sacarlos de la raíz

Vercel mira **primero el sistema de ficheros y sólo después las
reescrituras**. Con `site.webmanifest` en la raíz, el rewrite por host no se
dispara nunca: el fichero existe y gana. Por eso los dos se movieron a
`front/iconos/`, para dejar la URL libre, y producción también pasa hoy por un
rewrite.

Un `redirect` sí corre antes del sistema de ficheros y habría evitado la
mudanza, pero `apple-touch-icon.png` está en el `PRECACHE` de `sw.js` y
`cache.addAll()` con una respuesta redirigida no está claro que no reviente el
`install` entero. Un rewrite no redirige: la URL responde 200 y el service
worker no nota nada.

### Qué NO cambia en `dev`

`background_color` y `theme_color` del manifiesto de pruebas siguen en negro,
como los de producción. Son el fondo de la pantalla de arranque de la PWA, que
iguala el negro de `splash.mp4` (`pantalla_de_carga.md`): en violeta, `dev`
dejaría de servir para probar el arranque, que es para lo que está.

Tampoco cambian `image.png` ni `icon-512.png` de la raíz, que además del
manifiesto son logo visible dentro de las páginas —la portada y las cabeceras—.
Una página de `dev` tiene que verse como la de producción.

Y el icono de los avisos push sigue siendo el de producción:
`sw.js` lo nombra a pelo (`icon: '/icon-192.png'`) y ese fichero es uno solo.

### Generar los de pruebas

```bash
python tools/iconos-dev.py      # necesita Pillow, no es dependencia del proyecto
```

Pinta el fondo por inundación desde los bordes, no sustituyendo el negro: el
logo tiene negro dentro y un reemplazo global lo borraría. Detalle en la
cabecera del script.

### En local

`docker/server.js` sirve los de producción. Para ver los de pruebas:

```bash
ICONOS=dev docker compose up -d
```

El rewrite de `vercel.json` **no se puede probar en local**; lo que se prueba
aquí es su equivalente en `server.js`. Si falla, falla primero en el
despliegue de `dev`, que es donde esta rama va.

### El icono instalado no se refresca solo

Lo de abajo vale también para esto: el móvil que ya tuviera instalada la app de
`dev` seguirá viendo el icono negro hasta que se desinstale y se vuelva a
instalar.

## Desde el 2026-11-27: los iconos de Navidad

Todos los ficheros de la tabla de arriba, los de `front/iconos-dev/`
incluidos, son hoy el logo con gorro de Papá Noel. Salen de
`brand_christmas.jpeg` (1254×1254), que trajo Adrián y **no está en git**.
Con un original más grande que 512 el `icon-512.png` ya no está reescalado
hacia arriba, como pasaba con el logo de 256.

Se hicieron **sobrescribiendo los ficheros**, sin tocar las páginas ni los
manifiestos. Así, volver al logo de siempre es deshacer el commit
«iconos: los de Navidad», o sacar esos ficheros del commit anterior a él:

```bash
git checkout <commit>^ -- image.png favicon.ico icon-192.png icon-512.png icon-maskable-512.png front/iconos/apple-touch-icon.png front/iconos-dev/
```

Cómo se generaron: cada tamaño reducido con Lanczos desde el original; el
maskable, al 72 % sobre negro opaco como el anterior; el `.ico` con 16, 32,
48, 64, 128 y 256; `image.png` en paleta de 256 colores, como estaba el
anterior (44 KB; en color real pesaba 122 KB, y lo pide cada página como
favicon). La paleta le apaga el morado de la lengua: vale para favicon, no
para enseñarlo grande, que para eso está `logo_navidad.jpg`. Los de `dev` con `tools/iconos-dev.py`, al que hubo que
bajarle `FONDO` de 36 a 8: el razonamiento está en el propio script.

Lo que **sigue con el logo de siempre**:

- **Los correos.** `api/_logo.js` está generado desde `image.png` pero es una
  copia en base64: no cambia sola. Ojo al revés: si se regenera ahora, saldrá
  el de Navidad.
- **Los iconos ya instalados.** Ver abajo: hay que desinstalar y volver a
  instalar.

Y lo que cambia sin que se note a primera vista: el icono de los **avisos
push**, que `sw.js` nombra a pelo como `/icon-192.png`.

## Los iconos ya instalados no se refrescan

Quien tuviera el acceso directo creado antes sigue viendo el icono viejo: la
pantalla de inicio lo cachea. Hay que borrar el acceso directo y volver a
añadirlo. No es un fallo del despliegue y se pregunta cada vez.

## Instalación en Android

Chrome lanza «Instalando…» y es **Google Play Services** quien genera el WebAPK.
Si no aparece nada:

- Mirar primero en el **cajón de aplicaciones**: suele instalarse ahí, no en la
  pantalla de inicio. Si el menú de Chrome ya dice «Abrir aplicación», está.
- MIUI/Xiaomi bloquea por defecto que las apps creen iconos: Ajustes →
  Aplicaciones → Chrome → Otros permisos → «Crear accesos directos en la
  pantalla de inicio».
- Sin servicios de Google no hay WebAPK posible, sólo acceso directo.

Relacionado: [[service_worker]].
