// Lo que pinta /cuenta.
//
// Hasta el 2026-11-01 estas lineas vivian dentro de cuenta.html. Salen
// aqui sin tocar una coma; el <script> de la pagina las carga en el mismo
// sitio y sin defer, para que el orden de ejecucion no cambie.

const $ = (id) => document.getElementById(id)
let enVuelo = false

// A donde volver despues de entrar. auth-client.js manda aqui con ?volver=
// cuando intentas abrir una pagina sin sesion. Solo se aceptan rutas de este
// sitio: un "volver" que empiece por // o por http seria un redirect abierto.
function destino(){
  const v = new URLSearchParams(location.search).get('volver') || '/'
  return (v.startsWith('/') && !v.startsWith('//')) ? v : '/'
}

function mostrarAviso(texto, ok){
  $('avisoTexto').innerText = texto
  const caja = $('aviso')
  caja.classList.toggle('aviso--ok', ok === true)
  caja.classList.add('visible')
  caja.scrollIntoView({behavior:'smooth', block:'center'})
}

function limpiarAviso(){ $('aviso').classList.remove('visible') }

// `async` y todo lo de dentro esperado: esta funcion es la tarea de
// arranque del velo, asi que la pagina se destapa cuando ella termina. Lo
// que se lance aqui sin esperar aparece DESPUES, encima de la pagina ya
// visible, y eso es un flashazo.
async function pintarSesion(user){
  $('cargando').classList.add('oculto')
  $('panelSesion').classList.toggle('oculto', !user)
  $('panelAcceso').classList.toggle('oculto', !!user)
  $('panelAdmin').classList.toggle('oculto', !user || user.role !== 'admin')
  dibujarBotonesGoogle()
  if(!user) return
  $('sesionJugador').innerText = user.playerName || 'Sin jugador asignado'
  $('sesionCorreo').innerText = user.email
  if(user.playerName && !user.playerActive){
    mostrarAviso('Tu jugador está dado de baja, así que tu nombre no saldrá en las listas. Avisa a un administrador.')
  }
  if(user.role === 'admin') await cargarPendientes()
  // El resto del perfil lo trae /api/perfil (cuenta-perfil.js), y dentro de
  // el va el rating, que es lo que mas tarda. Se espera: el velo sigue
  // puesto hasta que la ultima tarjeta esta pintada.
  if(window.pintarPerfil) await window.pintarPerfil()
}

// El API devuelve {error, message}: el motivo se enseña tal cual, que para eso
// lo escribe en castellano.
async function llamar(action, payload){
  const opciones = payload
    ? {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)}
    : {headers:{accept:'application/json'}}
  const res = await fetch('/api/auth?action=' + action, opciones)
  const json = await res.json().catch(() => ({}))
  if(!res.ok || !json.ok){
    const err = new Error(json.error || 'error')
    err.texto = json.message || 'No se pudo completar la operación. Mira la conexión y vuelve a intentarlo.'
    throw err
  }
  return json
}

async function conBoton(boton, textoOcupado, tarea){
  if(enVuelo) return
  enVuelo = true
  const original = boton.innerHTML
  boton.disabled = true
  boton.textContent = textoOcupado
  try{ await tarea() }
  catch(e){ mostrarAviso(e.texto || 'No se pudo completar la operación.') }
  finally{ enVuelo = false; boton.disabled = false; boton.innerHTML = original }
}

function elegirPestana(alta){
  $('tabEntrar').setAttribute('aria-selected', String(!alta))
  $('tabAlta').setAttribute('aria-selected', String(alta))
  $('formEntrar').classList.toggle('oculto', alta)
  $('formAlta').classList.toggle('oculto', !alta)
  limpiarAviso()
  dibujarBotonesGoogle()
}

// Todos escriben su nombre; si ya jugaba, el servidor lo enlaza con su ficha.
// La casilla «Soy antiguo pirata» y su lista se quitaron el 2026-10-17.
// El formulario de inscripcion se rellena en /inscripcion, en otra pestana, y
// deja las respuestas en localStorage; aqui se leen y van con el alta. El
// evento `storage` avisa cuando la otra pestana las guarda.
const CLAVE_INSCRIPCION = 'vt-inscripcion'

function respuestasInscripcion(){
  try{ const g = JSON.parse(localStorage.getItem(CLAVE_INSCRIPCION) || 'null'); return (g && g.respuestas) || null }
  catch(e){ return null }
}

