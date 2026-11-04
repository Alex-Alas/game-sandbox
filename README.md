# Game Sandbox

Espacio para experimentar con jueguitos web. Vite multi-página: cada juego vive en
`games/<nombre>/` y sus assets en `public/<nombre>/`. Para probarlo en web entrar a [https://alex-alas.github.io/game-sandbox/](https://alex-alas.github.io/game-sandbox/)

```bash
npm install
npm run dev      # http://localhost:5173  (hub con la lista de juegos)
npm run build    # salida en dist/
```

La portada (`index.html`) muestra un póster y un loop de gameplay de cada juego; se regraban con
`node tools/hub-media.mjs` (con `npm run dev` corriendo; detalles en CLAUDE.md).

## Juegos

### LUCERO — `games/lucero/`
Match-3 por niveles al estilo saga, todo procedural en Canvas 2D (gemas, efectos y música por código).

- **Juego**: deslizá (o tocá dos) gemas para alinear 3 iguales. 4 en línea crean una **cometa**, una L/T
  una **nova**, un cuadrado 2×2 una **luciérnaga** y 5 en línea un **lucero**; tocá o mové un especial para
  dispararlo y juntá dos para combinarlos. Metas por nivel: juntar gemas, disipar niebla, romper rocas
  lunares, derretir escarcha y bajar estrellas fugaces. Lo que sobra al ganar se vuelve una lluvia de cometas.
- **Progreso**: mapa sin fin por regiones con dificultad en serrucho (DIFÍCIL / SÚPER DIFÍCIL), 1 a 3
  estrellas por nivel, vidas que se recargan, +5 movimientos con monedas, potenciadores que se desbloquean
  de a uno, racha de victorias con especiales gratis, regalo diario de 7 días, misiones del día, cofres y
  un cielo de constelaciones que se enciende con las estrellas ganadas.
- **Niveles**: generados y calibrados con un bot (`tools/simrun.mjs`); los primeros 300 vienen en una tabla.

Depuración: `__lucero.play(n)`, `auto(true)`, `speed(k)`, `state()`.

### ELYTRA — `games/elytra/`
Vuelo con alas en tercera persona + ragdoll físico. Three.js + Rapier (WASM).

- **Vuelo**: gravedad + arrastre cuadrático + redirección de la velocidad hacia el morro.
  W pliega (picado), S frena y cierra el giro, ESPACIO aletea (rescata pérdidas),
  A/D tonel lateral, SHIFT impulso. Corrientes térmicas, efecto suelo, rebote en el agua,
  roce contra paredes (choque solo si el impacto es frontal/fuerte), recarga de energía
  volando pegado a la roca.
- **Ragdoll**: cuerpos rígidos Rapier por cada parte del personaje (cabeza, torso, brazos,
  piernas, alas), articulaciones con límites angulares y "tono muscular" que se relaja,
  CCD, cámara lenta al impacto, sonido/polvo por golpe y marcador de daño/fracturas.
  Chocar contra las columnas de las ruinas las derriba. `X` para soltarse en el aire.
- **Mapa** (4×4 km): llanura de agujas, macizo nevado, cañón con puentes y arcos,
  anillo de piedra, ruinas, islas flotantes, lago y valle. Circuito de 23 puertas
  (~1 min por vuelta) con cronómetro, parciales y récord local. El terreno se talla
  automáticamente para que el recorrido siempre sea volable.

Créditos de assets en [games/elytra/CREDITS.md](games/elytra/CREDITS.md).

Depuración desde la consola: `__elytra.advance(seg)` simula sin rAF,
`__elytra.probePath()` comprueba que los tramos entre puertas estén libres.

### DOWNCASTLE — `games/downcastle/`
*Friendslop* para el teléfono, en vertical y con una mano: de 2 a 4 aventureros atados con una
cuerda elástica bajan por las entrañas de un castillo mágico, al estilo Downwell. Canvas 2D pixelado.

- **Controles**: inclinar para moverse; toque = saltar (en el suelo) o disparar las botas-cañón
  (en el aire); mantener = ancla (junto a una pared o en el suelo) o ráfaga; deslizar ↑ = tirón a
  tus vecinos de cuerda; deslizar ↓ = picada. Alternativa por arrastre en Ajustes.
- **Cuerda**: elástica hasta 2× su largo y rígida desde ahí; el rebote bungee devuelve la energía.
  Anclarse frena a los que cuelgan; el tirón salva (o sabotea).
- **Criaturas**: malvadas (goblin, diablillo; contorno rojo), neutrales (cubo gelatinoso que atrapa;
  violeta punteado) y buenas (hada que cura o recarga, y se enoja si le disparan; turquesa).
- **Run**: tramos procedurales cada vez más largos, gemas del equipo, premios sociales al final de
  cada tramo (Ancla de Hierro, Bungee de Oro, Fuego Amigo…) y nota de 1 a 5.
- **Red**: salas de 4 letras con link `?sala=ABCD` y QR. El anfitrión simula; en desarrollo el
  relay vive en el mismo servidor de Vite (`npx vite --host` para jugar con teléfonos en la Wi-Fi).
  En producción usa un Worker de Cloudflare con Durable Objects (`games/downcastle/server/`,
  se despliega a mano con `npx wrangler deploy`).

Sin red: «Jugar solo con bots» o `?solo=1`. Depuración: `__downcastle.bots(n)`, `advance(seg)`,
`state()`, `seed(s)`, `auto(on)`. Créditos en [games/downcastle/CREDITS.md](games/downcastle/CREDITS.md).

### ABISMO — `games/abismo/`
Roguelite dentro de roguelite, survivor vertical para teléfono. Morí, elegí una reliquia permanente,
volvé más fuerte. Matá al Guardián a los 3 min → Descenso completado → NG+ (Corrupción y bloque de
reliquias nuevas). Arte ocultista pulp procedural en Canvas 2D (papel sepia, tinta negra, dorado);
todo por código, sin assets externos.

- **Run (interior)**: joystick flotante de una mano, armas automáticas (6: Púa del Hereje, Litania
  de Fuego, Cadenas del Abismo, Lectura de Runas, Campana Espectral, Leviatán), 8 pasivas, críticas,
  imán de almas, combo/FIEBRE. Al subir de nivel elegís 1 de 3 cartas (teclas 1/2/3 en compu).
  A los 180 s aparece el **Guardián del Umbral**: te persigue, invoca horda, lanza dash y gira 3 runas
  que queman; 3 fases y su vida se calibra con tu DPS para que la pelea dure ~25 s.
- **Descenso (exterior)**: al morir o vencer elegís 1 de 3 reliquias permanentes (15 en total;
  NG+ con 4 nuevas tras vencer 1 vez, NG++ con 3 tras vencer 2). Cada muerte sube la Corrupción
  (más densa la horda, pero más botín). Cofre por Descenso completado y misiones diarias.
- **Persistencia** localStorage `abismo.save`: reliquias, Descensos, corrupción, récords, misiones,
  cofres, skins y ajustes. Sin cuenta, sin nube.
- **Cámara** que sigue al peregrino con zoom de teléfono (el Abismo es un círculo de 1100 unidades),
  arte ocultista pulp procedural y audio Web Audio sin archivos.

Depuración: `__abismo.start()`, `advance(seg)`, `state()`, `sim()`, `save`, `showcase()`.
