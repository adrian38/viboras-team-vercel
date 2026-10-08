# El service worker es red primero, y `/api` queda fuera

`sw.js` existe para que Chrome en Android ofrezca «Instalar aplicación»
(un WebAPK con icono propio) en vez de «Añadir a pantalla de inicio» (un acceso
directo que abre el navegador con sus barras). Se registra desde `pwa.js`, que
cargan las 16 páginas.

## La estrategia es deliberada

**Red primero, caché sólo como respaldo.** En una app de resultados una caché
agresiva es peor que no tener nada: enseñaría partidos viejos como si fueran los
de hoy. Invertir esto —*cache first*— rompe el producto aunque la pantalla
cargue más rápido.

Reglas del handler de `fetch`:

- Sólo `GET` y sólo del propio origen.
- **`/api/` no se intercepta en absoluto.** Los datos vienen siempre de la base.
- Sólo se guarda en caché lo que responde `ok`, para no cachear un 500.
- Sin red: se sirve la copia; si no hay copia y es una navegación, la portada;
  si no es navegación, `Response.error()` — nunca HTML en lugar de una imagen.

## Cómo se invalida

Cambiar `const CACHE = 'viboras-v1'` a `v2`. El `activate` borra toda caché cuyo
nombre no sea el actual. `skipWaiting()` + `clients.claim()` hacen que la
versión nueva tome el control sin esperar a que se cierren las pestañas.

## Es pegajoso

Una vez registrado en el móvil de alguien, el service worker se queda hasta que
desinstala la app o hasta que se despliega un `sw.js` que se autodesregistre. Por
eso la estrategia conservadora no es opcional: lo peor que puede pasar es ver
contenido viejo **estando sin conexión**, nunca estando con conexión.

## Cómo se prueba

No se puede registrar sobre `http://localhost` en el navegador integrado. Las
dos vías:

1. **Arnés de Node**, que ejecuta `sw.js` fuera del navegador con `vm` y dobles
   de `caches`/`fetch`, y comprueba las decisiones del handler: que `/api`, los
   `POST` y los otros orígenes no se intercepten, que un 500 no se cachee, que
   sin red se sirva la copia. 13 comprobaciones.
2. **En producción sobre HTTPS**, verificando desde la consola que
   `navigator.serviceWorker.controller` existe y que `caches.open('viboras-v1')`
   no contiene ninguna entrada de `/api`.

Vercel sirve `sw.js` con `Cache-Control: public, max-age=0, must-revalidate`,
que es lo correcto para que las versiones nuevas se recojan.

Relacionado: [[iconos_pwa]], [[entorno_local_docker_y_proxies_neon]].
