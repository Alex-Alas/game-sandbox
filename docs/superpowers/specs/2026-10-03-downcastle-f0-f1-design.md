# DOWNCASTLE — F0 (herramientas) + F1 (ciclo jugable): diseño

Fecha: 2026-10-03 · Estado: acordado en chat · Marco:
[`2026-10-03-downcastle-ronda-2-roadmap.md`](2026-10-03-downcastle-ronda-2-roadmap.md)

## Objetivo

Que 2 jugadores completen un **ciclo entero** (4 tramos que se alargan, uno de ellos con derrumbe,
y El Ojo) y entren al siguiente ciclo, más largo y denso. Antes, herramientas para iterar rápido
sin jugar cada vez desde el tramo 1.

Éxito:
- `?ciclo=0&tramo=2&mods=derrumbe` y `?jefe=1` llevan directo a ese punto.
- `node games/downcastle/tools/simrun.mjs` corre muchas semillas con 2 bots y falla si algún umbral
  no se cumple.
- Con tu hermano: un ciclo completo que se sienta más complejo, no más frustrante, con una nota
  ≥ 4 en la telemetría.

Fuera de alcance: exterior (F2), biomas nuevos, bestiario y cuentas (F3), arena, carga y los
demás objetivos (F4+), mecánicas de cuerda nuevas.

## F0 · Herramientas

### F0.1 Saltar a cualquier punto

- Parámetros de URL (con `?solo=1` o en una sala):
  - `?ciclo=c&tramo=k`: la run arranca en ese punto (c y k desde 0).
  - `?jefe=1`: arranca en el jefe del ciclo indicado.
  - `?mods=derrumbe`: fuerza modificadores en el primer tramo.
  - `?seed=s`.
- `window.__downcastle.goto(c, k, { mods, boss })`: lo mismo en caliente (solo el anfitrión).
- El anfitrión los pasa en el mensaje `start`, así los invitados no necesitan los parámetros.

### F0.2 Elementos, etiquetas y costo

- Nuevo `src/content.js` (puro, sin DOM), con tres tablas:
  - **`ELEMENTS`**: `{ id: { kind: 'criatura'|'obstaculo'|'mecanica'|'modificador'|'objetivo', cost, cycle } }`.
    Incluye lo que ya existe (`goblin`, `imp`, `cube`, `fairy`, `spikes`, `wood`, `bungee`) y lo de
    F1 (`skeleton`, `crumble`, `derrumbe`, `ojo`).
  - **`CURRICULUM[c]`**: `{ biome, news: [ids], boss }`. El ciclo 0 es la Mazmorra (`skeleton`,
    `crumble`, `derrumbe`; jefe `ojo`). En F1 los ciclos ≥ 1 son **Mazmorra «+1»**: sin novedades,
    con más presupuesto y largo, hasta que F2/F4 agreguen contenido.
  - **`BLOCK_META`**: metadatos de cada bloque, `{ tags, cost, chase, minCycle }`.
    - `tags` y `cost` se **derivan del ASCII** (cada carácter suma el costo de su elemento) y se
      pueden sobrescribir a mano.
    - `chase: true` marca los bloques aptos para el derrumbe.
    - `minCycle` fija el ciclo a partir del cual el bloque entra al pool.
- Los asserts de `level.js` se amplían: todo carácter del ASCII tiene un elemento conocido y todo
  bloque con `chase` cumple las reglas del derrumbe (sin `c`, sin bungee, hueco ≥ 4 en sus filas
  de borde).

### F0.3 Arnés de bots en Node

- `games/downcastle/tools/simrun.mjs`: importa `level.js`, `content.js`, `sim.js` y `bots.js`
  (ya funcionan en Node).
- Opciones: `--ciclo --tramo --mods --jefe --semillas N --jugadores 2 --json`.
- Por semilla simula hasta ganar, perder o pasar 240 s y mide:
  - resultado, duración, golpes y KO por jugador;
  - golpes del derrumbe y fracción del tiempo dentro de él;
  - eventos de rubber banding;
  - daño al jefe.
- Imprime una tabla resumen. **Termina con código ≠ 0** si no se cumplen los umbrales de
  aceptación (§F1.8): sirve como prueba.

### F0.4 Visor de bloques

- `?ver=bloques` abre una pantalla de depuración (dentro del mismo `index.html`, sin entrada
  nueva en Vite):
  - todos los `BLOCKS` dibujados con el render real;
  - sus etiquetas, costo y `chase`;
  - el resultado de los asserts.
- Vite recarga al editar `level.js`, así que se diseña ASCII sin jugar.
- Opcional: clic en un bloque para jugarlo solo (`goto` con un tramo de INICIO + ese bloque + FIN).

## F1 · Ciclo jugable

### F1.1 Estructura de la run

- `genTramo(seed, c, k)` devuelve
  `{ seed, c, k, n, kind: 'normal'|'boss', biome, chunks, mods, budget }`.
  - `n` es el índice global (compatibilidad con la telemetría y con `randomCreature`).
  - `k = 0..3` son los tramos normales y `k = 4` es el jefe.
