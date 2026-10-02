# ELYTRA — Clima y hora del día (subproyecto 3b)

Fecha: 2026-10-01 · Rama: `elytra-iteracion-2` · Estado: aprobado en chat

## Objetivo

Variar el ambiente sin romper la comparabilidad de los récords:

- La **hora del día** es libre y solo visual.
- El **viento** y la **niebla o las nubes** forman parte de cada circuito: son iguales
  en cada intento y para el fantasma.

Fuera de alcance: ciclo día-noche animado, lluvia o nieve, niebla por post-proceso.

## 1. Hora del día (`atmosphere.js`, nuevo)

- Cuatro presets: `morning` MAÑANA, `noon` MEDIODÍA (los valores actuales), `dusk`
  ATARDECER y `night` NOCHE.
- Cada preset define:
  - la dirección (elevación y acimut), el color y la intensidad del sol;
  - los colores e intensidad de la luz hemisférica;
  - los uniforms del `Sky` (turbidity, rayleigh, mie);
  - el color y la densidad base de `FogExp2`;
  - `toneMappingExposure` y `environmentIntensity`;
  - el tinte y la opacidad de las nubes;
  - el color del agua.
- `applyTime(id)` cambia todo en vivo: uniforms, luces y el entorno PMREM regenerado
  desde el cielo. Sin recarga.
- **NOCHE:** el cielo del shader `Sky` queda oscuro (el sol, bajo el horizonte). La luz
  direccional pasa a ser una luna azulada de baja intensidad y se añade un campo de
  estrellas (`THREE.Points` en una esfera que sigue a la cámara, sin niebla). Los
  emisivos existentes (puertas, cristales, alas, estelas) resaltan solos.
- **Título:** fila `HORA <NOMBRE> ‹ ›`, guardada en `localStorage['elytra.time']`.
  Los récords no se separan por hora.

## 2. Viento con ráfagas (por circuito)

- En `courses.js`, un campo opcional:
  `weather: { wind: { dir: grados, speed: m/s, gust: m/s } }`.
- `wind.js` (nuevo): `windAt(raceT, out)` devuelve el vector de viento. Vale
  `dir · (speed + gust · g(raceT))`, con `g` en [0, 1] hecha de pulsos suaves de ruido 1D
  y semilla fija.
  - Fuera de carrera se usa el tiempo desde la salida.
  - Depende **solo del tiempo de carrera**, así que el fantasma y el jugador viven las
    mismas ráfagas y se pueden aprender.
- **Física** (`player.js`, `stepFlight`): aceleración `wind · CFG.WIND_PUSH` (≈ 0,5/s)
  aplicada a la velocidad. Arcade: empuja y obliga a corregir el rumbo.
- **HUD:** indicador de viento en el panel derecho (`VIENTO 18 m/s` y una flecha
  relativa a la dirección de vuelo). Aviso `¡RÁFAGA!` cuando `g` cruza 0,6.
- **Efectos:** partículas tenues que viajan con el viento cerca de la cámara, y más
  ruido de viento en `updateWind` durante las ráfagas.
- **Circuitos:**
  - DESCENSO: viento cruzado fuerte (≈ 14 m/s con ráfagas de +16).
  - TRAVESÍA: viento moderado (≈ 8 m/s con ráfagas de +8).
- Las medallas de esos dos se recalibran con el piloto automático y la misma regla.

## 3. Niebla baja y mar de nubes (por circuito)

`weather.fog: { top, falloff, strength }` y `weather.clouds: { y, thickness, ... }`.

### Niebla por altura (CAÑÓN)

- Se sobrescriben los chunks `fog_*` de `THREE.ShaderChunk` antes de compilar ningún
  material.
- El vertex calcula la altura mundial del vértice con
  `(inverse(viewMatrix) * mvPosition).y`, válido también para sprites y puntos.
- El fragment suma, a la niebla exponencial base, la integral analítica de una
  densidad que decae con la altura entre la cámara y el punto:
  `D·L·e^{-(y_c-top)/H}·(1-e^{-Δy/H})/(Δy/H)`.
- `top`, `H` y `strength` son `#define` horneados por carga (el circuito no cambia sin
  recargar). El color sale de `scene.fog.color`, que lo pone la hora.
- La GRAN VUELTA no tiene niebla baja.

### Mar de nubes (ISLAS)

- Nubes de **malla low-poly**: racimos de icosaedros facetados en un `InstancedMesh`,
  blancos y **opacos**, con `side: DoubleSide`. Forman una capa (y ≈ 110–170 m) bajo
  las islas.
- **Sin collider:** se atraviesan.
- **Por dentro:** se ve el interior del cascarón (las caras traseras, algo más oscuras
  vía `gl_FrontFacing`), sin relleno, y **no se ve el exterior** hasta salir. Es el
  efecto buscado.
- Las últimas puertas de ISLAS (abs 170 → meta a ras del suelo) obligan a cruzar la
  capa.

## 4. Verificación

- Capturas de las cuatro horas en la Gran Vuelta, de la niebla del CAÑÓN y del mar de
  nubes de ISLAS, por fuera y por dentro de una nube.
- El piloto automático completa DESCENSO y TRAVESÍA con viento sin chocar; con esos
  tiempos se recalibran sus medallas.
- Rendimiento (F3, calidad baja, la misma vista): como mucho +1 ms por frame respecto
  a hoy.
- La Gran Vuelta a MEDIODÍA se ve igual que hoy. Sin errores en la consola y
  `npm run build` correcto.
