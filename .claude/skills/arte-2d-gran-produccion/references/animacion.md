# Animación: poses, smears y física secundaria

La animación de gran producción en 2D es **pose a pose**: pocos dibujos fuertes, bien elegidos y sostenidos. No es una interpolación continua «a lo Flash». En el kit, una pose es un diccionario de objetivos (dónde van la cadera, las manos y los pies, cuánto se inclina el torso, hacia dónde apunta el arma) y el dibujo sale del IK. Un clip es una lista de poses clave con curvas de espaciado, y se muestrea en cuadros **enteros** a su propio fps.

## 1. Vocabulario de la pose (claves del kit)

| Clave | Qué es |
|---|---|
| `hip` | Cadera, relativa a la raíz |
| `lean` | Inclinación del torso (rad) |
| `head` | Contra-giro de la cabeza |
| `hf`, `hb` | Manos de adelante y de atrás |
| `ef`, `eb` | Hacia qué lado doblan los codos (±1) |
| `ff`, `fb` | Tobillos |
| `tf`, `tb` | Inclinación de cada pie |
| `bl` | Ángulo del arma (rad, en el marco del sprite) |
| `bz` | Arma detrás (−1) o delante (+1) del cuerpo |
| `sm` | Barrido del smear (rad): solo en el cuadro rápido |
| `x` | Avance de la raíz dentro del clip |
| `yw` | Altura en el mundo (saltos) |
| `rot` | Giro de todo el cuerpo alrededor de la cadera (volteretas) |
| `sq` | Estirar/aplastar con área constante: x se escala por 1/√sq |
| `eye` | Apertura de los ojos (0,3 = entrecerrados al atacar) |
| `cl` | Cuánto vuela la capa (sube el ruedo de reposo) |
| `gl` | Brillo del arma o de las brasas (0..1) |

Las claves de un clip **solo dicen lo que cambia**: se acumulan sobre la anterior y la primera, sobre `base`. Por eso `base` tiene que declarar todas las claves.

## 2. Curvas de espaciado

| Curva | Uso |
|---|---|
| `'o'` (sale rápido) | Hacia una anticipación |
| `'io'` | Asentarse en una pose |
| `'snap'` (`1 − (1−t)^6`) | El cuadro del golpe: llega casi entero en el primer intermedio |
| `'h'` | Sostiene la pose anterior hasta la clave |
| `'l'` | Rotaciones continuas (voltereta) y temblor de carga |
| `'back'` | Un rebote que se pasa y vuelve |

## 3. Fps y «en dos»

| Movimiento | fps |
|---|---|
| Guardia o respiración | 12 |
| Correr | 16 |
| Ataques de la heroína | 20 |
| Ataques del jefe | 14 (más lento = más pesado) |

El `Actor` dibuja solo cuando cambia el cuadro entero (`mode = 'twos'`): el cuerpo avanza escalonado. Mientras tanto, la física (capa, cintas) corre a 120 Hz con la pose fraccionaria y se ve suave. Ese contraste es buena parte del aspecto «hecho a mano». El boil cambia con cada dibujo nuevo, así una pose sostenida mantiene su línea.

## 4. Receta de un ataque (heroína, 20 fps, 13 cuadros)

