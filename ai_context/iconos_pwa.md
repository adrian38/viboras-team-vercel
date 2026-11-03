# Iconos de la app: el favicon no basta

Añadida la web a la pantalla de inicio, Android generaba un icono con la inicial
del título en vez del logo. El favicon suelto (`<link rel="icon">`) no sirve para
eso: hacen falta un **web manifest** y un **apple-touch-icon**.

## Qué hay

| Fichero | Para qué |
| --- | --- |
| `image.png` (256×256) | El logo. Es la **única fuente** que existe en el repo. |
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
resuelven esas dos URLs. El rewrite mira el host: cualquier
`*-git-*.vercel.app` —el alias estable de una rama— se lleva los de pruebas, y
todo lo demás los de producción.

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

## Limitación conocida

`icon-512.png` está **reescalado desde 256 px**, que es lo más grande que hay en
el repo (el `favicon.ico` tampoco pasa de 256). Si aparece el logo original en
mayor resolución, regenerar los tres tamaños sin interpolar.

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
