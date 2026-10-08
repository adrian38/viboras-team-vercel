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

const CACHE = 'viboras-v1';

// Lo minimo para que la app abra aunque no haya cobertura.
const PRECACHE = [
  '/',
  '/index.html',
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
