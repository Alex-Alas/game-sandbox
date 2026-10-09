// El manual (lo lee solo el MUDO con la bomba armada): una página por módulo con su tabla, que sale de la semilla de la bomba.
// En la sala se puede hojear uno de ejemplo (las tablas cambian en cada bomba). También están acá los textos de «cómo se
// desactiva» que muestra la sesión informativa, con lo que hace cada uno.
import { tables, type Tables, type WireRule, MAZE_N } from './sim/tables.ts';
import { COLORS, LIGHTS, NOTES, BRAILLE, type Role } from './sim/const.ts';
import { modName, isChaos, ALARM_T, type Kind } from './sim/mods.ts';
import { HEX, symbol } from './draw.ts';

export const HOW: Record<Kind, { look: string } & Record<Role, string>> = {
  cables: { look: 'De 3 a 6 cables de colores y una luz.',
    sordo: 'Decí la luz, cuántos cables hay y sus colores de izquierda a derecha.', mudo: 'Buscá la regla (luz × cantidad) y mostrá el número de cable con los dedos.', ciego: 'Contá los cables desde la izquierda y cortá el que te digan.' },
  calc: { look: 'Una pantalla con una cuenta, un teclado y cuatro botones con una luz.',
    sordo: 'Leé la cuenta. Cuando el resultado está bien se prende la luz: decí su color.', mudo: 'Con la luz y si el resultado es par o impar, buscá cuál de los 4 botones va.', ciego: 'Escribí el resultado en el teclado (los números están en braille), OK, y después apretá el botón que te digan.' },
  dir: { look: 'Una cruz de flechas, una placa braille y una luz. Dos etapas.',
    sordo: 'Decí el color de la luz.', mudo: 'Número × luz = flecha. Mostrala con la mano.', ciego: 'Leé el número en braille y decíselo al MUDO. Apretá la flecha que te digan.' },
  slide: { look: 'Tres correderas con perillas de colores y un botón OK.',
    sordo: 'Decí el color de cada perilla, de izquierda a derecha.', mudo: 'Para cada una: color × posición = arriba, al medio o abajo.', ciego: 'Mové cada perilla adonde te digan y apretá OK.' },
  bells: { look: 'Nueve timbres de colores en una grilla de 3 × 3.',
    sordo: 'Mirá dónde para la mano del CIEGO y decí el color de ese timbre.', mudo: 'Número × color = tres timbres en orden (la grilla se numera como un teléfono).', ciego: 'Tocá los timbres hasta encontrar el que suena (solo vos lo oís). Leé su número en braille.' },
  piano: { look: 'Un piano de 7 teclas, una placa braille (la octava) y una luz.',
    sordo: 'Decí el color de la luz. Las teclas tienen el nombre escrito.', mudo: 'Octava × luz = cuatro notas. Oís el piano: avisá si sale mal.', ciego: 'Leé la octava en braille. Tocá las notas en orden (un error y se empieza de nuevo).' },
  dial: { look: 'Una ruleta con seis símbolos, una aguja y cuatro botones de colores. Dos etapas.',
    sordo: 'Decí qué símbolo marca la aguja (y si es lleno o hueco).', mudo: 'Símbolo = color del botón. No podés decir colores: que el SORDO pregunte y respondé sí o no.', ciego: 'Girá la aguja hasta que zumbe (solo vos lo oís). Apretá el botón que te digan.' },
  simon: { look: 'Cuatro botones de colores en rombo; uno echa vapor. Tres etapas.',
    sordo: 'Decí el color del botón que echa vapor y en qué etapa van.', mudo: 'Etapa × color que quema = color a apretar. En cada etapa se repiten todas las anteriores.', ciego: 'El que quema lo sentís con la mano. Apretá la secuencia entera, desde el principio.' },
  morse: { look: 'Tres enchufes con aros de colores, una pantalla con un orden de colores y un teclado.',
    sordo: 'Decí el orden de los colores de la pantalla y de qué color es cada enchufe.', mudo: 'Traducí cada código a su número.', ciego: 'Tocá cada enchufe y escuchá su código (corto o largo). Escribí los tres números en el orden de la pantalla y OK.' },
  maze: { look: 'Una grilla de 5 × 5 con un punto rojo y un aro verde, una placa braille y flechas.',
    sordo: 'Decí dónde están el rojo y el verde (fila A–E, columna 1–5).', mudo: 'El número en braille dice qué laberinto es. Guiá paso a paso con las flechas.', ciego: 'Leé el número en braille. Apretá las flechas de a una (chocar una pared es error).' },
  switch: { look: 'Cuatro palancas, con una luz arriba y una placa braille abajo cada una, y un OK.',
    sordo: 'Decí los colores de las cuatro luces.', mudo: 'Luz × número = arriba o abajo, palanca por palanca.', ciego: 'Leé los cuatro números en braille. Poné cada palanca y apretá OK.' },
  press: { look: 'Un reloj de presión con aguja y una válvula roja. No se desactiva.',
    sordo: 'Vigilá la aguja: si pasa lo amarillo, avisá.', mudo: 'La oís sisear cada vez más fuerte. Avisá si nadie la atiende.', ciego: 'Apretá la válvula para bajar la presión (el siseo te dice cuánto falta).' },
  alarm: { look: 'Una sirena y seis botones. No se desactiva.',
    sordo: 'Cuando gira la luz roja, decí qué botones echan vapor.', mudo: 'La sirena se oye: avisá.', ciego: `Cuando suena, sentí cuáles queman y apretalos todos en menos de ${ALARM_T} s.` },
};

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const chip = (c: number) => `<span class="chip" style="--c:${HEX[c]}">${COLORS[c]}</span>`;
const dot = (c: number) => `<span class="dot" style="--c:${HEX[c]}" title="${COLORS[c]}"></span>`;
const ARROWS = ['↑', '→', '↓', '←'];
const POSW = ['ABAJO', 'MEDIO', 'ARRIBA'];
const cab = (i: number) => `<b>${i + 1}</b>`;