function pintarInscripcion(){
  const hecho = !!respuestasInscripcion()
  $('estadoInscripcionTexto').textContent = hecho ? 'Formulario de inscripción: rellenado ✓' : 'Formulario de inscripción: sin rellenar'
  $('enlaceInscripcion').textContent = hecho ? 'Revisar' : 'Rellenar'
  $('estadoInscripcion').classList.toggle('hecho', hecho)
  pintarGoogleAlta()
}

// Con la cuenta creada ya estan en el servidor: no se quedan en el navegador,
// ni el formulario ni el borrador del alta.
function olvidarInscripcion(){
  try{ localStorage.removeItem(CLAVE_INSCRIPCION); localStorage.removeItem(CLAVE_BORRADOR) }catch(e){}
  try{ localStorage.removeItem(CLAVE_CONTRASENA) }catch(e){}
  pintarInscripcion()
}

// Borrador del alta. Ir a /inscripcion puede sacarte de esta pagina (en el
// movil, o con «Ir a crear cuenta»), y al volver lo escrito se perdia y la
// pagina abria en «Entrar». Desde el 2026-10-17 (lo pidio Adrian) tambien la
// contrasena, aparte y con caducidad: en localStorage, porque la vuelta puede
// ser por otra pestana (sessionStorage no llega), y sólo 30 minutos desde la
// ultima vez que se escribio. Se borra al crear la cuenta; auth-client.js
// borra la caducada en cualquier pagina.
const CLAVE_BORRADOR = 'vt-alta-borrador'
const CLAVE_CONTRASENA = 'vt-alta-contrasena'
const VIDA_CONTRASENA = 30 * 60 * 1000
const CAMPOS_BORRADOR = ['altaNombre', 'altaCorreo', 'altaNormativa']

function guardarContrasena(){
  try{
    const valor = $('altaPassword').value
    if(valor) localStorage.setItem(CLAVE_CONTRASENA, JSON.stringify({ valor, hasta: Date.now() + VIDA_CONTRASENA }))
    else localStorage.removeItem(CLAVE_CONTRASENA)
  }catch(e){}
}

function leerContrasena(){
  try{
    const c = JSON.parse(localStorage.getItem(CLAVE_CONTRASENA) || 'null')
    if(c && c.hasta > Date.now()) return c.valor
    localStorage.removeItem(CLAVE_CONTRASENA)
  }catch(e){}
  return ''
}

function guardarBorrador(){
  const b = {}
  for(const id of CAMPOS_BORRADOR) b[id] = $(id).type === 'checkbox' ? $(id).checked : $(id).value
  try{ localStorage.setItem(CLAVE_BORRADOR, JSON.stringify(b)) }catch(e){}
  guardarContrasena()
}

function leerBorrador(){
  try{ return JSON.parse(localStorage.getItem(CLAVE_BORRADOR) || 'null') }catch(e){ return null }
}

function restaurarBorrador(){
  const b = leerBorrador()
  if(!b) return
  for(const id of CAMPOS_BORRADOR){
    if(!(id in b)) continue
    if($(id).type === 'checkbox') $(id).checked = !!b[id]
    else $(id).value = b[id]
  }
  if(!$('altaPassword').value) $('altaPassword').value = leerContrasena()
  pintarGoogleAlta()
}

// /cuenta?alta (el enlace de vuelta de /inscripcion), o un alta a medias,
// abren directamente «Crear cuenta».
function quiereAlta(){
  return new URLSearchParams(location.search).has('alta') || !!leerBorrador()
}

function quienSoy(){
  const quien = { newPlayerName: $('altaNombre').value }
  return Object.assign(quien, { acceptRules: $('altaNormativa').checked, signupForm: respuestasInscripcion() })
}

