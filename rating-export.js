// "Exportar jugadores" de /rating: un Excel con cada jugador, su rating y lo que
// rellenó al inscribirse. Sólo para administradores.
//
// Vive aquí y no en el panel de /cuenta porque el rating no está en la base:
// lo calcula esta página, y llevarlo a otra obligaría a una cuarta copia del
// motor (ai_context/motor_de_rating_duplicado.md). Usa calculateEngineRatings,
// filterMatchesForCutoff, getFiabilidadConfig y TIER_DEFINITIONS de rating.html.
//
// El botón oculto es comodidad; quien protege los datos es exigirAdmin en
// /api/read?action=exportPlayers.
//
// Detalle: ai_context/exportar_jugadores.md
(function () {
  var boton = document.getElementById('exportPlayersBtn');
  if (!boton) return;

  window.vtMe.then(function (me) {
    if (me && me.role === 'admin') boton.hidden = false;
  });

  var CABECERA = [
    'Jugador', 'Estado', 'Rating', 'RD', 'Fiabilidad', 'Categoría', 'Partidos',
    'Correo', 'Correo confirmado', 'Rol', 'Alta', 'Aprobada', 'Rechazada',
    'Nombre completo', 'Teléfono', 'Prueba BK', 'Nivel BK', 'Liga', 'Torneos',
    'Ranking/semana', 'Disponibilidad'
  ];

  // Números de verdad, para que Excel ordene y sume; vacío si no hay.
  function numero(n, decimales) {
    return Number.isFinite(n) ? Number(n.toFixed(decimales)) : '';
  }

  function categoria(rating) {
    if (!Number.isFinite(rating)) return '';
    var tier = TIER_DEFINITIONS.find(function (t) { return rating > t.min && rating <= t.max; });
    return tier ? tier.title : '';
  }

  function fecha(valor) {
    return valor ? String(valor).slice(0, 10) : '';
  }

  // A la fecha más reciente del desplegable, que es la que la tabla enseña al
  // abrir, y sin sus filtros: la exportación es de todo el grupo. No vale
  // 'latest': calculateEngineRatings lo toma por fecha y devuelve todo a 1500.
  function ratingsPorNombre() {
    var opcion = document.getElementById('ratingDate').options[0];
    var corte = opcion ? opcion.value : undefined;
    var partidos = filterMatchesForCutoff(window._allMatches || [], corte);
    var jugados = new Map();
    partidos.forEach(function (m) {
      m.team1.concat(m.team2).forEach(function (n) {
        var k = String(n || '').trim();
        if (k) jugados.set(k, (jugados.get(k) || 0) + 1);
      });
    });
    var porNombre = new Map();
    calculateEngineRatings(window._allNames || [], partidos, corte).forEach(function (e) {
      porNombre.set(e.name, { rating: e.rating, rd: e.rd, partidos: jugados.get(e.name) || 0 });
    });
    return porNombre;
  }

  function fila(j, r) {
    var f = j.form || {};
    var rating = r ? r.rating : NaN;
    return [
      j.name, j.estado, numero(rating, 2), numero(r ? r.rd : NaN, 0),
      r ? getFiabilidadConfig(r.rd).label : '', categoria(rating), r ? r.partidos : '',
      j.email, j.email ? (j.emailVerified ? 'si' : 'no') : '', j.role,
      fecha(j.createdAt), fecha(j.approvedAt), fecha(j.rejectedAt),
      f.fullName, f.phone, f.bkTest, f.bkLevel, f.league, f.tournaments,
      f.rankingPerWeek, f.availability
    ];
  }

  async function exportar() {
    boton.disabled = true;
    try {
      var r = await fetch('/api/read?action=exportPlayers', { headers: { accept: 'application/json' } });
      if (!r.ok) throw new Error(r.status === 403 ? 'Sólo los administradores pueden exportar.' : 'HTTP ' + r.status);
      var datos = await r.json();
      var ratings = ratingsPorNombre();
      var filas = (datos.players || []).map(function (j) { return fila(j, ratings.get(j.name)); });
      filas.sort(function (a, b) { return String(a[0]).localeCompare(String(b[0]), 'es', { sensitivity: 'base' }); });
      vtExcel.descargar('jugadores-' + new Date().toISOString().slice(0, 10) + '.xlsx', 'Jugadores', [CABECERA].concat(filas));
    } catch (err) {
      alert('No se pudo exportar: ' + err.message);
    } finally {
      boton.disabled = false;
    }
  }

  boton.addEventListener('click', exportar);
})();
