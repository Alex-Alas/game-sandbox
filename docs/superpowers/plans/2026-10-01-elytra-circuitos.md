# ELYTRA — Circuitos múltiples: plan de implementación

> Plan breve a petición del usuario: ejecución nativa en esta sesión, sin revisión intermedia.

**Goal:** Catálogo de 5 circuitos con selector en el título y récords, fantasma, estilo y medallas por circuito.
**Architecture:** `courses.js` (datos) → `course.js` toma el circuito activo (`?c=` / localStorage). El mundo se construye para ese circuito; cambiar recarga la página.
**Spec:** `docs/superpowers/specs/2026-10-01-elytra-circuitos-design.md`
**Verificación:** no hay tests; se verifica en el navegador (`?c=<id>&q=low`) con `__elytra.probePath()`, `__elytra.autopilot()` y `advance()`.

## Review Focus

- Récord antiguo `elytra.best`: debe seguir apareciendo en la Gran Vuelta.
- `?c=` con un id inválido: cae a `main` sin romper.
- En un sprint no se talla un tramo de la meta a la salida.
- Un reinicio automático pendiente no debe dispararse si el jugador ya reinició con R/T o está en un choque.
- `?q=` y `?c=` conviven en la URL al cambiar cualquiera de los dos.

---

### Task 1: Catálogo y circuito activo (regresión de la Gran Vuelta)

**Files:** crear `src/courses.js`; modificar `src/course.js` y `src/config.js` (que `?q=` conserve `?c=`).

- [ ] Antes de tocar nada, guardar la línea base: posiciones de las puertas, `world.stats.pillars` y el tiempo del piloto automático en la Gran Vuelta.
- [ ] `courses.js`: `COURSES` (la Gran Vuelta con las `GATE_DEFS` actuales y sus medallas 48/55/64/80), `COURSE_ORDER`, `pickCourse()` (`?c=` > `elytra.course` > `main`; un id inválido da `main`), `saveCourse(id)`, `courseUrl(id)`.
- [ ] `course.js`: `GATE_DEFS`, `MEDALS`, `course.id` y `course.kind` salen de `ACTIVE`. `computeGateFrames()` y `pathSegments()` respetan `kind === 'sprint'` (sin lazo). `start` es opcional: `{ pos, dir, speed }`. Récord en `elytra.best.<id>`, con lectura de la clave antigua para `main`.
- [ ] Verificar contra la línea base: mismas puertas, mismas agujas y ~50,8 s. Commit.

### Task 2: Selector en el título y flujo de los sprints

**Files:** `index.html`, `style.css`, `src/main.js`.

- [ ] Fila `CIRCUITO <NOMBRE> ‹ ›` (`coursePrev`/`courseNext`/`courseName`) que hace `location.replace(courseUrl(id))`.
- [ ] La meta de un sprint programa un reinicio a los 3 s (`timers.restart`). R, T, un choque o una nueva salida lo cancelan. El reinicio hace `resetCourse()`, `ghostCancel()`, `styleCancel()` y `respawn(true)`.
- [ ] `respawn(true)` usa la velocidad de `course.start.speed` si existe.
- [ ] Verificar con un sprint de prueba de 2 puertas: el reinicio ocurre y R lo cancela. Commit junto con la Task 3.

### Task 3: Contenido de los circuitos

**Files:** `src/courses.js`.

- [ ] CAÑÓN (sprint, ~9 puertas en el cañón), ISLAS (sprint vertical), DESCENSO (sprint de la cumbre al lago) y TRAVESÍA (vuelta de ~60 s).
- [ ] Por cada uno: cargar `?c=<id>&q=low`, que `probePath()` dé `[]`, que el piloto automático lo complete sin chocar, ajustar las puertas hasta que T esté dentro de ±30 % del objetivo y fijar las medallas con la regla (⌊0,95T⌋, ⌈1,08T⌉, ⌈1,25T⌉, ⌈1,55T⌉).
- [ ] Una captura de la salida de cada uno. Commit.

### Task 4: Cierre

- [ ] Actualizar CLAUDE.md (catálogo, `?c=`, regla de medallas) y la memoria del proyecto. `npm run build`, consola limpia y commit.