function wireText(w: WireRule) {
  switch (w.t) {
    case 'pos': return `Cortá el ${cab(w.i)}.`;
    case 'any': return `Si hay algún ${chip(w.c)}: el ${w.last ? 'último' : 'primer'} ${COLORS[w.c]}. Si no: el ${cab(w.i)}.`;
    case 'many': return `Si hay más de un ${chip(w.c)}: el ${cab(w.a)}. Si no: el ${cab(w.b)}.`;
    case 'end': return `Si el último es ${chip(w.c)}: el ${cab(w.a)}. Si no: el ${cab(w.b)}.`;
    case 'none': return `Si no hay ningún ${chip(w.c)}: el ${cab(w.a)}. Si no: el ${cab(w.b)}.`;
  }
}
const lightHead = () => Array.from({ length: LIGHTS }, (_, c) => `<th>${dot(c)} ${COLORS[c].toUpperCase()}</th>`).join('');
const brailleSvg = (n: number) => `<svg class="br" viewBox="0 0 10 14">${[1, 2, 3, 4, 5, 6].map(d => `<circle cx="${d > 3 ? 7 : 3}" cy="${3 + ((d - 1) % 3) * 4}" r="${BRAILLE[n].includes(d) ? 1.6 : 0.6}"/>`).join('')}</svg>`;
function mazeSvg(tb: Tables, k: number) {
  const mz = tb.maze[k], N = MAZE_N, c = 10, o = 8;
  let s = `<svg class="mz" viewBox="0 0 ${o + N * c + 3} ${o + N * c + 3}">`;
  for (let i = 0; i < N; i++) s += `<text x="${o + i * c + c / 2}" y="6">${i + 1}</text><text x="3" y="${o + i * c + c / 2 + 1.5}">${'ABCDE'[i]}</text>`;
  s += `<rect x="${o}" y="${o}" width="${N * c}" height="${N * c}" class="wall"/>`;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x, px = o + x * c, py = o + y * c;
    s += `<circle cx="${px + c / 2}" cy="${py + c / 2}" r="0.8" class="cell"/>`;
    if (x < N - 1 && mz.wr[i]) s += `<line x1="${px + c}" y1="${py}" x2="${px + c}" y2="${py + c}" class="wall"/>`;
    if (y < N - 1 && mz.wd[i]) s += `<line x1="${px}" y1="${py + c}" x2="${px + c}" y2="${py + c}" class="wall"/>`;
  }
  return s + '</svg>';
}