- **Largo** de los tramos normales: `5 + k + 3c` bloques intermedios, con tope `CFG.MAX_BLOCKS`
  (inicial 14). El tramo `k = 0` siempre es corto y sin modificadores.
- **Tramo de jefe:** INICIO + 2 bloques de aproximación baratos + sala del jefe (2 bloques
  apilados, 12×24) + FIN.
- `run` guarda `{ c, k }` en lugar de solo `n`; al ganar, `k++`, y tras el jefe `c++, k = 0`.
- La etiqueta muestra «CICLO 1 · TRAMO 3» o «CICLO 1 · JEFE: EL OJO», y el fin de la run el ciclo
  alcanzado.

### F1.2 Presupuesto y rampa

- `budget(c, k) = B0 + Bc·c + Bk·k` (constantes en `CFG`). El generador elige bloques del pool
  (`minCycle ≤ c`) cuyo costo acumulado no pase del presupuesto. Si no le alcanza, rellena con los
  bloques más baratos (respiros).
- **Novedades:** en el ciclo de su presentación, ~40 % de los bloques llevan algún elemento de
  `CURRICULUM[c].news`. Los bloques de presentación (una novedad sola, sin otros peligros) van
  primero en el tramo `k = 0`.
- **Rampa interna:** la densidad sube con `k` por el presupuesto y los respiros bajan. A mitad de
  ciclo no se agregan elementos nuevos.
- Se mantiene «al menos un bungee», salvo en tramos con derrumbe o de jefe.

### F1.3 Modificador `derrumbe` (cámara forzada)

Reemplaza a `EJEMPLO_DERRUMBE` y queda registrado en `MODS`.

- **Estado en la sim:** `sim.cam = { y, v, ahead, ease }`. Lo simula el anfitrión y viaja en
  `encodeState` (`cy` redondeado). Con el derrumbe activo, el render usa `view.camY` y no sigue al
  jugador local. Los invitados lo interpolan como al resto del estado.
- **Velocidad base** según el bloque en el que está la cámara:
  `vBase = (V0 + Vc·c + Vb·índiceDeBloque) · factor(costoDelBloque)`, donde `factor` baja en
  bloques caros (por ejemplo, 1,15 en pasillos y 0,8 en los densos). Resultado: aumento lineal
  bloque a bloque, más lento donde el bloque pide más.
- **Rubber banding (solo eventualidades):**
  - **Adelantado:** si el jugador vivo más avanzado está por debajo de `cam.y + 0,75·H`, la
    velocidad objetivo sube en proporción a cuánto se pasó (`vBase + KA·exceso`, con tope). La
    cámara la alcanza con retraso: suavizado de la velocidad con τ ≈ 0,6 s, así que el que se
    apura ve tarde lo que viene.
  - **Golpes seguidos:** si el equipo recibe ≥ 2 golpes del derrumbe en ≤ 3 s, la velocidad
    objetivo baja un poco (`× 0,85`) durante 2 s.
  - **Fuera de eso,** la velocidad vuelve suave a `vBase`. Sin trinquete: nada queda acumulado.
- **Borde superior = derrumbe** (escombros dibujados en los primeros píxeles):
  - Un jugador vivo que lo toca recibe `hurt`: −1 corazón, empujón hacia abajo e invulnerabilidad.
  - Uno fuera de combate solo es empujado hacia abajo.
  - Cuenta `chaseHits`.
- **Borde inferior:** sin barrera. Los compañeros fuera de pantalla usan las flechas que ya
  existen.
- **Inicio:** 3 s de aviso (temblor, «¡DERRUMBE!», «la cámara se suelta de ti») con la cámara
  quieta arriba. Después arranca. Al ganar, se detiene.
- **Reglas del generador:**
  - Solo bloques `chase`, con un tope de costo por bloque.
  - Nunca en `k = 0`, nunca en dos tramos seguidos (incluido entre ciclos) ni en el jefe.
  - Nunca en el ciclo de presentación de otra novedad que no sea la propia.
  - En el ciclo 0 aparece en **exactamente uno** de los tramos `k = 2` o `k = 3`. Después, con una
    probabilidad `CFG.CHASE_P(c)`.
- **Telemetría:** cada entrada de `downcastle.tel` guarda `c`, `k`, `kind` y `mods`.

### F1.4 Esqueleto arquero (malvada, carácter `s`)

- Sprite `skelet_idle_anim` de 0x72 (ya está en el atlas), con contorno rojo.
- Se queda quieto en una cornisa mirando hacia arriba y no camina. Cada ~2,2 s, si hay un jugador
  vivo **arriba** dentro de 110 px, **tensa el arco** 0,5 s (destello: el aviso) y dispara una
  flecha recta hacia donde estaba ese jugador.
- La flecha va a 160 px/s, se rompe contra los tiles, quita 1 corazón y la rompe un disparo de
  las botas.
