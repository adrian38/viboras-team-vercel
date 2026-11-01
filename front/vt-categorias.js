// Los cortes de categoria y de fiabilidad, en un solo sitio.
//
// Son presentacion: agrupan lo que calcula el motor, no intervienen en el
// calculo. Pero han cambiado dos veces en una semana, asi que esparcirlos por
// las paginas sale caro: ai_context/categorias_de_rating.md lo dice y aun asi
// /cuenta nacio con su propia copia, con los numeros de los puntos de salida
// de la prueba de BK en lugar de estos, y colgaba de Intermedio a quien es
// Avanzado.
//
// Vive aqui y no en vt-glicko.js porque el motor no sabe de categorias: le dan
// igual los nombres con los que se enseña su numero.
;(function(){

// El limite pertenece a la categoria de arriba: el filtro es
// `rating > min && rating <= max`, asi que un 1600,00 clavado es Avanzado.
// `key` se usa como clase CSS (`tier-${key}`) en la tabla de /rating.
const TIER_DEFINITIONS = [
  { key: 'entreno', title: 'Entreno', rangeText: '> 2000,00 pts', min: 2000, max: Infinity },
  { key: 'avanzado', title: 'Avanzado', rangeText: '1600,01 – 2000,00 pts', min: 1600, max: 2000 },
  { key: 'intermedio', title: 'Intermedio', rangeText: '1200,01 – 1600,00 pts', min: 1200, max: 1600 },
  { key: 'iniciacion', title: 'Iniciación', rangeText: '≤ 1200,00 pts', min: -Infinity, max: 1200 }
]

// El nombre de la categoria de un rating, con la misma regla que la tabla.
function categoriaDeRating(rating){
  if(!Number.isFinite(rating)) return ''
  const tier = TIER_DEFINITIONS.find((t) => rating > t.min && rating <= t.max)
  return tier ? tier.title : ''
}

// Cuanto se fia el motor de ese numero, por el RD. Los colores son el rojo ->
// verde de las insignias de rating-info.html, aclarados para que se lean sobre
// el carbono.
function getFiabilidadConfig(rd) {
  if (rd === undefined || rd === null) return { bars: 0, color: '', label: '' };
  const v = Number(rd);
  if (!Number.isFinite(v)) return { bars: 0, color: '', label: '' };

  if (v >= 350) return { bars: 0, color: 'var(--vt-loss)', label: 'Sin fiabilidad' };
  if (v < 100) return { bars: 5, color: 'var(--vt-win)', label: 'Muy alta' };
  if (v < 140) return { bars: 4, color: 'var(--vt-lime)', label: 'Alta' };
  if (v < 190) return { bars: 3, color: 'var(--vt-yellow)', label: 'Media' };
  if (v < 250) return { bars: 2, color: 'var(--vt-orange)', label: 'Baja' };
  return { bars: 1, color: 'var(--vt-loss)', label: 'Muy baja' };
}

// Globales a pelo porque asi los usan rating.html y rating-export.js desde
// antes de que esto fuera un fichero aparte.
window.TIER_DEFINITIONS = TIER_DEFINITIONS
window.getFiabilidadConfig = getFiabilidadConfig
window.categoriaDeRating = categoriaDeRating

})()
