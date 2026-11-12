// Las consultas de la exportacion, una por hoja. Separadas del resto porque
// son lo unico que hay que tocar para cambiar lo que sale.
//
// Detalle: ai_context/exportar_encuestas_desde_el_escritorio.md

// matches.date es texto en dos formatos; lo que no encaja en ninguno queda
// NULL, igual que en la vista match_feedback_por_dia (api/_avisos.js).
const DIA = `CASE
  WHEN m.date ~ '^\\d{4}-\\d{2}-\\d{2}$' THEN m.date::date
  WHEN m.date ~ '^\\d{2}/\\d{2}/\\d{4}$' THEN to_date(m.date, 'DD/MM/YYYY')
END`;

// Declaradas y no arrow: tools/code-size.mjs busca la primera llave tras la
// firma, y en una arrow que devuelve una plantilla esa llave no existe.
function equipoDe(jugador) {
  return `CASE
    WHEN ${jugador} IN (m.player1a_id, m.player1b_id) THEN 1
    WHEN ${jugador} IN (m.player2a_id, m.player2b_id) THEN 2
  END`;
}

function enMadrid(col) {
  return `to_char(${col} AT TIME ZONE 'Europe/Madrid', 'YYYY-MM-DD HH24:MI')`;
}

// Una revancha es otro partido con la misma pantalla de valoracion, asi que la
// misma opinion esta repetida en varias filas. `ventana` las agrupa igual que
// la vista match_feedback_por_dia: mismo dia, mismos cuatro, mismo votante y
// mismo votado. Filtrando «mas reciente» = Si salen las opiniones logicas, que
// son las que cuentan la app y la pantalla del panel.
const VENTANA = `PARTITION BY ${DIA}, ARRAY(
    SELECT j FROM unnest(ARRAY[m.player1a_id, m.player1b_id, m.player2a_id, m.player2b_id]) AS j
    ORDER BY j
  ), f.rater_player_id, f.rated_player_id`;

// Los textos son los de la pantalla /valorar (front/pantallas/valorar/valorar.js).
// El numero del nivel es el mismo que usa api/perfil.js para nivel_neto.
const OPINIONES = `
  SELECT f.match_id AS "partido id", to_char(${DIA}, 'YYYY-MM-DD') AS "fecha",
    e.name AS "evento", m.round AS "ronda",
    f.rater_player_id AS "vota id", pr.name AS "vota",
    f.rated_player_id AS "votado id", pd.name AS "votado",
    CASE WHEN ${equipoDe('f.rater_player_id')} IS NULL OR ${equipoDe('f.rated_player_id')} IS NULL
         THEN 'Fuera del partido'
         WHEN ${equipoDe('f.rater_player_id')} = ${equipoDe('f.rated_player_id')} THEN 'Companero'
         ELSE 'Rival' END AS "relacion",
    CASE f.actitud WHEN 'buen_rollo' THEN 'Buen rollo' WHEN 'neutro' THEN 'Neutro'
      WHEN 'mejorable' THEN 'No tan bien' END AS "ambiente",
    CASE f.nivel WHEN 'por_debajo' THEN 'Por debajo' WHEN 'en_su_nivel' THEN 'En su nivel'
      WHEN 'por_encima' THEN 'Por encima' END AS "nivel",
    CASE f.nivel WHEN 'por_debajo' THEN -1 WHEN 'en_su_nivel' THEN 0
      WHEN 'por_encima' THEN 1 END AS "nivel valor",
    ${enMadrid('f.created_at')} AS "contestada", ${enMadrid('f.updated_at')} AS "ultimo cambio",
    CASE WHEN row_number() OVER (${VENTANA}
      ORDER BY f.updated_at DESC, f.id DESC) = 1 THEN 'Si' ELSE 'No' END AS "mas reciente",
    count(*) OVER (${VENTANA})::int AS "copias ese dia"
  FROM match_feedback f
  JOIN matches m ON m.id = f.match_id
  JOIN events e ON e.id = m.event_id
  JOIN players pr ON pr.id = f.rater_player_id
  JOIN players pd ON pd.id = f.rated_player_id
  ORDER BY ${DIA} NULLS LAST, f.match_id, pr.name, pd.name`;

// Partidos jugados y ganados con el mismo criterio que la app: un partido
// organizado y sin jugar esta en la tabla con 0-0 y no cuenta
// (ai_context/contar_partidos_de_un_jugador.md).
const MARCADORES = `
  WITH marcadores AS (
    SELECT m.id, m.player1a_id, m.player1b_id, m.player2a_id, m.player2b_id,
      (CASE WHEN set1_team1 > set1_team2 THEN 1 ELSE 0 END
       + CASE WHEN set2_team1 > set2_team2 THEN 1 ELSE 0 END
       + CASE WHEN set3_team1 > set3_team2 THEN 1 ELSE 0 END) AS sets1,
      (CASE WHEN set1_team2 > set1_team1 THEN 1 ELSE 0 END
       + CASE WHEN set2_team2 > set2_team1 THEN 1 ELSE 0 END
       + CASE WHEN set3_team2 > set3_team1 THEN 1 ELSE 0 END) AS sets2
    FROM matches m
  ), jugados AS (SELECT * FROM marcadores WHERE sets1 + sets2 > 0)`;

