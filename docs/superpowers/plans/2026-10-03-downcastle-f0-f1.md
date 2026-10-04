# DOWNCASTLE — plan de F0 + F1

Spec: [`specs/2026-10-03-downcastle-f0-f1-design.md`](../specs/2026-10-03-downcastle-f0-f1-design.md) ·
Marco: [`specs/2026-10-03-downcastle-ronda-2-roadmap.md`](../specs/2026-10-03-downcastle-ronda-2-roadmap.md).
Rama de implementación: una nueva desde `master`, después de mezclar la de la voz (#6) y esta
planificación.

## Pasos

1. **`content.js`.** Tablas `ELEMENTS`, `CURRICULUM` y `BLOCK_META`, derivadas del ASCII con
   sobrescritura a mano. Asserts nuevos en `level.js` (caracteres conocidos y reglas de `chase`).
2. **Generador por ciclos.** `genTramo(seed, c, k)` con largo `5 + k + 3c` (tope), presupuesto,
   ~40 % de novedades, tramo de jefe y reglas del derrumbe. `run` pasa a `{ c, k }`.
   Actualizar `main.js` (mensaje `start`, etiquetas, fin de la run) y la telemetría (`c`, `k`,
   `kind`, `mods`).
3. **Saltar a cualquier punto.** `?ciclo`, `?tramo`, `?jefe`, `?mods`, `?seed` y
   `__downcastle.goto`, propagados por `start`.
4. **`tools/simrun.mjs`.** Arnés en Node con métricas, tabla y código de salida por umbrales (de
   arranque, solo con los tramos normales).
5. **Visor `?ver=bloques`.**
6. **Plataformas que se derrumban** (`=`): `sim.dyn`, `tileAt` dinámico, `dy` en `encodeState`,
   dibujado aparte en `render.js`, fx y sonido.
7. **Esqueleto arquero** (`s`): criatura, flecha, aviso del arco, sprite 0x72, sonido. Los bots
   disparan a las flechas y al esqueleto.
8. **Bloques nuevos:** 2 de presentación, 2 mixtos y 2 `chase`, con sus metadatos.
9. **Derrumbe:** `sim.cam` con velocidad base por bloque y rubber banding (adelantado y golpes
   seguidos), borde mortal, aviso de 3 s, `cy` en el estado, render con cámara compartida e
   interpolación en los invitados. Borrar `EJEMPLO_DERRUMBE`. Calibrar `V0`, `Vc`, `Vb`, `KA` y τ
   con `simrun`.
10. **El Ojo:** sala `ojo_a`/`ojo_b` con cierre y apertura, cuerpo en código, rayo, ojitos, ventana
    de picada, fases, lluvia de gemas, premio «Golpe de Gracia» y lógica de bots. Calibrar con
    `simrun --jefe`.
11. **Aceptación** (spec §F1.8): `simrun` en verde, `npm run build`, recorrido en el navegador con
    piloto automático, Playwright con 2 contextos y actualizar `CLAUDE.md`.
12. **Prueba con 2 personas** y ajuste de constantes según la nota de `downcastle.tel`.
