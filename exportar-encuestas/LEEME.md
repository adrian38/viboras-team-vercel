# Exportar las encuestas a Excel y CSV

Saca de la base del grupo quién votó a quién después de cada partido, con el
id del partido, y lo deja en un Excel y en cuatro CSV.

**Esta carpeta se puede copiar entera a otro ordenador.** No hay que instalar
librerías: sólo hace falta Node.

## Cómo se usa

1. **Instalar Node** si no lo está: <https://nodejs.org>, botón LTS, siguiente
   y siguiente. Para comprobarlo, en una consola: `node --version` (vale 18 o
   superior).
2. **Poner la cadena de conexión.** Crear en esta misma carpeta un fichero de
   texto llamado `conexion.txt` con la cadena dentro y nada más. Empieza por
   `postgres://` y la da quien lleva la base.
3. **Doble clic en `exportar.bat`.** La ventana dice de qué base lee, cuántas
   filas salen y dónde quedaron los ficheros.

Desde una consola es lo mismo: `node exportar.mjs`. También se le puede pasar
la cadena a mano, sin crear el fichero:

```
node exportar.mjs "postgres://usuario:clave@host/neondb"
```

## Qué deja

En `salida\encuestas-AAAA-MM-DD-HHMM\`: cuatro CSV y un `.xlsx` con las mismas
cuatro hojas. Los CSV llevan `;` y BOM, que es lo que espera el Excel en
español.

| Hoja | Qué lleva |
| --- | --- |
| **Opiniones** | Una fila por voto: id del partido, fecha, quién vota, a quién, si era compañero o rival, el ambiente y el nivel. |
| **Jugadores** | Partidos, ganados y los votos que ha recibido cada uno. |
| **Partidos** | Id, fecha, los cuatro nombres, los sets y cuántas opiniones tiene. |
| **Cuentas** | Correo, estado, rol y lo que cada uno rellenó al registrarse. |

### Ojo: 210 filas no son 210 opiniones

Una revancha es otro partido con la misma pantalla de valoración, así que la
misma opinión aparece repetida en varias filas. Para contar sin duplicar, en
la hoja **Opiniones** hay que filtrar la columna `mas reciente` por `Si`. La
columna `copias ese dia` dice cuántas filas son la misma opinión.

### El ambiente no tiene nota

Son tres respuestas (`Buen rollo`, `Neutro`, `No tan bien`) y detrás no hay
ningún número: el que se ponga, se lo inventa quien lo ponga. El **nivel** sí
tiene uno, el que usa la propia aplicación: `nivel valor` es −1 por debajo, 0
en su nivel y +1 por encima.

El **rating** no sale aquí porque no está en la base: lo calcula la propia
página. Para eso está el botón «Exportar jugadores» de `/rating`.

## Sólo lee

Las consultas van en un lote marcado como de sólo lectura, y antes de empezar
el script le pregunta a la base si de verdad lo está: si no, para sin leer
nada. Cualquier intento de escribir lo rechazaría Postgres, no el script.

**Aun así, la cadena de conexión abre la base entera.** Quien tenga el
`conexion.txt` puede, con otro programa cualquiera, cambiar o borrar datos. No
es un fichero que se mande por WhatsApp: si hay que dárselo a alguien de
fuera, lo suyo es pedir una cadena de sólo lectura (un usuario aparte en el
panel de Neon).

Los ficheros que salen llevan **nombres, correos y teléfonos** del grupo.
