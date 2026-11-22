// Rumbo al Trofeo - servidor
// Uso: npm start   (PIN del moderador: variable PIN, por defecto 1234)
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const QRCode = require('qrcode');
const { Server } = require('socket.io');
const { Motor } = require('./lib/motor');

const PUERTO = Number(process.env.PORT) || 3000;
const PIN = String(process.env.PIN || '1234');
const RAIZ = __dirname;
const DATOS = path.join(RAIZ, 'data', 'juego.json');

if (!fs.existsSync(DATOS)) {
  console.error('Falta data/juego.json. Corre primero: npm run datos');
  process.exit(1);
}
const datos = JSON.parse(fs.readFileSync(DATOS, 'utf8'));

const app = express();
app.set('trust proxy', 1);
const servidor = http.createServer(app);
const io = new Server(servidor, { pingInterval: 15000, pingTimeout: 15000 });

function ipLocal() {
  const candidatas = [];
  for (const [nombre, lista] of Object.entries(os.networkInterfaces())) {
    for (const i of lista || []) {
      if (i.family === 'IPv4' && !i.internal) candidatas.push({ nombre, ip: i.address });
    }
  }
  // Prefiere Wi-Fi/Ethernet sobre adaptadores virtuales
  const buena = candidatas.find((c) => !/vEthernet|VirtualBox|VMware|WSL|Hyper-V|Loopback/i.test(c.nombre));
  return (buena || candidatas[0] || { ip: 'localhost' }).ip;
}
const IP = process.env.IP_PUBLICA || ipLocal();

function urlBase(req) {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/+$/, '');
  if (req) {
    const host = (req.get('x-forwarded-host') || req.get('host') || '').split(',')[0].trim();
    if (host && !/^(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?$/i.test(host)) {
      const proto = (req.get('x-forwarded-proto') || req.protocol || 'http').split(',')[0].trim();
      return `${proto}://${host}`;
    }
  }
  if (process.env.RENDER_EXTERNAL_URL) return process.env.RENDER_EXTERNAL_URL.replace(/\/+$/, '');
  if (process.env.RAILWAY_PUBLIC_DOMAIN) return `https://${process.env.RAILWAY_PUBLIC_DOMAIN.replace(/\/+$/, '')}`;
  return `http://${IP}:${PUERTO}`;
}
const urlJugar = (req) => `${urlBase(req)}/jugar?c=${motor.estado.codigo}`;

// ---------- Emisión de estado ----------
let pendiente = false;
function emitirTodo() {
  if (pendiente) return;
  pendiente = true;
  setImmediate(() => {
    pendiente = false;
    for (const s of io.sockets.sockets.values()) emitirA(s);
  });
}
function emitirA(s) {
  const rol = s.data.rol;
  if (rol === 'moderador' && !s.data.autorizado) return;
  try { s.emit('estado', motor.vista(rol, s.data.eid)); } catch (e) { console.error('Error emitiendo:', e); }
}

const motor = new Motor({
  datos,
  archivo: process.env.ESTADO || path.join(RAIZ, 'estado.json'),
  alCambiar: emitirTodo,
  alEvento: (ev) => io.emit(ev),
});

// ---------- Rutas ----------
app.use(express.static(path.join(RAIZ, 'public')));
app.get('/health', (req, res) => res.status(200).json({ ok: true }));
app.get('/', (req, res) => res.redirect('/pantalla'));
app.get('/pantalla', (req, res) => res.sendFile(path.join(RAIZ, 'public', 'pantalla.html')));
app.get('/moderador', (req, res) => res.sendFile(path.join(RAIZ, 'public', 'moderador.html')));
app.get('/jugar', (req, res) => res.sendFile(path.join(RAIZ, 'public', 'jugar.html')));
app.get('/revision', (req, res) => res.sendFile(path.join(RAIZ, 'public', 'revision.html')));
app.get('/api/revision', (req, res) => {
  // Todo el contenido con respuestas, para revisar antes de la sesión. Pide el PIN del moderador.
  if (String(req.get('x-pin') || '') !== PIN) return res.status(401).json({ error: 'PIN incorrecto' });
  // Se lee del disco cada vez: después de 'npm run datos' basta con recargar la página
  try { res.json(JSON.parse(fs.readFileSync(path.join(RAIZ, 'data', 'juego.json'), 'utf8'))); } catch (e) { res.status(500).json({ error: String(e.message) }); }
});
app.get('/api/info', async (req, res) => {
  const base = urlBase(req);
  const url = urlJugar(req);
  const urlCorta = `${base.replace(/^https?:\/\//i, '')}/jugar`;
  const qr = await QRCode.toDataURL(url, { margin: 1, width: 520, color: { dark: '#1a0b3b', light: '#ffffff' } });
  res.json({ url, urlCorta, codigo: motor.estado.codigo, qr });
});
app.get('/api/datos', (req, res) => {
  // Datos públicos para dibujar: tablero, caminos, personajes y reglas (sin cartas ni respuestas)
  res.json({ tablero: datos.tablero, caminos: datos.caminos, personajes: datos.personajes, reglas: datos.reglas, materiales: datos.materiales || [] });
});

// ---------- Sockets ----------
const seguro = (fn) => (...args) => {
  try { fn(...args); } catch (e) { console.error('Error en acción:', e); }
};

