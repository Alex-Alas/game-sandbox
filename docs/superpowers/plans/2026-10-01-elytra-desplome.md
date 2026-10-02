# ELYTRA — Modo DESPLOME: plan breve

> Ejecución nativa en la sesión, sin revisión intermedia (preferencia del usuario).
> Spec: `docs/superpowers/specs/2026-10-01-elytra-desplome-design.md`

## Review Focus

- Chocar antes de cruzar la ENTRADA no debe puntuar (el intento no está armado); se reaparece normal.
- R durante el ragdoll de un intento puntuado no debe sumar dos veces.
- Los bloques deben dormir al cargar (no derrumbarse solos), como las columnas de las ruinas.
- El reinicio debe volver los bloques a su sitio: el mundo no se reconstruye, así que hay que restaurar sus poses.
- Otros circuitos: ni arena ni lógica de desplome activa.

## Tasks

1. **Datos y arena.** Entrada `desplome` en `courses.js`. `buildArena(cfg)` en `world.js`: diana (anillos) y torres de cajas dinámicas con `track()`, dormidas; `world.arena = { center, blocks, knockables }` con sus poses iniciales y `resetArena()`.
2. **Lógica.** `desplome.js`: estados, `knocked()`, `scoreAttempt()`, récord y medallas por puntos. Ganchos en `main.js`: entrada (onGate), choque (crash), por frame (fin del intento o tiempo agotado), reinicio (`restartRun` → `resetArena`), panel y HUD. Fantasma y estilo apagados.
3. **Verificación y calibración.** El piloto automático apunta a la diana tras la entrada; medir puntos en varios intentos y fijar las medallas. Capturas, build, documentación y commit.
