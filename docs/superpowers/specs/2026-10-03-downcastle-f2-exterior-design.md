# DOWNCASTLE — F2 (exterior de la torre): diseño

Fecha: 2026-10-03 · Estado: acordado en chat · Marco:
[`2026-10-03-downcastle-ronda-2-roadmap.md`](2026-10-03-downcastle-ronda-2-roadmap.md) ·
Base: F0+F1 ([`2026-10-03-downcastle-f0-f1-design.md`](2026-10-03-downcastle-f0-f1-design.md))

## Objetivo

Darle al ciclo su **respiro y su transición**: bajar por **afuera de la torre**, con una
proyección cilíndrica tipo Nebulus, después del jefe y en un mini-tramo dentro de cada ciclo.
Afuera se presentan cuatro novedades: **viento**, **plataformas móviles** (horizontales y
ascensores), **gárgola** y **murciélago**.

Éxito:
- `?ext=bajada` y `?ext=mini` llevan directo al exterior; la torre gira bajo el jugador, con cielo
  a los costados, y los compañeros detrás de la torre se ven como silueta.
- `simrun.mjs` sigue en verde y suma los grupos del exterior.
- Con 2 personas, la bajada después del Ojo se siente como un respiro distinto, no como un tramo
  más.

Fuera de alcance: ventanas dentro de un tramo, biomas nuevos (F4), murciélago en el interior (F4),
bestiario y cuentas (F3), mecánicas de cuerda nuevas, oclusión por geometría (solo la cara de
atrás de la torre genera siluetas).

## F2.1 Estructura de la run

Los ciclos se numeran desde 0 (`c`), como en F1; en pantalla se muestran como `c + 1`.


- Secuencia de cada ciclo (`CYCLE_SEQ`): **T1, T2, mini-exterior, T3, T4, jefe, bajada**.
  - `run` guarda `{ c, s }`, con `s` el índice en la secuencia. Los tramos normales siguen
    usando `k = 0..3` para el largo, el presupuesto y las reglas del derrumbe (el mini no cuenta
    entre los 4).
  - Al ganar, `s++`; tras la bajada, `c++, s = 0`.
- **Mini-exterior:** 2 anillos (3 desde `c = 1`), en todos los ciclos, **también en el primero**.
  En el ciclo 0 usa solo anillos básicos (sin novedades del exterior): presenta la torre y la
  rotación.
- **Bajada:** `4 + c` anillos, tope `CFG.EXT_MAX_RINGS` (7). En el ciclo 0 presenta las novedades
  (§F2.2).
- Ambos son tramos `kind: 'exterior'` con `sub: 'mini' | 'bajada'`, empiezan en el anillo fijo
  `ventana` (salen por una ventana rota) y terminan en `entrada` (el FIN es una ventana abierta).
  Terminan con la pantalla de premios, como cualquier tramo.
- El derrumbe **nunca** aparece afuera; la regla «nunca en dos tramos seguidos» mira solo los
  tramos normales.
- Etiquetas: «CICLO 1 · AFUERA» (mini) y «CICLO 1 · BAJADA POR LA TORRE».
- Telemetría: `kind: 'exterior'`, `sub`, y los anillos usados.

## F2.2 Anillos y generador

- Nuevo `src/rings.js` (como `blocks.js`): `RINGS = { id: [8 filas de 32 caracteres] }`.
- Caracteres: los del interior (`#`, `-`, `=`, `^`, `*`, `G`, `g`, `i`, `f`, `s`, `?`) más:
  - `b` murciélago (cuelga del tile de arriba, que debe ser piedra);
  - `w` gárgola (sobre piedra; sopla hacia su lado libre);
  - `m` plataforma móvil (2–3 `m` contiguos en la fila); su riel es una fila de `h` (horizontal,
    en la misma fila) o una columna de `v` (ascensor, en las columnas de la plataforma). El riel
    marca el recorrido completo.
- `content.js`: los elementos nuevos (`wind`, `mover`, `gargoyle`, `bat`, con su costo) y
  `RING_META` derivado igual que `BLOCK_META` (`tags`, `cost`, `minCycle`, `intro`). `wind` es
  una marca del anillo (sin carácter): `RING_OVERRIDES[id].wind = true`.
- `CURRICULUM` gana la entrada **`ext`** (la bajada del ciclo 0): `news: ['wind', 'mover',
  'gargoyle', 'bat']`.
- **Ensamblado:** cada anillo se apila con un giro al azar (corrimiento de x, múltiplo de 1 tile)
  y, con 50 %, espejado. `genExterior(seed, c, sub)` devuelve
  `{ seed, c, kind: 'exterior', sub, rings: [{ id, shift, mirror }], budget }`.