```ts
const G: Pose = { hip: [-2, -22.5], lean: 0.32, head: -0.24, ff: [9, 0], fb: [-10, 0], hf: [5, -17], hb: [-2, -16],
  ef: -1, eb: 1, bl: 2.78, cl: 0.1, sm: 0, eye: 1, sq: 1, rot: 0, yw: 0, gl: 0 };   // guardia
const at = (x: number, extra: Pose = {}): Pose => ({ ...G, x, ...extra });

const slash1: Clip = { id: 'slash1', label: 'Tajo', fps: 20, loop: false, frames: 13, keys: [
  { f: 0, p: at(0) },
  // ANTICIPACIÓN: se enrosca al revés del golpe (filo sobre el hombro, torso hacia atrás, ojos entrecerrados)
  { f: 1, p: { hip: [-4, -21.5], lean: -0.04, hf: [-11, -42], ef: 1, bl: -2.25, hb: [6, -29], eye: 0.55, cl: 0.2 }, e: 'o' },
  // TENSIÓN: se sostiene derivando un poco más (un cuadro de «carga»)
  { f: 2, p: { hip: [-4.5, -21], lean: -0.08, hf: [-12, -43.5], bl: -2.42 }, e: 'io' },
  // SMEAR: llega de golpe, el cuerpo se lanza adelante, el arma pasa el blanco y barre `sm` rad
  { f: 3, p: { x: 7, hip: [5, -21], lean: 0.55, head: -0.36, hf: [26, -27], bl: 0.35, sm: 2.77, ff: [20, 0], fb: [-6, -1], tb: 0.6, eye: 0.35, cl: 0.55 }, e: 'snap' },
  // FOLLOW-THROUGH: se pasa un poco y el smear se apaga
  { f: 4, p: { x: 9, hip: [6, -20.5], lean: 0.62, hf: [27, -21], bl: 0.6, sm: 0.3 }, e: 'o' },
  // SOSTENER el contacto: el ojo necesita estos cuadros para leer el golpe
  { f: 7, p: { x: 9.5, hf: [26.5, -20.5], bl: 0.64, sm: 0 }, e: 'io' },
  // RECOBRO: el filo da la vuelta por ARRIBA (nunca cruza el piso) …
  { f: 9, p: { x: 10, hip: [2, -23.4], lean: 0.3, hf: [10, -36], bl: -1.7, eye: 0.8 }, e: 'io' },
  // … y vuelve a la guardia con el ángulo menos una vuelta entera (2.78 − 2π), así gira hacia el lado correcto
  { f: 12, p: at(10, { bl: 2.78 - Math.PI * 2 }), e: 'io' },
], ev: [{ f: 3, k: 'hit', reach: 60, dmg: 1, kb: 60 }, { f: 3, k: 'swing' }] };
```

Patrones que se repiten en todos los ataques:

- **Anticipación** en sentido contrario al golpe, de 1–2 cuadros en un ataque ligero y 4–5 en uno pesado. Los ojos se entrecierran y la capa se levanta (`cl`).
- **Un cuadro de smear** con `snap`:
  - el cuerpo avanza de golpe (`x`), se inclina (`lean` 0,55–0,8) y se estira o aplasta (`sq` 0,86–1,16);
  - el arma termina *pasada* del blanco;
  - `sm` vale lo que barrió (2,8 rad en un tajo, −3,8 en un revés hacia arriba);
  - el evento `hit` va en ese mismo cuadro.
- **Follow-through** de 1 cuadro con `sm` chico, y después **sostener** 2–3 cuadros.
- **Recobro** con un giro del arma por encima y vuelta a la guardia. Encadenar combos es dejar que el próximo clip arranque de la guardia (`actor.then('slash2')`).
- **Ataque aéreo o voltereta** (`slash3`): agacharse con `sq` 0,84, saltar con `sq` 1,16 en el `snap`, girar `rot` de 0 a 6,28 en 4 cuadros con `'l'` y `sm` ≈ 1,5 sostenido, y aterrizar con `snap` y `sq` 0,8 (aplaste) más el evento `impact`.

### Ataque pesado (jefe, 14 fps, 26 cuadros)

Anticipación larga: el arma sube por encima de la cabeza (`hf: [4, −104]`), el pecho se abre (`br`) y gruñe. Después, 3 cuadros de temblor con `'l'` mientras sube `gl` (0,3 → 0,8): la amenaza se lee. El cuadro 8 es el `snap`, con `sm` 3,07, `sq` 0,9, `lean` 0,95 y los eventos `slam` y `hit`. Le siguen 7 cuadros clavado en el suelo (`sq` 0,84–0,88) y un recobro lento. Los ataques del jefe tienen **armadura** (un golpe no los interrumpe) y eso también se comunica: no hay animación de dolor, solo el destello.

## 5. Ciclos

