# Posproceso (WebGL2)

El tratamiento final es lo que une personajes, efectos y escenario en una sola imagen «de película». Va todo en `kit/gl/renderer.ts` + `kit/gl/shaders.ts`.

## 1. Cadena

```
escena (capas + sprites + efectos) → objetivo HDR (RGBA16F si hay EXT_color_buffer_float; si no, RGBA8)
  ├─ bloom: brillo con rodilla suave → 5 niveles hacia abajo (13 muestras) → hacia arriba sumando (carpa 3×3)
  ├─ rayos: máscara del astro − silueta de las capas (¼ de resolución) → desenfoque radial (48 muestras con jitter)
  └─ composición:
       ondas de choque → aberración cromática radial → + bloom → + rayos (solo mitad de arriba)
       → exposición → curva de tonos → lift/gamma/gain → saturación → viñeta → papel → grano
       → destello blanco → inversión
```

## 2. Valores que funcionaron

```ts
post = {
  bloom: 0.62, thresh: 1.05,        // solo lo HDR (> 1) florece: la pintura normal no
  exposure: 1.0, sat: 1.04,
  ca: 0.002,                        // aberración base casi nula; los golpes la suben a 0,009–0,02 y decae
  vig: 0.55, grain: 0.035, paper: 0.09,
  lift: [0.02, 0.035, 0.05],        // sombras levemente frías
  gamma: [1.0, 1.0, 1.02],
  gain: [1.04, 1.0, 0.95],          // luces levemente cálidas
};
rayK: 0.8;  sol: [0.74, 0.88, radio 0.035] (en uv de pantalla)
```

Sin `EXT_color_buffer_float` (algunos teléfonos), el umbral baja a `thresh × 0.75`, porque el blanco se recorta en 1.

## 3. La curva de tonos (no ACES)

```glsl
vec3 tone(vec3 x){                                   // identidad hasta 0.6, después comprime las luces
  vec3 k = 0.6 + 0.4 * (1.0 - exp(-(x - 0.6) / 0.4));
  return mix(x, k, step(0.6, x));
}
```

ACES levantaba los oscuros: la tinta se volvía gris, las pieles carbón se veían pálidas y todo el cuadro se lavaba. Con esta curva, los oscuros autorados quedan como se pintaron y solo se domestican los brillos HDR. Si cambias de curva, revisa al personaje oscuro contra el fondo antes de seguir.

## 4. Piezas

- **Bloom.** El paso de brillo promedia 4 muestras y resta el umbral manteniendo el tono (`c · max(0, l − thresh) / l`), con un tope de 40 para que una chispa no explote. La bajada es el filtro de 13 muestras (estilo Call of Duty) y la subida, una carpa 3×3 sumando cada nivel.
- **Rayos volumétricos.**
  1. Se pinta la máscara del astro: disco + halo + un poco de cielo arriba.
  2. Se tapa con la silueta de cada capa: el alfa de su textura con `textureLod(…, 2.0)`, a ¼ de resolución.
  3. Se desenfoca radialmente hacia el astro (`uDecay`, `uDensity`), con jitter por píxel contra las bandas.

  En la composición se multiplica por `smoothstep(0.12, 0.5, uv.y)` para que no inunde el suelo.
- **Ondas de choque.** Hasta 4 a la vez: centro, radio que crece y fuerza que decae. Desplazan la uv en un anillo gaussiano (`exp(−((r − R)/0.035)²)`) y van *antes* de leer la escena, así también deforman el bloom.
- **Aberración cromática.** Radial: crece con la distancia al centro. Casi nada en reposo y un pulso en cada golpe.
- **Papel y grano.**
  - Papel: dos escalas de ruido fijas a la pantalla (512 y 1400 px) que oscurecen un poco.
  - Grano: hash por píxel que cambia cada cuadro, menos en las luces.

  Juntos sacan el aspecto «vector limpio».
- **Viñeta.** `1 − vig · smoothstep(0.35, 1.25, distancia)`, corregida por el aspecto.
- **Destello e inversión.** El destello es una mezcla hacia el blanco. La inversión usa `1 − col.bgr` con un leve giro de tono: un cuadro en los golpes fuertes, que decae ×20/s.

## 5. En los sprites (no en el posproceso)

`SPRITE_FS` agrega por sprite:

- fibras de papel que cambian con cada dibujo (`uSeed`);
- oclusión cerca del suelo;
- luz local que multiplica;
- tinte y niebla de su profundidad;
- destello de golpe (`× 0.6` hacia crema);
- la disolución con borde de brasa;
- el lienzo de brillo sumado en HDR (`uGlowK`).

Además descarta todo lo que está por debajo del suelo (`uGround.y`), así el filo clavado no se ve bajo tierra.

## 6. Ruido y unidades de textura

Crea **una** textura de ruido RGBA de 256² con cuatro ruidos distintos por canal y bilineal repetible. Atala a la unidad 7 y no la toques más. Todos los shaders la leen (`uNoise`): la erosión de los rastros y el polvo, los haces de luz, la niebla y el papel.

Toda subida de textura hace `activeTexture(TEXTURE0)` antes. En FILO, una subida en la unidad activa pisó el ruido en el primer cuadro.

## 7. Resolución adaptativa

Mide el tiempo medio por cuadro. Si pasa de 24 ms, baja la escala de render (`R.scale`) de a 0,08, con piso en 0,45. Si queda por debajo de 14 ms, súbela de a 0,05, con tope en 1 (0,85 en táctiles). Cada cambio tiene una espera antes del siguiente, para no oscilar. En el teléfono, arranca en 0,7. El posproceso es lo más caro: el bloom y los rayos ya trabajan a resolución reducida.
