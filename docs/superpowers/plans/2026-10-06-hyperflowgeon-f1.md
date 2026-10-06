# HYPERFLOWGEON — plan de F1

Spec: [`specs/2026-10-06-hyperflowgeon-f0-design.md`](../specs/2026-10-06-hyperflowgeon-f0-design.md) (decisiones
cerradas en su §0 y §8). Rama de implementación: una nueva desde `master`; esta planificación va primero.
**No se implementa nada hasta que el usuario diga «empezá F1».**

## Objetivo

Contestar la pregunta más riesgosa del proyecto: **¿el grapple con auto-aim en el pulgar se siente preciso y
fluido?** Entregable: el **Patio del Mesón**, un campo de práctica jugable en teléfono y PC donde se juega La
Calamidad (tirón, enganche, columpio, bowie atado) contra dummies, con el núcleo de reglas compartidas
(estados, momentum, hitstop por entidad) ya hecho como simulación pura, determinista y serializable.

## Alcance

**Dentro:**
- Simulación pura a 60 Hz: controlador cinemático (coyote 6 cuadros, buffer 7), estados AÉREO / ANCLADO /
  LANZADO / ATURDIDO / EN PICADA, MOMENTUM, hitstop por entidad, ataque ligero y pesado direccional (D10).
- La Calamidad: habilidades 1–4 del §4.2 (tirón, enganche de enemigo, columpio, bowie atado). Sin doble
  anclaje.
- Entorno con propiedades legibles: anclable, rompible, lanzable, rebotable, deslizable (grind básico).
- Dummies de Prototype Bits (`Dummy_Base`, dianas, barriles, cajas) con vida, estados y golpes de prueba.
- Entrada: teclado + mouse, gamepad y táctil híbrido (joystick + 4 botones, auto-aim de 35°, 16 direcciones).
- Render Three.js: material toon propio, contorno de casco invertido, cámara 2.5D con «trauma», HUD mínimo
  (momentum, estado, cable), resolución adaptativa y overlay de métricas.
- Panel de tuning (Tweakpane) y estado serializable con replays de entradas.
- Héroe provisional: el muñeco de Prototype Bits o una cápsula con la pose por estado; los UBC de Quaternius
  entran cuando estén medidos (F2).

**Fuera:** los otros tres héroes, enemigos con IA, reinos, jefes, ofrendas y run (F2–F3), PVP y red (F4–F5),
audio final (solo sonidos procedurales de prueba), doble anclaje.

## Estructura de archivos

```
games/hyperflowgeon/
  index.html            entrada (título, canvas, #touch, #pausemenu)
  CREDITS.md            créditos de assets (CC0)
  src/
    main.ts             bucle (paso fijo 60 Hz + render interpolado), estados de pantalla, window.__hfg
    sim/
      math.ts           + − × ÷ √, sin/cos/atan2 propias (tablas o polinomios), clamp, lerp, vec2
      state.ts          tipos de estado: datos planos serializables (entidades, anclas, cables)
      step.ts           un paso de simulación: entradas → estados → física → eventos
      input.ts          Input por cuadro (dirección en 16 pasos, botones, buffer)
      controller.ts     cinemático: suelo, coyote, salto, aire, shape-casts
      states.ts         AÉREO, ANCLADO, LANZADO, ATURDIDO, EN PICADA y sus transiciones
      momentum.ts       ganar/gastar/decaer; modificadores pasivos
      combat.ts         ligero/pesado direccional, hitboxes, hitstop por entidad
      grapple.ts        garfio, tirón, enganche, columpio, bowie atado (cable = restricción de distancia)
      world.ts          anclas y propiedades del entorno, colliders de Rapier, rompibles
      aim.ts            auto-aim (cono 35°, prioridad amenaza > anclable > objeto)
      dummies.ts        dummies y objetos lanzables
      serialize.ts      estado ⇄ JSON/ArrayBuffer; replay de entradas
    render/
      scene.ts, toon.ts, outline.ts, camera.ts (trauma), hero.ts, fx.ts, hud.ts, quality.ts
    input/
      keyboard.ts, gamepad.ts, touch.ts (joystick + botones reubicables), mapping.ts (remapeo)
    tuning/
      params.ts         todos los valores tuneables (CFG) con rangos
      panel.ts          Tweakpane; presets guardados en localStorage
    realms/
      meson.ts          el Patio como «reino» de datos (valida el formato de §3.4 del spec)
  tests/                Vitest (ver «Pruebas»)
  tools/
    export-assets.mjs   Prototype Bits → glTF optimizado (meshopt/KTX2) en public/hyperflowgeon/
public/hyperflowgeon/   assets exportados
```

