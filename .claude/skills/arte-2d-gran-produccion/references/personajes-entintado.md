# Personajes entintados (Canvas 2D)

Un personaje es una función `pose → lista de piezas`. Cada pieza es un polígono denso más sus instrucciones de pintura. El entintador (`kit/draw/ink.ts → paint`) las convierte en una ilustración. Todo pasa en unidades del sprite, con y hacia abajo y la raíz en el suelo bajo la cadera; el `Actor` escala a píxeles (4 px por unidad en escena, 6 en primeros planos).

## 1. Cómo pinta el entintador (por qué no parecen figuras)

`paint(ctx, parts, style, glowCtx)` hace tres pasadas:

1. **Contorno global.** Todas las piezas con `outline !== false` se trazan con `lineWidth = 2·ol` y se rellenan en tinta. Después se repite corrido hacia la sombra (`-light · olShadow`). Resultado: una sola silueta, más gruesa del lado oscuro, y las piezas se funden en las articulaciones.
2. **Piezas, por `z` creciente.** Cada una recibe:
   - `fill`;
   - recorte a sí misma;
   - `shade`: la pieza menos una copia corrida `shadeW` hacia la luz (la medialuna);
   - `deep`: lo mismo, más ancho y más oscuro;
   - `hatch`: el rayado, trazos afinados que nacen en el borde oscuro, separados `hatch` unidades;
   - `deco()`: detalles recortados a la pieza (pliegues, costuras);
   - `hl`: el filo de luz del lado iluminado;
   - `line`: una línea interior fina, que solo se nota donde la pieza tapa a otra;
   - `after()`: detalles sin recorte (ojos, pupilas).
3. **Contraluz.** En un lienzo auxiliar se pinta la unión de las piezas como máscara opaca, se le resta la unión corrida hacia la luz `rimW`, recién ahí se colorea con `rimC` (`source-in`) y se compone con `screen`. Solo queda el borde exterior del lado oscuro.

Además, lo que tiene `glow`/`glowDraw` se pinta en el lienzo de brillo, y lo que no, *borra* ese lienzo (`destination-out`). Así el brillo de algo tapado no se cuela por delante. El renderer suma ese lienzo en HDR y el bloom hace el halo.

Estilo de tinta que funcionó, para un personaje de ~72 unidades de alto:

```ts
ink: { ink: '#140c1c', ol: 0.85, olShadow: 0.7, rimC: 'rgba(96,186,206,0.62)', rimW: 0.62 }
// jefe de ~130 unidades: más grueso
ink: { ink: '#120c18', ol: 1.35, olShadow: 1.0, rimC: 'rgba(100,190,196,0.8)', rimW: 1.3 }
```

La luz (`light`) es la dirección *hacia* la luz principal en coordenadas del sprite (y hacia abajo). En FILO va arriba a la derecha y detrás, `[0.6, −0.8]`, y el actor la espeja con `facing`.

## 2. Estructura de un personaje (`CharDef`)

Copia `kit/chars/hero.ts` y mantén este esqueleto:

```ts
const THIGH = 13.2, SHIN = 14, TORSO = 15.5, UPPER = 9.4, FORE = 9, BLADE = 48;  // largos de huesos
export const PAL = { /* cinco tonos por material, ver direccion-de-arte.md */ };
export const BASE: Pose = { x: 0, y: 0, sq: 1, hip: [-1, -25.5], lean: 0.14, head: -0.06,
  hf: [9.5, -17.5], hb: [-6, -18], ef: 1, eb: 1, ff: [6.5, 0], fb: [-7.5, 0], tf: 0, tb: 0,
  bl: 0.55, eye: 1, cl: 0, sm: 0, rot: 0, yw: 0, gl: 0 };  // TODAS las claves que usan los clips

function frames(P) { /* marcos locales: T(a,b) torso, C(a,b) cuello/capa, H(a,b) cabeza */ }
function geom(P)   { /* articulaciones con ik2: brazos y piernas desde hombros y caderas */ }
function parts(P, ph, o): Part[] { /* piezas en orden de z */ }
```

- **Marcos locales.** `frames()` arma funciones que ubican puntos en el marco del torso (`T`), del cuello (`C`) y de la cabeza (`H`), girados por `lean` y `head`. Las piezas se describen en esos marcos (por ejemplo, `H(8.6, −9.6)`), así siguen la pose sin tocar coordenadas absolutas.
- **IK.** `ik2(hombro, mano, UPPER, FORE, curva, estirar)` devuelve el codo. El `estirar` 1,1–1,12 deja que el brazo se alargue en los cuadros rápidos (como en la animación a mano). Las piernas doblan hacia adelante (`bend −1`).
- **Boil.** Envuelve cada lista de puntos de control con `B = (pts) => boil(pts, o.boil, o.seed, ++id)` *antes* del spline. El `id` incremental hace que cada pieza tiemble distinto, y `o.seed` cambia con cada dibujo nuevo. La amplitud que funcionó es 0,32 unidades.

## 3. Recetas de piezas

