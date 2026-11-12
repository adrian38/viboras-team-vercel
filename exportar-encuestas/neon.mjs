// Consultas a Neon por HTTP, sin librerias: el mismo `POST https://<host>/sql`
// que usa por dentro @neondatabase/serverless, con `fetch`, que Node trae de
// serie desde la 18. Asi la carpeta se puede copiar a otro ordenador y
// funcionar con Node a secas, sin `npm install`.
//
// Las consultas van en un lote marcado `Neon-Batch-Read-Only`: Postgres abre
// la transaccion en SOLO LECTURA y rechaza por su cuenta cualquier escritura,
// venga de donde venga. No es confianza en que el SQL de aqui sea un SELECT.
//
// Detalle: ai_context/exportar_encuestas_desde_el_escritorio.md

// La cadena es `postgres://usuario:clave@host/base`. El endpoint HTTP es ese
// mismo host; lo demas viaja en la cabecera, no en la URL.
function hostDe(conexion) {
  let url;
  try {
    url = new URL(conexion.trim().replace(/^postgres(ql)?:/, 'https:'));
  } catch {
    throw new Error('La cadena de conexion no parece una URL de Postgres.');
  }
  if (!url.hostname) throw new Error('La cadena de conexion no trae host.');
  return url.hostname;
}

function mensajeDeError(datos, estado) {
  if (datos && datos.message) return datos.message;
  if (estado === 401 || estado === 403) return 'la base rechazo la contrasena (HTTP ' + estado + ')';
  return 'HTTP ' + estado;
}

// Devuelve, por consulta y en el mismo orden, sus filas y sus columnas con el
// tipo que declara la base (`dataTypeID`), que es lo que distingue un numero
// de un texto: Neon manda todos los valores como texto.
export async function consultarSoloLectura(conexion, consultas) {
  const respuesta = await fetch(`https://${hostDe(conexion)}/sql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Neon-Connection-String': conexion.trim(),
      'Neon-Array-Mode': 'false',
      'Neon-Batch-Read-Only': 'true'
    },
    body: JSON.stringify({ queries: consultas.map((query) => ({ query, params: [] })) })
  });
  const datos = await respuesta.json().catch(() => null);
  if (!respuesta.ok) throw new Error('La base respondio ' + mensajeDeError(datos, respuesta.status));
  if (!datos || !Array.isArray(datos.results)) throw new Error('Respuesta inesperada de la base.');
  return datos.results.map((r) => ({ filas: r.rows || [], campos: r.fields || [] }));
}

// Se pregunta a Postgres, no se da por hecho: si la transaccion no esta en
// solo lectura, el script para antes de leer nada.
export async function comprobarSoloLectura(conexion) {
  const [base, lectura] = await consultarSoloLectura(conexion, [
    'SELECT current_database() AS base',
    'SHOW transaction_read_only'
  ]);
  if (lectura.filas[0].transaction_read_only !== 'on') {
    throw new Error('La conexion no quedo en solo lectura; no sigo.');
  }
  return base.filas[0].base;
}
