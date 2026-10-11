# Kit de arte 2D (motor de FILO)

Es el código tal como quedó probado en FILO (`games/filo/` del repo game-sandbox): TypeScript sin dependencias y con sintaxis borrable. Los imports llevan la extensión `.ts`: Vite los sirve tal cual y Node ≥ 22 corre los módulos puros. `tsc` con `strict` y `erasableSyntaxOnly` pasa sin errores.

## Para usarlo

1. Copia esta carpeta dentro del proyecto (por ejemplo, `src/kit/`).
2. Con Vite no hace falta configurar nada. Con otro empaquetador, permite los imports con `.ts` (`allowImportingTsExtensions` en el tsconfig).
3. Abre `lab.html` con el dev server: `http://localhost:5173/src/kit/lab.html?c=idle,slash1&s=5&bg=dark`.

## Qué hay

| Archivo | Qué es | ¿DOM? |
|---|---|---|
| `draw/curves.ts` | Vectores, ruido, `spline` (Catmull-Rom centrípeta con esquinas), `taper`, `brush`, `limb` (miembro de una pieza con tapas), `ik2`, `boil`, `crescent`, `pathOf` | Usa `Path2D` solo en `pathOf` |
| `draw/ink.ts` | El entintador `paint(ctx, parts, style, glow)` y `stroke()` (trazo de pincel) | Sí |
| `rig.ts` | `Pose`, `Clip`, `sample` (eases y cuadros enteros), `lerpPose`, `Chain` (Verlet), `Springs` | No (puro) |
| `actor.ts` | Reproduce clips en dos, física a 120 Hz, eventos, redibujo en un lienzo ajustado, `toWorld`, `rect` | Sí |
| `chars/types.ts` | El contrato `CharDef` de un personaje | — |
| `chars/hero.ts` + `hero-clips.ts` | La Errante: **el ejemplo a imitar** | Sí |
| `chars/brute.ts` + `brute-clips.ts` | El Verdugo de Ceniza: masa, grietas de brasa, ataques pesados con armadura | Sí |
| `fx.ts` | Partículas instanciadas, rastros (cintas) y estallidos en WebGL2, con recetas | Sí |
| `stage.ts` | Actores + efectos: eventos de clips → efectos, rastros desde poses interpoladas, hitstop, sacudón, estelas, grietas, ondas, sombras de contacto y disolución | Sí |
| `gl/gl.ts` | `Prog`, `Target`, texturas, matrices y la textura de ruido | Sí |
| `gl/shaders.ts` | Cielo, capas, sprite, bloom, composición, rayos, haces, niebla | — |
| `gl/renderer.ts` | Cámara en perspectiva, capas por parallax, vista despiezada, HDR y posproceso | Sí |
| `world/paint.ts` | `Paint` (lienzo de CPU con `fill`, `inside`, `rim`, `brush`, `vgrad`, `stroke`, `glowDot`), `rough` y `ridge` | Sí |
| `world/scene.ts` | El «Cementerio de filos» completo: doce capas, de ejemplo | Sí |
| `audio.ts` | Sonido procedural (Web Audio) para cada evento | Sí |
| `lab.ts` + `lab.html` | Hojas de contactos (`contactSheet`) y el laboratorio | Sí |

## Armar una escena (como en FILO)

```ts
import { Renderer } from './kit/gl/renderer.ts';
import { buildScene } from './kit/world/scene.ts';
import { Actor } from './kit/actor.ts';
import { Stage } from './kit/stage.ts';
import { hero } from './kit/chars/hero.ts';
import { brute } from './kit/chars/brute.ts';

const R = new Renderer(canvas);            // <canvas> a pantalla completa
R.resize();
const scene = buildScene(matchMedia('(pointer: coarse)').matches ? 0.75 : 1);
R.env.light = [scene.lantern[0], scene.lantern[1], 70, 0.55];   // luz local: x, y, radio, fuerza
const S = new Stage(R);
S.lantern = scene.lantern;
S.onSfx = (k, o) => sfx.play(k, o);        // opcional: audio.ts
const H = new Actor(hero, 'idle'), B = new Actor(brute, 'idle');
const HF = S.add(H, 'errante', { core: [1.25, 1.18, 1.12], edge: [1.1, 0.14, 0.18], w: 0.5, life: 0.26 }, 10);
const BF = S.add(B, 'verdugo', { core: [1.3, 1.45, 1.5], edge: [0.35, 0.75, 1.0], w: 0.9, life: 0.32 }, 30);
BF.armor = ['slam', 'sweep', 'roar', 'death'];
H.height = 72; B.height = 130;
H.x = -60; B.x = 60; B.setFacing(-1);
R.cam.H = 240; R.cam.y = 78;               // alto visible y centro de la cámara (unidades del mundo)

let last = performance.now(), t = 0;
function loop(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
  R.time = t;
  S.update(dt);                            // actores, física, efectos, hitstop, sacudón
  R.resize();
  const ppu = R.pxPerUnit();
  for (const f of S.fighters) { f.a.scale = ppu; if (!f.a.hidden) f.a.draw(); }
  R.frame(scene.layers, (r) => S.draw(r));  // capas detrás → personajes y efectos → capas delante → posproceso
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
H.play('slash1'); H.then('slash2', 'slash3');   // un combo
```

Para una coreografía, FILO usa una línea de tiempo (`Duel` en `games/filo/src/demo.ts`): pasos `{ run, clip, face, wait }`, con distancias relativas al rival y control de vida antes de cada clip.

## Un personaje nuevo

1. Copia `chars/hero.ts` → `chars/<nombre>.ts` y `hero-clips.ts` → `<nombre>-clips.ts`.
2. Cambia los largos de huesos, `PAL` (cinco tonos por material), `BASE`, `frames()` y `geom()`.
3. Reescribe `parts()` pieza por pieza, en orden de z (ver `references/personajes-entintado.md`).
4. Crea la física en `phys()`/`step()`/`mirror()`: una `Chain` por cinta y unos `Springs` por ruedo.
5. Escribe los clips pose a pose, empezando por la guardia (ver `references/animacion.md`).
6. Agrégalo a `lab.ts` (selector `ch=`) y revisa con hojas de contactos a 5–6×.

## Hojas de sprites

```ts
import { contactSheet } from './kit/lab.ts';
const frames = contactSheet(hero, 'slash1', 4);           // un lienzo por cuadro, caja fija
const sheet = document.createElement('canvas');
sheet.width = frames[0].width * frames.length; sheet.height = frames[0].height;
frames.forEach((f, i) => sheet.getContext('2d')!.drawImage(f, i * f.width, 0));
sheet.toBlob((b) => { /* descargar b */ }, 'image/png');
```

Pon `actor.bake = true` (el valor por defecto) para que el smear quede dibujado en el sprite. El pivote es el origen de la caja del personaje (`def.box`: x0, y0 en unidades → píxeles por la escala).
