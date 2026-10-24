/**
 * Tiempo real con Socket.io: cada cambio se envía SOLO a los usuarios conectados del mismo cliente
 * (sala `t:<tenantId>`). Solo se aceptan conexiones con una sesión válida (la cookie httpOnly del login).
 */
import { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { readCookie, sessionFromToken } from './auth';
import { config } from './config';
import { bus } from './db';
import { MINUTE } from '../../shared/time';
import { log } from './log';

export function startRealtime(http: HttpServer): Server {
  const io = new Server(http, { path: '/socket.io', cors: { origin: config.corsOrigins, credentials: true }, serveClient: false });

  io.use(async (socket, next) => {
    const s = await sessionFromToken(readCookie(socket.handshake.headers.cookie));
    if (!s || !s.tenant) return next(new Error('unauthorized'));
    socket.data['userId'] = s.user.id;
    socket.data['tenantId'] = s.tenant.id;
    next();
  });

  io.on('connection', (socket) => {
    socket.join('t:' + socket.data['tenantId']);
    log.info('Usuario conectado', { user: socket.data['userId'], tenant: socket.data['tenantId'] });
  });

  bus.on('rt', (tenantId: string, event: string, payload: unknown) => io.to('t:' + tenantId).emit(event, payload));

  // Cada 5 minutos se cierran las conexiones cuya sesión ya no es válida (usuario desactivado, cliente suspendido…).
  const recheck = async () => {
    for (const s of await io.fetchSockets()) {
      const sess = await sessionFromToken(readCookie(s.handshake.headers.cookie));
      if (!sess || sess.tenant?.id !== s.data['tenantId']) s.disconnect(true);
    }
  };
  setInterval(() => recheck().catch((e) => log.error('realtime: revisión de sesiones', e)), 5 * MINUTE);

  return io;
}
