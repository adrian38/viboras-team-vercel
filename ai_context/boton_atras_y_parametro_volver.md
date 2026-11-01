# El botón «Atrás» y el parámetro `?volver=`

No hay historial ni router: cada página es un `.html` suelto y su botón de
atrás lleva a donde diga su `onclick`. Mientras a una pantalla sólo se llegara
desde la portada, escribir `/` ahí era correcto. Deja de serlo en cuanto una
segunda pantalla enlaza a la misma página: el botón sigue yendo a la portada y
el usuario pierde el sitio donde estaba.

El 2026-11-01 pasaba en cinco páginas, todas por enlaces de `/cuenta`:
`/comunidad`, `/rating`, `/buzon`, `/valorar` (también desde `/history`) y
`/group-normativa`.

## La convención

**Quien enlaza dice a dónde se vuelve, con `?volver=`.** Ya existía en
`day.html` y `results.html`; ahora la usan también `comunidad.html`,
`rating.html`, `buzon.html`, `valorar.html` y `group-normativa.html`.

- Quien enlaza añade `?volver=` con la ruta **codificada**:
  `/rating?volver=%2Fcuenta`. En JavaScript, `encodeURIComponent`.
- Quien lo recibe acepta **sólo rutas de este sitio**: tiene que empezar por
  `/` y no por `//`. Un `//evil.com` o un `http://…` sería un redirect
  abierto. Sin parámetro, a la portada, que es de donde se llega desde el menú.
- Las cuatro líneas se repiten en cada página. Es la misma duplicación
  deliberada que el resto del repositorio: no hay layout compartido.

El mismo nombre de parámetro lo usa `auth-client.js` para otra cosa —a dónde ir
**después de entrar**, cuando te manda a `/cuenta` sin sesión—, con la misma
regla de validación (`destino()` en `cuenta.html`). No se mezclan: el `volver`
de `/cuenta` es post-login y su botón «Volver» **no** lo usa, porque volvería a
la página sin sesión y `auth-client.js` te devolvería a `/cuenta` en bucle.

## `history.back()` no vale

`group-normativa.html` lo usaba. Desde `/cuenta` esa página se abre con
`target="_blank"`: en una pestaña recién abierta no hay historia y el botón
**no hacía absolutamente nada**, sin error ni aviso. Lo mismo valdría para
cualquier página a la que se entre por un aviso push o por un enlace pegado.

## Si la etiqueta dice «al inicio», tiene que ir al inicio

`buzon.html` y `valorar.html` rotulan el botón «Volver al inicio». Cuando hay
`?volver=`, el texto pasa a «Volver»: dejarlo sería una etiqueta que promete
otra cosa que el código hace. En `valorar.html` el texto se cambia **antes** de
colgar el icono de flecha, porque `textContent` vacía el enlace.

## Al añadir un enlace nuevo entre pantallas

Si la página destino ya tiene otra entrada, pásale `?volver=` con la ruta
actual. Si no lo tiene aún, el botón sigue yendo a la portada y ahí está el
fallo, que es silencioso: nadie avisa de que el atrás se fue a otro sitio.

Entradas a cada pantalla, a 2026-11-01: `rg -n "location *= *'/|href=\"/" *.html *.js`.
