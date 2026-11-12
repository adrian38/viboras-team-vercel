# Los partidos de torneo no se editan como partidos sueltos

Un partido de pozo **es una fila de `matches` como cualquier otra**. Lo único
que lo distingue es su `event_id`, que apunta a un `events` de tipo `pozo`, y
que sus juegos se guardan en `set1_team1` / `set1_team2` con `format`
`timed_games`. Nada en la fila dice «esto lo sube un administrador».

Por eso, hasta el 2026-11-12, la regla del pozo tenía una puerta de atrás. La
regla vive en `submitPozoResult` (`api/_pozo-api.js`):

```js
function puedeTocar(user) {
  if (user.role === 'admin') return null;
  return 'El marcador lo sube un administrador. ...';
}
```

Pero `submitResult` y `deleteResult` (`api/write.js`) tienen otro permiso —«los
cuatro jugadores del partido o un administrador»— y **no miraban de qué evento
era la fila**. Un miembro que jugaba en una pista podía sobrescribir su marcador
o borrar el partido entero sin ser administrador.

## Medido en el entorno local el 2026-11-12

Pozo de 2 pistas y 3 rondas; sesión sembrada a mano para un miembro
(`users.role = 'member'`) que juega en la pista 2. Con el `api/write.js`
anterior:

| Llamada | Respuesta | Efecto |
| --- | --- | --- |
| `submitPozoResult` | 403 `forbidden` | ninguno (la regla del pozo funcionaba) |
| `submitResult` con `_original.id` del partido | **200** | el marcador pasó de 9-1 a 6-0 |
| `deleteResult` con el mismo id | **200** | el partido desapareció |

Por la interfaz no se llegaba: `/history` pide `eventType=ranked,legacy` y no
ve estos partidos, y `/tournaments` sólo lee. Pero el id, la fecha y los cuatro
nombres que hacen falta los da `getResults?eventType=pozo`, que contesta a
cualquiera con sesión.

## Cómo está cerrado

`vetadoPorTorneo()` en `api/write.js`: antes de editar o de borrar, lee el tipo
de evento del partido y responde 403 `es_de_torneo` si es uno de

```js
const EVENTOS_DE_TORNEO = ['pozo', 'compas', 'doble_ko'];
```

Dos decisiones deliberadas:

- **Se cierra por tipo de evento, no por rol.** Un administrador tampoco sube
  por aquí el marcador de un pozo: cada torneo tiene su pantalla y sus reglas
  (`submitPozoResult` sincroniza las rondas siguientes; `submitResult` no, y
  dejaría el torneo a medias sin avisar).
- **`ranked`, `legacy`, `unranked` y `grupo_liga` siguen igual que antes.** Lo
  pidió Adrián explícitamente: el veto es sólo para los torneos. Los partidos
  de liga se editan como siempre.

Una fila que no existe no es de torneo: `vetadoPorTorneo()` devuelve `false` y
de ella se encarga el 409 que ya tenían las dos acciones.

## Lo que esto no cubre

- **No hay guarda mecánica.** Un `case` nuevo en `api/write.js` que escriba en
  `matches` vuelve a abrir la puerta, y `npm run check` no lo verá.
- **`league-admin.js` escribe en `matches` por su cuenta** y no pasa por aquí;
  está detrás de `exigirAdmin`, así que no hace falta, pero si algún día deja
  de estarlo, este veto no lo protege.
- La comprobación cuesta un `SELECT` extra por edición y por borrado. Son
  acciones de una en una, no un bucle.

## La trampa de probarlo en local

`api/` está montado en caliente (`docker-compose.yml`), pero **el módulo se
queda en caché**: editar `api/write.js` y volver a llamar al API sigue
ejecutando el código de antes. Hay que `docker compose restart app`. La primera
prueba de este arreglo dio «cerrado» con el fichero viejo en disco justo por
esto. Y el entorno local responde en **`localhost:3001`**, no en el 3000 que
dice `CLAUDE.md`: `ports: - "3001:3000"`.
