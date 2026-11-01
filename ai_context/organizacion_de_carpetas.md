# Las carpetas: `pantallas/`, `front/`, `api/`, y la raíz que queda

Hasta el 2026-11-01 todo vivía en la raíz: 20 páginas, 18 ficheros de
JavaScript, `theme.css` y los binarios, 58 ficheros versionados en un solo
sitio. Ahora son tres carpetas y 23 ficheros en la raíz.

| Carpeta | Qué hay | Quién lo sirve |
| --- | --- | --- |
| `pantallas/` | las 20 `.html` | rewrites de `vercel.json` |
| `front/` | los 16 `.js` compartidos y `theme.css` | su propia URL, `/front/...` |
| `api/` | las 10 funciones serverless | Vercel, por nombre de fichero |

## La URL no cambió, y eso no era optativo

Con `cleanUrls` el nombre del fichero **es** la URL: `day.html` en la raíz se
servía como `/day`. Movido a `pantallas/` pasaría a ser `/pantallas/day`, y esa
URL está escrita en sitios que no controla este repositorio:

- **en la base**: `avisos.enlace` guarda `/valorar`, `/buzon`, `/cuenta` y
  `/tablon` (`api/_avisos.js`, `api/_buzon.js`, `api/_campana.js`,
  `api/_tablon.js`). Las filas ya escritas apuntarían a ninguna parte, y la
  campanita y los avisos push llevan a ese enlace;
- **en los móviles del grupo**, en el acceso directo de la PWA.

Por eso `vercel.json` tiene **una regla por página**: 21 rewrites que mapean
`/day` a `/pantallas/day.html`. Explícitas y no una comodín, para no depender de
en qué orden mira Vercel el sistema de ficheros y las reescrituras.

### `/index.html` tiene su propia regla, y es la que puede romper el móvil

`sw.js` precachea `/index.html` por ese nombre. Mientras el fichero estaba en la
raíz, `cleanUrls` lo redirigía a `/` y la cosa funcionaba sola. Ya no hay
fichero ahí, así que sin su rewrite `/index.html` daría 404 — y
`cache.addAll()` es todo o nada: **una entrada que falla tumba el `install`
entero y el service worker no llega a registrarse**. Es el mismo motivo por el
que `site.webmanifest` no está en `PRECACHE` (`service_worker.md`).

Al mover `theme.css` se cambió también su línea del `PRECACHE` y se subió
`CACHE` a `viboras-v4`, para que los navegadores tiren la copia vieja.

## `sw.js` se queda en la raíz

El alcance de un service worker es la ruta desde la que se sirve. Desde
`/front/sw.js` sólo controlaría `/front/`, es decir, nada de lo que el grupo
usa. No es orden; es la única ubicación posible.

Los binarios —iconos, `favicon.ico`, `splash.mp4`, `splash-final.jpg`,
`image.png`— y `site.webmanifest` también siguen en la raíz. Moverlos tocaría
los cinco elementos PWA de las 20 páginas por un orden que no se puede
comprobar en local, que es donde se ven los iconos de iOS.

## Lo que hubo que tocar en las guardas

Mover ficheros deja guardas que siguen pasando mientras miran a otro sitio:

- **`tools/palette.mjs`** hacía `readdirSync('.')`, que no recorre el árbol: con
  el código en carpetas habría pasado verde vigilando la nada. Ahora tiene una
  lista explícita, `CARPETAS = ['.', 'front', 'pantallas']`. **No es recursiva a
  propósito**: barrer todo arrastraría los 15 colores literales de
  `api/_correo.js`, que son el HTML de los correos, donde una `var()` no vale
  porque el cliente de correo no carga `theme.css`. El precio es que una carpeta
  de presentación nueva hay que añadirla a mano.
- **`tools/rating-parity.mjs`**: su constante `MOTOR` vale a la vez como ruta en
  disco y, con una barra delante, como la URL que cargan las páginas. Por eso
  bastó cambiarla a `front/vt-glicko.js`.
- **`tools/code-size-baseline.json`**: sus claves son rutas. 14 entradas
  reapuntadas a `pantallas/`. No se usó `--write`, que no habría añadido las
  nuevas y habría dado por caducadas las viejas.

## El entorno local: 37 líneas de `volumes:` a dos carpetas

`docker-compose.yml` montaba **un fichero por línea**, y lo que no estuviera en
la lista se servía desde la imagen, viejo y sin avisar
(`entorno_local_docker_y_proxies_neon.md`). Ahora monta `./front` y
`./pantallas` enteras, así que un fichero nuevo recarga sin reconstruir.

`docker/server.js` necesita su propia línea para las páginas:

```js
app.use(express.static(path.join(ROOT, 'pantallas'), { extensions: ['html'] }));
```

Es el equivalente local de los rewrites. Sin ella `/day` daría 404 en local y
200 en producción.

## Lo que no se pudo comprobar

Los rewrites de `vercel.json` **no corren en local**: lo que se comprobó es su
equivalente de `express.static`. Que el mapeo real funcione sólo se ve en el
primer despliegue, y afecta a las 20 páginas a la vez.

El registro del service worker tampoco: falla en local con «unknown error when
fetching the script» aunque `/sw.js` se sirva con 200 y su sintaxis sea válida.
Lo que sí se midió es que **las seis entradas de `PRECACHE` responden 200**, que
es lo que tumbaría el `install`.