- **Correr** (16 fps, 8 cuadros, loop). Cuatro poses por paso: contacto, abajo, paso y arriba. La cadera baja y sube (`hip.y` −22,6 … −26,8), los brazos van a contrapié, el torso inclinado (`lean` 0,46) y la capa arriba (`cl` 0,55). Los eventos `step` van en los contactos (0 y 4) para el polvo y el sonido.
- **Guardia** (12 fps, 24 cuadros). Dos claves con `'io'`: respira bajando la cadera 1 unidad, abre apenas las manos y el arma se mece 0,04 rad. Lo vivo está en la física y el boil, no en mover mucho.
- **Caminar del jefe.** Paso pesado con `stomp` en cada contacto (sacudón chico y polvo).

## 6. Física secundaria

Corre en el marco local del personaje (x hacia donde mira, y hacia abajo). Cada paso recibe:

- `shift`: cuánto se movió el marco, para que las partículas se queden en el mundo y la tela se atrase;
- `fv`: la velocidad del marco, para el arrastre del aire.

Si el marco salta más de 40 unidades (teletransporte o reinicio), se ignora: si no, la tela cruza la pantalla. Al darse vuelta, `mirror()` espeja el estado.

```ts
// cinta de la capucha: cadena Verlet (n, largo de tramo, ancla, dirección de reposo, gravedad, arrastre, rigidez de flexión)
tail: new Chain(9, 3.9, tailAnchor(P), tailRest(P), 380, 2.4, 0.04)
// ruedo de la capa: puntos con resorte hacia su forma de reposo (k, amortiguación, arrastre, gravedad, alejamiento máximo)
hem: new Springs(hemRest(P), 260, 9, 3.6, 46, 14)
// faja y cadenas: cadenas cortas y más rígidas
sash: new Chain(5, 2.6, T(-3.6, 3), [-0.6, 0.8], 300, 3, 0.05)
```

- La **forma de reposo** depende de la pose (`hemRest(P)` usa `cl`): un clip levanta la capa cambiando una clave y la física hace el resto.
- **Rigidez de flexión.** Baja (0,04) para que la cinta ondee, pero el primer tramo sigue la dirección de reposo con 0,22, para que salga de la capucha con intención.
- El **aleteo** (un seno por partícula, proporcional a la velocidad) evita que la tela se vea muerta cuando el personaje está quieto.
- El **alejamiento máximo** (`maxD`) de los resortes es el largo de la tela: sin él, el ruedo se estira como goma en los golpes rápidos.

## 7. Eventos

Los clips llevan `ev: [{ f, k, ... }]`, que el actor dispara una vez al pasar por el cuadro. Tipos usados:

- `hit` (`reach`, `dmg`, `kb`, `up`);
- `swing`, `step`, `land`, `jumpdust`;
- `impact`, `dash`, `skid`;
- `charge`, `wave`;
- `slam`, `scrape`, `roar`, `growl`;
- `kneel`, `die`.

`Stage` los traduce en efectos y sonido (ver `vfx-y-game-feel.md`). Pon los eventos en el cuadro exacto del contacto, no «cerca». El hitstop solo funciona si cae justo en el dibujo del smear.

## 8. Hojas de sprites

`lab.ts → contactSheet(def, clip, escala)` produce un lienzo por cuadro:

- usa `fixedBox` (la caja del personaje), así todos quedan registrados igual;
- en los loops corre un ciclo antes, para que la tela llegue a su régimen.

Para exportar, pega los lienzos en una tira o grilla y descárgala con `canvas.toBlob`. Acompáñala con un JSON de `{ fps, frames, pivot, events }` si va a otro motor. Con `bake = true`, el smear queda dibujado en el sprite: es lo correcto para una hoja, porque el motor de destino no tiene el rastro WebGL.

## 9. Lista de control de un clip

- La hoja de contactos completa, a 4×, ¿cuenta la acción sin moverse? Cada cuadro tiene que ser un dibujo con intención.
- ¿Hay anticipación en sentido contrario? ¿El smear llega de golpe y el contacto se sostiene?
- ¿Los arcos son arcos? Mano y punta del arma tienen que describir curvas, no rectas: revísalo con el papel cebolla o con el esqueleto.
- ¿Nada atraviesa el piso? (`clipY` recorta, pero el recobro tiene que pasar por arriba).
- ¿Los pies no patinan? En el contacto, `ff` y `fb` quedan quietos en el mundo: compensa con `x`.
- ¿La tela se atrasa y se asienta, sin explotar?