function pintarPendientes(filas){
  const caja = $('listaPendientes')
  caja.innerHTML = ''
  if(filas.length === 0){
    caja.innerHTML = '<p class="vt-small vt-muted">No hay ninguna cuenta esperando.</p>'
    return
  }
  for(const f of filas){
    const fila = document.createElement('div')
    fila.className = 'pendiente'
    const aviso = f.player_active === false ? ' · jugador dado de baja' : ''
    const quien = f.player_name
      ? f.player_name + aviso
      : (f.requested_player_name || 'Sin jugador') + ' · jugador nuevo'
    // Con textContent y no innerHTML: el correo y el nombre pedido los escribe
    // quien se registra, el alta es publica, y esto lo abre un administrador.
    const datos = document.createElement('div')
    datos.className = 'pendiente__quien'
    const nombre = document.createElement('strong')
    nombre.textContent = quien
    const correo = document.createElement('span')
    correo.className = 'pendiente__correo'
    correo.textContent = f.email + (f.email_verified_at ? ' · confirmado' : ' · sin confirmar')
    datos.append(nombre, correo)
    if(f.signup_form) datos.appendChild(respuestasDePendiente(f.signup_form))
    fila.appendChild(datos)
    fila.appendChild(botonesDePendiente(f.id))
    caja.appendChild(fila)
  }
}

const TEXTO_INSCRIPCION = {
  si: 'Sí', no: 'No', ninguno: 'Ninguno', iniciacion: 'Iniciación', intermedio: 'Intermedio',
  avanzado: 'Avanzado', entreno: 'Entreno', mananas: 'Solo mañanas', tardes: 'Solo tardes',
  turnos: 'Turnos mañana/tarde', findes: 'Solo findes', 'mananas-findes': 'Mañanas + findes',
  'tardes-findes': 'Tardes + findes', 'turnos-findes': 'Turnos + findes'
}

// Las respuestas del formulario de inscripcion, plegadas. Con textContent: las
// escribe quien se registra.
function respuestasDePendiente(r){
  const caja = document.createElement('details')
  caja.className = 'pendiente__form'
  const titulo = document.createElement('summary')
  titulo.textContent = 'Formulario de inscripción'
  caja.appendChild(titulo)
  const t = (v) => TEXTO_INSCRIPCION[v] || v || '—'
  const filas = [
    ['Nombre y apellidos', r.fullName], ['Teléfono', r.phone], ['Prueba BK', t(r.bkTest)],
    ['Nivel BK', t(r.bkLevel)], ['Liga', t(r.league)], ['Torneos', t(r.tournaments)],
    ['Ranking/semana', t(r.rankingPerWeek)], ['Disponibilidad', t(r.availability)]
  ]
  for(const [pregunta, respuesta] of filas){
    const linea = document.createElement('div')
    linea.textContent = pregunta + ': ' + (respuesta || '—')
    caja.appendChild(linea)
  }
  return caja
}

function botonesDePendiente(id){
  const acciones = document.createElement('div')
  acciones.className = 'vt-row'
  acciones.style.gap = 'var(--vt-sm)'
  const rol = document.createElement('select')
  rol.className = 'vt-select'
  rol.setAttribute('aria-label', 'Tipo de usuario')
  rol.innerHTML = '<option value="member">Jugador</option><option value="admin">Admin</option>'
  const aprobar = document.createElement('button')
  aprobar.className = 'vt-btn vt-btn--sm'
  aprobar.textContent = 'Aprobar'
  aprobar.onclick = () => conBoton(aprobar, 'Aprobando...', async () => {
    limpiarAviso()
    await llamar('approveUser', {id, role: rol.value})
    await cargarPendientes()
  })
  acciones.appendChild(rol)
  const rechazar = document.createElement('button')
  rechazar.className = 'vt-btn vt-btn--danger vt-btn--sm'
  rechazar.textContent = 'Rechazar'
  rechazar.onclick = () => conBoton(rechazar, 'Rechazando...', async () => {
    limpiarAviso()
    await llamar('rejectUser', {id})
    await cargarPendientes()
  })
  acciones.appendChild(aprobar)
  acciones.appendChild(rechazar)
  return acciones
}

async function cargarPendientes(){
  try{
    const json = await llamar('listPending')
    pintarPendientes(json.pending || [])
  }catch(e){
    $('listaPendientes').innerHTML = '<p class="vt-small vt-muted">No se pudo cargar la lista.</p>'
  }
}

