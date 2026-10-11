# VFX y peso de los golpes

Los efectos de los juegos de referencia no son brillos difusos: son **formas dibujadas** (medialunas, estrellas de puntas, bocanadas de polvo con contorno) que aparecen de golpe, se sostienen un instante y se **erosionan**, no se desvanecen. Lo que hace sentir un golpe es la suma de todo, sincronizada en un cuadro.

Todo vive en `kit/fx.ts` (dibujo WebGL) y `kit/stage.ts` (eventos → efectos, hitstop y sacudón). Los colores de los efectos van en HDR: componentes > 1 = brilla con el bloom.

## 1. Rastro del arma (cinta)

**El problema:** a 20 fps «en dos», la punta del arma salta de un dibujo al otro. Una estela que una esas posiciones con una recta se ve barata.

**La solución:** en cada dibujo nuevo con `|sm| > 0.05`, se interpolan 16 poses entre la pose anterior y la actual (`lerpPose`). Por cada una se pide la hoja (`def.weapon(p)` → empuñadura y punta) en coordenadas del mundo (`actor.toWorld`), y se arma una tira de triángulos. Como lo que se interpola es la *pose*, el rastro es un **arco** que sigue al brazo.

El shader de la cinta (`TRAIL_FS`), con u = tiempo (0 viejo → 1 nuevo) y v = de la empuñadura (0) a la punta (1):

- **Grosor** `uW · u^0.7`: crece hacia lo nuevo, ocupa la parte exterior de la hoja y se afina en la cola.
- **Bandas planas**: dos colores (`edge` afuera, `core` adentro) con un `smoothstep` corto. No usar un degradé suave.
- **Erosión**: ruido que se come la cinta desde la cola y desde el borde interno a medida que pasa la vida (`n < uLife·1.35 − u·0.55 + (1−x)·0.25` → descartar), con un borde que brilla justo antes de desaparecer.
- **Línea de tinta** en el filo exterior (mezcla normal, no aditiva). Es lo que la hace ver dibujada.

Colores por personaje:

```ts
heroína: { core: [1.25, 1.18, 1.12], edge: [1.1, 0.14, 0.18], w: 0.5, life: 0.26 } // blanco con borde carmesí (su capa), fino y rápido
jefe:    { core: [1.3, 1.45, 1.5], edge: [0.35, 0.75, 1.0], w: 0.9, life: 0.32 }   // blanco azulado, ancho y lento (el hacha pesa)
```

Del extremo del rastro se desprenden 4 chispas en la dirección del barrido.

## 2. Partículas (un solo dibujo instanciado)

Cada partícula es un quad con `kind` y el shader de partículas dibuja la forma. Hay dos grupos: las opacas (polvo y escombros, con mezcla normal) se dibujan primero y las aditivas después.

| Tipo | Forma | Notas |
|---|---|---|
| Brasa / luciérnaga | Núcleo + halo, parpadeo | Sube (gravedad negativa), HDR `[3.0, 1.3, 0.35]` |
| Chispa | Alargada en su velocidad, punta blanca | Gravedad 160; al tocar el piso muere o rebota una vez |
| **Polvo** | **Bocanada con sombra de caricatura y borde de tinta** | Se erosiona con ruido (no baja el alfa). Es la clave del aspecto Silksong |
| Escombro | Polígono anguloso con tinta, lado iluminado | Rebota y se asienta en el piso |
| Ceniza | Escama que aletea | Ambiente |
| Destello | Estrella de 4 puntas | 0,18–0,3 s |
| Anillo | Aro que crece y se afina | Ondas de aterrizaje (achatado `asp` 3) |
| Línea de velocidad | Trazo horizontal | Dash |

Las recetas (`dust`, `sparks`, `embers`, `shards`, `ring`, `star`, `speedLines`, `burst`) tienen los rangos que funcionaron: úsalas en vez de inventar números.

## 3. Receta de un golpe (lo que pasa en el cuadro del `hit`)

