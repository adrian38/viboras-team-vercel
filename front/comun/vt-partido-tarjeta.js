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

  function plazaHtml(plaza, partido, opciones) {
    const propuesta = opciones.propuestaEn === plaza.puesto && !plaza.playerId;
    if (propuesta) {
      return `<div class="vt-plaza vt-plaza--propuesta">
        <span class="vt-plaza__ficha">${escapar(iniciales(opciones.yoSoy))}</span>
        <span class="vt-plaza__nombre">${escapar(opciones.yoSoy)}</span>
        <span class="vt-plaza__pie">Sin guardar</span></div>`;
    }
    // El icono va DENTRO de la ficha y no en la misma etiqueta: la ficha
    // impone la fuente del titular, que le ganaria a la de los iconos y
    // pintaria la palabra «add» dentro del circulo.
    if (!plaza.playerId) {
      return `<div class="vt-plaza vt-plaza--libre">
        <span class="vt-plaza__ficha"><span class="ms notranslate" translate="no" aria-hidden="true">add</span></span>
        <span class="vt-plaza__nombre">Libre</span>
        <span class="vt-plaza__pie">&nbsp;</span></div>`;
    }
    const organiza = plaza.playerId === partido.creadorId;
    const yo = opciones.miId && plaza.playerId === opciones.miId;
    const clases = ['vt-plaza', organiza ? 'vt-plaza--organiza' : '', yo ? 'vt-plaza--yo' : ''].filter(Boolean).join(' ');
    const pie = organiza ? 'Organiza' : (yo ? 'Tú' : '&nbsp;');
    return `<div class="${clases}">
      <span class="vt-plaza__ficha">${escapar(iniciales(plaza.nombre))}</span>
      <span class="vt-plaza__nombre">${escapar(plaza.nombre)}</span>
      <span class="vt-plaza__pie">${pie}</span></div>`;
  }

  function chipHtml(partido) {
    if (partido.cancelado) return '<span class="vt-chip">Cancelado</span>';
    if (partido.jugado) return '<span class="vt-chip">Ya se jugó</span>';
    if (partido.libres <= 0) return '<span class="vt-chip vt-chip--gold">Completo</span>';
    return `<span class="vt-chip vt-chip--gold">${4 - partido.libres}/4</span>`;
  }

  // El cuerpo de la tarjeta sin las acciones: cada pantalla pone las suyas.
  // `opciones.rejilla` lo pinta en 2x2, que es como lo ensena /partido.
  function cuerpo(partido, opciones) {
    const o = opciones || {};
    const donde = partido.sedePistas
      ? `${escapar(partido.sedeNombre)} <span class="vt-partido__pistas">· ${escapar(partido.sedePistas)}</span>`
      : escapar(partido.sedeNombre);
    const plazas = partido.plazas.map((p) => plazaHtml(p, partido, o)).join('');
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
      <div class="vt-partido__plazas${o.rejilla ? ' vt-partido__plazas--rejilla' : ''}">${plazas}</div>
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
