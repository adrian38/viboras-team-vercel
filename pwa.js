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

// Confirmacion comun para cualquier guardado. Al ir fuera del flujo no cambia
// los margenes del formulario ni desplaza sus botones.
let vtToastTimer;
window.vtToast = function vtToast(mensaje, duracion = 3000) {
  let toast = document.getElementById('vtToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'vtToast';
    toast.className = 'vt-toast';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    document.body.appendChild(toast);
  }
  clearTimeout(vtToastTimer);
  toast.textContent = mensaje;
  toast.classList.add('vt-toast--visible');
  vtToastTimer = setTimeout(() => toast.classList.remove('vt-toast--visible'), duracion);
};
