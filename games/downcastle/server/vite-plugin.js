/* Relay de salas en desarrollo: atiende /downcastle-ws en el mismo servidor de Vite (dev y
   preview), así también se juega con teléfonos reales en la misma Wi-Fi (`vite --host`).
   Usa la misma lógica de sala (room.js) que el Durable Object de producción. */
import { createRooms, MAX_MSG } from './room.js';

async function attach(httpServer, base) {
  if (!httpServer) return;
  const { WebSocketServer } = await import('ws');
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MSG });
  const rooms = createRooms();
  const path = (base || '/').replace(/\/$/, '') + '/downcastle-ws';
  httpServer.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname !== path && url.pathname !== '/downcastle-ws') return; // el resto (HMR) no es nuestro
    wss.handleUpgrade(req, socket, head, (ws) => {
      const sock = {
        send: (s) => { if (ws.readyState === 1) ws.send(s); },
        close: (code, reason) => ws.close(code, reason),
      };
      const h = rooms.connect(sock, {
        code: url.searchParams.get('sala'),
        create: url.searchParams.get('create') === '1',
        pid: url.searchParams.get('pid'),
        max: url.searchParams.get('max'),
      });
      if (!h) return;
      ws.on('message', (data) => h.message(data.toString()));
      ws.on('close', () => h.close());
      ws.on('error', () => h.close());
    });
  });
}

export function downcastleRelay() {
  return {
    name: 'downcastle-relay',
    configureServer(server) { return attach(server.httpServer, server.config.base); },
    configurePreviewServer(server) { return attach(server.httpServer, server.config.base); },
  };
}