- **Bajada del ciclo 0:** `ventana`, un anillo de presentación por novedad en orden (viento,
  plataformas, gárgola, murciélago), uno mixto, `entrada`.
- **Resto:** por presupuesto (`budgetExt(c)`) del pool exterior, con `minCycle ≤ c`. El pool no
  usa cubo ni bungee. Las novedades del exterior solo aparecen desde la bajada del ciclo 0 (el
  mini del ciclo 0 no las tiene).
- **Asserts** (como en `level.js`): cada fila tiene 32 caracteres conocidos, `b` cuelga de piedra,
  cada `m` tiene riel, y la entrada es alcanzable desde la ventana con wrap. Para la
  alcanzabilidad, las celdas del riel cuentan como pisables. La fila 0 de cada anillo tiene al
  menos 6 celdas libres seguidas (para que el giro al azar siempre deje paso).
- Al menos **10 anillos**: `ventana`, `entrada`, 4 de presentación, 4 mixtos o básicos.

## F2.3 Simulación con wrap

- `buildLevel` arma el exterior con `w = 32`, `wrap = true`. Las posiciones **no se envuelven**:
  la x de jugadores, criaturas y balas crece sin límite y solo `tileAt` da la vuelta. La cuerda
  enrolla de forma natural y la interpolación de red no salta en la costura.
- `dxw(lv, a, b)`: el delta más corto con wrap (identidad en el interior). Se usa en todas las
  comparaciones entre entidades (colisiones jugador–criatura, balas, gemas, pisotones, despertar,
  apuntado) y en las comparaciones con cosas fijas del mapa (gemas, criaturas que vuelven a su
  percha).
- `ropePath`: la recta y el BFS usan tiles envueltos y devuelven puntos sin envolver (contiguos a
  los extremos). `los` funciona igual porque usa `tileAt`.
- `move`/`moveX`/`moveBody`: sin cambios (usan `tileAt`). El `hasSupport` del ancla también.
- Las flechas a los compañeros fuera de pantalla usan `dxw` para el lado.

## F2.4 Mecánicas nuevas

Todo lo nuevo depende de `sim.t` (y de la semilla), así que **no agrega estado de red**: los
invitados lo calculan con el `T` del estado.

### Viento (anillos con `wind`)
- Ciclo por anillo, con fase desde la semilla: calma de 4–7 s → **aviso de 1 s** (líneas de viento
  que cruzan la pantalla y un silbido) → **ráfaga de 1,5 s** con dirección al azar.
- La ráfaga **arrastra la posición** (deriva en x dentro de `move`, como en ELYTRA: un empuje sobre
  `vx` lo pisaría el control): `CFG.WIND_V` completo en el aire, la mitad en el suelo y **nada
  anclado**. A las criaturas no las afecta.
- Solo actúa sobre quien está dentro de las filas de ese anillo.

### Plataformas móviles (`m` con riel `h` o `v`)
- Plataforma de 2–3 tiles que **se cruza desde abajo como la madera** y la picada la atraviesa.
- Va y viene por su riel con suavizado (ping-pong con `smoothstep`) a ~`CFG.MOVER_V` (30 px/s) de
  media; la fase sale de la semilla y la posición es función de `sim.t`.
- **Lleva al que está parado encima**: en cada paso, al jugador (o criatura) apoyado se le suma
  el desplazamiento de la plataforma, también hacia arriba en los ascensores. El aterrizaje se
  resuelve contra la posición barrida del paso (para no atravesarla subiendo).
- No es un tile: vive en `lv.movers` y la colisión la consulta aparte de `tileAt`. El ancla vale
  parado sobre una plataforma (el anclado viaja con ella). `hasSupport` también mira las
  plataformas.

### Gárgola (`w`, invulnerable)
- Estatua sobre un tile de piedra. Cada ~3 s: **ojos que brillan 0,8 s** (el aviso) y después
  **sopla 1 s** una banda de 2 tiles de alto y 6 de largo hacia su lado libre.
- La banda **empuja fuerte y no daña**, como el rayo del Ojo; el anclado no se mueve. Las balas
  rebotan en ella. Las muertes chistosas salen de los pinchos, el vacío y la cuerda.

### Murciélago (`b`)
- Cuelga dormido bajo un techo. Se despierta si un jugador vivo pasa a < 64 px.
- Despierto: **picado sinusoidal** hacia el jugador que lo despertó durante ~3 s, después vuelve
  a su percha y se duerme (enfriamiento de 2 s).
- 1 HP, muere con disparo o pisotón, quita 1 corazón al tocar y deja 1 gema. Contorno rojo
  (malvado). Sprite del atlas 0x72 si hay uno de murciélago; si no, dibujado en código (`CODE`).

