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

## Lo que falta, y por qué

**No hay ninguna entrada `crons` en `vercel.json`, y eso es deliberado.** Los
recordatorios `reserva:1`, `reserva:2` y `2h` necesitan una pasada **cada pocos
minutos** (`*/5 * * * *`), y eso sólo existe en el plan **Pro** de Vercel: en
**Hobby** los cron jobs están limitados a una ejecución diaria y el disparo es
aproximado dentro de la hora. El repositorio ya asume Hobby
(`ai_context/buzon_de_quejas.md`: «El plan Hobby admite 12 [funciones]»), pero
**no está verificado**.

Hasta que Adrián confirme el plan:

- **Con Pro**: añadir `"crons": [{ "path": "/api/cron-partidos", "schedule":
  "*/5 * * * *" }]` a `vercel.json` y crear `CRON_SECRET` en Production y en el
  override de Preview `dev`. Los seis funcionan con un desfase máximo de 5
  minutos. Vercel añade la cabecera `Authorization: Bearer $CRON_SECRET` por su
  cuenta a las rutas declaradas en `crons`.
- **Con Hobby**: `48h`, `dia` y `resultado` se podrían dar «sobre media mañana»
  (una pasada diaria en UTC cae en las 10:00 peninsulares en verano y en las
  9:00 en invierno, más la hora de margen). `reserva:1`, `reserva:2` y `2h`
  **no se pueden dar**, y entonces **no se construyen: no se maquetan**. La
  alternativa barata es un workflow de GitHub Actions
  (`on: schedule: '*/5 * * * *'`) que llame al mismo endpoint con el secreto;
  el repositorio ya está en GitHub. Su `schedule` también se retrasa en horas
  punta y se desactiva solo tras 60 días sin actividad en el repositorio.

**El código está escrito y probado, y mientras tanto es inerte**: sin cron que
lo llame y sin secreto, `/api/cron-partidos` devuelve 503.

### El cupo de funciones

`api/partidos.js` y `api/cron-partidos.js` dejan el proyecto en **12 funciones
serverless, que es el techo de Hobby**. A partir de aquí no cabe ninguna más
sin fusionar endpoints.

### Peligro al probar

El entorno local manda push a móviles **reales** si `push_subscriptions` tiene
filas restauradas de un volcado (`ai_context/avisos_push.md`). Antes de
ejecutar una pasada en local, vaciar esa tabla. Y `dev` tiene su propio par
VAPID, así que desde Preview no se alcanza a los móviles del grupo.

## `sql.query` en vez del `sql` de siempre

`api/_partidos-cron.js` es el **único** sitio del proyecto que usa
`sql.query(texto, valores)` en lugar del literal etiquetado. No es un descuido:
la lista de los seis instantes es un trozo de SQL que se usa en dos consultas
—la de sellar y la de buscar vencidos— y el `sql` de `@vercel/postgres`
convierte cada `${}` en un parámetro, así que una constante con ese trozo
dentro no pegaría texto, pasaría una cadena como valor y rompería la consulta.
Tenerlo dos veces copiado sería peor: son los seis instantes que definen todo
lo de arriba.
