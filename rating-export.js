// "Exportar jugadores" de /rating: un CSV con cada jugador, su rating y lo que
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
    'jugador', 'estado', 'rating', 'rd', 'fiabilidad', 'categoria', 'partidos',
    'correo', 'correo_confirmado', 'rol', 'alta', 'aprobada',
    'nombre_completo', 'telefono', 'prueba_bk', 'nivel_bk', 'liga', 'torneos',
    'ranking_semana', 'disponibilidad'
  ];

  // Excel ejecuta como fórmula lo que empieza por = + - @, y los nombres y el
  // teléfono los escribe quien se registra.
  function celda(valor) {
    var s = valor === undefined || valor === null ? '' : String(valor);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function numero(n, decimales) {
    return Number.isFinite(n) ? n.toFixed(decimales).replace('.', ',') : '';
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
      fecha(j.createdAt), fecha(j.approvedAt),
      f.fullName, f.phone, f.bkTest, f.bkLevel, f.league, f.tournaments,
      f.rankingPerWeek, f.availability
    ];
  }

  function descargar(texto) {
    var blob = new Blob(['﻿' + texto], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'jugadores-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
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
      descargar([CABECERA].concat(filas).map(function (f) { return f.map(celda).join(';'); }).join('\n'));
    } catch (err) {
      alert('No se pudo exportar: ' + err.message);
    } finally {
      boton.disabled = false;
    }
  }

  boton.addEventListener('click', exportar);
})();