## F2.5 Render: proyección Nebulus

- **Geometría:** circunferencia `C = 32·16 = 512 px`, radio de dibujo `R = 80 px` (los tiles del
  centro quedan en escala ~1:1). La torre ocupa x ∈ [16, 176] y se ve cielo a los costados.
- **Cámara:** ángulo `φ` que sigue la x del jugador local con suavizado (y la y como siempre).
  Para un punto del mundo, `θ = 2π·(x − camX)/C`: pantalla `x = 96 + R·sin θ`, profundidad
  `cos θ`.
- `project(x, y)` devuelve `[sx, sy, depth]` (en el interior, depth = 1). El renderer elige la
  proyección según `lv.wrap`.
- **Torre:** el exterior se pre-dibuja **desenrollado** (512 px × alto del tramo: muro de ladrillo
  de fondo, cornisas, madera, pinchos, ventanas). Cada cuadro se dibuja cada una de las ~16
  columnas visibles como una tira vertical (solo el rango de y visible) con ancho
  `R·(sin θ₁ − sin θ₀)` y oscurecida hacia los bordes según `cos θ`. Las columnas con `cos ≤ 0`
  no se dibujan. Los tiles dinámicos (quebradizas) y las plataformas móviles pasan por la misma
  proyección.
- **Siluetas:** jugadores, criaturas y la cuerda con profundidad ≤ 0 se dibujan como **silueta
  plana** (color del jugador al 40 %) sobre la piedra, en su x proyectada. La cuerda: los tramos
  de adelante normales; los de atrás, tenues y punteados.
- **Cielo:** degradé de anochecer, estrellas y una franja de montañas en parallax que se corre con
  `φ` (y un poco con la y). Afuera **no hay capa de oscuridad**; las antorchas no aplican.
- Ventana rota del inicio (con fx de vidrios al empezar) y ventana abierta del FIN, dibujadas en
  código.
- Rendimiento: el cuadro del exterior sigue ≲ 4 ms en el teléfono de referencia (resolución
  lógica de 192 px; ~16 `drawImage` de la torre más el cielo).

## F2.6 Red, audio y voz

- El mensaje `start`/`tramo` lleva el tramo exterior (`rings` con `shift` y `mirror`); el
  invitado lo reconstruye con `buildLevel`. Murciélagos y gárgolas viajan como criaturas (la
  gárgola sin estado propio: su fase sale de `T`).
- **Audio** (procedural, `audio.js`): ambiente de viento de fondo afuera (ruido filtrado), silbido
  de aviso y ráfaga, soplido de la gárgola, chillido del murciélago al despertar.
- **Voz:** afuera los vivos se oyen **en seco** (aire libre), sin el bus de cueva. Las demás
  reglas (caídos, asimetría oír/enviar) no cambian.

## F2.7 Herramientas y bots

- URL: `?ext=mini|bajada` (con `?ciclo=`) arranca en ese exterior; `__downcastle.goto(c, k,
  { ext })` en caliente. `?ver=bloques` también muestra los anillos desenrollados con sus metadatos
  y asserts.
- **Bots:** `flowField`/`botFields` con wrap (vecinos envueltos) y los rieles como celdas
  pisables; ignoran el viento y la gárgola; les disparan a los murciélagos como a los diablillos.
- `simrun.mjs`: `--ext mini|bajada`, y dos grupos nuevos en la suite.

## F2.8 Aceptación

- `npm run build` sin errores; los asserts de `level.js` y `rings.js` en silencio.
- `simrun.mjs` con 2 bots y 50 semillas:
  - **Mini-exterior** (ciclos 0 y 1): ≥ 90 % completados.
  - **Bajada** (ciclos 0 y 1): ≥ 85 % completados.
  - Los grupos de F1 siguen pasando y el paso de simulación sigue en ≲ 0,05 ms.
- **Navegador:** `?solo=1&bots=1&ext=bajada` con `auto(true)` completa la bajada; captura de la
  torre girando, de una silueta detrás de la torre y de una ráfaga.
- **Playwright:** 2 contextos de 390×844 con `hasTouch`: el invitado ve las plataformas, las
  gárgolas y el viento en fase con el anfitrión (diferencia de plataforma ≤ 4 px tras
  interpolar), y el ciclo completo pasa por el mini y la bajada con sus premios.
- **Prueba real con 2 personas:** un ciclo completo con la bajada.
- **CLAUDE.md:** sección DOWNCASTLE actualizada (exterior, `rings.js`, `dxw`, proyección,
  mecánicas nuevas).
