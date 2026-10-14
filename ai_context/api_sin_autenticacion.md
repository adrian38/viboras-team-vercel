# Los endpoints de escritura no tienen autenticación

Comprobado el 2026-10-08 y **confirmado el 2026-10-14**: no hay contraseña,
token, cabecera ni comprobación de sesión en ninguna de las tres funciones de
`api/`.

> Desde el 2026-10-14 la app tiene cuentas y sesiones
> ([[cuentas_y_sesiones]]), y eso **no cambia nada de este documento**. La
> sesión sólo dice quién eres: `api/read.js`, `api/write.js` y
> `api/league-admin.js` siguen sin mirarla. Si has visto `/cuenta` y has
> supuesto que detrás hay permisos, no los hay.

| Endpoint | Acciones |
| --- | --- |
| `api/read.js` | `getNames`, `getLeagues`, `getResults`, `getSlots` |
| `api/write.js` | `submitName`, `submitResult`, `deleteResult`, `deleteName`, `submitVote` |
| `api/league-admin.js` | `createLeague`, `createLeagueBracket`, `createPozoTournament`, `createCompasTournament`, `updateLeagueSubstitutions` |

Las tres enrutan por `?action=`. Cualquiera que conozca la URL puede crear una
liga, borrar un resultado o dar de baja a un jugador con un `curl`. El botón de
«Administración» de la interfaz es una conveniencia visual, no un control de
acceso.

## Por qué está escrito aquí

Porque es fácil **asumir lo contrario**. Un endpoint que se llama
`league-admin` y una interfaz con botón de administración sugieren que hay un
permiso detrás, y no lo hay. Al tocar esa zona:

- No escribir código que dé por supuesto que `req` viene de un administrador.
- No mover una comprobación «al sitio donde ya se valida», porque no existe.
- Si se añade autenticación, entra por los tres ficheros a la vez: comparten el
  patrón de enrutado pero no una capa común. La pieza para hacerlo ya existe:
  `usuarioDeLaPeticion(req)` y `exigirAdmin(req, res)` en `api/_auth.js`.

## Decisión actual

Es una app de un grupo de pádel con la URL compartida entre conocidos. No está
documentado que se haya decidido asumir el riesgo, sólo que hoy es así. No
cambiarlo sin pedirlo: añadir autenticación rompe el flujo de «subir resultado»
de todo el grupo.

Dato relacionado: `scripts/apply-schema.js` y los volcados de `backups/` llevan
nombres de personas. `backups/` está en `.gitignore` por eso.
