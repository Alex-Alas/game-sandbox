# CATAPUM — guía de arte (assets de diseño)

El juego se dibuja en Canvas 2D en **caricatura procedural** (decisión del usuario). Los assets son **SVG hechos a
mano** (código), livianos y nítidos a cualquier escala, en `public/catapum/` (convención del repo: `public/<juego>/`).
El juego los carga con `import.meta.env.BASE_URL + 'catapum/…'` (en Pages la base es `/game-sandbox/`).

## Estilo

- **Contorno grueso y oscuro**: `#1a1222`, `stroke-width` 3 en un viewBox de 64 (≈ 4,7 %), `stroke-linejoin="round"`,
  `stroke-linecap="round"`. Igual que los personajes del juego (`render.ts → drawPlayer`).
- **Rellenos planos y saturados**, una sombra plana (el mismo color ~25 % más oscuro, abajo a la derecha) y un brillo
  chico (blanco al 35–60 %, arriba a la izquierda). Sin degradados salvo fuego, rayos y cielos.
- Formas **redondas y exageradas**, un poco infladas, legibles en silueta a 24 px. Nada de texto dentro del arte
  (salvo las onomatopeyas y el logo).
- Fondo **transparente**. Centrado, con ~4 px de margen en el viewBox 64.
- Inclinación dinámica leve (−10° a −15°) en lo que se lanza; lo que se apoya, derecho.
- Las caras (si las hay) son como las de los personajes: ojos blancos ovalados con pupila negra, boca de una línea.

## Paleta

| Uso | Colores |
|---|---|
| Contorno | `#1a1222` |
| Tipos de carta (marco que pone el juego) | EXPLOSIVO `#ff9a3c` · RAYO `#4fe3ff` · MOVIMIENTO `#6fe36a` · TRAMPA `#ff5a5a` · APOYO `#ff8ad8` · CUERPO `#b38bff` |
| Fuego | `#ffe27a` → `#ffb43a` → `#ff7a1a` → `#d63a2a` |
| Metal / bomba | `#2b2b33`, `#5a5f6a`, `#cfd8dc` |
| Madera | `#c8873a`, `#a06c37`, `#6b4a2e` |
| Personajes | BOMBÍN `#ff7a3d` · LÍA `#3fd0c9` · TURBO `#ffd23f` · MUU `#f4f1ea` · CHUCHU `#e84a5f` · KUNAI `#8f6bff` |
| UI | fondo `#1a1033`, panel `#2a1d4f`, amarillo `#ffd23f`, naranja `#ff7a3d`, cian `#3fd0c9`, rojo `#ff5a5a` |
| Temas de mapa | ver `games/catapum/src/themes.ts` (cielo, mar, tierra, pasto, piedra, madera por tema) |

## Qué se hace (y dónde)

- `public/catapum/cartas/<id>.svg` — una ilustración por carta (los ids de `src/sim/cards.ts`) más `+ulti` y `+mana`
  (`ulti.svg`, `mana.svg`). viewBox `0 0 64 64`. Se ven a 24–60 px sobre el color del tipo.
- `public/catapum/deco/<tema>/<nombre>.svg` — decorados del mundo por tema (árboles, arbustos, rocas, carteles,
  cristales…), con el **pie del objeto en el borde de abajo del viewBox** y centrados en x. Tamaño real en metros en el
  manifiesto. Solo adorno: no chocan con nada.
- `public/catapum/fondo/<tema>-<capa>.svg` — siluetas lejanas para parallax (2 capas por tema), anchas (viewBox
  `0 0 1600 400`), que se puedan repetir en x sin costura visible, en 1–2 colores del tema.
- `public/catapum/ui/` — íconos de los botones táctiles (salto, dash, garfio, ulti) en blanco con contorno, íconos de
  los 6 tipos de carta, el logo CATAPUM y onomatopeyas de historieta (`bum.svg`, `paf.svg`, `catapum.svg`,
  `splash.svg`, `zas.svg`, `ko.svg`).
- Cada carpeta lleva un `manifest.json` con la lista de archivos y sus datos (tamaño en metros y ancla para los
  decorados; tema; para qué carta es cada ilustración).
