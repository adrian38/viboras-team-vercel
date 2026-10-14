// Quien eres, para las paginas que lo preguntan.
//
// Vive en un fichero propio y no en linea dentro de index.html a proposito:
// tools/code-size-baseline.json tiene index.html clavado en 813 lineas de
// JavaScript y el trinquete solo deja encoger, asi que una sola linea en
// linea alli rompe `npm run check`. Un <script src> no se mide.
//
// La cookie es HttpOnly, asi que el navegador no puede leerla: la unica forma
// de saber quien eres es preguntarselo al API. Se pregunta UNA vez por carga y
// se reparte la promesa; con Neon en Frankfurt y arranques en frio, cada
// pregunta de mas se nota.
//
// Detalle: ai_context/cuentas_y_sesiones.md
(function () {
  window.vtMe = fetch('/api/auth?action=me', { headers: { accept: 'application/json' } })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (j) { return (j && j.user) || null; })
    // Sin red el service worker sirve la pagina de cache y esto falla. No es
    // un error: es "no hay sesion".
    .catch(function () { return null; });

  function icono(glifo) {
    return '<span class="ms ms--sm notranslate" translate="no" aria-hidden="true">' + glifo + '</span>';
  }

  // En index.html el nombre se esconde por debajo de 400 px; el icono no.
  function nombre(texto) {
    return '<span class="vt-chip__nombre">' + texto + '</span>';
  }

  function pintarChip(user) {
    var chip = document.getElementById('vtSession');
    if (!chip) return;
    if (!user) {
      chip.innerHTML = icono('login') + nombre('Entrar');
      return;
    }
    // Solo el nombre de pila: en la barra de index.html a 375 px no entra
    // "Adrián C" entero y se cortaba a mitad de palabra.
    var corto = (user.playerName || user.email).split(' ')[0];
    chip.innerHTML = icono('person') + nombre(corto);
    chip.classList.add('vt-chip--gold');
  }

  window.vtMe.then(pintarChip);
})();
