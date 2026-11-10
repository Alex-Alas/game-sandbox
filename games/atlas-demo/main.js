// Demo de prueba: sprites del dataset Pixel Art Atlas (CC0). Ver public/atlas-demo/CREDITS.md
const cvs = document.getElementById('c');
const ctx = cvs.getContext('2d');
const W = cvs.width, H = cvs.height;
const $ = (id) => document.getElementById(id);
const BASE = import.meta.env?.BASE_URL ?? '/';
const SIZE = 16;
const keys = new Set();
let pointerX = null;

const sprites = [];
let index = [];
const images = [];

async function load() {
  index = await (await fetch(`${BASE}atlas-demo/sprites/index.json`)).json();
  for (const s of index) {
    const img = new Image();
    img.src = `${BASE}atlas-demo/sprites/${s.file}`;
    images.push(img);
  }
}

let state, last = 0, spawnT = 0;

function reset() {
  state = { running: true, score: 0, lives: 3, basketX: W / 2 - 20, items: [], t: 0, speed: 40 };
  spawnT = 0;
}

function draw() {
  ctx.fillStyle = '#14121f';
  ctx.fillRect(0, 0, W, H);
  for (let y = 0; y < H; y += 24) { // suelo de rayas
    ctx.fillStyle = y % 48 ? '#1d1a2e' : '#221e37';
    ctx.fillRect(0, y, W, 24);
  }
  for (const it of state.items) ctx.drawImage(images[it.k], Math.round(it.x), Math.round(it.y), SIZE, SIZE);
  ctx.fillStyle = '#c8873a';
  ctx.fillRect(Math.round(state.basketX), H - 20, 40, 6);
  ctx.fillRect(Math.round(state.basketX) - 2, H - 16, 44, 4);
  $('score').textContent = state.score;
  $('lives').textContent = '♥'.repeat(state.lives) || '✕';
}

function step(dt) {
  const dir = (keys.has('ArrowLeft') || keys.has('a') || keys.has('A') ? -1 : 0) + (keys.has('ArrowRight') || keys.has('d') || keys.has('D') ? 1 : 0);
  if (pointerX !== null) state.basketX = pointerX - 20;
  state.basketX = Math.max(0, Math.min(W - 40, state.basketX + dir * 120 * dt));
  state.t += dt;
  state.speed = 40 + state.t * 1.5;
  spawnT -= dt;
  if (spawnT <= 0) {
    spawnT = Math.max(0.45, 1.1 - state.t * 0.01);
    state.items.push({ x: Math.random() * (W - SIZE), y: -SIZE, k: Math.floor(Math.random() * images.length) });
  }
  for (const it of state.items) it.y += state.speed * dt;
  state.items = state.items.filter((it) => {
    const inBasket = it.y + SIZE >= H - 16 && it.y <= H - 14 && it.x + SIZE > state.basketX && it.x < state.basketX + 40;
    if (inBasket) { state.score += 10; return false; }
    if (it.y > H) { state.lives--; return false; }
    return true;
  });
  if (state.lives <= 0) {
    state.running = false;
    $('text').textContent = `Fin · puntaje ${state.score}`;
    $('go').textContent = 'Otra vez';
    $('msg').hidden = false;
  }
}

function frame(ts) {
  const dt = Math.min(0.05, (ts - last) / 1000 || 0);
  last = ts;
  if (state?.running) step(dt);
  if (state) draw();
  requestAnimationFrame(frame);
}

function start() { reset(); $('msg').hidden = true; }
$('go').addEventListener('click', start);
addEventListener('keydown', (e) => { keys.add(e.key); if (e.key.startsWith('Arrow')) e.preventDefault(); });
addEventListener('keyup', (e) => keys.delete(e.key));
const toCanvasX = (e) => (e.clientX - cvs.getBoundingClientRect().left) * (W / cvs.getBoundingClientRect().width);
cvs.addEventListener('pointerdown', (e) => { pointerX = toCanvasX(e); });
cvs.addEventListener('pointermove', (e) => { if (e.buttons) pointerX = toCanvasX(e); });
addEventListener('pointerup', () => { pointerX = null; });

load().then(() => requestAnimationFrame(frame));
