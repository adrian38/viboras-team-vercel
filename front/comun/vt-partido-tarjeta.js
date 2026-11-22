// La tarjeta de un partido previsto y las llamadas que la mueven.
//
// Vive en comun/ porque la pintan cuatro pantallas: /partidos, /partido,
// /partidos-abiertos y la vista previa de /partido-nuevo. Duplicarla seria
// garantizar que diverjan, que es la leccion de ai_context/
// motor_de_rating_duplicado.md.
//
// Todo lo que se pinta sale del partido que devolvio el servidor. No hay ni
// un dato de relleno: una plaza sin jugador se ensena como hueco, y lo que
// no viene en la respuesta no aparece.
(function () {
  const MESES_OPC = { timeZone: 'Europe/Madrid' };

  const escapar = (t) => String(t == null ? '' : t)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  const hora = (iso) => new Date(iso).toLocaleTimeString('es-ES', { ...MESES_OPC, hour: '2-digit', minute: '2-digit' });

  // «SÁB 5 DIC · 19:00 – 21:00»
  function cuando(partido) {
    const dia = new Date(partido.empieza).toLocaleDateString('es-ES', { ...MESES_OPC, weekday: 'short', day: 'numeric', month: 'short' });
    const fin = new Date(new Date(partido.empieza).getTime() + partido.duracion * 60000);
    return `${dia.replace(',', '')} · ${hora(partido.empieza)} – ${hora(fin)}`;
  }

  // Iniciales de un nombre: «Carlos Gómez» -> «CG». De una sola palabra, sus
  // dos primeras letras. Es presentacion, no un dato nuevo.
  function iniciales(nombre) {
    const trozos = String(nombre).trim().split(/\s+/);
    if (trozos.length > 1) return (trozos[0][0] + trozos[1][0]).toUpperCase();
    return trozos[0].slice(0, 2).toUpperCase();
  }

  // El lado de pista de cada puesto, SOLO en la rejilla 2x2. Es una etiqueta
  // de la posicion en el dibujo, no un dato del jugador: nadie elige lado al
  // apuntarse y el servidor da el hueco mas bajo que quede. Por eso dice
  // «Drive» y no «juega al drive», y por eso no sale en la lista estrecha,
  // donde sin la rejilla delante no se entenderia como una posicion.
  const LADOS = { 1: 'Drive', 2: 'Revés', 3: 'Drive', 4: 'Revés' };

  const ladoHtml = (plaza, o) => (o.rejilla
    ? `<span class="vt-plaza__lado">${LADOS[plaza.puesto] || ''}</span>` : '');

  // El nivel del apuntado: la categoria que guardo el ultimo recalculo. Si no
  // viene, no se pinta nada; no hay valor de relleno para «no se sabe».
  const nivelHtml = (plaza, o) => (o.rejilla && plaza.categoria
    ? `<span class="vt-plaza__nivel">${escapar(plaza.categoria)}</span>` : '');

  function plazaHtml(plaza, partido, opciones) {
    const propuesta = opciones.propuestaEn === plaza.puesto && !plaza.playerId;
    const lado = ladoHtml(plaza, opciones);
    if (propuesta) {
      return `<div class="vt-plaza vt-plaza--propuesta">${lado}
        <span class="vt-plaza__ficha">${escapar(iniciales(opciones.yoSoy))}</span>
        <span class="vt-plaza__nombre">${escapar(opciones.yoSoy)}</span>
        <span class="vt-plaza__pie">Sin guardar</span></div>`;
    }
    // El icono va DENTRO de la ficha y no en la misma etiqueta: la ficha
    // impone la fuente del titular, que le ganaria a la de los iconos y
    // pintaria la palabra «add» dentro del circulo.
    // Un hueco al que puedo moverme es un boton, no un div: se pulsa, y con
    // el teclado tambien. Solo lo pide /partido y solo cuando ya estoy
    // dentro —moverse es cambiar de sitio, no entrar—, asi que las otras
    // pantallas siguen pintando el hueco quieto de siempre.
    if (!plaza.playerId) {
      if (opciones.puedoMoverme) {
        return `<button type="button" class="vt-plaza vt-plaza--libre vt-plaza--mover"
          data-accion="moverme" data-puesto="${plaza.puesto}">${lado}
          <span class="vt-plaza__ficha"><span class="ms notranslate" translate="no" aria-hidden="true">sync_alt</span></span>
          <span class="vt-plaza__nombre">Libre</span>
          <span class="vt-plaza__pie">Ponerme aquí</span></button>`;
      }
      return `<div class="vt-plaza vt-plaza--libre">${lado}
        <span class="vt-plaza__ficha"><span class="ms notranslate" translate="no" aria-hidden="true">add</span></span>
        <span class="vt-plaza__nombre">Libre</span>
        <span class="vt-plaza__pie">&nbsp;</span></div>`;
    }
    const organiza = plaza.playerId === partido.creadorId;
    const yo = opciones.miId && plaza.playerId === opciones.miId;
    const clases = ['vt-plaza', organiza ? 'vt-plaza--organiza' : '', yo ? 'vt-plaza--yo' : ''].filter(Boolean).join(' ');
    const pie = organiza ? 'Organiza' : (yo ? 'Tú' : '&nbsp;');
    return `<div class="${clases}">${lado}
      <span class="vt-plaza__ficha">${escapar(iniciales(plaza.nombre))}</span>
      <span class="vt-plaza__nombre">${escapar(plaza.nombre)}</span>
      ${nivelHtml(plaza, opciones)}
      <span class="vt-plaza__pie">${pie}</span></div>`;
  }

  function chipHtml(partido) {
    if (partido.cancelado) return '<span class="vt-chip">Cancelado</span>';
    if (partido.jugado) return '<span class="vt-chip">Ya se jugó</span>';
    if (partido.libres <= 0) return '<span class="vt-chip vt-chip--gold">Completo</span>';
    return `<span class="vt-chip vt-chip--gold">${4 - partido.libres}/4</span>`;
  }

  // En la rejilla las cuatro plazas se pintan como dos parejas, con su
  // rotulo. «Equipo 1» son los puestos 1 y 2 y «Equipo 2» los 3 y 4, que es
  // el orden en el que el servidor llena los huecos. Es la lectura del
  // dibujo, no un emparejamiento decidido: el partido no guarda parejas y
  // apuntarse no las elige. En la lista estrecha siguen siendo cuatro
  // columnas seguidas, sin rotulos.
  const EQUIPOS = [{ titulo: 'Equipo 1', puestos: [1, 2] }, { titulo: 'Equipo 2', puestos: [3, 4] }];

  function plazasHtml(partido, o) {
    if (!o.rejilla) {
      return `<div class="vt-partido__plazas">`
        + partido.plazas.map((p) => plazaHtml(p, partido, o)).join('') + '</div>';
    }
    return '<div class="vt-partido__equipos">' + EQUIPOS.map((equipo) => {
      const dentro = equipo.puestos
        .map((n) => partido.plazas.find((p) => p.puesto === n))
        .filter(Boolean)
        .map((p) => plazaHtml(p, partido, o)).join('');
      return `<div class="vt-equipo">
        <p class="vt-equipo__titulo">${equipo.titulo}</p>
        <div class="vt-partido__plazas vt-partido__plazas--rejilla">${dentro}</div>
      </div>`;
    }).join('') + '</div>';
  }

  // El cuerpo de la tarjeta sin las acciones: cada pantalla pone las suyas.
  // `opciones.rejilla` lo pinta en dos parejas de 2, que es como lo ensena
  // /partido.
  function cuerpo(partido, opciones) {
    const o = opciones || {};
    const donde = partido.sedePistas
      ? `${escapar(partido.sedeNombre)} <span class="vt-partido__pistas">· ${escapar(partido.sedePistas)}</span>`
      : escapar(partido.sedeNombre);
    const plazas = plazasHtml(partido, o);
    // El nivel se ensena SIEMPRE, tambien cuando es «todos»: es una
    // condicion del partido, y un hueco donde a veces hay algo y a veces no
    // se lee como que ese partido no tiene nivel, no como que admite a todos.
    const nota = `<p class="vt-partido__nota">`
      + `<span class="ms ms--sm notranslate" translate="no" aria-hidden="true">military_tech</span>`
      + `${escapar(partido.nivelesTexto)}</p>`;
    return `<div class="vt-partido__cabeza">
        <div>
          <p class="vt-partido__cuando">${escapar(cuando(partido))}</p>
          <p class="vt-partido__donde"><span class="ms notranslate" translate="no" aria-hidden="true">location_on</span><span>${donde}</span></p>
        </div>
        ${chipHtml(partido)}
      </div>
      ${plazas}
      ${nota}`;
  }

  // Una llamada al API de partidos. Devuelve {ok, datos} o {ok:false,
  // mensaje}, con el mensaje que mando el servidor: los textos de error son
  // suyos y no se reescriben aqui, para que digan lo mismo en las cuatro
  // pantallas.
  async function llamar(accion, cuerpoJson) {
    const metodo = cuerpoJson ? 'POST' : 'GET';
    const opciones = { method: metodo, headers: { 'Content-Type': 'application/json' } };
    if (cuerpoJson) opciones.body = JSON.stringify(cuerpoJson);
    let datos = null;
    try {
      const r = await fetch(`/api/partidos?action=${accion}`, opciones);
      datos = await r.json();
      if (r.ok && datos && datos.ok) return { ok: true, datos };
    } catch {
      return { ok: false, mensaje: 'No hay conexión. Inténtalo otra vez.' };
    }
    return { ok: false, mensaje: (datos && datos.message) || 'No se ha podido.', error: datos && datos.error };
  }

  window.vtPartido = { cuerpo, cuando, hora, iniciales, escapar, llamar };
})();
