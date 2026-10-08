# El service worker es red primero, y `/api` queda fuera

`sw.js` existe para que Chrome en Android ofrezca «Instalar aplicación»
(un WebAPK con icono propio) en vez de «Añadir a pantalla de inicio» (un acceso
directo que abre el navegador con sus barras). Se registra desde `pwa.js`, que
cargan las 16 páginas.

## En un preview protegido, la consola se llena de errores del manifiesto

Si el despliegue tiene la Deployment Protection de Vercel activada, **todas**
las rutas responden 302 a `vercel.com/sso-api`. La navegación lleva la cookie
de sesión y la página carga, pero `site.webmanifest` se pide siempre en modo
CORS y **sin credenciales**: rebota al SSO, que es otro origen, y CORS lo corta.

Los errores salen en parejas y la segunda línea parece de aquí:

```
Access to fetch at 'https://vercel.com/sso-api?...' (redirected from
'.../site.webmanifest') ... blocked by CORS policy
The FetchEvent for ".../site.webmanifest" resulted in a network error response
```

El service worker no lo causa: intercepta, la red falla, mira en la caché, no
está, y devuelve `Response.error()`, que es lo que dice su código. Esa segunda
línea es, de hecho, la señal de que **está registrado y funcionando** — que es
justo lo que no se puede comprobar en local.

Por eso las 16 páginas llevan
`<link rel="manifest" href="/site.webmanifest" crossorigin="use-credentials">`:
así la petición manda la cookie, no la redirigen, y no queda nada que bloquear.
En producción no cambia nada, porque ahí no hay protección.

**`site.webmanifest` no está en `PRECACHE` a propósito.** `cache.addAll()` es
todo o nada: si una sola entrada falla, el `install` entero falla y el service
worker no llega a activarse. Meter ahí precisamente el recurso que puede fallar
en un preview protegido cambiaría un aviso en consola por quedarse sin service
worker.

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
