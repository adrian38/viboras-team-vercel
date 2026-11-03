# Las carpetas: una por pantalla, `comun/`, `api/`, y la raíz que queda

Hasta el 2026-11-01 todo vivía en la raíz: 20 páginas, 18 ficheros de
JavaScript, `theme.css` y los binarios, 58 ficheros versionados en un solo
sitio. Ese mismo día se hizo el camino entero, en tres tramos.

```
api/                       el backend, sin tocar
front/
  comun/                   los 10 .js que usan 2+ pantallas, y theme.css
  pantallas/
    <nombre>/
      index.html           la página
      <nombre>.js          su JavaScript
      <otros>.js           lo que sólo usa ella
sw.js                      en la raíz a la fuerza
```

## Por qué una carpeta por pantalla, y por qué no antes

La primera idea fue `pantallas/` y `front/` como hermanas. Está mal: las
páginas **son** front, así que el nombre mentía. Pero anidar sin más tampoco
servía, porque **16 de las 20 páginas no tenían ningún `.js` propio**: su
JavaScript —4785 líneas, el 63 % del total— estaba dentro del `.html`. Una
carpeta por pantalla habría dado 20 carpetas, 16 con un solo fichero dentro.

Por eso el orden fue: separar, **sacar el JavaScript de los veinte `.html`**, y
sólo entonces agrupar. Al revés se construyen carpetas vacías de contenido.

A `comun/` baja lo que usan dos pantallas o más. Son diez: `auth-client`,
`pwa` y `splash` (las 20), `vt-cargando` (15), `vt-glicko` (6),
`nivel-votos` y `rating-inicial` (5), `vt-categorias` (4), `excel-export` (2)
y `avisos-push`, que no lo carga ninguna página porque lo inyecta
`auth-client` en caliente.

## La URL no cambió nunca, y eso no era optativo

Con `cleanUrls` el nombre del fichero **es** la URL. Movida la página, `/day`
pasaría a ser otra cosa, y esa URL está escrita donde el repositorio no manda:

- **en la base**: `avisos.enlace` guarda `/valorar`, `/buzon`, `/cuenta` y
  `/tablon` (`api/_avisos.js`, `api/_buzon.js`, `api/_campana.js`,
  `api/_tablon.js`). Las filas ya escritas apuntarían a ninguna parte, y la
  campanita y los avisos push llevan a ese enlace;
- **en los móviles del grupo**, en el acceso directo de la PWA.

Por eso `vercel.json` tiene **una regla por pantalla**: 21 rewrites que mapean
`/day` a `/front/pantallas/day/index.html`. Explícitas y no una comodín, para
no depender de en qué orden mira Vercel el sistema de ficheros y las
reescrituras.

### El destino del rewrite es la ruta que Vercel SIRVE, no el fichero

Esto tiró el primer despliegue entero: **las veinte páginas daban 404**, y en
local las veinte daban 200.

Con `cleanUrls`, Vercel sirve `front/pantallas/rating/index.html` en
`/front/pantallas/rating`, y convierte `/front/pantallas/rating/index.html`
en una **redirección 308** hacia esa ruta limpia. Un rewrite cuyo destino es
un 308 no resuelve: da 404.

```
/front/pantallas/rating/index.html   308   <- lo que ponia el destino
/front/pantallas/rating              200   <- lo que hay que poner
```

En `docker/server.js` no se nota porque ahí el destino es un `sendFile` con
la ruta real en disco, que existe. Es la diferencia entre local y producción
más cara de todas las que han aparecido.

**Y la portada no puede vivir en una carpeta llamada `index`.** `cleanUrls`
colapsa tanto el `index.html` como un segmento llamado `index`, y la carpeta
se queda sin ninguna ruta que la sirva: `/front/pantallas/index/` redirige y
`/front/pantallas/` da 404. Por eso se llama `portada/`. Con cualquier otro
nombre funciona, y `tools`/`rewrites` lo comprueban al generar el fichero.

### Dos reglas que no son como las demás

`/index.html` tiene la suya porque **`sw.js` precachea la portada por ese
nombre**, y `cache.addAll()` es todo o nada: una entrada que falla tumba el
`install` entero y el service worker no llega a registrarse. Es el mismo
motivo por el que `site.webmanifest` no está en `PRECACHE`
(`service_worker.md`).

Dicho eso, **esa regla hoy no llega a dispararse**, y conviene saberlo para no
tocarla creyendo que sostiene algo. Medido en el Preview del 2026-11-01:

```
/index.html   308 -> /   200   (sirve la portada)
```

