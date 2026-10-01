# Game Sandbox

Espacio para experimentar con jueguitos web. Vite multi-página: cada juego vive en
`games/<nombre>/` y sus assets en `public/<nombre>/`.

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
