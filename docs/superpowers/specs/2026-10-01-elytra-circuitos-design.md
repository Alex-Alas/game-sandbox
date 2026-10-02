# ELYTRA — Circuitos múltiples (subproyecto 3a)

Fecha: 2026-10-01 · Rama: `elytra-iteracion-2` · Estado: aprobado en chat, pendiente de revisión escrita

## Objetivo

Pasar de un único circuito a un catálogo de cinco, con selector en el título. Cada
circuito tiene sus propios récords, medallas, fantasma y estilo. Éxito = los cinco
se pueden completar sin chocar con el piloto automático, cada uno tiene medallas
calibradas y la Gran Vuelta actual queda idéntica.

Fuera de alcance: clima y hora del día (subproyecto 3b), circuitos aleatorios o
generados por semilla, editor de circuitos.

## Decisiones

- **Cambiar de circuito recarga la página** (enfoque A). El mundo (tallado del
  terreno, arcos/puentes/anillo y obstáculos que respetan `isPathClear`) se construye
  solo para el circuito activo, así cada uno conserva un mapa denso y la Gran Vuelta
  no cambia. Es el mismo patrón que el preset de calidad.
- La Gran Vuelta conserva el id `main`: sus claves de fantasma (`elytra.ghost.main`) y
  estilo (`elytra.style.main`) siguen valiendo.

## 1. Datos y selección

### `courses.js` (nuevo)

Catálogo de circuitos, sin lógica de juego:

```js
export const COURSES = [
  { id: 'main', name: 'GRAN VUELTA', kind: 'loop', gates: [...], medals: { author, gold, silver, bronze } },
  { id: 'canon', name: 'CAÑÓN', kind: 'sprint', gates: [...], medals: {...}, start: { pos, dir, speed }? },
  ...
];
export const COURSE_ORDER = ['main', 'canon', 'islas', 'descenso', 'travesia'];
export function pickCourse()   // ?c=<id> > localStorage 'elytra.course' > 'main'
export function saveCourse(id)
```

- Las definiciones de puerta mantienen el formato actual de `GATE_DEFS`
  (`x`, `z` | `canyon`, `a` | `abs`, `zone`, `feature`).
- `start` es opcional. Sin él, la salida se calcula como hoy: 380 m detrás de la
  primera puerta y en altura. Los punto a punto en altura (DESCENSO e ISLAS) la
  definen explícita.
- `medals` son segundos y se rellenan con la regla de calibración (sección 2).

### `course.js`

- `course.id`, `course.kind` y `MEDALS` salen del circuito activo
  (`pickCourse()`). `medalFor` y `nextMedal` no cambian de firma.
- `resolveGates()` usa las puertas del circuito activo.
- `computeGateFrames()`: con `kind === 'sprint'` no se cierra el lazo. La normal de
  la primera puerta mira desde la salida hacia la segunda, y la de la última, desde
  la penúltima.
- `pathSegments()`: en un sprint no se añade el tramo última→primera puerta (si no,
  el tallado abriría un barranco de la meta a la salida).
- Récord: clave `elytra.best.<id>`. Para `main` se lee primero `elytra.best.main` y,
  si no existe, la clave antigua `elytra.best` (migración sin pérdida).

### Título

- Cuarta fila de selector: `CIRCUITO <NOMBRE> ‹ ›`, mismo estilo que calidad y
  sensibilidad. Cambiar hace `location.replace('?c=<id>')` (conservando `?q=` si
  está).
- La línea de récords ya existente muestra el circuito activo: mejor tiempo, estilo,
  fantasma y escalera de medallas.

## 2. Circuitos

| id | Nombre | Tipo | Duración objetivo | Recorrido |
|---|---|---|---|---|
| `main` | GRAN VUELTA | vuelta | ~51 s | Las 23 puertas actuales, sin cambios |
| `canon` | CAÑÓN | sprint | ~20 s | Entrada en picado al cañón por el oeste y ~9 puertas bajas siguiendo `canyonZ` hacia el este, con puente y arco como features y agujas de fondo |
| `islas` | ISLAS | sprint | ~25 s | Salida alta sobre `ZONES.islands` y eslalon vertical descendente entre islas (alturas absolutas de ~420 a ~150 m) |
| `descenso` | DESCENSO | sprint | ~25–30 s | Salida en la cumbre del macizo (~600 m), bajada por crestas y laderas y meta a ras del lago (`ZONES.lake`) |
| `travesia` | TRAVESÍA | vuelta | ~60 s | Vuelta larga con orden de zonas distinto (lago → valle → cañón de este a oeste → agujas → ladera del macizo → ruinas) y puertas nuevas |

Las coordenadas exactas de las puertas se fijan durante la implementación, iterando
con `probePath()` y el piloto automático hasta cumplir los criterios de la sección 4.

**Regla de medallas.** Con T = tiempo del piloto automático (con impulso) en ese
circuito: autor = ⌊0,95·T⌋, oro = ⌈1,08·T⌉, plata = ⌈1,25·T⌉ y bronce = ⌈1,55·T⌉,
redondeados a segundos. La Gran Vuelta conserva sus medallas actuales (48/55/64/80);
con T = 50,8 la regla da 48/55/64/79, así que solo difiere el bronce, en 1 s.

## 3. Flujo de los sprints

- La carrera arranca al cruzar la primera puerta, igual que hoy.
- En la meta de un sprint aparece el panel de meta (medalla, estilo, fantasma) y a
  los 3 s se reinicia solo: `resetCourse()`, `ghostCancel()`, `styleCancel()` y
  `respawn(true)`. **R** y **T** reinician al instante. El fantasma espera en la
  salida.
- Los circuitos de tipo vuelta se comportan como hoy (la vuelta siguiente empieza al
  cruzar de nuevo la primera puerta).
- La reaparición con **R** a mitad de carrera usa el último punto de control, igual
  que hoy.

## 4. Verificación

Cada circuito nuevo, cargado con `?c=<id>&q=low`:

1. `__elytra.probePath()` devuelve `[]`: ningún tramo recto entre puertas choca.
2. `__elytra.autopilot(true)` completa el circuito sin chocar. Su tiempo T define
   las medallas.
3. El tiempo T queda dentro de ±30 % de la duración objetivo.
4. Una captura de la salida.

Regresión de la Gran Vuelta:

- Las posiciones de las puertas coinciden con las de antes del cambio.
- Se mantiene `world.stats.pillars`.
- El tiempo del piloto automático sigue en ~50,8 s.
- El récord, el fantasma y el estilo existentes se siguen leyendo.

Sin errores en la consola al cargar ningún circuito, y `npm run build` correcto.

## Riesgos

- **Tallado agresivo en DESCENSO.** Un tramo recto que baja una ladera puede abrir
  barrancos grandes. Se mitiga con más puertas intermedias que sigan el relieve.
- **El `rng(1337)` del mundo consume una secuencia distinta según el circuito**
  (`isPathClear` rechaza otras posiciones). Los mundos son deterministas por
  circuito, pero no idénticos entre sí; es lo esperado.
- **Tiempo de carga.** Cambiar de circuito cuesta una carga completa (~5 s en la
  iGPU). Aceptado con el enfoque A.
