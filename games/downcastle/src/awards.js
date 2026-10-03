/* Premios sociales (cada uno con mínimo) y telemetría local por tramo. */
import { load, store } from './config.js';

export const AWARDS = [
  { id: 'ancla', name: 'Ancla de Hierro', icon: '⚓', stat: 'anchorLoadT', min: 6, fmt: (v) => `${v.toFixed(1)} s anclado con carga` },
  { id: 'bungee', name: 'Bungee de Oro', icon: '💎', stat: 'bungeeGems', min: 1, fmt: (v) => `${v} gemas en pleno rebote` },
  { id: 'fuego', name: 'Fuego Amigo', icon: '🔥', stat: 'ffHits', min: 3, fmt: (v) => `${v} disparos a compañeros` },
  { id: 'tiron', name: 'Tirón Traicionero', icon: '🪢', stat: 'traitorTugs', min: 1, fmt: (v) => `${v} tirones que terminaron en daño` },
  { id: 'salva', name: 'Salvavidas', icon: '🛟', stat: 'rescues', min: 1, fmt: (v) => `${v} rescates` },
  { id: 'hadas', name: 'Domador de Hadas', icon: '🧚', stat: 'angryFairies', min: 1, fmt: (v) => `${v} hadas enojadas` },
  { id: 'peso', name: 'Peso Muerto', icon: '💀', stat: 'koT', min: 12, fmt: (v) => `${v.toFixed(1)} s fuera de combate` },
];

/* players: [{ id, name, color, stats }]. Hasta 3 premios, ordenados por cuánto superan el
   mínimo; cada premio se lo lleva quien más tiene de ese contador. */
export function computeAwards(players, max = 3) {
  const out = [];
  for (const a of AWARDS) {
    let best = null;
    for (const p of players) {
      const v = p.stats?.[a.stat] || 0;
      if (v >= a.min && (!best || v > best.v)) best = { v, p };
    }
    if (best) out.push({ id: a.id, name: a.name, icon: a.icon, who: best.p.name, color: best.p.color, pid: best.p.id, text: a.fmt(best.v), score: best.v / a.min });
  }
  out.sort((x, y) => y.score - x.score);
  return out.slice(0, max);
}

export function sumStats(into, add) {
  for (const k in add) into[k] = (into[k] || 0) + add[k];
  return into;
}

/* Telemetría: los últimos 200 tramos en localStorage['downcastle.tel']. */
const TEL = 'downcastle.tel';
export function saveTel(entry) {
  const list = load(TEL, []);
  entry.at = Date.now();
  list.push(entry);
  while (list.length > 200) list.shift();
  store(TEL, list);
  return entry.at;
}
export function rateTel(at, rating) {
  const list = load(TEL, []);
  const e = list.find((x) => x.at === at);
  if (e) { e.rating = rating; store(TEL, list); }
}