// Un ojo en cada contrasena para verla mientras se escribe (lo pidio Silvia:
// en el movil es facil equivocarse). Se anade aqui y no en el marcado para
// no repetirlo en los tres campos.
function botonesVerContrasena(){
  for(const input of document.querySelectorAll('input[type=password]')){
    const caja = document.createElement('div')
    caja.className = 'clave'
    input.parentNode.insertBefore(caja, input)
    caja.appendChild(input)
    const boton = document.createElement('button')
    boton.type = 'button'
    boton.className = 'ver-clave'
    boton.setAttribute('aria-label', 'Mostrar contraseña')
    boton.innerHTML = '<span class="ms notranslate" translate="no" aria-hidden="true">visibility</span>'
    boton.onclick = () => {
      const ver = input.type === 'password'
      input.type = ver ? 'text' : 'password'
      boton.setAttribute('aria-label', ver ? 'Ocultar contraseña' : 'Mostrar contraseña')
      boton.firstChild.textContent = ver ? 'visibility_off' : 'visibility'
    }
    caja.appendChild(boton)
  }
}
botonesVerContrasena()
// Nombre o normativa: cualquier cambio puede dejar listo el alta con Google.
$('formAlta').addEventListener('input', pintarGoogleAlta)
$('formAlta').addEventListener('change', pintarGoogleAlta)
$('formAlta').addEventListener('input', guardarBorrador)
$('tapaGoogleAlta').onclick = avisarFaltasGoogle
$('formAlta').addEventListener('change', guardarBorrador)
window.addEventListener('storage', (ev) => { if(ev.key === CLAVE_INSCRIPCION) pintarInscripcion() })
// Algun movil congela la pestana de fondo: al volver a ella se mira otra vez.
document.addEventListener('visibilitychange', () => { if(!document.hidden) pintarInscripcion() })
pintarInscripcion()
$('tabEntrar').onclick = () => elegirPestana(false)
$('tabAlta').onclick = () => elegirPestana(true)

$('formEntrar').onsubmit = (ev) => {
  ev.preventDefault()
  conBoton($('btnEntrar'), 'Entrando...', async () => {
    limpiarAviso()
    await llamar('login', {email:$('entrarCorreo').value, password:$('entrarPassword').value})
    window.location.replace(destino())
  })
}

$('formAlta').onsubmit = (ev) => {
  ev.preventDefault()
  conBoton($('btnAlta'), 'Creando...', async () => {
    limpiarAviso()
    if(!respuestasInscripcion()){ mostrarAviso('Rellena el formulario de inscripción antes de crear la cuenta.'); return }
    await llamar('register', Object.assign({
      email: $('altaCorreo').value,
      password: $('altaPassword').value
    }, quienSoy()))
    $('formAlta').reset(); olvidarInscripcion()
    mostrarAviso('Cuenta creada. Te hemos enviado un correo para confirmar tu dirección: ábrelo (mira también en spam). Un administrador tiene que aprobar la cuenta antes de que puedas entrar.', true)
  })
}

$('btnSalir').onclick = () => conBoton($('btnSalir'), 'Saliendo...', async () => {
  if (window.vtPush) await window.vtPush.baja()
  await llamar('logout', {})
  window.location.reload()
})

// La libreria de Google llega con async: puede no estar lista todavia cuando
// esto corre, y no hay evento al que engancharse que sirva en los dos casos.
function esperarGoogle(){
  return new Promise((listo, falla) => {
    const limite = Date.now() + 6000
    const mirar = () => {
      if(window.google && google.accounts && google.accounts.id) return listo()
      if(Date.now() > limite) return falla(new Error('gsi_no_carga'))
      setTimeout(mirar, 100)
    }
    mirar()
  })
}

// Un solo callback para los dos botones: la libreria no admite uno por boton,
// asi que se mira que pestana esta abierta.
function alVolverDeGoogle(respuesta){
  const esAlta = $('tabAlta').getAttribute('aria-selected') === 'true'
  const boton = esAlta ? $('btnAlta') : $('btnEntrar')
  conBoton(boton, 'Entrando...', async () => {
    limpiarAviso()
    if(!esAlta){
      await llamar('googleLogin', {credential: respuesta.credential})
      window.location.replace(destino())
      return
    }
    const json = await llamar('googleRegister', Object.assign({
      credential: respuesta.credential
    }, quienSoy()))
    if(json.status === 'pending'){
      $('formAlta').reset(); olvidarInscripcion()
      mostrarAviso('Cuenta creada. Un administrador tiene que aprobarla antes de que puedas entrar.', true)
      return
    }
    window.location.replace(destino())
  })
}

