# Recordatorios de partido, y el primer cron del proyecto

Un partido convocado en `/partidos` manda hasta seis recordatorios a quienes
están apuntados. Existen por una razón concreta: en los polideportivos de
Bilbao Kirolak **la pista se reserva por franja horaria y cada franja se abre
48 horas antes de su propia hora**, así que el momento de reservar es un
instante exacto que es fácil perder.

| Clave | Cuándo (hora peninsular) |
| --- | --- |
| `48h` | 10:00 del día en que se abre la reserva, **siempre** |
| `reserva:1` | 30 min antes de abrirse la franja de la primera hora |
| `reserva:2` | sólo en los de 2 h: 30 min antes de la segunda franja |
| `dia` | 10:00 del día del partido; **si el partido es antes de las 10:00, el día antes a las 18:00** |
| `2h` | 2 h antes de empezar |
| `resultado` | 10:00 del día siguiente, si nadie lo ha cerrado |

`reserva` se duplica en los partidos de dos horas porque son **dos franjas que
reservar**: uno de 19:00 a 21:00 exige la franja de las 19:00 y la de las
20:00, que se abren a las 19:00 y a las 20:00 de dos días antes.

## El `reserva:1` puede llegar antes que el `48h`, y es lo decidido

Partido el jueves a las 8:00 → `reserva:1` el martes a las **7:30** y `48h` el
martes a las **10:00**. El aviso de «hoy se abre la reserva» llega dos horas y
media después de que se abriera.

Adrián lo eligió así: el `48h` sale **siempre** a las 10:00, sin excepción. Por
eso su texto pregunta «¿ya la tenéis?» en vez de dar por hecho que nadie ha
reservado. Si alguien lo lee como un fallo y «arregla» la hora, romperá lo
pedido.

La regla de las 18:00 del día antes es **sólo del `dia`**, no del `48h`.

## La zona horaria se resuelve en la consulta

Los crons de Vercel se programan en UTC y el servidor corre en UTC. Las 10:00 y
las 18:00 locales salen de `AT TIME ZONE 'Europe/Madrid'` **dentro del SQL**,
donde Postgres conoce el cambio de hora. El cron no decide *qué* se manda, sólo
*cuándo se mira*.

Comprobado con los seis casos límite —8:00, 10:00, 23:00, uno de 2 h, en
invierno y en verano— imprimiendo los 32 instantes en hora peninsular. El
fichero de la consulta no está en el repositorio: es la expresión
`INSTANTES` de `api/_partidos-cron.js` sobre un `VALUES`, y se puede rehacer en
un minuto.

## Las tres reglas que evitan el desastre

Un endpoint que manda pushes a todo un grupo falla caro. Tres cosas lo atan:

1. **Marcar es el candado.** Se inserta la fila en `partido_avisos` **antes** de
   avisar, con `ON CONFLICT DO NOTHING`: cero filas significa que otra pasada se
   adelantó y no se manda nada. Dos ejecuciones simultáneas no duplican ni un
   push. El precio es que un fallo de `web-push` pierde ese aviso, y aquí eso es
   lo correcto: mejor perder uno que mandar veinte.
2. **Colapso por pasada.** Si a un mismo partido le vencen dos avisos a la vez
   se manda **sólo el de instante más tardío** —el más inminente, y el que
   contiene al anterior— y los otros se marcan `omitido`. Dos pushes del mismo
   partido en el mismo minuto son ruido.
3. **Ventana de 6 horas.** Un instante más viejo que eso se marca y **no se
   manda**. Un cron parado medio día, un despliegue tras una caída o una base
   restaurada de un volcado no pueden vomitar avisos viejos.

## No hay aviso de recuperación

Al crear o al mover un partido, todo aviso cuyo instante ya pasó nace con su
fila y `omitido = TRUE` (`sellarVencidos`). Decir «hoy se abre la reserva»
cuando se abrió hace dos días sería mentir.

Y **no es un caso raro, es el normal**: todo partido convocado con menos de
48 h 30 min de antelación nace sin los avisos de reserva. Por eso
`/partido-nuevo` lo dice en pantalla antes de crearlo, y por eso el booleano
existe: separa «mandado» de «no se mandará» y se puede responder con un
`SELECT` a quien pregunte por qué no le llegó nada.

Al **editar** se borran las claves `omitido` para que se recalculen con la hora
nueva, y se dejan las que ya se mandaron: un aviso enviado no se desenvía.
Bajar de dos horas a una se lleva por delante `reserva:2`.

## Los destinatarios, y la marca por partido

La lista se calcula **en el instante del envío**, leyéndola de
`partido_plazas`. Quien se apunta tarde entra en los avisos que aún no han
salido; quien se borra entre dos simplemente no está en el `SELECT` del
siguiente.

**La marca es por partido, no por jugador.** Consecuencia aceptada: quien se
apunte después de que saliera el `48h` no lo recibirá nunca. La alternativa
—una marca por jugador— obligaría a una tabla cuatro veces mayor y, peor, haría
llegar «hoy se abre la reserva» tres horas tarde a quien acaba de apuntarse,
que es menos útil que no recibir nada.

Si al llegar el instante no queda **nadie** apuntado, se marca consumido y no
se manda nada. El `resultado` además exige los cuatro: un partido que se quedó
a tres no se jugó y no se pregunta por él.

## El endpoint

`api/cron-partidos.js` es **la única función del proyecto que no exige sesión**
y la única que no se alcanza desde ninguna pantalla. Se protege con
`CRON_SECRET` en la cabecera `Authorization: Bearer`, comparado con
`timingSafeEqual` (un `===` filtra el secreto por el tiempo que tarda en
fallar).

