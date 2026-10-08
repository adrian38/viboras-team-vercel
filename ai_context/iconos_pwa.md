# Iconos de la app: el favicon no basta

Añadida la web a la pantalla de inicio, Android generaba un icono con la inicial
del título en vez del logo. El favicon suelto (`<link rel="icon">`) no sirve para
eso: hacen falta un **web manifest** y un **apple-touch-icon**.

## Qué hay

| Fichero | Para qué |
| --- | --- |
| `image.png` (256×256) | El logo. Es la **única fuente** que existe en el repo. |
| `apple-touch-icon.png` (180) | iOS. |
| `icon-192.png`, `icon-512.png` | Android, `purpose: any`. |
| `icon-maskable-512.png` | Android, `purpose: maskable`: logo al **72 %** sobre fondo negro. |
| `site.webmanifest` | `display: standalone`, nombre corto «Viboras». |

Las cuatro etiquetas (`apple-touch-icon`, `manifest`,
`apple-mobile-web-app-title`, `theme-color`) están en el `<head>` de las 16
páginas.

## Por qué el maskable va reducido

Android aplica una máscara —círculo, squircle, lo que use el lanzador— sobre el
icono. El logo ocupa todo el cuadrado y el texto «TEAM» llega al borde: a tamaño
completo, la máscara se lo come. El 72 % deja la zona segura.

## Fondo negro, no transparente

Los iconos se generan **componiendo sobre negro opaco**. iOS no admite
transparencia en el apple-touch-icon: la rellena de negro por su cuenta, y el
logo ya tiene fondo oscuro, así que queda coherente.

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
