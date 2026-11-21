// El mensaje de WhatsApp de un partido, y como sale de la app.
//
// Hereda el formato del boton que vivia en /results, que era lo unico que
// habia: emojis, una linea por cosa y los cuatro jugadores. Lo que anade es
// el enlace de vuelta, que es el motivo de todo esto: quien lo pulsa aterriza
// en /partido?id=N y se apunta desde alli.
//
// No se puede mandar a un grupo concreto. WhatsApp solo deja prellenar texto
// hacia un numero de telefono (wa.me/<numero>?text=); los grupos no tienen
// URL a la que escribir, solo enlaces de invitacion para unirse. Lo mas cerca
// que se llega es navigator.share(), que abre la hoja de compartir del movil
// con los chats recientes dentro —el grupo suele estar ahi, a un toque—. En
// escritorio no existe, y ahi se cae a wa.me, que abre WhatsApp con el texto
// puesto y pide elegir el chat.
//
// El partido que se le pasa es SIEMPRE el que acaba de devolver el servidor,
// nunca el que esta pintado: el mensaje dice quien va, y decir que vas cuando
// el servidor no te ha metido seria mandarle una mentira al grupo.
(function () {
  const EMOJI = { fecha: '\u{1F4C5}', sitio: '\u{1F3DF}\u{FE0F}', hora: '\u{23F0}', nivel: '\u{1F4CA}', jugador: '\u{1F3BE}', libre: '\u{26AA}' };

  function enHoraLocal(iso, opciones) {
    return new Date(iso).toLocaleString('es-ES', { timeZone: 'Europe/Madrid', ...opciones });
  }

  // «sábado 5 de diciembre», como lo escribia /results.
  function diaLargo(iso) {
    const dia = enHoraLocal(iso, { weekday: 'long' });
    const numero = enHoraLocal(iso, { day: 'numeric' });
    const mes = enHoraLocal(iso, { month: 'long' });
    return `${dia} ${numero} de ${mes}`;
  }

  function soloHora(iso) {
    return enHoraLocal(iso, { hour: '2-digit', minute: '2-digit' });
  }

  function texto(partido) {
    const fin = new Date(new Date(partido.empieza).getTime() + partido.duracion * 60000).toISOString();
    const sitio = partido.sedePistas ? `${partido.sedeNombre} (${partido.sedePistas})` : partido.sedeNombre;
    const lineas = [
      `${EMOJI.fecha}${diaLargo(partido.empieza)}`,
      `${EMOJI.sitio}${sitio}`,
      `${EMOJI.hora}Hora ${soloHora(partido.empieza)} a ${soloHora(fin)}`,
      `${EMOJI.nivel}Nivel ${partido.nivelesTexto}`
    ];
    for (const plaza of partido.plazas) {
      lineas.push(plaza.nombre ? `${EMOJI.jugador}${plaza.nombre}` : `${EMOJI.libre}Libre`);
    }
    lineas.push('', `${location.origin}/partido?id=${partido.id}`);
    return lineas.join('\n');
  }

  // navigator.share puede fallar porque el usuario cierre la hoja, y eso no
  // es un error que ensenar: se distingue por el nombre AbortError. Cualquier
  // otro fallo (un navegador que lo anuncia y no lo hace) cae a wa.me.
  async function compartir(partido) {
    const mensaje = texto(partido);
    if (navigator.share) {
      try {
        await navigator.share({ text: mensaje });
        return true;
      } catch (err) {
        if (err && err.name === 'AbortError') return false;
      }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(mensaje)}`, '_blank', 'noopener');
    return true;
  }

  window.vtCompartirPartido = { texto, compartir };
})();
