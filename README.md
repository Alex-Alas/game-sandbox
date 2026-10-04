# Game Sandbox

Espacio para experimentar con jueguitos web. Vite multi-página: cada juego vive en
`games/<nombre>/` y sus assets en `public/<nombre>/`. Para probarlo en web entrar a [https://alex-alas.github.io/game-sandbox/](https://alex-alas.github.io/game-sandbox/)

```bash
npm install
npm run dev      # http://localhost:5173  (hub con la lista de juegos)
npm run build    # salida en dist/
```

## Juegos

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
