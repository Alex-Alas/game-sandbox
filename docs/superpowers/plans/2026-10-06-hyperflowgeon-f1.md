# HYPERFLOWGEON — plan de F1

Spec: [`specs/2026-10-06-hyperflowgeon-f0-design.md`](../specs/2026-10-06-hyperflowgeon-f0-design.md) (decisiones
cerradas en su §0 y §8). Rama de implementación: una nueva desde `master`; esta planificación va primero.
**No se implementa nada hasta que el usuario diga «empezá F1».**

## Cambios acordados al empezar (2026-10-06)

F1 arrancó en gris y por pasos que el usuario calibra jugando, empezando por lo riesgoso:
**A** correr y saltar (hecho) → **B** tirón y columpio → **C** auto-aim y táctil (primera respuesta a la pregunta
de F1) → después enganchar dummies, bowie, combate, momentum y estados → render Three.js, assets y animación
al final. Además: colisión propia por barrido de cajas (Rapier 2D solo si hacen falta cuerpos dinámicos),
deslizadores nativos en vez de Tweakpane, `node --test` en vez de Vitest, sin trigonometría propia (vectores +
`√`, cono por producto punto, 16 direcciones en tabla). Lo de abajo queda como mapa; donde contradice esto,
manda esto.

**Paso A calibrado (2026-10-06):** el usuario fijó `RUN 20, ACC 22, DEC 61, AIR 20, JUMP_H 3.8` (el resto quedó)
con un principio que guía lo que sigue: tomar carrera lleva tiempo y cambiar de dirección no es instantáneo, así que
redirigir el momentum sale de movimientos avanzados y de la geometría; **las herramientas facilitan conservar el
momentum, pero no lo regalan.** El garfio del paso B se diseña con esa regla.

**Paso B decidido y hecho (2026-10-07):** el garfio es una **liga elástica a lo King Tongue** que se pega a
**cualquier superficie** (no hay puntos de anclaje). Es una sola fuerza central que solo tira, con tope de velocidad
radial (`HOOK_V`): las tres opciones que se presentaron (fuerza, cuerda que se acorta, tirón fijo) salen de esa regla
según el ángulo entre la liga y la velocidad. Apuntado: opción 1 (el mismo joystick que mueve, mira adelante-arriba
sin dirección) con **joystick fijo** (tocar un punto da la dirección, sin arrastrar) y una mira siempre visible que se
tiñe según el efecto. Esto cambia el §4.2 y la propiedad «anclable» del spec: ahora todo es anclable. Pendiente de
confirmar: superficies lisas (no anclables) como excepción de diseño de niveles. La ayuda de apuntado (esquinas, cono
de 35°, prioridades) queda para el paso C.

**Pedido del usuario (2026-10-07): los tres esquemas de apuntado del garfio tienen que quedar elegibles en Ajustes**
(la opción 1 es la de por defecto y la única hecha):
1. *El mismo joystick que mueve* (hecho): la mira sigue al joystick; sin dirección, adelante y arriba.
2. *Arrastrar desde el botón, como Brawl Stars*: tocar GARFIO dispara como en la 1; arrastrar desde el botón apunta
   con el pulgar derecho y soltar dispara. Separa apuntar de moverse (correr a la derecha y lanzar hacia atrás).
3. *Tocar el punto del mundo*: la liga va hacia donde se toca (como el ratón).

Los tres llegan a la simulación igual (`Input.ax/ay`), así que es solo entrada; en PVP se reducen a las mismas 16
direcciones.

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
- Héroe: **UBC Superhero_Male** (Quaternius, ya medido) con los clips de UAL 1 y 2 que existen (`Idle`,
  `Jog/Sprint`, `Jump_*`, `Pistol_Aim_*` para apuntar el garfio, `OverhandThrow` para el bowie, `Slide_*`
  para el grind, `Hit_*`, `Sword_Regular_*` como golpe ligero provisional) y poses por código para lo que
  no existe (tirón y columpio). Sin trajes ni accesorios culturales todavía (F2+).

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
      anim.ts           estado de la sim → clip (estirado a los cuadros del golpe) + poses por código
    input/
      keyboard.ts, gamepad.ts, touch.ts (joystick + botones reubicables), mapping.ts (remapeo)
    tuning/
      params.ts         todos los valores tuneables (CFG) con rangos
      panel.ts          Tweakpane; presets guardados en localStorage
    realms/
      meson.ts          el Patio como «reino» de datos (valida el formato de §3.4 del spec)
  tests/                Vitest (ver «Pruebas»)
  tools/
    export-assets.mjs   Prototype Bits + UBC + UAL → glTF optimizado en public/hyperflowgeon/:
                        simplifica a ≤ 6 k tris, funde materiales, quita huesos de dedos (≤ 60),
                        recorta los clips al mismo esqueleto, texturas ≤ 1024² (meshopt/KTX2)
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
   gamepad y táctil híbrido (botones de ≥ 12 mm, reubicables y escalables como en VÓRTICE); remapeo; los tres
   esquemas de apuntado del garfio elegibles en Ajustes (ver «Pedido del usuario» arriba).
10. **Personaje y animación.** `tools/export-assets.mjs` produce el héroe y los clips (esqueleto de 65 → ≤ 60
    huesos, ≤ 6 k tris). `anim.ts`: tabla estado → clip, con el clip estirado para que su impacto caiga en el
    cuadro que dice la simulación; poses de tirón y columpio con control de huesos por código.
    Medir en el teléfono antes de pasar al paso 11.
11. **Render y feedback.** Material toon (2 bandas + luz de borde), contorno de casco invertido solo en lo
    jugable y en los dummies, lenguaje de color de gameplay del §5 (anillo jade en anclables, etc.), cámara
    con trauma, estela del cable, chispas e impactos procedurales, sonidos procedurales de prueba.
12. **Calidad y métricas.** Presets `?q=low|med|high` (como ELYTRA), resolución adaptativa, overlay F3 con
    ms de simulación y render, draw calls y tris.
13. **Panel de tuning.** Tweakpane con todos los valores de `params.ts`, presets y exportación a JSON.
14. **Aceptación.** Pruebas de §«Aceptación», `npm run typecheck`, `npm run test`, `npm run build`, recorrido en
    el navegador (teclado y táctil emulado), medición en teléfono real Android de gama media, y actualizar
    `CLAUDE.md` (arquitectura de la carpeta, comandos de prueba).
15. **Prueba de sensación con el usuario** y ajuste de `params.ts` según lo que diga; la decisión sobre si el
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
| Draw calls / tris | ≤ 120 / ≤ 250 k; héroe ≤ 6 k tris y ≤ 60 huesos |
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
- **Los packs ya están medidos** (spec §6.1). El riesgo que queda es de rendimiento: UBC trae 14 k tris y 65
  huesos contra un presupuesto de 6 k y 60. Si la simplificación deforma al personaje, plan B: cuerpo propio
  de bajo polígono sobre el mismo esqueleto (los clips siguen valiendo).
- **Animaciones que no existen** (tirón, columpio, planeo): son trabajo propio y el grapple de F1 es el que
  más depende de ellas; si las poses por código no leen bien, se dibuja el cable y los efectos primero y la
  pose se pule después (el juicio de F1 es sobre la sensación, no sobre la animación).

## Después de F1

F2a (Freydis + Grapple–Melee) y F2b (Cuauhtli y Calicó + restantes), según el spec §9. Cada una con su plan
y sin empezar hasta que F1 esté aprobada.
