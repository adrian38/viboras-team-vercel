// Lo que en /cuenta va por correo: pedir el enlace para restablecer la
// contrasena, usarlo, y confirmar el correo con el enlace del alta.
//
// Fichero aparte para no engordar el JavaScript de cuenta.html
// (ai_context/tamano_del_codigo_y_trinquete.md). Usa sus funciones globales
// $, mostrarAviso, limpiarAviso y conBoton: este script es defer y corre
// cuando el de la pagina ya las ha definido.
//
// Detalle: ai_context/cuentas_y_sesiones.md
(function () {
  var parametros = new URLSearchParams(location.search);
  var tokenRestablecer = parametros.get('restablecer');
  var tokenVerificar = parametros.get('verificar');

  // El token no se queda en la barra ni en el historial: quien coja el movil
  // despues no debe poder volver a abrirlo.
  if (tokenRestablecer || tokenVerificar) {
    history.replaceState(null, '', location.pathname);
  }

  async function llamarCorreo(action, datos) {
    var res = await fetch('/api/correo?action=' + action, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(datos)
    });
    var json = await res.json().catch(function () { return {}; });
    if (!res.ok || !json.ok) {
      // conBoton ensena e.texto, igual que con los errores de llamar().
      var error = new Error(json.message || 'No se pudo completar.');
      error.texto = error.message;
      throw error;
    }
    return json;
  }

  // Solo uno de los cuatro formularios a la vista.
  function soloFormulario(id) {
    ['formEntrar', 'formAlta', 'formOlvido', 'formRestablecer'].forEach(function (f) {
      $(f).classList.toggle('oculto', f !== id);
    });
    document.querySelector('.pestanas').classList.toggle('oculto', id === 'formOlvido' || id === 'formRestablecer');
  }

  $('btnOlvido').onclick = function () {
    limpiarAviso();
    $('olvidoCorreo').value = $('entrarCorreo').value;
    soloFormulario('formOlvido');
    $('olvidoCorreo').focus();
  };

  $('btnOlvidoVolver').onclick = function () {
    limpiarAviso();
    soloFormulario('formEntrar');
  };

  $('formOlvido').onsubmit = function (ev) {
    ev.preventDefault();
    conBoton($('btnOlvidoEnviar'), 'Enviando...', async function () {
      limpiarAviso();
      var json = await llamarCorreo('requestReset', { email: $('olvidoCorreo').value });
      mostrarAviso(json.message, true);
    });
  };

  $('formRestablecer').onsubmit = function (ev) {
    ev.preventDefault();
    conBoton($('btnRestablecer'), 'Guardando...', async function () {
      limpiarAviso();
      var json = await llamarCorreo('resetPassword', {
        token: tokenRestablecer,
        password: $('restablecerPassword').value
      });
      tokenRestablecer = null;
      $('formRestablecer').reset();
      soloFormulario('formEntrar');
      mostrarAviso(json.message, true);
    });
  };

  // Despues de pintarSesion, que decide que panel se ve: el enlace de
  // restablecer manda aunque hubiera una sesion abierta en este navegador.
  function alCargar() {
    if (tokenRestablecer) {
      $('panelSesion').classList.add('oculto');
      $('panelAcceso').classList.remove('oculto');
      soloFormulario('formRestablecer');
      $('restablecerPassword').focus();
    }
    if (tokenVerificar) {
      llamarCorreo('verifyEmail', { token: tokenVerificar })
        .then(function (json) { mostrarAviso(json.message, true); })
        .catch(function (e) { mostrarAviso(e.message); });
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    window.vtMe.then(alCargar);
  });
})();
