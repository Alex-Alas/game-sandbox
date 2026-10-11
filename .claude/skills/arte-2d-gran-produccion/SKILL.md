---
name: arte-2d-gran-produccion
description: Crea assets de arte 2D con calidad de indie de gran producción (Hades, Hollow Knight Silksong, Death's Door, Dead Cells) hechos 100 % con código. Cubre personajes entintados a mano en Canvas 2D, rig por IK y animación cuadro a cuadro con anticipación, smears y follow-through, física secundaria de capas y cintas, y VFX (rastros de arma, chispas, polvo de caricatura, impactos con hitstop). También escenarios pintados en capas con parallax, niebla y rayos de luz, y posproceso WebGL2 (bloom HDR, gradación, papel y grano). Úsala siempre que pidan sprites, personajes, enemigos o jefes, animaciones de ataque, hojas de sprites, efectos visuales, fondos o escenarios 2D. Lo mismo si piden arte dibujado a mano, que no parezca hecho de figuras geométricas, pixel art estilizado o juice/game feel en 2D, aunque no nombren esta skill. Vale igual en inglés (2D character art, sprite animation, smear frames, VFX, hand-drawn look, parallax background, shaders).
---

# Arte 2D de gran producción, por código

Esta skill destila cómo se hizo FILO, un escaparate de un kit de assets 2D: una heroína y un jefe entintados, más de quince animaciones con smears, un escenario de doce capas y un posproceso HDR. Todo está hecho con código: vectores, pinceladas y shaders, sin una sola imagen. El usuario lo comparó con Hades, Silksong y Death's Door, y quiere poder repetir ese nivel. Lo que sigue es lo que funcionó, con los números que funcionaron, y las trampas que costaron horas.

¿Por qué con código y no con imágenes? Porque así el arte es independiente de la resolución, se anima por poses y no por dibujos sueltos, cambia de paleta con un objeto y pesa kilobytes. Además se puede revisar y corregir en bucle sin herramientas de dibujo.

## El listón: qué hace que se vea caro

Cuando algo «parece figuras geométricas pegadas», casi siempre falla uno de estos puntos. Los diez juntos son el estilo:

1. **Silueta legible.** En negro y a 48 px de alto tiene que entenderse quién es y qué hace. La identidad va en la cabeza y en el arma, y las proporciones se exageran (la cabeza de la heroína mide un tercio del alto).
2. **Un solo contorno de tinta.** Todas las piezas se trazan gruesas *antes* de rellenar, y la unión forma una silueta continua, más gruesa del lado de la sombra. Si cada pieza tiene su propio contorno, se ve como un recorte de cartón.
3. **Sombras que siguen la forma.** La sombra es la pieza menos una copia corrida hacia la luz: una medialuna plana y nítida, no un degradé. Encima van oclusión, rayado de tinta que nace del borde oscuro (Hades), un filo de luz y líneas interiores finas.
4. **Paleta con giro de tono.** Las sombras van hacia el violeta o azul frío y las luces hacia el naranja. Los oscuros se autoran oscuros y saturados. Un color de acento (brasa, filo) queda reservado para lo importante.
5. **Luz de contraluz.** Un borde fino y frío, solo en el contorno exterior y del lado oscuro, despega al personaje del fondo.
6. **Animación de pocos dibujos fuertes.** Poses sostenidas «en dos», un cuadro de smear que llega de golpe, la pose de contacto sostenida para que se lea y un rebote al pasarse. La tela y las cintas se mueven suaves a 120 Hz: el contraste entre un cuerpo escalonado y una tela fluida es muy de Silksong.
7. **Peso en cada golpe.** Hitstop, sacudón, destello, chispas, polvo y sonido, todo escalado según cuánto pesa el golpe.
8. **Profundidad.** Capas con parallax y perspectiva atmosférica (lo lejano más claro y frío), haces de luz, bancos de niebla y un primer plano oscuro y desenfocado.
9. **Tratamiento final.** Bloom solo sobre lo emisivo en HDR, una curva de tonos suave (no ACES), gradación con sombras frías y luces cálidas, viñeta, papel y grano.
10. **Línea viva («boil»).** Cada dibujo nuevo tiembla un poco distinto: se nota la mano.

## Flujo de trabajo

1. **Escribir el brief de dirección antes del código** (5–8 líneas en el chat o en un comentario):
   - una idea de silueta;
   - el lenguaje de formas (por ejemplo, curvas y triángulos para lo ágil, bloques y púas para lo pesado);
   - la paleta por material con base, sombra, oclusión, contraluz y brillo;
   - el acento;
   - la dirección de la luz;
   - el ánimo;
   - referencias concretas («el ruedo de Hornet», «las sombras rayadas de Zagreus»).

   Ver `references/direccion-de-arte.md`.
2. **Elegir la base.**
   - Si el proyecto es web (TS/JS), copia `assets/kit/` y construye encima: el motor ya está probado.
   - Si el proyecto usa otro motor (Godot, Unity, Three.js…), lee el kit para entender la técnica y pórtala. Otra opción es usar el kit para hornear hojas de sprites PNG (ver `references/animacion.md`, «Hojas de sprites»).
3. **Silueta plana primero.** Dibuja las piezas solo con su color (modo `flat` del entintador) y mira la miniatura. Si no se lee plana, el sombreado no la va a salvar.
4. **Entintado y materiales:** contorno global, sombra propia, oclusión, rayado, filo de luz, detalles pintados (pliegues, costuras, vendas) y brillo. Ver `references/personajes-entintado.md`.
5. **Animación pose a pose.**
   - Primero las poses clave: guardia, anticipación, smear, contacto y recobro.
   - Después los intermedios, los eventos (golpe, paso, polvo) y la física secundaria.

   Ver `references/animacion.md`.
6. **Efectos y peso** (rastros, chispas, polvo, hitstop, sacudón…). Ver `references/vfx-y-game-feel.md`.
7. **Escenario y atmósfera.** Ver `references/escenarios.md`.
8. **Posproceso.** Ver `references/postproceso.md`.
9. **Ciclo de revisión.** No es opcional, y es lo que más mejora el resultado (el usuario lo pidió explícitamente: «revisa tu trabajo constantemente»). Por cada asset hay que dar al menos tres vueltas. Cada vuelta consiste en:
   1. renderizar una hoja de contactos y un primer plano a 4–6×;
   2. **mirarlos de verdad**: leer el PNG con la herramienta de lectura de imágenes;
   3. comparar con la referencia y anotar tres defectos concretos;
   4. corregirlos y volver a renderizar.

   Ver `references/revision.md`: tiene el arnés de capturas y una tabla de síntomas a causas.

## Capítulos (cargar solo el que haga falta)

| Archivo | Cuándo leerlo |
|---|---|
| `references/direccion-de-arte.md` | Siempre, al empezar un asset nuevo: silueta, formas, valores, paletas con giro de tono, proporciones y la variante pixel art. |
| `references/personajes-entintado.md` | Para diseñar o dibujar un personaje, criatura, arma o prop. |
| `references/animacion.md` | Para clips, poses, smears, ciclos de caminar o correr, ataques pesados, física de tela y hojas de sprites. |
| `references/vfx-y-game-feel.md` | Para rastros de arma, partículas, impactos, disoluciones, hitstop o sacudón. |
| `references/escenarios.md` | Para fondos, capas con parallax, pintura procedural, niebla, haces de luz y brillos. |
| `references/postproceso.md` | Para bloom, rayos volumétricos, curva de tonos, gradación, viñeta, grano y ondas de choque. |
| `references/revision.md` | Antes de dar algo por terminado, y cada vez que algo «se ve raro». |

## El kit de código (`assets/kit/`)

Es el motor de FILO tal como quedó probado: TypeScript sin dependencias, con sintaxis borrable (Node y Vite lo corren sin configuración) y comentarios en español. `assets/kit/README.md` explica cada archivo. Lo esencial:

- `draw/curves.ts`: splines Catmull-Rom centrípetas con esquinas, trazos que se afinan, miembros de una pieza con tapas redondas, IK de dos huesos, ruido, boil y medialunas para los smears.
- `draw/ink.ts`: el entintador (`paint(ctx, parts, style, glowCtx)`).
- `rig.ts`: poses, clips con curvas de espaciado, `Chain` (Verlet) y `Springs`.
- `actor.ts`: reproduce clips en dos, corre la física a 120 Hz y redibuja solo cuando cambia el dibujo.
- `chars/hero.ts` + `chars/hero-clips.ts`: **el ejemplo a imitar** al crear un personaje nuevo. `chars/brute.ts` es el contrapunto pesado.
- `fx.ts` + `stage.ts`: partículas instanciadas, rastros, estallidos, y eventos de los clips → efectos, hitstop y sacudón.
- `gl/`: el renderer WebGL2 (capas en perspectiva, HDR, bloom, rayos y composición).
- `world/paint.ts` + `world/scene.ts`: pintura procedural de escenarios y un escenario completo de ejemplo.
- `lab.ts` + `lab.html`: hojas de contactos para revisar poses sin el resto de la escena.

Para empezar un personaje nuevo, copia `chars/hero.ts` y su archivo de clips, cambia `frames()`/`geom()` (proporciones), `parts()` (las piezas) y la paleta, y revisa en el laboratorio. No escribas un entintador nuevo: el valor está en el que ya existe.

En el repo game-sandbox, el original vivo es `games/filo/`. Ahí está también el escaparate (`npm run dev` → `/games/filo/`), con visor de animaciones, papel cebolla, vector crudo contra final, galería de efectos y vista despiezada del escenario: sirve para mostrarle al usuario cualquier asset nuevo.

## Trampas que ya costaron horas

- **Velo de color sobre todo el personaje.** Pasa al borrar con `destination-out` usando un color translúcido, que solo borra en parte. Arma las máscaras opacas y pon el color al final con `source-in`.
- **Personaje pálido o gris.**
  - ACES levanta los oscuros y los lava: usa la curva suave (identidad hasta 0,6).
  - La luz local tiene que **multiplicar** el color, no sumarse.
  - Las pieles de valor medio se ven grises: autóralas oscuras y saturadas (`#252536`, no `#5a5a6e`).
- **Sprites translúcidos de repente.** Una capa aditiva dejó puesto `blendFunc(ONE, ONE)`. Restablece la mezcla antes de cada pasada.
- **El primer cuadro sin ruido o con texturas cruzadas.** Una subida de textura pisó la unidad del ruido. Toda subida va con `activeTexture(TEXTURE0)`, y el ruido vive fijo en la unidad 7.
- **La luz de contraluz aparece en bordes interiores.** Hay que pintarla sobre la unión de las piezas, pieza por pieza: un solo `Path2D` con sentidos de giro mezclados deja huecos.
- **Captura colgada en Chromium headless.** Lanza con `--disable-accelerated-2d-canvas` y pinta los escenarios en lienzos de CPU (`willReadFrequently: true`).
- **El primer plano desaparece.** El desenfoque por mipmap borra lo fino: el primer plano se hace con formas gruesas.
- **La punta del arma atraviesa el piso al recobrar.** Gira el arma por arriba (−2π) y recorta lo que quede bajo el suelo (`clipY`).
- **Eventos que pisan una muerte.** Toda línea de tiempo revisa si el actor sigue vivo antes de lanzar el siguiente clip.

## Al terminar

Muéstrale al usuario el resultado, no la descripción:

- capturas en tamaño de compu (1280×720) y de teléfono (844×390 acostado, 390×844 parado);
- una hoja de contactos del clip principal;
- el PNG de la hoja de sprites si la pidió.

Dile qué quedó sin revisar a ojo y qué valores son los más fáciles de calibrar (paleta, grosores, fps, hitstop). Si el proyecto tiene un CLAUDE.md o README, documenta ahí las decisiones de estilo, así la próxima sesión no las re-deriva.