```ts
spark(x, y, big):
  fx.burst(x, y, big ? 26 : 18, [1.0, 0.42, 0.18], big ? 11 : 8)    // estrella irregular, borde de tinta, se vacía del centro (0,2 s)
  fx.sparks(x, y, big ? 16 : 10, dirección, 0.9, big ? 300 : 220, [2.2, 1.4, 0.7])
  fx.star(x, y, big ? 14 : 9, [1.8, 1.6, 1.4], 0.18)                  // destello
  fx.ring(x, y, 6, big ? 220 : 160, [1.2, 0.7, 0.35], 0.25)           // aro
  fx.embers(x, y, big ? 10 : 5, 8, 40)
  hitstop = big ? 0.11 : 0.075   // s: el mundo se congela, el sonido no
  shake   = big ? 4 : 2.4        // unidades; decae con dt·shake·7 + dt·2
  post.ca = big ? 0.016 : 0.009  // pulso de aberración cromática
  if (big) post.invert = 1       // un cuadro con colores invertidos (decae ×20/s)
  víctima.flash = 1              // se aclara (decae ×9/s); en el shader del sprite: mix hacia crema × 0,6
  post.waves.push({ x, y, r: 2, k: big ? 0.012 : 0.006 })              // onda de choque en el posproceso
```

- **Hitstop.** Mientras dura, no avanzan los actores ni los efectos, pero sí el sacudón y el destello. Si el hitstop congelara también eso, se sentiría como un tirón de rendimiento.
- **Sacudón.** Suma dos senos de frecuencias distintas por eje (83 y 51 Hz en x; 71 y 39 en y) por la amplitud. Nunca uses ruido aleatorio por cuadro: tiembla en vez de sacudir.

## 4. Impactos contra el suelo y otros eventos

| Evento | Efecto |
|---|---|
| `slam` (hachazo) | `groundImpact(x, 1.6)`: polvo a los dos lados, escombros (10·potencia), chispas hacia arriba, aro achatado, estallido, onda de choque `0.018·potencia`, sacudón 5·potencia, hitstop 0,06·potencia y **grietas de brasa** que quedan brillando en el piso y se apagan |
| `scrape` (barrido) | 6 tandas de chispas y escombros a lo largo del barrido, separadas 20 ms en tiempo del mundo |
| `roar` | 3 anillos y ondas de choque separados 0,18 s, 30 brasas, sacudón 6 y aberración 0,02 |
| `land` | Polvo a los dos lados y un aro achatado; sacudón 1,2·potencia |
| `step` | 2 bocanadas chicas hacia atrás; el jefe usa `stomp` con sacudón 0,8 |
| `dash` | Líneas de velocidad, polvo atrás y **estelas** (4 copias del sprite que se quedan atrás, teñidas de rojo, 0,28 s; se guardan los lienzos, no se redibuja) |
| `charge` → `wave` | El arma se enciende (`gl`), tiembla y suelta brasas mientras carga; la onda viaja a 330 unidades/s con estallido y aberración |

## 5. Disolución (muerte, teletransporte)

En el shader del sprite, un **frente en el mundo** recorre el cuerpo de la cabeza a los pies: `d = (yFrente − y)·sentido/14 + (fbm(xy·0.035) − 0.5)·1.6`, y se descarta lo que tiene `d < 0`. El borde quemado es `mix(col, [3.2, 1.2, 0.35], 1 − smoothstep(0, 0.35, d))`, en HDR para que brille. Desde la línea del frente se sueltan brasas que suben. Para reaparecer, el mismo frente corre al revés y el cuerpo se arma desde los pies.

Ojo: el frente tiene que estar en coordenadas del *mundo*, no del sprite. Si no, cambia de lugar cada vez que el lienzo del actor cambia de tamaño.

## 6. Detalles que suman

- **Sombra de contacto.** Una elipse oscura bajo los pies que se achica y aclara con la altura (`yw`): ancla al personaje al piso.
- **Oclusión cerca del suelo.** En el shader del sprite, `col *= mix(0.72, 1, smoothstep(0, 22, y − suelo))`: los pies se oscurecen un poco.
- **Luz local** (farol, fuego): multiplica el color del sprite (`col += col·luz·k·exp(−d/r)`). Sumarla en plano lava los oscuros y la tinta.
- **Ambiente.** Brasas que suben, ceniza y luciérnagas cerca de las luces: pocas, lentas y siempre.

## 7. Sonido (también es peso)

`kit/audio.ts` es Web Audio procedural, sin archivos, todo con una reverberación de catedral generada y viento de fondo:

- silbido del filo: ruido pasa-banda que sube;
- golpe: ruido grave + seno que cae + dos tonos metálicos;
- hachazo: seno a 70 → 28 Hz + retumbe + escombros;
- rugido: sierra a 68–92 Hz modulada a 23 Hz por un filtro resonante;
- pasos, carga, raspado y crepitar.

El sonido va en el mismo evento que el efecto: un golpe sin sonido pierde la mitad del peso.
