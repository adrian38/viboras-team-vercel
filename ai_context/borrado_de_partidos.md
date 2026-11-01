# Borrar un partido: participantes y administradores

Desde el 2026-11-01 pueden eliminar un partido sus cuatro participantes y los
administradores. Antes los participantes podían editar el resultado, pero el
botón «Eliminar» sólo se añadía para un administrador y `deleteResult` también
exigía ese rol.

La pantalla aplica la misma condición que para editar: `isAdmin || juegaEn(m)`.
No es la barrera de seguridad. `api/write.js` resuelve los cuatro nombres a sus
ids y exige que `user.player_id` esté entre ellos, salvo que la sesión tenga rol
`admin`; los demás reciben 403.

El borrado sigue identificando la fila por `matches.id` y confirma fecha y los
cuatro jugadores en el propio `DELETE`. Así, una pestaña antigua no borra una
fila que otro usuario haya cambiado y una petición no puede autorizarse con un
partido para borrar otro distinto.

Relacionado: [[cuentas_y_sesiones]], [[valoraciones_y_avisos]].