## Pasos

1. **Andamiaje.**
   - Dependencias: `@dimforge/rapier2d-deterministic-compat`, `tweakpane` (dep.), `typescript`, `vitest` (dev).
   - `tsconfig.json` con `include: ["games/hyperflowgeon"]`, scripts `typecheck` (`tsc --noEmit`) y `test`
     (`vitest run`).
   - `games/hyperflowgeon/index.html` + entrada en `build.rollupOptions.input` de `vite.config.js` + tarjeta
     en el hub `index.html`.
   - Verificar que `npm run build` y `npm run dev` siguen iguales para los otros cuatro juegos.
2. **Matemática determinista (`sim/math.ts`).** Trigonometría propia, vector 2D. Test que lee los archivos
   de `src/sim/` y falla si aparecen `Math.sin|cos|tan|atan|atan2|exp|pow|log|hypot` (salvo `Math.sqrt`,
   `abs`, `min`, `max`, `floor`, `ceil`, `trunc`, `sign`). Test de que `sin/cos/atan2` propias coinciden con
   `Math.*` dentro de una tolerancia.
3. **Estado y bucle.** `state.ts` + `step.ts` + paso fijo a 60 Hz con acumulador y render interpolado
   (patrón de `player.rpos` de ELYTRA). `serialize.ts`: ida y vuelta idéntica, y `replay`: misma lista de
   entradas ⇒ mismo estado bit a bit.
4. **Controlador.** Suelo y rampas con shape-casts de Rapier, coyote, buffer, salto variable, aire con
   control limitado. Pruebas de frame data (cuadros exactos de coyote y buffer).
5. **Estados compartidos y momentum.** Transiciones de `states.ts` en una tabla (no `if` dispersos): cada
   entrada dice qué permite, qué corta y a quién lo vuelve rebotable. `momentum.ts` con los números del §2.
6. **Combate.** Ligero (startup ≤ 6 cuadros), pesado direccional (≤ 15), hitstop por entidad (3–7 cuadros),
   cancelaciones con SALTO/MOVIMIENTO, LANZADO que daña por velocidad.
7. **Entorno y dummies.** Propiedades por objeto (`anchorable | breakable | throwable | bouncy | slidable`),
   grind básico en deslizables, rompibles, dummies con vida y estados.
8. **Grapple (La Calamidad).** Cable como restricción de distancia con recogida, tensión y soltado con
   velocidad conservada; en este orden: tirón → enganchar enemigo (liviano viene / pesado te lleva /
   ATAQUE lo lanza) → columpio → bowie atado que se clava y vuelve. Cable tenso = deslizable.
9. **Auto-aim y entrada.** `aim.ts` (cono 35°, prioridad) con las 16 direcciones de PVP; teclado, mouse,
   gamepad y táctil híbrido (botones de ≥ 12 mm, reubicables y escalables como en VÓRTICE); remapeo.
10. **Render y feedback.** Material toon (2 bandas + luz de borde), contorno de casco invertido solo en lo
    jugable y en los dummies, lenguaje de color de gameplay del §5 (anillo jade en anclables, etc.), cámara
    con trauma, estela del cable, chispas e impactos procedurales, sonidos procedurales de prueba.
