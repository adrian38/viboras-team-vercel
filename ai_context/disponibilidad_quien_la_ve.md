# Quién ve la disponibilidad del día

Fecha: 2026-10-31.

## La regla

Las horas que vota cada uno en `/day` son **privadas**: sólo un administrador
puede ver la lista de quién ha marcado qué. Un miembro ve las suyas y nada más.

No es una preferencia de pantalla, es cómo responde el API: `getSlots` en
`api/read.js` hace una consulta distinta según el papel del usuario.

```js
const { rows } = user.role === 'admin'
  ? await sql`… WHERE a.date = ${String(date)} AND p.active = TRUE …`
  : await sql`… AND a.player_id = ${user.player_id} …`;
```

Para que eso sea posible, `handler` se queda con el usuario que devuelve
`exigirSesion()` y se lo pasa a `getSlots`. Antes lo tiraba (`if (!await
exigirSesion(req, res)) return;`) y la acción no sabía quién preguntaba.

## Por qué no basta con esconder el botón

`/day` tenía un botón «Ver votos» que llevaba a `/results`, donde salía la
lista entera de nombres por hora. Se quitó el 2026-10-31 porque esa información
no es de quien vota. Pero **quitar el botón no cierra nada**: `/results` sigue
estando en su URL y cualquiera con sesión podía escribirla, igual que podía
pedir `/api/read?action=getSlots&date=…` a mano.

Por eso la restricción está en el API y no en el HTML. Comprobado el mismo día
contra el entorno local, con dos jugadores votando el 01/11/2026:

```
admin   -> {"17:00":["Adrián C","Davidmen"],"18:00":["Adrián C"],"19:00":["Davidmen"]}
miembro -> {"17:00":["Davidmen"],"19:00":["Davidmen"]}
```

## Lo que esto deja tocado

- **`/results` ya no se enlaza desde ninguna parte.** Sigue funcionando —y
  sigue teniendo su «Organizar partido»— pero sólo escribiendo la URL, y sólo
  enseña algo útil a un administrador. Si hace falta volver a alcanzarla, el
  sitio es la pantalla de administración de jugadores, no `/day`.
- **`/day` sigue necesitando `getSlots`**, pero sólo para marcar tus horas:
  desde que el contador entre paréntesis desapareció, no usa los nombres de
  nadie más.
- Un usuario sin jugador enlazado (`player_id` nulo) recibe un objeto vacío,
  que es lo correcto: no tiene disponibilidad ninguna.
