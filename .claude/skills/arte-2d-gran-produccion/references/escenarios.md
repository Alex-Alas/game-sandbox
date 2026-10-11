# Escenarios pintados en capas

El escenario de FILO, el «Cementerio de filos», son doce capas pintadas por código en Canvas 2D, más capas que son solo shader (haces de luz, bancos de niebla). Una cámara en perspectiva las ubica en profundidad. Lo que lo hace ver como un fondo de Silksong o Death's Door:

- bordes ásperos;
- pincel seco;
- luz de borde del lado del sol;
- bruma que crece con la distancia;
- un primer plano casi negro.

## 1. Capas en perspectiva (multiplano)

Pintar cada capa «como se ve desde la cámara» y dejar que la matemática la ubique en z:

```ts
REF = { x: 0, y: 92, H: 300 }            // cámara de referencia: centro y alto visible (unidades del mundo)
z     = -Dref * (1 / p - 1)              // Dref = distancia a la que se ven H unidades con el fov elegido
escala = 1 / p                           // la capa se agranda para verse igual desde REF
rect_mundo = REF + (rect_pintado - REF) * escala
```

- El parallax `p` vale 1 en el plano de juego, < 1 detrás y > 1 delante.
- Ventajas:
  - el parallax es correcto en x **y** en y (al saltar, el fondo se mueve menos);
  - un zoom de cámara se comporta como uno real;
  - sale gratis una **vista despiezada**: la cámara orbita (`cam.explode`) y se ven las capas separadas con sus etiquetas.

Las capas de FILO, de atrás hacia adelante (densidad en px por unidad entre paréntesis):

| Capa | Parallax | Ajustes |
|---|---|---|
| Cielo | — | Shader: degradé, luna velada, estrellas |
| Agujas de la catedral (1,1 px) | 0,16 | Niebla 0,42, bruma 0,3; más su capa aditiva de ventanas (0,6 px, tinte ×1,6) |
| Bosque muerto (1,3 px) | 0,3 | Niebla 0,3 |
| Banco de niebla lejana | 0,4 | Shader |
| Columnata (1,6 px) | 0,5 | Un solo muro cuyo borde de abajo son los arcos, con ruinas mordidas |
| Cadenas | 0,5 | Con vaivén (`sway`) |
| Haces de luz cálidos y fríos | 0,55 / 0,62 | Shader aditivo inclinado |
| Filos gigantes clavados y la máscara caída (2 px) | 0,72 | Más su capa aditiva de flores de luz |
| Niebla baja | 0,85 | Shader |
| Suelo con losas (2,6 px) | 1 | Más su capa aditiva de velas y farol |
| Pasto de adelante | 1,02 | — |
| Primer plano (1,2 px) | 1,45 | Desenfocado (`blur` 1,1 = nivel de mipmap) |

Por capa: `fog` (mezcla hacia el color de la niebla: 0,42 lejos → 0 cerca), `mist` (bruma baja cerca de `mistY`, animada con fbm), `light` (cuánto la tiñe la luz local), `tint`, `add` (aditiva), `sway` y `blur`.

## 2. Pintar una forma (`kit/world/paint.ts`)

```ts
const P = new Paint(x0, y0, x1, y1, densidad, semilla);   // lienzo de CPU, transformado a mundo con y hacia arriba
const forma = new Path2D(pathPts(rough(puntos, 1.2, 0.07, semilla)));   // 1. borde áspero
P.fill(forma, rgb(base));                                               // 2. color base
P.brush(forma, P.rect(), 1400, [rgb(scl(base, 0.85)), rgb(mix(base, lit, 0.12))],
        Math.PI / 2, [4, 12], [0.6, 1.4], 0.35, 0.12);                  // 3. pincel seco recortado
detalles(forma);                                                        // 4. ventanas, grietas, musgo…
P.rim(forma, SUN[0], SUN[1], 1.3, rgb(lit, 0.55));                      // 5. luz de borde del lado del sol
P.vgrad(forma, -40, 60, rgb(bruma), rgb(base, 0));                      // 6. el pie hundido en la bruma
```

