// GRISÚ: el juego (F1, el patio de las mecánicas: game.ts) o el escaparate de assets (F0.5: showcase.ts), según la URL.
// `?modo=personajes|enemigos|escenario|efectos|retratos`, `?ch=…` o `?lab=1` abren el escaparate; si no, el juego
// (`?clase=esgrimista|estibador`, `?zona=pasillo|pozo|sala`).
const q = new URLSearchParams(location.search);
const SHOW = ['personajes', 'enemigos', 'escenario', 'efectos', 'retratos'];
const m = q.get('modo');
if (q.has('lab') || q.has('ch') || (m && SHOW.includes(m))) void import('./showcase.ts');
else void import('./game.ts').then((g) => g.startGame());
