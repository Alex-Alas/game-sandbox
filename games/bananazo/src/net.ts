// Online: salas de 3 sobre el relay de DOWNCASTLE (plugin de Vite en desarrollo, el Worker en producción, `?ws=` para otro).
// El anfitrión es la verdad: corre la bomba y reparte. Protocolo (JSON; PROTO 1, el anfitrión rechaza otro PROTO o juego):
//   invitado → anfitrión: hello {g, v, name} · name {name} · role {r} · act {a} (acción sobre la bomba) · hand {x, y} (la mano del
//     CIEGO en unidades de bomba, ~15 Hz) · ges {g} · hit {to} (bananazo a un papel) · chat {s} · talk {on} · rtc {to, d}
//   anfitrión → todos: lobby {seats, sel, prog} · phase {ph, spec?, seed?, n?} · st {b, ev} (la bomba entera, ~6 Hz y en el acto si
//     pasó algo) · live {h, tk} (mano y quién habla, ~15 Hz) · soc {k: 'ges'|'hit'|'chat', id, r, …} (cada uno filtra según su papel)
//   anfitrión → uno: rtc {from, d} (señalización de la voz)
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // el mismo alfabeto que downcastle/server/room.js
export const GAME = 'bananazo', PROTO = 1, SEATS = 3;
type Env = { DEV?: boolean, BASE_URL?: string };
const ENV: Env = (import.meta as unknown as { env?: Env }).env ?? { DEV: false, BASE_URL: '/' };
const params = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
const WS_PROD = 'wss://downcastle.libre-flow.workers.dev/ws'; // el Worker de DOWNCASTLE (no está desplegado: ver CLAUDE.md)
export function wsUrl() {
  const q = params.get('ws');
  if (q) return q;
  if (ENV.DEV || location.hostname === 'localhost' || location.hostname === '127.0.0.1' || /^\d+\.\d+\.\d+\.\d+$/.test(location.hostname))
    return `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}${ENV.BASE_URL ?? '/'}downcastle-ws`;
  return WS_PROD;
}
export function randomCode() { let c = ''; for (let k = 0; k < 4; k++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]; return c; }
export const validCode = (c: string) => c.length === 4 && [...c].every(ch => CODE_CHARS.includes(ch));
export const ERRORS: Record<string, string> = {
  exists: 'Ese código ya existe.', noroom: 'No existe esa sala.', full: 'La sala está llena (son de a 3).', code: 'Código inválido.',
  host: 'El anfitrión se fue.', kick: 'El anfitrión te sacó.', net: 'No se pudo conectar con el servidor de salas.', game: 'Esa sala es de otro juego.',
  proto: 'El anfitrión tiene otra versión del juego (recargá).',
};

export type Msg = Record<string, unknown>;
export type Conn = { open: boolean, host: boolean, id: number, send(o: unknown): void, close(): void };
type On = { welcome(m: { id: number, host: boolean }): void, message(m: Msg): void, status(st: 'open' | 'reconnecting' | 'closed', why?: string): void };
export function connect(code: string, create: boolean, pid: string, on: On): Conn {
  let ws: WebSocket | null = null, welcomed = false, fatal = '', tries = 0, closed = false, timer = 0;
  const conn: Conn = {
    open: false, host: false, id: 0,
    send(o) { if (ws && ws.readyState === 1 && welcomed) ws.send(JSON.stringify(o)); },
    close() { closed = true; clearTimeout(timer); try { ws?.close(1000); } catch { /* */ } },
  };
  const open = () => {
    const q = `sala=${code}&pid=${encodeURIComponent(pid)}${create && !welcomed ? `&create=1&max=${SEATS}` : ''}`;
    try { ws = new WebSocket(`${wsUrl()}?${q}`); } catch { on.status('closed', 'net'); return; }
    ws.onmessage = e => {
      let m: Msg;
      try { m = JSON.parse(e.data); } catch { return; }
      if (m.t === 'welcome') {
        welcomed = true, tries = 0, conn.open = true, conn.host = !!m.host, conn.id = m.id as number;
        on.status('open');
        on.welcome({ id: conn.id, host: conn.host });
      } else if (m.t === 'err' || m.t === 'end') fatal = String(m.err ?? m.why ?? 'net');
      else on.message(m);
    };
    ws.onclose = () => {
      conn.open = false;
      if (closed) return;
      if (fatal || !welcomed || conn.host) { on.status('closed', fatal || 'net'); return; }
      if (++tries > 15) { on.status('closed', 'net'); return; }
      on.status('reconnecting');
      timer = setTimeout(open, 1200) as unknown as number;
    };
  };
  open();
  return conn;
}

// pid por sala en sessionStorage: recargar vuelve al mismo lugar
export function pidFor(code: string) {
  const k = `bananazo.pid.${code}`;
  try {
    let p = sessionStorage.getItem(k);
    if (!p) { p = Math.random().toString(36).slice(2, 12); sessionStorage.setItem(k, p); }
    return p;
  } catch { return Math.random().toString(36).slice(2, 12); }
}