`cleanUrls` redirige `/index.html` antes de que se miren las reescrituras, y
el `/` al que llega sí tiene la suya. La entrada del `PRECACHE` funciona por
esa redirección, no por la regla. La regla se queda como red por si algún día
se quita `cleanUrls`, que es cuando sería la única vía.

Y ninguna regla cubre la forma con extensión. **Eso ya rompió cuatro botones**:
los de ida y vuelta entre `/ranking` y `/ranking-info`, y entre `/rating` y
`/rating-info`, navegaban a `/ranking.html`. Antes funcionaba porque
`cleanUrls` redirigía; después daría 404 en Vercel. En local daban 200, porque
el `express.static` servía el fichero por ese nombre, así que ninguna barrida
lo cazó. Se corrigieron a la forma canónica.

## `sw.js` se queda en la raíz

El alcance de un service worker es la ruta desde la que se sirve. Desde
`/front/` sólo controlaría `/front/`, es decir, nada de lo que el grupo usa.
No es orden; es la única ubicación posible.

Los binarios —iconos, `favicon.ico`, `splash.mp4`, `splash-final.jpg`,
`image.png`— también siguen en la raíz. Moverlos tocaría los cinco elementos
PWA de las veinte páginas por un orden que no se puede comprobar en local, que
es donde se ven los iconos de iOS.

`site.webmanifest` y `apple-touch-icon.png` sí se movieron, el 2026-11-03, a
`front/iconos/`, y **sin tocar las veinte páginas**: las URLs siguen siendo
`/site.webmanifest` y `/apple-touch-icon.png`, resueltas por un rewrite. La
mudanza no era el objetivo sino el precio: Vercel mira primero el sistema de
ficheros, así que mientras el fichero estuviera en la raíz no había rewrite
que pudiera servir otro en su lugar, y la rama `dev` no podía tener su propio
icono (`iconos_pwa.md`).

## Lo que hubo que tocar en las guardas

Mover ficheros deja guardas que siguen pasando mientras miran a otro sitio:

- **`tools/palette.mjs`** hacía `readdirSync('.')`, que no recorre el árbol.
  Pasó por una lista explícita de carpetas y hoy **recorre `front/` entera**,
  que es posible porque la presentación ya tiene un solo tronco. `api/` se
  queda fuera a propósito: sus quince colores literales son el HTML de los
  correos, donde una `var()` no vale porque el cliente de correo no carga
  `theme.css`.
- **`tools/rating-parity.mjs`** tuvo que aprender que **una pantalla son dos
  ficheros**. Comprobaba `window.vtGlicko` mirando sólo el `.html`, y el día
  que se extrajo `players` dijo que la página no usaba el motor; era falso, el
  código estaba intacto dos ficheros más allá. Ahora mira la página y su
  fichero propio. Probado que sigue cazando: con una copia de `expected()` en
  el fichero extraído falla, y renombrando `window.vtGlicko` también.
- **`tools/code-size-baseline.json`**: sus claves son rutas, así que cada
  movimiento las invalida. Ver la sección del trinquete en
  `tamano_del_codigo_y_trinquete.md`, que es donde muerde de verdad.

## El entorno local

`docker-compose.yml` montaba **un fichero por línea**, y lo que no estuviera en
la lista se servía desde la imagen, viejo y sin avisar
(`entorno_local_docker_y_proxies_neon.md`). Ahora monta `./front` entera: con
una línea está todo el código de la aplicación.

`docker/server.js` necesita **una ruta explícita por pantalla**:

```js
app.get('/', pagina('index'));
app.get('/index.html', pagina('index'));
for (const nombre of PANTALLAS) if (nombre !== 'index') app.get(`/${nombre}`, pagina(nombre));
```

Y van **después** de los estáticos, porque Vercel mira primero el sistema de
ficheros. No se usa un `express.static` de `front/pantallas`: ése serviría
`/day/` con barra final y redirigiría `/day` a `/day/`, cosa que Vercel no
hace, y esa diferencia entre local y producción es justo lo que estas líneas
existen para evitar.

## Lo que no se pudo comprobar

Los rewrites de `vercel.json` **no corren en local**: lo comprobado es su
equivalente en `docker/server.js`. Que el mapeo real funcione sólo se ve en el
primer despliegue, y afecta a las veinte páginas a la vez.

El registro del service worker tampoco: falla en local con «unknown error when
fetching the script» aunque `/sw.js` se sirva con 200 y su sintaxis sea
válida. Lo que sí se midió es que **las seis entradas de `PRECACHE` responden
200**, que es lo que tumbaría el `install`.
