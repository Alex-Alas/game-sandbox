# CATAPUM — diseño (2026-10-08)

Boom Slingers sin turnos: un brawler de plataformas 2D en tiempo real, con cartas, terreno que se rompe y mucho
movimiento. Referencia de cartas: la wiki de Boom Slingers (`boomslingers.wiki.gg/wiki/Cards`). Allá el juego es un
Worms 1v1 por turnos: maná por turno, mazo, proyectiles, movimiento, trampas y curas, bloques que se rompen y KO al
caer al agua.

## Decisiones del usuario (preguntas del 2026-10-08)

| Tema | Decisión |
|---|---|
| Cartas | **Maná + mano de 4 + cartas que caen al mapa**: mazo de 8 armado antes (builds), maná que se recarga solo, y cajas con paracaídas que dan una carta extra para adaptarse durante la partida. |
| Victoria | **Smash + Boom Slingers + deathmatch**: un sistema de **fragilidad al empuje** (el % y estados de algunas cartas), **fuera del ring** que no es solo caer al agua, y una **partida por tiempo** donde gana quien hace más puntos. |
| Multijugador | **Primero online**, y siempre poder elegir la cantidad de jugadores y de bots. |
| Movimiento | Todas: **liga/garfio, pared + doble salto, dash/esquive, barrida + picada**… y **ultis** («movimientos especiales definitivos»). |
| Ultis | **Personajes con ulti propia**. |
| Terreno | **Destructible fino + cajas** (celdas de 25 cm, pedazos sueltos que caen, objetos con física simple). |
| Progresión | **Sin progresión** por ahora: todo desbloqueado. Después se ve arcade + desbloqueos. |
| Visual | **Caricatura procedural 2D** (Canvas, todo dibujado en código). 2026-10-09: **sin emojis**, arte original empezando por cartas y personajes; personajes **cabezones** (chibi). |
| Sensación | 2026-10-09: un poquito más **floaty** (menos gravedad), sin que bajar del aire se sienta eterno. |

## Reglas

- **Daño (%) y empuje.** El daño no mata: sube el empuje que recibís. Empuje = (base + extra × % / 100) × fragilidad
  / masa del personaje. **FRÁGIL** (melocotón, shuriken, banana) × 1,6; **PIES DE PLOMO** × 0,4. El golpe reemplaza la
  velocidad y aturde según su fuerza; el joystick perpendicular lo desvía (influencia, ±15°) y SALTO justo antes de
  pegar contra algo es un **tech**.
- **Fuera del ring:** el agua (o la lava), los costados (12 m más allá del mapa), arriba (12 m sobre el techo) y los
  peligros del mapa (tren, rocas del volcán; el viento empuja hacia afuera).
- **Puntos:** +1 al último que te tocó (hasta 8 s antes); caerse solo es −1. Partida de 1–5 min o sin límite; si al
  final hay empate, **muerte súbita**: todos al 300 % (60 s como mucho).
- **Cartas:** mazo de 8 sin repetidas, mano de 4 (la usada vuelve al final), maná 0–10 que sube 0,75/s. Las cajas
  traen una carta gratis para la ranura 5 (o +50 de ulti, o maná lleno). 34 cartas en 6 tipos (explosivo, rayo,
  movimiento, trampa, apoyo, cuerpo).
- **Ulti:** se carga haciendo y recibiendo daño, con trucos de movimiento y KOs (y un poco con el tiempo).

## Movimiento (lo aprendido en HYPERFLOWGEON)

Simulación pura de 60 Hz con barrido por ejes contra la grilla (no atraviesa nada), coyote, buffer, salto con corte, la
entrada en el aire que nunca quita velocidad a favor y la liga como una fuerza central que solo tira. Para un brawler
todo es más corto y rápido, y **cada movimiento pega**: el dash empuja a quien toca, la barrida lo levanta, la picada lo
clava y suelta una onda, y la liga enganchada a un rival + DASH lo lanza. Trucos: SUPER (dash + salto en el suelo),
WAVEDASH (dash diagonal al suelo), HYPER (salto en una barrida rápida), REBOTE (picada con SALTO mantenido), TECH,
salto de pared, rocket jump (tu explosión te empuja sin dañarte).

## Personajes

BOMBÍN (METEORO), LÍA (LAZO; liga con 3 cargas), TURBO (COHETE; dos dashes), MUU (ABDUCCIÓN; pesada), CHUCHU
(EXPRESO; tren), KUNAI (SOMBRA; liviana, triple salto). Cada uno con un mazo inicial distinto.

## Online

Relay de salas de DOWNCASTLE (mismo plugin de Vite y el mismo Worker), anfitrión autoritativo con los bots, estado
compacto a 20 Hz, entradas a 30 Hz y predicción del propio personaje con reconciliación. Hasta 8 jugadores entre
humanos y bots (el Worker desplegado admite 4 humanos hasta que se vuelva a desplegar con el cupo nuevo).

## Pendiente (para hablar)

- Progresión: arcade con desbloqueos (decisión del usuario: después).
- Calibrar jugando: movimiento, empuje y maná están sin calibrar (AJUSTES → AVANZADO, «copiar JSON»).
- Más mapas y cartas; que el anfitrión online no pueda pausar (si su pestaña queda oculta, la partida se frena).