- **Miembros.** Usa `limb([hombro, codo, muñeca], anchosIzq, anchosDer, 6, bulto)`: una sola pieza que pasa por las articulaciones, con tapas redondas. El `bulto` es una gaussiana que agrega pantorrilla o bíceps de un solo lado, y la asimetría izquierda/derecha es lo que lo hace orgánico. Anchos de la heroína:
  - pierna `[2.2, 1.25, 0.8]` / `[2.3, 1.15, 0.85]`;
  - brazo `[1.75, 1.05, 0.85]` / `[1.7, 1.1, 0.9]`.

  El miembro de atrás va con el color multiplicado por 0,8 (`shadeHex(base, 0.8)`).
- **Cuerpo, capucha y máscara.** Son 8–10 puntos de control en el marco local, con `spline(pts, true, 6, sharp)`. Pocas esquinas, solo donde la forma termina. Mira los números de `hero.ts`: la máscara es un óvalo apenas asimétrico, con mentón en punta y la frente aplanada.
- **Capa.** Hombros fijos más el ruedo de `Springs` (la física), y `spline` cerrado con esquinas en las puntas del ruedo. Lleva:
  - un forro de un tono más oscuro detrás (se ve cuando vuela);
  - pliegues con `stroke` desde el hombro hasta cada punta;
  - un ribete oscuro en el ruedo;
  - una pincelada de brillo en el hombro.
- **Cintas, colas y fajas.** Toma los puntos de una `Chain`, aplícales `spline` abierto y `taper` con ancho decreciente y un leve ondeo (`1 + 0.15·sin(t·12 + tiempo·6)`). Una costura central con `stroke` les da volumen.
- **Ojos.** Van en `after()`: almendras con esquinas, inclinadas, que se entrecierran con la clave `eye` (0,3 en los ataques). La pupila es de color de acento y lleva un punto de brillo; la pupila también va en `glowDraw`.
- **Arma.**
  - **Hoja.** Es un perfil con lomo y filo, más ancha en la base y en punta, con una leve curva (`−2.6·sin(π·t·0.9)·t`). Lleva un vaceo (canal) con `stroke` y un filo encendido con `gl`, que se pinta también en el brillo.
  - **Guarda y empuñadura.** Piezas aparte, con `z` contiguo.
  - **Contorno propio** un poco más fino (`olw`).
- **Smear dibujado.** Es una medialuna (`crescent`) del radio de la hoja, que barre `sm` radianes hacia atrás desde la hoja actual. Va blanca, con un núcleo del color del personaje y 3–4 estrías de velocidad. Solo se dibuja en el sprite si `bake` está prendido (hojas de sprites); en escena, el rastro WebGL hace ese trabajo (ver `vfx-y-game-feel.md`).
- **Brasas y grietas.** Son trazos de acento con `glowDraw` y una intensidad que late (`0.75 + 0.25·sin(t·k)`). En el jefe, las grietas también se engrosan con `gl`.

### Orden de z (heroína, de atrás hacia adelante)

| z | Pieza |
|---|---|
| −2 | Cinta de la capucha |
| 0 | Forro de la capa |
| 1 | Brazo de atrás |
| 2 | Pierna de atrás |
| 2,5 | Faja |
| 3 | Torso |
| 4 | Pierna de adelante |
| 5 | Capa |
| 6 | Capucha |
| 6,5 | Hueco de la capucha (sin contorno) |
| 7 | Máscara |
| 2,8 o 9 | Arma, según `bz` (detrás o delante) |
| 8,5 | Brazo de adelante |
| 10 | Puño |

La clave `bz` deja que un clip pase el arma por detrás del cuerpo en el recobro.

## 4. Valores por pieza que funcionaron

```ts
// tela principal (capa, capucha)
{ shade: S, shadeW: 3.2, deep: D, deepW: 7, rim: R, rimW: 0.9, hl: H, hlW: 0.7, hatch: 1.5, hatchC: 'rgba(30,6,20,0.85)', line: 0.8 }
// máscara de hueso (rayado suave y lila)
{ shade: maskS, shadeW: 2.1, hatch: 1.5, hatchL: 2.6, hatchC: 'rgba(70,45,100,0.5)', deep: maskD, deepW: 5, hl: maskH, hlW: 0.9, line: 0.75 }
// miembros
{ shade: bodyS, shadeW: 1.5–1.8, rim: bodyR, rimW: 0.6, line: 0.6 }
// acero
{ shade: steelS, shadeW: 0.9, rim: steelR, rimW: 0.35, line: 0.5, olw: 0.95 }
```

La regla es que `shadeW` crece con el tamaño de la pieza (≈ 1/4–1/3 de su ancho) y `deepW` es aproximadamente el doble. El rayado va solo en las piezas grandes; en las chicas se vuelve ruido.

## 5. Antes de dar un personaje por bueno

- Míralo en `flat` (vector crudo) y en final, lado a lado. Lo final tiene que verse *dibujado* y lo crudo, *diseñado*. Si lo crudo ya es feo, el problema es de forma, no de pintura.
- Revisa el primer plano a 6×:
  - que el contorno no se corte en las articulaciones;
  - que la sombra no forme bandas raras en piezas finas (achica `shadeW`);
  - que el contraluz sea solo un borde (si vela, ver `revision.md`);
  - que los ojos y el acento brillen y nada más.
- Revisa la miniatura (48–64 px): que siga leyéndose.
