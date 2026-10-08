// Registro del service worker (ver sw.js). Se carga desde todas las paginas
// para que la app quede instalable aunque se entre directamente a /rating o
// a /players, no solo por la portada.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('No se pudo registrar el service worker:', err);
    });
  });
}