**Sin `CRON_SECRET` en el entorno responde 503 y no hace nada.** Es a propósito:
un endpoint que manda pushes a todo el grupo no puede quedarse abierto porque
alguien olvidara una variable. En `docker-compose.yml` la variable existe
vacía; para probarlo en local, `CRON_SECRET=loquesea docker compose up -d app`.

## El reloj está en GitHub Actions, no en Vercel

**`vercel.json` no tiene ni tendrá una entrada `crons`.** La cuenta está en el
plan **Hobby** —comprobado el 2026-11-21 con `npx vercel@latest teams ls`:
`adrian38s-projects · hobby`— y ahí un cron corre **como mucho una vez al
día**. Y no es que vaya lento: **una expresión más frecuente que diaria hace
fallar el despliegue**, no se queda atrasada. Además el disparo de Hobby es
aproximado dentro de la hora indicada.

Los avisos `reserva:1`, `reserva:2` y `2h` necesitan cadencia de minutos, así
que el reloj vive fuera: `.github/workflows/recordatorios-de-partido.yml`
llama a `/api/cron-partidos` cada cinco minutos con el secreto en la cabecera.
El repositorio es **público**, así que los minutos de GitHub Actions son
gratis e ilimitados; en uno privado, 288 pasadas al día se comerían de sobra
los 2.000 minutos mensuales del plan gratuito y habría que espaciarlas o pagar.

**El workflow tiene que estar en `viboras`.** GitHub sólo dispara un
`schedule` desde la rama por defecto; en cualquier otra rama el fichero existe
pero no corre, y no sale nada en rojo. Pasó del 2026-11-21 al 2026-11-27: el
workflow vivía sólo en `dev`, `gh run list` contestaba «not found on the
default branch» y en `viboras_dev` la tabla `partido_avisos` no tenía ni un
aviso mandado, sólo los que nacieron vencidos (`omitido`). Adrián lo notó
porque no le llegó ni el de 30 min antes de reservar ni el del día del
partido. Comprobarlo: `gh run list --workflow recordatorios-de-partido.yml`.

El workflow llama a una lista de entornos (`matrix`), no a uno solo: mientras
los partidos previstos vivan sólo en `dev`, la lista es `dev`, porque
producción contesta 404 en `/api/cron-partidos`. **Al llevar `partidos` a
`viboras`, añadir producción a la lista**, o el grupo real se quedará sin
recordatorios igual que se quedó `dev`. El endpoint de `dev` no está detrás de
la protección de Vercel: sin cabecera contesta el 401 de la propia función.

Dos cosas que no se pueden arreglar desde el repositorio:

- **El `schedule` de Actions no es puntual.** En horas punta se retrasa, a
  veces diez o quince minutos. Por eso el endpoint mira una ventana de seis
  horas hacia atrás y manda lo vencido, en vez de exigir que la pasada caiga
  en el minuto exacto.
- **GitHub desactiva solo los `schedule` de un repositorio que lleva 60 días
  sin actividad**, y avisa por correo. Si los avisos dejan de llegar de golpe,
  mirar eso antes que el código.

Si algún día la cuenta pasa a **Pro**, el workflow se puede borrar y poner
`"crons": [{ "path": "/api/cron-partidos", "schedule": "*/5 * * * *" }]` en
`vercel.json`: Vercel añade por su cuenta la cabecera
`Authorization: Bearer $CRON_SECRET` a las rutas declaradas ahí, y el endpoint
no cambia.

### Lo que hay que crear a mano

Un secreto por entorno, con **el mismo valor** en Vercel y en GitHub, o el
endpoint contestará 401 cada cinco minutos:

| Entorno | Vercel | GitHub (Settings → Secrets and variables → Actions) |
| --- | --- | --- |
| Producción | `CRON_SECRET` en **Production** | `CRON_SECRET` |
| `dev` | `CRON_SECRET` en **Preview (dev)** | `CRON_SECRET_DEV` |

Cada job de la `matrix` dice cuál usa. Hasta el 2026-11-27 había un solo
secreto en GitHub y no coincidía con el de Preview (dev): la primera pasada
dio 401. Los dos de `dev` se regeneraron ese día y se redesplegó el Preview.
Ninguno se puede volver a leer: si se duda de que coincidan, se genera uno
nuevo, se pone en los dos sitios y se redespliega (cambiar una variable de
Vercel no afecta al despliegue que ya está sirviendo).

Hasta que existan, el workflow falla en rojo cada pasada y el endpoint
responde 503. Es ruidoso a propósito: un recordatorio que no llega no se nota,
y un job en rojo sí.

### El cupo de funciones

`api/partidos.js` y `api/cron-partidos.js` dejan el proyecto en **12 funciones
serverless**. Hobby admite 12, así que está justo en el techo: a partir de
aquí no cabe ninguna más sin fusionar endpoints.

### Peligro al probar

El entorno local manda push a móviles **reales** si `push_subscriptions` tiene
filas restauradas de un volcado (`ai_context/avisos_push.md`). Antes de
ejecutar una pasada en local, vaciar esa tabla.

## `sql.query` en vez del `sql` de siempre

`api/_partidos-cron.js` es el **único** sitio del proyecto que usa
`sql.query(texto, valores)` en lugar del literal etiquetado. No es un descuido:
la lista de los seis instantes es un trozo de SQL que se usa en dos consultas
—la de sellar y la de buscar vencidos— y el `sql` de `@vercel/postgres`
convierte cada `${}` en un parámetro, así que una constante con ese trozo
dentro no pegaría texto, pasaría una cadena como valor y rompería la consulta.
Tenerlo dos veces copiado sería peor: son los seis instantes que definen todo
lo de arriba.
