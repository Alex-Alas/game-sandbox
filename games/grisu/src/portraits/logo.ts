// El logo «GRISÚ» en píxel (5 × 7 por letra, con contorno de tinta y la tilde en turquesa)
const F: Record<string, string[]> = {
  G: ['01110', '10001', '10000', '10111', '10001', '10001', '01111'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
};
export function drawLogo(cv: HTMLCanvasElement, word = 'GRISU') {
  const sc = 1, W = word.length * 6 + 3, H = 12;
  cv.width = W * sc; cv.height = H * sc;
  const c = cv.getContext('2d')!;
  const on = new Set<string>();
  [...word].forEach((ch, i) => F[ch].forEach((row, y) => [...row].forEach((v, x) => { if (v === '1') on.add(`${2 + i * 6 + x},${3 + y}`); })));
  // tilde de la Ú
  const acc = [[2 + 4 * 6 + 2, 1], [2 + 4 * 6 + 3, 1], [2 + 4 * 6 + 2, 2]];
  const px = (x: number, y: number, col: string) => { c.fillStyle = col; c.fillRect(x * sc, y * sc, sc, sc); };
  const all = new Set([...on, ...acc.map(([x, y]) => `${x},${y}`)]);
  for (const k of all) { const [x, y] = k.split(',').map(Number); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1]]) if (!all.has(`${x + dx},${y + dy}`)) px(x + dx, y + dy, '#1b1420'); }
  for (const k of on) { const [x, y] = k.split(',').map(Number); px(x, y, y < 6 ? '#f3d27e' : y < 8 ? '#b88e44' : '#906527'); }
  for (const [x, y] of acc) px(x, y, '#3bded3');
}
