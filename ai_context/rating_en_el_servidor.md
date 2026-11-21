# El rating, también en el servidor

Hasta el 2026-11-22 el rating **sólo existía mientras una pantalla lo
calculaba**. El motor Glicko recorre el histórico entero en el navegador, y el
servidor nunca supo el número de nadie: `api/perfil.js` lo dice en un
comentario y por eso la calificación de estrellas se calcula en el cliente.

Eso bastaba para **enseñarlo**. Dejó de bastar cuando un partido previsto pudo
decir «sólo avanzados»: para **decidir** con el rating, el servidor tiene que
saberlo.

## No hay un segundo motor, hay un segundo sitio que lo usa

`api/_motor.js` **carga y ejecuta los mismos cuatro ficheros** que cargan
`/rating` y `/players`, dentro de un `vm` con un navegador de mentira:

```
front/comun/vt-glicko.js       el motor
front/comun/vt-categorias.js   los cortes de categoría
front/comun/rating-inicial.js  de qué rating parte cada jugador
front/comun/nivel-votos.js     los votos que mueven el RD
```

La invariante de `tools/rating-parity.mjs` sigue en pie: un solo motor. Si
alguien lo cambia, esto cambia con él, que es exactamente lo que se quiere. Es
la misma técnica del arnés con el que se prueba `sw.js`
(`ai_context/service_worker.md`).

**Comprobado el día que se escribió**, contra la base local clonada de `dev`:
los seis primeros de `/rating` y los seis primeros de la tabla `players`
coinciden hasta el céntimo — 2133,20 · 2097,88 · 2073,53 · 2006,91 · 2000,01 ·
1968,50. Si alguna vez no coinciden, es que lo guardado está viejo, **no** que
haya dos cuentas distintas.

## Las tres cosas que hacen que funcione, y que es fácil romper

1. **El `window` del sandbox tiene que SER el objeto global.** `vt-glicko.js`
   publica con `window.GlickoPlayer = …` y sus acompañantes usan
   `GlickoPlayer` a secas. En el navegador es la misma variable; con un
   `window` que sea un objeto cualquiera, no. El primer intento falló aquí con
   un «Cannot read properties of undefined».
2. **El `fetch` falso va dentro de la caja y antes de cargar.**
   `rating-inicial.js` y `nivel-votos.js` piden sus datos **en la propia
   carga** y guardan la promesa en `listo`; hay que esperar las dos antes de
   calcular, como hacen `/rating` y `/players`. Sin eso no revienta: los
   jugadores nuevos saldrían todos de 1500 y los votos no moverían el RD. Un
   número creíble y distinto del de la pantalla, que es el peor resultado.
3. **`vercel.json` tiene que empaquetar los cuatro ficheros** con las
   funciones (`functions.includeFiles`). Sin esa línea el recálculo funciona
   en local y revienta con ENOENT en Vercel.

   Y **`vercel.json` no admite claves desconocidas**: el primer intento llevaba
   un `"_comentario_functions"` explicando para qué servía el bloque, y Vercel
   rechazó el despliegue entero. Dos despliegues en **Error** seguidos, y como
   el alias se queda sirviendo el último que funcionó, la aplicación parecía
   estar bien: lo único raro era que el recálculo no hacía nada. Si algo
   desplegado no cambia por mucho que se empuje, mirar
   `vercel list` antes que el código. Las explicaciones van en el código o
   aquí, nunca dentro de `vercel.json`.

El mapeo de filas a partidos —las fechas en dos formatos, los sets, los
formatos de torneo— lo hace el propio motor con su `leerPartidos`, al que se
le da el JSON que esperaría de `/api/read`. Por eso no está escrito aquí otra
vez.

## Qué se guarda y cuándo

En `players`: `rating`, `rd`, `categoria` y `rating_at` (ALTER en
`api/_rating.js`, fuera de `ensureSchema`, que está en el techo de tamaño).

`rating_at` no es adorno: sin él no hay forma de saber que lo guardado es de
antes del último partido, que es la única manera de notar que el recálculo
dejó de correr.

**Se recalcula entero, siempre.** El Glicko de uno depende de contra quién
jugó, así que «recalcular sólo a Marta» no existe. Son cincuenta y pico
partidos y cuarenta jugadores.

Corre al meter, editar y borrar un resultado (`api/write.js`), y otra vez en
cada pasada del cron como red de seguridad. Nunca tira la petición: el
resultado ya está guardado y que el rating tarde un minuto más en moverse no
es un error que enseñarle a nadie.

## El filtro de nivel de los partidos

`api/partidos.js` compara la **categoría guardada** con los niveles que pide
el partido. Decisión de Adrián el 2026-11-22:

- **No se salta nadie**, ni quien convoca ni los administradores. Convocar te
  apunta en la plaza 1, así que poner unos niveles en los que no estás te
  dejaría fuera de tu propio partido: se dice al crear, antes de guardarlo.
- **A quien ya está dentro no se le echa.** El filtro actúa al entrar; un
  rating que se mueva después no saca a nadie de un partido al que ya le
  dijeron que sí.
- **Sin categoría calculada se deja pasar.** Significa que el recálculo nunca
  ha corrido, no que el jugador no dé el nivel. Dejar fuera a alguien por una
  tabla vacía sería inventarse un motivo.

Comprobado contra el entorno local: un Intermedio no entra en un partido de
Avanzado ni puede convocarlo, y sí entra en uno de Intermedio + Avanzado y en
uno sin niveles.

### Ojo: tres sitios con los mismos cuatro nombres

Iniciación, Intermedio, Avanzado y Entreno aparecen en
`TIER_DEFINITIONS` (la categoría por rating, que es la que filtra),
en `RATING_DE_PARTIDA` (el nivel de la prueba de Bilbao Kirolak declarado al
darse de alta, que es de dónde **parte** el rating) y en `NIVELES`
(los que admite un partido). El filtro usa el primero. Detalle en
`ai_context/partidos_previstos.md`.