function table(head: string, rows: string[]) { return `<table><thead><tr>${head}</tr></thead><tbody>${rows.map(r => `<tr>${r}</tr>`).join('')}</tbody></table>`; }
export function pageHtml(k: Kind, tb: Tables): string {
  const h = HOW[k];
  let body = '';
  switch (k) {
    case 'cables':
      body = '<p>Los cables se cuentan <b>de izquierda a derecha</b>, del 1 en adelante (los cortados también cuentan). Buscá la fila de la luz y la columna de la cantidad de cables.</p>' +
        table('<th>LUZ</th>' + [3, 4, 5, 6].map(n => `<th>${n} cables</th>`).join(''), tb.cables.map((row, c) => `<th>${dot(c)} ${COLORS[c]}</th>${row.map(w => `<td>${wireText(w)}</td>`).join('')}`));
      break;
    case 'calc':
      body = '<p>Primero la cuenta tiene que estar bien: recién ahí se prende la luz. Los botones se numeran <b>1 2</b> arriba y <b>3 4</b> abajo.</p>' +
        table('<th>LUZ</th><th>RESULTADO PAR</th><th>RESULTADO IMPAR</th>', tb.calc.map((r, c) => `<th>${dot(c)} ${COLORS[c]}</th><td class="big">botón ${r[0] + 1}</td><td class="big">botón ${r[1] + 1}</td>`));
      break;
    case 'dir':
      body = '<p>Número de la placa braille × color de la luz. Son dos etapas: la placa y la luz cambian.</p>' +
        table('<th>N.º</th>' + lightHead(), tb.dir.map((r, n) => `<th>${n + 1}</th>${r.map(d => `<td class="big">${ARROWS[d]}</td>`).join('')}`));
      break;
    case 'slide':
      body = '<p>Las correderas se cuentan de izquierda a derecha. Cada perilla va según su color y su lugar.</p>' +
        table('<th>COLOR</th><th>1.ª</th><th>2.ª</th><th>3.ª</th>', tb.slide.map((r, c) => `<th>${chip(c)}</th>${r.map(p => `<td>${POSW[p]}</td>`).join('')}`));
      break;
    case 'bells':
      body = '<p>Uno solo de los timbres suena al tocarlo (lo oye el CIEGO). Con su número braille y su color, apretá tres timbres en orden. La grilla se numera así:</p>' +
        '<div class="grid9">' + [1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<span>${n}</span>`).join('') + '</div>' +
        table('<th>N.º</th>' + lightHead(), tb.bells.map((r, n) => `<th>${n + 1}</th>${r.map(s => `<td>${s.map(x => x + 1).join(' · ')}</td>`).join('')}`));
      break;
    case 'piano':
      body = '<p>Octava (placa braille) × luz = cuatro notas en orden. Las teclas van de DO a SI, de izquierda a derecha.</p>' +
        table('<th>OCTAVA</th>' + lightHead(), tb.piano.map((r, o) => `<th>${o + 1}</th>${r.map(m => `<td>${m.map(n => NOTES[n]).join(' ')}<br><small>${m.map(n => n + 1).join(' · ')}</small></td>`).join('')}`));
      break;
    case 'dial':
      body = '<p>El símbolo que marca la aguja cuando zumba dice qué color apretar. Son dos etapas (zumba en otro lugar).</p><div class="syms">' +
        tb.dial.map((c, s) => `<div class="sym"><canvas data-sym="${s}" width="64" height="64"></canvas>${chip(c)}</div>`).join('') + '</div>';
      break;
    case 'simon':
      body = '<p>En cada etapa echa vapor otro botón. La respuesta de la etapa se <b>suma</b> a las anteriores: en la etapa 3 se aprietan las tres respuestas, desde la primera.</p>' +
        table('<th>ETAPA</th>' + Array.from({ length: LIGHTS }, (_, c) => `<th>quema ${dot(c)}</th>`).join(''), tb.simon.map((r, s) => `<th>${s + 1}</th>${r.map(c => `<td>${chip(c)}</td>`).join('')}`));
      break;
    case 'morse':
      body = '<p>Cada enchufe repite un número en morse: <b>●</b> corto, <b>▬</b> largo. Los números se escriben en el orden de colores que muestra la pantalla.</p>' +
        '<div class="morse">' + tb.morse.map((c, d) => `<div><b>${d}</b><span>${[...c].map(x => x === '.' ? '●' : '▬').join(' ')}</span></div>`).join('') + '</div>';
      break;
    case 'maze':
      body = '<p>El número braille dice cuál de los seis laberintos es. Filas A–E de arriba abajo, columnas 1–5 de izquierda a derecha. Chocar una pared es error.</p>' +
        '<div class="mazes">' + tb.maze.map((_, k) => `<div><b>${k + 1}</b>${brailleSvg(k + 1)}${mazeSvg(tb, k)}</div>`).join('') + '</div>';
      break;
    case 'switch':
      body = '<p>Cada palanca va según el color de su luz (arriba) y su número braille (abajo). Después, OK.</p>' +
        table('<th>LUZ</th>' + [1, 2, 3, 4, 5, 6].map(n => `<th>${n}</th>`).join(''), tb.sw.map((r, c) => `<th>${dot(c)} ${COLORS[c]}</th>${r.map(u => `<td class="big">${u ? '↑' : '↓'}</td>`).join('')}`));
      break;
    case 'press':
      body = '<p>La aguja sube sola. Cada apretón de la válvula la baja un poco. Si llega al final: <b>error</b> (y vuelve a empezar). No se desactiva: hay que atenderla hasta terminar los demás módulos.</p>';
      break;
    case 'alarm':
      body = `<p>Cada tanto suena la sirena y algunos botones se calientan (echan vapor). Hay que apretar <b>todos</b> los que queman en menos de ${ALARM_T} segundos o es error. No se desactiva.</p>`;
      break;
  }
  return `<h2>${modName(k)}${isChaos(k) ? ' <span class="tag">CAOS</span>' : ''}</h2><p class="look">${esc(h.look)}</p>${body}
    <div class="roles"><div><b>SORDO</b> ${esc(h.sordo)}</div><div><b>MUDO</b> ${esc(h.mudo)}</div><div><b>CIEGO</b> ${esc(h.ciego)}</div></div>`;
}

const INTRO = `<h2>CÓMO LEER ESTE MANUAL</h2>
<p>Sos el único que puede leerlo, pero no podés hablar. Escuchás al SORDO y al CIEGO; te ve solo el SORDO. Respondé con <b>gestos</b>:
números con los dedos, flechas, sí y no. Para los colores, que el SORDO pregunte y vos asentí o negá.</p>
<ul><li>Todo se cuenta de <b>izquierda a derecha</b> y de <b>arriba abajo</b>, empezando en 1.</li>
<li>Las tablas cambian en cada bomba: no sirve aprenderlas de memoria.</li>
<li>Si te ignoran, tirales un <b>bananazo</b>.</li></ul>`;

// Arma el manual en `root`: pestañas a la izquierda y la página a la derecha
export function mountManual(root: HTMLElement, seed: number, kinds: Kind[], sample: boolean) {
  const tb = tables(seed);
  root.innerHTML = `<nav class="mtabs"><button data-p="intro">ÍNDICE</button>${kinds.map(k => `<button data-p="${k}">${modName(k)}</button>`).join('')}</nav>
    <article class="mpage"></article>`;
  const page = root.querySelector('.mpage') as HTMLElement;
  const show = (p: string) => {
    page.innerHTML = (sample ? '<div class="sample">EJEMPLO · las tablas cambian en cada bomba</div>' : '') + (p === 'intro' ? INTRO : pageHtml(p as Kind, tb));
    page.scrollTop = 0;
    for (const b of root.querySelectorAll<HTMLButtonElement>('.mtabs button')) b.setAttribute('aria-selected', String(b.dataset.p === p));
    for (const cv of page.querySelectorAll<HTMLCanvasElement>('canvas[data-sym]')) {
      const g = cv.getContext('2d')!;
      g.clearRect(0, 0, 64, 64);
      symbol(g, +cv.dataset.sym!, 32, 32, 22, '#2a1d12');
    }
  };
  root.querySelector('.mtabs')!.addEventListener('click', e => { const b = (e.target as HTMLElement).closest('button'); if (b) show(b.dataset.p!); });
  show('intro');
  return { show };
}
