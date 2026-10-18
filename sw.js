// Service worker de Viboras Team.
//
// Estrategia deliberadamente conservadora: red primero, cache solo como
// respaldo. En una app de resultados una cache agresiva es peor que no tener
// nada, porque ensenaria partidos viejos como si fueran los de hoy.
//
// Las llamadas a /api nunca pasan por aqui: los datos vienen siempre de la
// base de datos.
//
// Para forzar que todos los navegadores descarten lo cacheado, cambia CACHE.

const CACHE = 'viboras-v2';

// Lo minimo para que la app abra aunque no haya cobertura.
//
// theme.css entra aqui desde el tema oscuro: lo cargan las 16 paginas y sin
// el la portada abre sin estilos, texto negro sobre blanco.
const PRECACHE = [
  '/',
  '/index.html',
  '/theme.css',
  '/image.png',
  '/icon-192.png',
  '/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;
  // Los videos (splash.mp4) se piden por trozos: la respuesta es un 206 y la
  // cache no admite respuestas parciales. Directos a la red.
  if (req.headers.has('range')) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        // Solo se guarda lo que ha ido bien, para no cachear un 500.
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => {
        if (hit) return hit;
        // Sin red y sin copia: si es una navegacion, al menos la portada.
        if (req.mode === 'navigate') return caches.match('/index.html');
        return Response.error();
      }))
  );
});

// Avisos push (api/_push.js). Llegan con la app cerrada; el texto es el mismo
// que el de la campanita. Detalle: ai_context/avisos_push.md
self.addEventListener('push', (event) => {
  let d = {};
  try {
    d = event.data ? event.data.json() : {};
  } catch (e) {
    d = { body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(self.registration.showNotification(d.title || 'Víboras Team', {
    body: d.body || '',
    icon: '/icon-192.png',
    data: { url: d.url || '/' }
  }));
});

// Solo enlaces de la propia app: lo que venga de fuera abre la portada.
function destino(url) {
  const u = new URL(url || '/', self.location.origin);
  return u.origin === self.location.origin ? u.href : self.location.origin + '/';
}

// Si la app ya esta abierta se lleva alli; si no, se abre.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = destino(event.notification.data && event.notification.data.url);
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((ventanas) => {
      const abierta = ventanas.find((v) => new URL(v.url).origin === self.location.origin);
      if (!abierta) return self.clients.openWindow(url);
      return abierta.focus()
        .then((v) => (v || abierta).navigate(url))
        .catch(() => self.clients.openWindow(url));
    })
  );
});