// Sin GOOGLE_CLIENT_ID la pagina sigue entera: solo no aparece el boton. Es lo
// que pasa en el entorno local, donde no hay credencial.
async function montarGoogle(){
  let clientId = ''
  try{
    const json = await fetch('/api/auth?action=config').then(r => r.json())
    clientId = (json && json.googleClientId) || ''
  }catch(e){ return }
  if(!clientId) return
  try{ await esperarGoogle() }catch(e){ console.error(e); return }
  google.accounts.id.initialize({client_id: clientId, callback: alVolverDeGoogle, ux_mode: 'popup'})
  googleListo = true
  dibujarBotonesGoogle()
  pintarGoogleAlta()
}

let googleListo = false

// El boton de Google es un iframe de Google: su clic no se puede frenar.
// Mientras falte algo, una capa encima (.tapa-google) recibe el clic y dice
// que falta, como hace «Crear cuenta»; sin ella, el alta con Google arrancaria
// sin nombre, sin formulario y sin normativa. Correo y contrasena no hacen
// falta: los pone Google. Devuelve lo que falta, en orden, con su campo.
function faltasParaGoogle(){
  const faltas = []
  if(!$('altaNombre').value.trim()){
    faltas.push({ texto: 'tu nombre', campo: 'altaNombre' })
  }
  if(!respuestasInscripcion()) faltas.push({ texto: 'rellenar el formulario de inscripción', campo: 'enlaceInscripcion' })
  if(!$('altaNormativa').checked) faltas.push({ texto: 'aceptar la normativa', campo: 'altaNormativa' })
  return faltas
}

function pintarGoogleAlta(){
  $('cajaGoogleAlta').classList.toggle('bloqueado', faltasParaGoogle().length > 0)
}

// "Te falta: tu nombre, el formulario y aceptar la normativa", y el foco al
// primer campo pendiente. Sin desplazar: mostrarAviso ya lleva la vista al
// aviso, y dos scrollIntoView seguidos se pisan.
function avisarFaltasGoogle(){
  const faltas = faltasParaGoogle()
  if(!faltas.length) return
  const lista = faltas.map((f) => f.texto)
  const texto = lista.length > 1 ? lista.slice(0, -1).join(', ') + ' y ' + lista[lista.length - 1] : lista[0]
  mostrarAviso('Para registrarte con Google te falta ' + texto + '.')
  $(faltas[0].campo).focus({preventScroll:true})
}

// Google fija el ancho del boton en pixeles al dibujarlo y no lo recalcula.
// Dibujado con la caja oculta (la otra pestana, o el panel aun cargando)
// clientWidth era 0, salia de 300 px, mas ancho que la tarjeta en un movil,
// y su overflow:hidden lo cortaba. Por eso se dibuja cada caja cuando se ve,
// con su ancho real, y otra vez si ese ancho cambia.
function dibujarBotonesGoogle(){
  if(!googleListo) return
  dibujarBoton('googleEntrar', 'sepEntrar', 'signin_with')
  dibujarBoton('googleAlta', 'sepAlta', 'signup_with')
}

function dibujarBoton(hueco, separador, texto){
  const caja = $(hueco)
  $(separador).classList.remove('oculto')
  const ancho = Math.min(400, Math.floor(caja.clientWidth))
  if(ancho < 200 || caja.dataset.ancho === String(ancho)) return
  caja.dataset.ancho = String(ancho)
  caja.innerHTML = ''
  google.accounts.id.renderButton(caja, {
    theme: 'filled_black', size: 'large', shape: 'rectangular',
    text: texto, locale: 'es', width: ancho
  })
}

// auth-client.js lleva defer: los scripts diferidos corren despues del parseo
// y antes de DOMContentLoaded, asi que aqui window.vtMe ya existe. Este script
// esta en linea y se ejecuta antes que el, de modo que fuera del listener no
// existiria todavia.
document.addEventListener('DOMContentLoaded', () => {
  restaurarBorrador()
  if(quiereAlta()) elegirPestana(true)
  montarGoogle()
  window.addEventListener('resize', dibujarBotonesGoogle)
  // La carga de arranque de esta pagina es saber quien eres: hasta entonces
  // no se puede ensenar ni el perfil ni el formulario de entrada. El perfil
  // en si lo pide despues cuenta-perfil.js, ya con la pagina delante.
  vtCargando.arranque(() => window.vtMe.then(pintarSesion), 'Cargando tu cuenta')
})
