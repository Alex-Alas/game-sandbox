# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Comandos

```bash
npm install
npm run dev      # Vite en :5173 (hub en / ; ELYTRA en /games/elytra/)
npm run build    # salida en dist/
```

No hay linter ni tests. Se verifica en el navegador con el dev server (`.claude/launch.json`, config `sandbox`).

## Arquitectura

Vite multi-página: cada juego vive en `games/<nombre>/` y sus assets en `public/<nombre>/`. Un juego nuevo se registra en `build.rollupOptions.input` de [vite.config.js](vite.config.js) y en el hub `index.html`. Stack: Three.js + Rapier (`@dimforge/rapier3d-compat`, WASM incrustado). Los comentarios y textos de UI están en español.

### ELYTRA (`games/elytra/src/`)

- `main.js`: bucle, estados (`loading|title|fly|crash`), entrada, HUD, resolución adaptativa y overlay F3. Expone `window.__elytra` para depurar (`advance(seg, keys, render)` simula sin rAF; `probePath()`; `autopilot(on, boost)` vuela solo hacia la siguiente puerta, útil para completar vueltas headless).
- `ghost.js`: graba la vuelta a 20 Hz en una rejilla de tiempo de carrera y guarda la mejor por circuito (`elytra.ghost.<course.id>`); la reproduce como piloto translúcido. Las medallas (`MEDALS` en `course.js`) se calibraron con el piloto automático (~50,8 s).
- **Dos simulaciones separadas.** El vuelo (`player.js`) usa paso fijo de 120 Hz con colisión por shape-cast de Rapier; el mundo Rapier (`physics.js`) corre a 60 Hz y solo se simula si hay cuerpos despiertos. El render interpola ambos (`player.rpos`, `phys.tracked`/`syncDynamic`): usá `rpos`, no `pos`, para posicionar cámara y mallas.
- Cuerpos con malla se registran con `track()` y se quitan con `removeBodies()`; el ragdoll (`ragdoll.js`) y las columnas de ruinas pasan por ahí.
- `ragdoll.js`: una caja por parte, articulaciones esféricas con motores/límites. Las partes no colisionan entre sí (grupos de colisión) y los golpes se detectan por Δv por paso, no por fuerza bruta.
- Quirk de rapier3d-compat 0.21: `JointData.spherical` crea un joint Generic sin métodos tipados; motores y límites van por `j.rawSet.jointConfigureMotorPosition` / `jointSetLimits`. `ShapeCastHit.normal1` es local: la normal mundial es `-normal2`.
- Mundo (`world.js`, `terrain.js`, `course.js`): el terreno es un heightfield compartido por malla, collider y consultas; el recorrido de 23 puertas talla el terreno (`setCarveSegments`) para ser siempre volable. Orden de construcción en `buildWorld` importa (puertas → heightfield → obstáculos con `isPathClear`).
- Rendimiento: `instanced()` en `world.js` hace culling por instancia (cámara y sombra) con un buffer intercalado; llamar `updateCulling(camera)` cada frame después de `updateSunShadow`. Los shaders triplanares (`materials.js`) usan `textureGrad` y apagan el detalle con la distancia (`QUALITY.detailDist`).
- Calidad: presets en `config.js` (`?q=low|med|high`, guardado en localStorage). Cambiarlo recarga (el MSAA solo se fija al crear el contexto). Los valores tuneables viven en `CFG`.
- Audio (`audio.js`) es Web Audio procedural, sin archivos; los golpes del ragdoll pasan por `claimHit` (límite de polifonía).
- Los modelos Kenney vienen con metalness=1: `assets.js` los sanea.

Créditos de assets (CC0) en `games/elytra/CREDITS.md`.
