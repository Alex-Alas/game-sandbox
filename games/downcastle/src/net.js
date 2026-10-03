/* Cliente de red: conexión a la sala (con reconexión del invitado usando el mismo pid) y
   búfer de estados para dibujar a los demás interpolados 100 ms en el pasado.
   Protocolo (JSON, valores redondeados, ≤ 16 KB):
     invitado → anfitrión: hello/prof/ready (sala), in {x, h} a 30 Hz, ev {s, e} con número de secuencia
     anfitrión → invitados: lobby, start, st (estado a 20 Hz + fx + ack), res, runend, tolobby */
import { CFG } from './config.js';
import { CODE_CHARS } from '../server/room.js';

export function randomCode() {
  let c = '';
  for (let i = 0; i < 4; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return c;
}

export const ERRORS = {
  exists: 'Ese código ya existe.',
  noroom: 'No existe esa sala.',
  full: 'La sala está llena (4 jugadores).',
  code: 'Código inválido.',
  host: 'El anfitrión se fue. Fin de la sesión.',
  kick: 'El anfitrión te sacó de la sala.',
  net: 'No se pudo conectar con el servidor de salas.',
  noserver: 'No hay servidor de salas configurado. Probá ?solo=1 o ?ws=wss://…',
};

/* on: { welcome(m), message(m), status(estado, motivo) } con estado 'open' | 'reconnecting' | 'closed' */
export function connectRoom({ code, create, pid, on }) {
  let ws = null, welcomed = false, isHost = false, closedByUs = false, fatal = null, tries = 0, timer = 0;
  const conn = {
    code,
    get open() { return !!ws && ws.readyState === 1 && welcomed; },
    send(obj) { if (conn.open) ws.send(JSON.stringify(obj)); },
    close() { closedByUs = true; clearTimeout(timer); try { ws && ws.close(1000); } catch { /* */ } },
  };
  if (!CFG.WS_URL) { setTimeout(() => on.status('closed', 'noserver')); return conn; }
  function open() {
    const q = `sala=${code}&pid=${encodeURIComponent(pid)}${create && !welcomed ? '&create=1' : ''}`;
    try { ws = new WebSocket(`${CFG.WS_URL}?${q}`); } catch { on.status('closed', 'net'); return; }
    ws.onmessage = (e) => {
      let m;
      try { m = JSON.parse(e.data); } catch { return; }
      if (m.t === 'welcome') {
        const first = !welcomed;
        welcomed = true; isHost = m.host; tries = 0;
        on.status('open');
        on.welcome(m, first);
      } else if (m.t === 'err' || m.t === 'end') fatal = m.err || m.why;
      else on.message(m);
    };
    ws.onclose = () => {
      if (closedByUs) return;
      if (fatal || !welcomed || isHost) { on.status('closed', fatal || 'net'); return; }
      if (++tries > 15) { on.status('closed', 'net'); return; }
      on.status('reconnecting');
      timer = setTimeout(open, 1200);
    };
  }
  open();
  return conn;
}

/* Búfer de estados del anfitrión. El reloj del anfitrión se estima con el menor desfase
   visto (que deriva despacio si la latencia sube). */
export function createSnapBuffer() {
  const B = {
    snaps: [],
    offset: null,
    push(msg, now) {
      const off = now - msg.T;
      if (B.offset == null || off < B.offset || B.snaps.length && msg.T < B.snaps[B.snaps.length - 1].T - 1) B.offset = off;
      else B.offset += (off - B.offset) * 0.02;
      msg.recv = now;
      B.snaps.push(msg);
      if (B.snaps.length > 40) B.snaps.shift();
    },
    latest() { return B.snaps[B.snaps.length - 1] || null; },
    /* Devuelve [a, b, f] para dibujar en el tiempo del anfitrión (now − desfase − delay). */
    sample(now, delay) {
      const s = B.snaps;
      if (!s.length) return null;
      const t = now - B.offset - delay;
      if (t <= s[0].T) return [s[0], s[0], 0];
      for (let i = s.length - 1; i > 0; i--) {
        if (s[i - 1].T <= t) {
          const a = s[i - 1], b = s[i];
          if (t >= b.T) return [b, b, 0];
          return [a, b, (t - a.T) / (b.T - a.T || 1)];
        }
      }
      return [s[s.length - 1], s[s.length - 1], 0];
    },
    clear() { B.snaps = []; B.offset = null; },
  };
  return B;
}
