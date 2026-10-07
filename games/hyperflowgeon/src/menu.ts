// Menú de AJUSTES: pestañas por sección, generadas desde tablas [valor, mín, máx, paso, etiqueta] (las filas
// [v, 0, 1, 1] son casillas), selectores de botones y filas de botones sueltos. Cada control se vuelve a pintar desde los valores
// con refresh() (al cambiar de perfil, restablecer…). Abrirlo pausa el juego (main.ts).
export type Row = [number, number, number, number, string];
export type Choice = { id: string, label: string, hint?: string };
export type Field =
  | { title: string, note?: string }
  | { rows: Record<string, Row>, keys: readonly string[], vals: Record<string, number> }
  | { choice: readonly Choice[], get: () => string, set: (id: string) => void }
  | { buttons: { label: string, onClick: () => void }[] };
export type Section = { id: string, label: string, fields: Field[], reset: () => void };

const refreshers: (() => void)[] = [];
export const refresh = () => refreshers.forEach(f => f());
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
};

// Una fila por clave: deslizador con su valor, o casilla
export function rows(box: HTMLElement, table: Record<string, Row>, keys: readonly string[], vals: Record<string, number>, changed: () => void) {
  for (const k of keys) {
    const [, min, max, stp, label] = table[k], check = min === 0 && max === 1 && stp === 1;
    const row = el('label', 'row');
    row.innerHTML = `<span title="${k}">${label}</span>` + (check ? '<input type="checkbox"><output></output>'
      : `<input type="range" min="${min}" max="${max}" step="${stp}"><output></output>`);
    const inp = row.querySelector('input')!, out = row.querySelector('output')!;
    inp.oninput = () => { vals[k] = check ? +inp.checked : +inp.value; out.textContent = check ? '' : inp.value; changed(); };
    box.append(row);
    refreshers.push(() => { if (check) inp.checked = vals[k] > 0.5; else inp.value = out.textContent = String(vals[k]); });
  }
}

// Selector de botones (uno apretado) con la explicación del elegido debajo
function choice(box: HTMLElement, f: Extract<Field, { choice: unknown }>, changed: () => void) {
  const seg = el('div', 'seg'), hint = el('div', 'hint');
  const btns = f.choice.map(o => {
    const b = el('button', '', o.label);
    b.onclick = () => { f.set(o.id); changed(); refresh(); };
    seg.append(b);
    return b;
  });
  box.append(seg, hint);
  refreshers.push(() => {
    const v = f.get();
    f.choice.forEach((o, k) => btns[k].setAttribute('aria-pressed', String(o.id === v)));
    hint.textContent = f.choice.find(o => o.id === v)?.hint ?? '';
  });
}

export function buildMenu(root: HTMLElement, sections: Section[], o: { changed: () => void, copy: () => string, onOpen: () => void, onClose: () => void }) {
  const panel = el('div', 'panel'), head = el('header'), nav = el('nav'), body = el('div', 'body'), foot = el('footer');
  const close = el('button', 'x', '✕');
  close.title = 'cerrar (Esc)';
  head.append(el('b', '', 'AJUSTES'), nav, close);
  let tab = sections[0].id;
  try { tab = sections.find(s => s.id === localStorage.getItem('hfg.tab'))?.id ?? tab; } catch { /* sin almacenamiento */ }
  const tabs = sections.map(s => {
    const t = el('button', 'tab', s.label), page = el('div', 'sec');
    t.onclick = () => show(s.id);
    nav.append(t);
    for (const f of s.fields) {
      if ('title' in f) { page.append(el('h3', '', f.title)); if (f.note) page.append(el('div', 'hint', f.note)); }
      else if ('rows' in f) rows(page, f.rows, f.keys, f.vals, o.changed);
      else if ('choice' in f) choice(page, f, o.changed);
      else {
        const row = el('div', 'seg');
        for (const x of f.buttons) { const b = el('button', '', x.label); b.onclick = x.onClick; row.append(b); }
        page.append(row);
      }
    }
    body.append(page);
    return { id: s.id, t, page };
  });
  function show(id: string) {
    tab = id;
    try { localStorage.setItem('hfg.tab', id); } catch { /* sin almacenamiento */ }
    for (const x of tabs) x.t.setAttribute('aria-selected', String(x.id === id)), x.page.hidden = x.id !== id;
    body.scrollTop = 0;
  }
  const copy = el('button', '', 'copiar JSON'), reset = el('button', '', 'restablecer sección'), msg = el('span', 'msg');
  let msgT = 0;
  const say = (m: string) => { msg.textContent = m; clearTimeout(msgT); msgT = setTimeout(() => msg.textContent = '', 1500); };
  copy.onclick = () => { navigator.clipboard?.writeText(o.copy()).then(() => say('copiado'), () => say('no se pudo copiar')); };
  reset.onclick = () => { sections.find(s => s.id === tab)!.reset(); o.changed(); refresh(); say('restablecido'); };
  foot.append(copy, reset, msg);
  panel.append(head, body, foot);
  root.append(panel);
  root.onpointerdown = e => { if (e.target === root) api.close(); }; // tocar fuera del panel cierra
  close.onclick = () => api.close();
  const api = {
    isOpen: () => !root.hidden,
    open(id = tab) { refresh(); show(id); root.hidden = false; o.onOpen(); },
    close() { if (root.hidden) return; root.hidden = true; (document.activeElement as HTMLElement | null)?.blur(); o.onClose(); },
    toggle() { if (root.hidden) api.open(); else api.close(); },
  };
  show(tab);
  refresh();
  return api;
}