11. **Calidad y métricas.** Presets `?q=low|med|high` (como ELYTRA), resolución adaptativa, overlay F3 con
    ms de simulación y render, draw calls y tris.
12. **Panel de tuning.** Tweakpane con todos los valores de `params.ts`, presets y exportación a JSON.
13. **Aceptación.** Pruebas de §«Aceptación», `npm run typecheck`, `npm run test`, `npm run build`, recorrido en
    el navegador (teclado y táctil emulado), medición en teléfono real Android de gama media, y actualizar
    `CLAUDE.md` (arquitectura de la carpeta, comandos de prueba).
14. **Prueba de sensación con el usuario** y ajuste de `params.ts` según lo que diga; la decisión sobre si el
    grapple «funciona» cierra F1.

## Pruebas (Vitest, en Node)

- **Determinismo:** mismo replay dos veces ⇒ estados idénticos cuadro a cuadro; serializar a mitad y seguir
  ⇒ idéntico a no haber serializado.
- **Sin `Math.*` no exacto** en `src/sim/` (paso 2).
- **Frame data:** coyote = 6 cuadros, buffer = 7, startup ligero ≤ 6, pesado ≤ 15, hitstop 3–7.
- **Reglas, no casos:** enganchar enemigo ⇒ ANCLADO (los golpes tensan, no empujan); picada sobre cable tenso
  lo corta; lo LANZADO es rebotable 0,3 s; todo cable tenso es deslizable. Cada una es un test sobre la
  regla, no sobre un par de entidades.
- **Cable:** conserva la velocidad tangencial; la recogida no atraviesa geometría; soltar con SALTO suma
  impulso.
- **Aim:** el cono de 35° elige amenaza antes que ancla y ancla antes que objeto; con las 16 direcciones el
  resultado del mouse y del joystick coincide para la misma dirección.

## Aceptación de F1

| Criterio | Umbral |
|---|---|
| Simulación + render en el teléfono de gama media | 60 fps sostenidos en el Patio; simulación ≤ 3 ms, envío de render ≤ 5 ms |
| Draw calls / tris | ≤ 120 / ≤ 250 k |
| Carga inicial | ≤ 15 MB comprimido |
| Tests y typecheck | en verde |
| Determinismo | replay idéntico en Chrome (escritorio) y Chromium emulando móvil |
| Cuatro habilidades de La Calamidad | jugables solo con el pulgar, sin tocar el panel de tuning |
| Reglas | las 5 reglas de §«Pruebas» pasan y no hay casos especiales por par de entidades |
| Entrada | teclado, mouse, gamepad y táctil completos; remapeo funciona |

## Riesgos de F1 y qué hacer

- **El grapple no se siente preciso con el pulgar.** Es la razón de F1: subir magnetismo del cono y la
  tolerancia de enganche en `params.ts` antes de tocar reglas; si no alcanza, volver a presentar opciones de
  entrada al usuario (no inventar una).
- **El contorno cuesta demasiado en gama media.** Medirlo la primera semana; plan B: contorno solo en
  jugadores y rompibles activos, o reducir el grosor por distancia.
- **TypeScript y tests en un repo de JS sin tests.** Quedan aislados en `games/hyperflowgeon/`; `CLAUDE.md`
  se actualiza («no hay tests» pasa a «solo hyperflowgeon tiene Vitest»).
- **Rapier 2D determinista pesa o no existe con la versión esperada.** Verificar en el paso 1; si falla,
  presentar opciones (colisión propia solo con AABB y rampas, que además sería trivialmente determinista).
- **Los packs no están en el contenedor.** F1 solo necesita Prototype Bits (ya medido); Quaternius se mide
  en cuanto el usuario habilite Drive.

## Después de F1

F2a (Freydis + Grapple–Melee) y F2b (Cuauhtli y Calicó + restantes), según el spec §9. Cada una con su plan
y sin empezar hasta que F1 esté aprobada.