io.on('connection', (socket) => {
  const auth = socket.handshake.auth || {};
  const rol = ['pantalla', 'moderador', 'jugador'].includes(auth.rol) ? auth.rol : 'jugador';
  socket.data.rol = rol;

  socket.on('hora', (_, ack) => typeof ack === 'function' && ack(Date.now()));

  if (rol === 'moderador') {
    socket.data.autorizado = String(auth.pin) === PIN;
    if (!socket.data.autorizado) { socket.emit('pin_incorrecto'); return; }
  }
  if (rol === 'jugador' && auth.token) {
    const r = motor.recuperar({ token: auth.token });
    if (r.ok) socket.data.eid = r.equipo.id;
    else socket.emit('sesion_vencida');
  }
  emitirA(socket);

  // ----- Jugador -----
  socket.on('unirse', seguro((d, ack) => {
    const r = motor.unirse(d || {});
    if (r.ok) {
      socket.data.eid = r.equipo.id;
      ack && ack({ ok: true, token: r.equipo.token, eid: r.equipo.id });
      emitirA(socket);
    } else ack && ack(r);
  }));
  socket.on('recuperar', seguro((d, ack) => {
    const r = motor.recuperar({ codigoEquipo: d && d.codigoEquipo });
    if (r.ok) {
      socket.data.eid = r.equipo.id;
      ack && ack({ ok: true, token: r.equipo.token, eid: r.equipo.id });
      emitirA(socket);
    } else ack && ack(r);
  }));
  socket.on('salir', seguro(() => { socket.data.eid = null; emitirA(socket); }));
  socket.on('accion', seguro((d) => {
    const eid = socket.data.eid;
    if (!eid || !d || !motor.eq(eid)) return;
    switch (d.tipo) {
      case 'inicio_responder': motor.responderInicio(eid, d.opcion); break;
      case 'camino': { const r = motor.elegirCamino(eid, d.camino); if (r.error) socket.emit('aviso', r.error); break; }
      case 'dado': motor.tirarDado(eid); break;
      case 'elegir_dado': motor.elegirDado(eid, d.i); break;
      case 'rival': motor.elegirRival(eid, d.rival); break;
      case 'carta': motor.elegirCarta(eid, d.idx); break;
      case 'juego': motor.accionCarta(eid, d.datos); break;
      default: break;
    }
  }));

  // ----- Moderador -----
  socket.on('mod', seguro((d) => {
    if (!socket.data.autorizado || !d) return;
    const m = motor;
    switch (d.tipo) {
      case 'quitar_equipo': m.quitarEquipo(d.equipo); break;
      case 'instructivo': { const r = m.iniciarInstructivo(); if (r.error) socket.emit('aviso', r.error); break; }
      case 'instructivo_paso': m.pasoInstructivo(Number(d.delta) || 0); break;
      case 'quien_empieza': m.iniciarQuienEmpieza(); break;
      case 'inicio_cerrar': m.cerrarInicio(); break;
      case 'inicio_siguiente': m.siguientePreguntaInicio(); break;
      case 'eleccion_camino': m.iniciarEleccionCamino(); break;
      case 'camino_por': { const r = m.elegirCamino(d.equipo, d.camino); if (r.error) socket.emit('aviso', r.error); break; }
      case 'empezar': m.empezarJuego(); break;
      case 'dado': m.tirarDado('moderador'); break;
      case 'elegir_dado': m.elegirDado('moderador', d.i); break;
      case 'rival': m.elegirRival('moderador', d.rival); break;
      case 'carta': m.elegirCarta('moderador', d.idx); break;
      case 'juego': m.accionCarta('moderador', d.datos); break;
      case 'carta_mod': m.accionModeradorCarta(d.datos); break;
      case 'juzgar': m.juzgar(String(d.veredicto)); break;
      case 'siguiente_turno': m.siguienteTurno(); break;
      case 'saltar_turno': m.siguienteTurno(); break;
      case 'repetir_turno': m.repetirTurno(); break;
      case 'mover': m.moverFicha(d.equipo, d.casilla, d.camino); break;
      case 'quitar_bonus': m.quitarBonus(d.equipo, d.i); break;
      case 'tiempo_iniciar': m.tiempoIniciar(); break;
      case 'tiempo_pausar': m.tiempoPausar(); break;
      case 'tiempo_reiniciar': m.tiempoReiniciar(); break;
      case 'tiempo_ajustar': m.tiempoAjustar(Number(d.seg) || 0); break;
      case 'dudosa': m.decidirDudosa(d.id, d.aceptar); break;
      case 'terminar': m.terminarPartida(null); break;
      case 'declarar_ganador': m.declararGanador(d.equipo); break;
      case 'volver_al_juego': m.volverAlJuego(); break;
      case 'nueva_partida': m.nuevaPartida(); break;
      case 'forzar_carta': {
        // Solo para pruebas automáticas (RT_PRUEBA=1). En el juego real no existe.
        if (!process.env.RT_PRUEBA || !m.estado.turno || !m.carta(d.id)) break;
        const eid = m.estado.turno.equipoId;
        m.nuevoTurno(eid);
        if (m.carta(d.id).tipo === 'Duelo') m.estado.turno.duelo = [eid, m.activos().find((x) => x.id !== eid).id];
        m.iniciarCarta(d.id);
        break;
      }
      default: break;
    }
  }));
});

process.on('uncaughtException', (e) => console.error('Error inesperado (el juego sigue):', e));
process.on('unhandledRejection', (e) => console.error('Promesa rechazada (el juego sigue):', e));

servidor.listen(PUERTO, '0.0.0.0', () => {
  const base = urlBase();
  console.log('\n  🏆 RUMBO AL TROFEO');
  console.log(`  Pantalla (videobeam): ${base}/pantalla`);
  console.log(`  Moderador:            ${base}/moderador   (PIN ${PIN})`);
  console.log(`  Celulares:            ${base}/jugar`);
  console.log(`  Código de la partida: ${motor.estado.codigo}\n`);
});