- HP 2, 3 gemas, muere con pisotón. Con eso castiga caer derecho y a ciegas sobre él.

### F1.5 Plataformas que se derrumban (tile `=`)

- Se comportan como madera (se cruzan desde abajo y con la picada).
- Al pararse alguien encima, **tiemblan 0,45 s** y caen: se vuelven vacías y aparece un fx de
  escombros. **Reaparecen a los 4 s** si no hay nadie ocupando el tile.
- **Estado dinámico:** `sim.dyn` es un mapa de índice de tile → `{ state, t }`. `tileAt` consulta
  `dyn` antes que `tiles`. Viaja en `encodeState` como una lista corta (`dy`).
- **Render:** los tiles dinámicos no se pre-dibujan en `levelCv`, se dibujan aparte cada cuadro.
- Los bots las tratan como madera; el flow field se recalcula si cambian (o las ignora: son
  traspasables desde abajo).

### F1.6 Jefe: El Ojo

- **Sala:** bloques `ojo_a` y `ojo_b` apilados (12×24).
  - Arriba, una entrada que se cierra (se vuelve piedra, con fx) cuando todos los vivos están
    debajo de la fila umbral. A los fuera de combate los arrastra la cuerda.
  - El FIN, debajo, se abre al morir el jefe.
- **Cuerpo:** 32×32 dibujado en código (esfera, párpado y 4 tallos). Flota en la mitad inferior y
  se desliza despacio de lado a lado. Tocarlo empuja (como una criatura neutral) pero no daña.
- **Vida:** `3 + jugadores` golpes (5 con 2). **Solo la picada sobre el ojo abierto** hace daño.
  Un pisotón normal rebota sin daño, y las balas solo aturden 0,3 s los tallos (fx de
  «¡clank!»).
- **Ciclo de ataque:**
  1. **Rayo barrido:** aviso de 1 s (una línea fina) y después un rayo horizontal de 2 tiles de
     alto que barre el cuarto de arriba abajo o al revés. **Empuja fuerte y aturde 0,6 s, sin
     daño.** Las muertes chistosas salen de la cuerda y los pinchos laterales de la sala.
  2. **Mirada:** cierra el ojo (invulnerable) y suelta 2 ojitos que persiguen como diablillos.
  3. **Ojo abierto 2,5 s:** la ventana para la picada.
  - Bajo el 50 % de vida, el ciclo es más rápido y lanza dos rayos cruzados.
- **Fin:** al morir, lluvia de gemas (la gema grande vale 10), se abre el FIN y suena un fx de
  victoria.
- **Premio nuevo:** «Golpe de Gracia» (`bossFinal`, mínimo 1). Contador `bossHits` para la
  telemetría.
- **Bots:** si el ojo está abierto y el bot está encima dentro de ±12 px, hacen picada. Si no,
  esquivan el rayo durante el aviso alejándose de su fila y disparan a los ojitos.

### F1.7 Bloques nuevos

- Al menos **6 intermedios nuevos**:
  - 2 de presentación (uno solo con esqueleto y otro solo con plataformas que se derrumban);
  - 2 mixtos;
  - 2 `chase` (anchos, con peligros que castigan bajar a ciegas: esqueleto en la base de una caída
    y `=` sobre pinchos).
- Además, la sala del Ojo y 2 de aproximación.
- Todos pasan los asserts y el FIN es alcanzable.

### F1.8 Aceptación

- `npm run build` sin errores. Los asserts de `level.js` quedan en silencio en toda la tabla de
  bloques.
- `simrun.mjs` con 2 bots y 50 semillas:
  - **Tramos normales** del ciclo 0 (k = 0..3): ≥ 90 % completados.
  - **Con derrumbe:** ≥ 90 % completados, < 5 % del tiempo dentro del derrumbe y una media ≤ 1
    golpe del derrumbe por jugador.
  - **El Ojo:** ≥ 80 % vencido en ≤ 120 s.
  - **Ciclo 1** (Mazmorra «+1», k = 0..3): ≥ 80 % completados.
  - Un paso de simulación sigue en ≲ 0,05 ms con 2 jugadores.
- **Navegador:** `?solo=1&bots=1&ciclo=0&tramo=2&mods=derrumbe` con `auto(true)` completa el tramo
  y la cámara no sigue al jugador local; `?jefe=1` vence al Ojo con piloto automático.
- **Playwright:** 2 contextos de 390×844 con `hasTouch`. El invitado ve la misma cámara forzada
  que el anfitrión (diferencia ≤ 8 px tras interpolar) y la sala del jefe se cierra y se abre
  igual en los dos.
- **Prueba real con 2 personas:** un ciclo completo, revisando la nota en `downcastle.tel`.
- **CLAUDE.md:** sección DOWNCASTLE actualizada (ciclos, `content.js`, derrumbe, El Ojo,
  `simrun.mjs`, `?ver=bloques`).