// Los votos recibidos salen de match_feedback_por_dia, no de la tabla: una
// revancha es una sola opinion. Son los numeros que enseña la pantalla
// «Jugadores» del panel (api/read.js, getAmbiente).
const JUGADORES = `${MARCADORES}, recibidos AS (
    SELECT rated_player_id AS pid,
      count(*) FILTER (WHERE actitud = 'buen_rollo')::int AS buen_rollo,
      count(*) FILTER (WHERE actitud = 'neutro')::int AS neutro,
      count(*) FILTER (WHERE actitud = 'mejorable')::int AS mejorable,
      count(*) FILTER (WHERE nivel = 'por_debajo')::int AS por_debajo,
      count(*) FILTER (WHERE nivel = 'en_su_nivel')::int AS en_su_nivel,
      count(*) FILTER (WHERE nivel = 'por_encima')::int AS por_encima
    FROM match_feedback_por_dia GROUP BY rated_player_id
  )
  SELECT p.id AS "jugador id", p.name AS "jugador",
    CASE WHEN p.active THEN 'Si' ELSE 'No' END AS "en activo",
    p.court_side AS "lado de pista", p.initial_rating AS "rating de partida",
    (SELECT u.email FROM users u WHERE u.player_id = p.id AND u.status = 'active'
      ORDER BY u.id LIMIT 1) AS "correo",
    (SELECT u.role FROM users u WHERE u.player_id = p.id AND u.status = 'active'
      ORDER BY u.id LIMIT 1) AS "rol",
    (SELECT count(*) FROM jugados j
      WHERE p.id IN (j.player1a_id, j.player1b_id, j.player2a_id, j.player2b_id))::int AS "partidos",
    (SELECT count(*) FROM jugados j
      WHERE (p.id IN (j.player1a_id, j.player1b_id) AND j.sets1 > j.sets2)
         OR (p.id IN (j.player2a_id, j.player2b_id) AND j.sets2 > j.sets1))::int AS "ganados",
    COALESCE(r.buen_rollo, 0) AS "buen rollo", COALESCE(r.neutro, 0) AS "neutro",
    COALESCE(r.mejorable, 0) AS "no tan bien", COALESCE(r.por_debajo, 0) AS "por debajo",
    COALESCE(r.en_su_nivel, 0) AS "en su nivel", COALESCE(r.por_encima, 0) AS "por encima",
    (SELECT count(*) FROM match_feedback f WHERE f.rater_player_id = p.id)::int AS "opiniones que dio"
  FROM players p LEFT JOIN recibidos r ON r.pid = p.id
  ORDER BY LOWER(p.name), p.name`;

const PARTIDOS = `${MARCADORES}
  SELECT m.id AS "partido id", to_char(${DIA}, 'YYYY-MM-DD') AS "fecha",
    m.date AS "fecha guardada", e.name AS "evento", m.format AS "formato", m.round AS "ronda",
    a.name AS "pareja 1a", b.name AS "pareja 1b", c.name AS "pareja 2a", d.name AS "pareja 2b",
    m.set1_team1 AS "set1 p1", m.set1_team2 AS "set1 p2", m.set2_team1 AS "set2 p1",
    m.set2_team2 AS "set2 p2", m.set3_team1 AS "set3 p1", m.set3_team2 AS "set3 p2",
    j.sets1 AS "sets p1", j.sets2 AS "sets p2",
    (SELECT count(*) FROM match_feedback f WHERE f.match_id = m.id)::int AS "opiniones"
  FROM matches m
  JOIN events e ON e.id = m.event_id
  LEFT JOIN jugados j ON j.id = m.id
  LEFT JOIN players a ON a.id = m.player1a_id
  LEFT JOIN players b ON b.id = m.player1b_id
  LEFT JOIN players c ON c.id = m.player2a_id
  LEFT JOIN players d ON d.id = m.player2b_id
  ORDER BY ${DIA} NULLS LAST, m.id`;

const CUENTAS = `
  SELECT u.id AS "cuenta id", u.email AS "correo", u.status AS "estado", u.role AS "rol",
    u.player_id AS "jugador id", p.name AS "jugador",
    u.requested_player_name AS "nombre que pidio",
    ${enMadrid('u.created_at')} AS "alta", ${enMadrid('u.approved_at')} AS "aprobada",
    ${enMadrid('u.rejected_at')} AS "rechazada",
    ${enMadrid('u.email_verified_at')} AS "correo verificado",
    ${enMadrid('u.rules_accepted_at')} AS "normativa aceptada",
    u.signup_form::text AS "inscripcion"
  FROM users u LEFT JOIN players p ON p.id = u.player_id
  ORDER BY u.id`;

export const CONSULTAS = [
  ['Opiniones', OPINIONES], ['Jugadores', JUGADORES],
  ['Partidos', PARTIDOS], ['Cuentas', CUENTAS]
];
