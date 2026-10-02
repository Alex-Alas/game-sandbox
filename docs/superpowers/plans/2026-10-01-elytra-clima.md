# ELYTRA — Clima y hora del día: plan breve

> Ejecución nativa en la sesión, sin revisión intermedia (preferencia del usuario).
> Spec: `docs/superpowers/specs/2026-10-01-elytra-clima-design.md`

## Review Focus

- MEDIODÍA debe verse idéntico a hoy (mismos valores en `buildSky`).
- Cambiar la hora con el ragdoll o el fantasma visibles no debe dejar materiales sin actualizar.
- Una ráfaga no debe empujar al jugador dentro del terreno al reaparecer (el viento arranca suave tras `resetPlayer`).
- Los sprites (nubes antiguas, halos) y los puntos (partículas) compilan con los chunks de niebla nuevos.
- Dentro de una nube: la cámara en primera y tercera persona no ve el exterior.

## Tasks

1. **Hora del día.** `atmosphere.js` con los presets y `applyTime`. `buildSky` guarda las referencias (hemi, sky, sky2/pmrem, agua, nubes) y estrellas para la noche. Fila HORA en el título. Verificar: capturas de las 4 horas y que MEDIODÍA no cambia.
2. **Niebla por altura.** Override de `ShaderChunk.fog_*` en `atmosphere.js` (`installHeightFog(cfg)`), llamado en `buildWorld` antes de crear materiales. CAÑÓN `weather.fog`. Verificar: captura del cañón y F3.
3. **Mar de nubes.** `buildCloudSea(cfg)` en `world.js` (InstancedMesh de icosaedros, DoubleSide y caras traseras más oscuras). ISLAS `weather.clouds`. Verificar: capturas por fuera y por dentro.
4. **Viento.** `wind.js` (`windAt`), empuje en `stepFlight`, indicador en el HUD, aviso de ráfaga, partículas y sonido. `weather.wind` en DESCENSO y TRAVESÍA. Verificar: piloto automático sin choques y recalibrar medallas.
5. **Cierre.** CLAUDE.md, memoria, build y un commit por bloque (1–3 y 4).