- **`rough`** remuestrea cada lado y lo corre sobre la normal con fbm (más una octava fina). Mata la recta perfecta, que es lo que más delata a lo «geométrico». La amplitud es de 1–2 unidades y la frecuencia de 0,05–0,1.
- **`brush`** son miles de trazos cortos, semitransparentes y casi paralelos, de dos o tres colores cercanos al base. La dirección sigue la forma: vertical en torres y troncos, horizontal en el suelo.
- **`rim`** es la forma menos la forma corrida en contra del sol: una banda de luz solo del lado iluminado, que despega cada plano del de atrás.
- **Dos planos dentro de una capa lejana.** El más lejano va más claro y más brumoso, el otro más oscuro. Se gana profundidad sin otra capa.
- **Detalle en grupos y con historia:** ventanas encendidas *pocas* (con probabilidad, no todas), arbotantes escalonados, una aguja rota, filos clavados con cintas, flores de luz.

Pinta en lienzos de CPU (`getContext('2d', { willReadFrequently: true })`). En el Chromium headless con GPU por software, miles de trazos recortados en un lienzo acelerado cuelgan las capturas. En CPU, además, el tiempo es predecible. Con `?prof` cada capa imprime cuánto tardó.

## 3. Brillos

Las ventanas, velas, flores y el farol van en **capas aparte, aditivas, a menos resolución** (0,5–0,6 de la densidad de su capa), con un `tint` > 1 para que entren al bloom. `glowDot` pinta un degradé radial. Así el brillo no ensucia la pintura de la capa y se puede apagar o animar por separado.

## 4. Atmósfera solo con shaders

- **Haces de luz** (`SHAFT_FS`, aditivos): bandas inclinadas (`slant` 0,42) de dos ruidos a distinta escala que se desplazan muy lento, desvanecidas arriba, abajo y a los costados. Llevan **motas de polvo** que titilan. Conviene usar dos capas: cálida (`[1.0, 0.86, 0.62]`, k 0,22) y fría (`[0.8, 0.92, 1.0]`, k 0,14).
- **Bancos de niebla** (`FOGBAND_FS`, alfa premultiplicado): dos fbm que se arrastran a distinta velocidad (0,004 y 0,008), con forma de banda horizontal y bordes suaves. Van entre capas pintadas, no encima de todo.
- **Rayos volumétricos** del astro: van en el posproceso (ver `postproceso.md`), tapados por la silueta de las capas.

## 5. Primer plano

- Formas **gruesas** casi negras (`[5, 9, 12]`): lomas en las esquinas, pasto alto con trazos de 4 unidades de base, helechos, ramas que cruzan una esquina y hojas que cuelgan.
- Un borde de luz muy suave del lado del sol (alfa 0,45).
- Desenfoque por mipmap. Todo lo fino (menos de ~3 px después de escalar) desaparece con el desenfoque: si no se ve, engrosa, no agregues más.
- Solo en las esquinas y los bordes: el centro queda libre para la acción.

## 6. Luz y color del escenario

- **Contraluz.** Si el sol va arriba a la derecha y detrás (`SUN = [0.62, 0.78]`, dirección hacia la luz con y arriba), los planos cercanos se ven oscuros con borde iluminado y los lejanos claros. Es el esquema que más «película» da.
- **Una luz local cálida** (el farol) que **multiplica** el color de lo cercano: `col += (col·1.6 + 0.02)·luz·k·exp(−d/r)`. Sumada en plano lava los oscuros.
- **Perspectiva atmosférica en tres pasos:** lejos claro y del color de la niebla, el medio desaturado y cerca saturado y oscuro.
- El suelo del plano de juego tiene que ser legible: losas con juntas, pasto en el borde y algo de brillo de las velas. Los personajes se paran ahí.

## 7. Lista de control

- ¿Se lee la profundidad con el escenario desaturado? (Valores: lejos claro, cerca oscuro).
- ¿Hay alguna recta perfecta o borde liso? Pásalo por `rough`.
- ¿El primer plano tapa la acción? Solo esquinas.
- ¿La niebla está *entre* capas, con capas pintadas delante y detrás? Si está solo encima de todo, aplana.
- ¿Las capas aditivas son pocas y están a baja resolución?
- ¿Cuánto tarda en pintarse? Mídelo con `?prof` (cada capa imprime su tiempo) y baja la densidad en el teléfono: FILO usa `q = 0.75` en pantallas táctiles, y todas las densidades se multiplican por `q`.
