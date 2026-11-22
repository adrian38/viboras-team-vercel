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
// con los chats recientes dentro —el grupo suele estar ahi, a un toque—.
//
// En escritorio navigator.share SI existe (Edge y Chrome en Windows 11 lo
// anuncian), pero lo que abre es la hoja del sistema, donde WhatsApp no
// aparece aunque este instalado: comparte a Correo, a un dispositivo cercano
// o a nada. Y como la promesa se resuelve bien, el boton que dice «Compartir
// por WhatsApp» se daba por cumplido sin haber pasado por WhatsApp. Por eso
// la hoja del sistema solo se usa en movil; en escritorio se va derecho a
// wa.me, que abre WhatsApp —la app instalada o la web— con el texto puesto y
// pide elegir el chat.
//
// El partido que se le pasa es SIEMPRE el que acaba de devolver el servidor,
// nunca el que esta pintado: el mensaje dice quien va, y decir que vas cuando
// el servidor no te ha metido seria mandarle una mentira al grupo.
(function () {
  // `jugador` es la vibora y no una pelota: el grupo es Viboras Team y el
  // mensaje se lee de un vistazo por los iconos. `libre` sigue siendo el
  // circulo vacio, que marca un hueco, no a alguien.
  const EMOJI = { fecha: '\u{1F4C5}', sitio: '\u{1F3DF}\u{FE0F}', hora: '\u{23F0}', nivel: '\u{1F4CA}', jugador: '\u{1F40D}', libre: '\u{26AA}' };

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

  // La primera linea, cuando el mensaje sale de apuntarse o de borrarse.
  // Sin ella el mensaje se repite entero en el grupo y no dice QUIEN se ha
  // movido: hay que comparar con el mensaje anterior para enterarse, y nadie
  // lo hace. Lo pidio el grupo con estas palabras: «se ha apuntado Oti, ya
  // sois 4».
  //
  // La cuenta sale de `libres`, que viene del servidor con el partido ya
  // cambiado. No se compone con lo que esta pintado ni se suma aqui.
  function avisoTexto(partido, aviso) {
    if (!aviso || !aviso.nombre) return '';
    if (aviso.tipo === 'alta') {
      return `Se ha apuntado ${aviso.nombre}, ya sois ${4 - partido.libres}.`;
    }
    if (aviso.tipo === 'baja') {
      const hueco = partido.libres === 1 ? 'queda 1 plaza' : `quedan ${partido.libres} plazas`;
      return `Se ha borrado ${aviso.nombre}, ${hueco}.`;
    }
    return '';
  }

  function texto(partido, aviso) {
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
    const cabecera = avisoTexto(partido, aviso);
    return (cabecera ? [cabecera, ''] : []).concat(lineas).join('\n');
  }

  // En movil la hoja del sistema lleva a WhatsApp; en escritorio no. El dato
  // fiable es userAgentData.mobile, que Chrome y Edge dan; Safari y Firefox
  // no lo traen, y ahi se mira el userAgent.
  function esMovil() {
    if (navigator.userAgentData && typeof navigator.userAgentData.mobile === 'boolean') {
      return navigator.userAgentData.mobile;
    }
    return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  }

  // navigator.share puede fallar porque el usuario cierre la hoja, y eso no
  // es un error que ensenar: se distingue por el nombre AbortError. Cualquier
  // otro fallo (un navegador que lo anuncia y no lo hace) cae a wa.me.
  async function compartir(partido, aviso) {
    const mensaje = texto(partido, aviso);
    if (navigator.share && esMovil()) {
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
