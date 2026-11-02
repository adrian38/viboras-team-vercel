// Lo que pinta /group-normativa.
//
// Hasta el 2026-11-01 estas lineas vivian dentro de group-normativa.html. Salen
// aqui sin tocar una coma; el <script> de la pagina las carga en el mismo
// sitio y sin defer, para que el orden de ejecucion no cambie.

// Era `history.back()`, y desde /cuenta esta página se abre con target="_blank":
// en una pestaña recién abierta no hay historia y el botón no hacía nada. Ahora
// lo dice quien trajo aquí, con ?volver=. Sólo rutas de este sitio —una que
// empiece por // o por http sería un redirect abierto—, la misma regla que
// `goBack()` en day.html. Sin ese parámetro, a la portada, que es de donde se
// llega desde el botón de la barra.
function volverAtras(){
  const v = new URLSearchParams(location.search).get('volver') || '/'
  window.location = (v.startsWith('/') && !v.startsWith('//')) ? v : '/'
}
