/* Lógica pura de sala de DOWNCASTLE, compartida por el Durable Object (producción) y el
   plugin de Vite (desarrollo). No sabe de transporte: cada conexión es un objeto con
   send(texto) y close(código, motivo).

   - El primero (create=1) es el anfitrión; hasta 4 lugares (o `max`, de 2 a 8, si lo pide al crear: CATAPUM). Un lugar queda reservado al
     desconectarse (el personaje cuelga como peso muerto) y se recupera con el mismo pid.
   - Invitado → servidor: cualquier JSON; se le reenvía al anfitrión como { t:'from', id, m }.
   - Anfitrión → servidor: { to?, m } (a uno o a todos los invitados) o { t:'drop', id }
     para liberar un lugar.
   - Servidor → anfitrión: { t:'peer', id, on } cuando un invitado entra o sale.
   - Si se va el anfitrión, la sesión termina con un aviso ({ t:'end' }).
   - La sala se cierra si queda vacía 2 min. */
export const MAX_PLAYERS = 4, MAX_CAP = 8;
export const MAX_MSG = 16 * 1024;
export const EMPTY_CLOSE_MS = 2 * 60 * 1000;
export const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // sin I ni O

export const validCode = (c) => typeof c === 'string' && c.length === 4 && [...c].every((ch) => CODE_CHARS.includes(ch));

function send(sock, obj) {
  try { sock.send(typeof obj === 'string' ? obj : JSON.stringify(obj)); } catch { /* socket cerrado */ }
}
function fail(sock, err) {
  send(sock, { t: 'err', err });
  try { sock.close(4004, err); } catch { /* */ }
  return null;
}

export class Room {
  constructor(code, { onClose = () => {}, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
    this.code = code;
    this.peers = new Map(); // id → { id, pid, sock, host } conectados
    this.slots = new Map(); // pid → id, conectados o reservados
    this.hostId = null;
    this.nextId = 1;
    this.closed = false;
    this.max = MAX_PLAYERS;
    this.timer = null;
    this.onClose = onClose;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
  }

  attach(sock, { pid, create, max }) {
    if (this.closed) return fail(sock, 'noroom');
    if (create && this.hostId != null) return fail(sock, 'exists');
    if (!create && this.hostId == null) return fail(sock, 'noroom');
    pid = String(pid || '').slice(0, 40) || Math.random().toString(36).slice(2);
    let id = this.slots.get(pid);
    const re = id != null;
    if (re) {
      const old = this.peers.get(id);
      if (old) { this.peers.delete(id); try { old.sock.close(4000, 'reemplazado'); } catch { /* */ } }
    } else {
      if (create && this.hostId == null) this.max = Math.max(2, Math.min(MAX_CAP, Math.floor(+max) || MAX_PLAYERS));
      if (this.slots.size >= this.max) return fail(sock, 'full');
      id = this.nextId++;
      this.slots.set(pid, id);
    }
    if (create) this.hostId = id;
    const peer = { id, pid, sock, host: id === this.hostId };
    this.peers.set(id, peer);
    if (this.timer) { this.clearTimer(this.timer); this.timer = null; }
    send(sock, { t: 'welcome', id, host: peer.host, code: this.code, hostId: this.hostId, max: this.max });
    if (!peer.host) this.toHost({ t: 'peer', id, on: true, re });
    return peer;
  }

  message(peer, raw) {
    if (this.closed || this.peers.get(peer.id) !== peer) return;
    if (typeof raw !== 'string') raw = String(raw);
    if (raw.length > MAX_MSG) return;
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m !== 'object') return;
    if (!peer.host) { this.toHost({ t: 'from', id: peer.id, m }); return; }
    if (m.t === 'drop') { this.drop(m.id); return; }
    if (m.m === undefined) return;
    const payload = JSON.stringify(m.m);
    if (m.to != null) { const p = this.peers.get(m.to); if (p) send(p.sock, payload); return; }
    for (const p of this.peers.values()) if (!p.host) send(p.sock, payload);
  }

  detach(peer) {
    if (this.peers.get(peer.id) !== peer) return; // ya reemplazado o cerrado
    this.peers.delete(peer.id);
    if (peer.host) {
      for (const p of this.peers.values()) { send(p.sock, { t: 'end', why: 'host' }); try { p.sock.close(4001, 'host'); } catch { /* */ } }
      this.peers.clear();
      this.close();
      return;
    }
    this.toHost({ t: 'peer', id: peer.id, on: false });
    if (!this.peers.size) this.timer = this.setTimer(() => this.close(), EMPTY_CLOSE_MS);
  }

  drop(id) {
    for (const [pid, sid] of this.slots) if (sid === id) this.slots.delete(pid);
    const p = this.peers.get(id);
    if (p && !p.host) { this.peers.delete(id); send(p.sock, { t: 'end', why: 'kick' }); try { p.sock.close(4002, 'kick'); } catch { /* */ } }
  }

  toHost(obj) {
    const h = this.peers.get(this.hostId);
    if (h) send(h.sock, obj);
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    if (this.timer) this.clearTimer(this.timer);
    this.onClose();
  }
}

/* Varias salas por código (el plugin de Vite; el Durable Object tiene una sola). */
export function createRooms(timers = {}) {
  const rooms = new Map();
  return {
    rooms,
    connect(sock, { code, create, pid, max }) {
      code = String(code || '').toUpperCase();
      if (!validCode(code)) return fail(sock, 'code');
      let room = rooms.get(code);
      if (!room) {
        if (!create) return fail(sock, 'noroom');
        room = new Room(code, { ...timers, onClose: () => rooms.delete(code) });
        rooms.set(code, room);
      }
      const peer = room.attach(sock, { pid, create, max });
      if (!peer) return null;
      return { message: (raw) => room.message(peer, raw), close: () => room.detach(peer) };
    },
  };
}
