# ELYTRA — Modo DESPLOME (subproyecto 4)

Fecha: 2026-10-01 · Rama: `elytra-iteracion-2` · Estado: aprobado en chat

## Objetivo

Un modo de puntuación con el ragdoll: vuelas hacia una arena y te estrellas en ella.
Puntúan el daño, las fracturas, los golpes, los objetos derribados y la velocidad de
impacto, multiplicados por la diana. Éxito = un intento completo (entrada → choque →
puntuación → reinicio) funciona y el récord se guarda.

Fuera de alcance: lanzamiento con rampa, varias arenas, objetos rompibles en trozos.

## 1. Arena y flujo

- En `courses.js`, la entrada `{ id: 'desplome', name: 'DESPLOME', kind: 'desplome' }`
  con:
  - `arena: { x, z, r }` en el valle de las ruinas;
  - una sola puerta de ENTRADA;
  - una salida en altura (~600 m antes);
  - `medals` por puntos (mínimos).
- El mundo construye la arena (`buildArena` en `world.js`): diana y 5 torres de
  bloques dinámicos (Rapier, dormidos hasta el golpe). Las columnas de las ruinas
  siguen ahí y cuentan.
- `desplome.js` (nuevo) tiene la lógica pura del intento:
  - **`armed`:** el intento arranca al cruzar la ENTRADA (aviso «¡ESTRÉLLATE!»). Desde
    ahí el marcador apunta a la diana.
  - **`crashed`:** empieza al chocar (`crash()` sin `voluntary`; soltarse con X también
    cuenta).
  - **`scored`:** llega cuando el ragdoll se detiene (`ragdoll.settled`) o a los 8 s del
    choque. Se calcula la puntuación y se muestra el panel.
  - A los 3 s se reinicia solo; R o un clic lo adelantan.
  - Si a los 20 s de la entrada no hubo choque: «SIN DESPLOME» y reinicio.
- En este modo se apagan el fantasma (no se graba ni se reproduce) y los combos de
  estilo.

## 2. Puntuación

- **Derribados.** Al armar el intento se guarda la pose de cada objeto derribable (los
  bloques de la arena y las columnas de las ruinas a menos de `arena.r`). Al puntuar,
  cuenta como derribado el que se desplazó más de 1,5 m o rotó más de 25°.
- **Diana.** Según la distancia horizontal del torso al centro al puntuar: menos de
  8 m → ×3, menos de 20 m → ×2, menos de 35 m → ×1,5, y si no ×1.
- **Fórmula:**
  `puntos = round((daño + fracturas·400 + golpes·40 + derribados·150 + impacto·15) × diana)`,
  con el daño, las fracturas y los golpes de `ragdoll.stats` y el impacto en m/s.
- **Récord** en `localStorage['elytra.desplome.<id>']`.
- **Medallas por puntos:** bronce, plata, oro y autor como mínimos, calibradas con
  impactos del piloto automático contra la diana.
- **Panel final:** reutiliza `#crashpanel`. Título con los puntos, desglose de las
  cifras (la diana con su multiplicador y los derribados) y récord/medalla. El HUD
  del panel central muestra «DESPLOME · RÉCORD n».

## 3. Verificación

- Un piloto automático de depuración que apunta a la diana tras la ENTRADA: se derriban
  bloques, se calcula la puntuación, se guarda el récord y el reinicio funciona.
- El caso de tiempo agotado (sin choque) reinicia sin puntuar.
- Capturas de la arena antes y después del choque.
- Sin errores en la consola, `npm run build` correcto, y los otros circuitos sin cambios
  (no construyen la arena).
