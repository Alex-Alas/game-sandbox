/* Worker de salas de DOWNCASTLE: un Durable Object por código de sala.
   GET /ws?sala=ABCD[&create=1]&pid=… (Upgrade: websocket) → el DO de esa sala.
   La lógica de sala es la misma que usa el plugin de Vite en desarrollo (../room.js).
   Despliegue a mano: `npx wrangler deploy` dentro de games/downcastle/server/. */
import { createRooms, validCode } from '../room.js';

export class DowncastleRoom {
  constructor(ctx) {
    this.ctx = ctx;
    this.rooms = createRooms();
  }

  async fetch(req) {
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('se esperaba un websocket', { status: 426 });
    const url = new URL(req.url);
    const [client, server] = Object.values(new WebSocketPair());
    server.accept();
    const sock = {
      send: (s) => { try { server.send(s); } catch { /* cerrado */ } },
      close: (code, reason) => { try { server.close(code, reason); } catch { /* cerrado */ } },
    };
    const h = this.rooms.connect(sock, {
      code: url.searchParams.get('sala'),
      create: url.searchParams.get('create') === '1',
      pid: url.searchParams.get('pid'),
    });
    if (h) {
      server.addEventListener('message', (e) => h.message(typeof e.data === 'string' ? e.data : ''));
      server.addEventListener('close', () => h.close());
      server.addEventListener('error', () => h.close());
    }
    return new Response(null, { status: 101, webSocket: client });
  }
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === '/') return new Response('DOWNCASTLE · salas\n');
    if (url.pathname !== '/ws' && url.pathname !== '/downcastle-ws') return new Response('no encontrado', { status: 404 });
    const code = (url.searchParams.get('sala') || '').toUpperCase();
    if (!validCode(code)) return new Response('código de sala inválido', { status: 400 });
    return env.ROOMS.get(env.ROOMS.idFromName(code)).fetch(req);
  },
};
