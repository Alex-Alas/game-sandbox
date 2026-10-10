# FLECHAZO — diseño

Pedido del usuario (2026-10-10): un rompecabezas de flechitas como los de las capturas de referencia (UnTangle, «One little
move, puzzle solved», Arrows – Puzzle Escape, «Logic unleashed»), **pero en 3D inmersivo y en primera persona**: el jugador
está adentro del tablero y camina hasta la flecha que quiere liberar. Con minimapa expandible, dificultades fácil / difícil /
extremo, mascotas que se compran con monedas, mejoras de salto, velocidad y visibilidad que se compran dentro del nivel,
tutorial guiado sin globos (carteles y marcas en el mundo y el mapa) apenas se entra, y 3 vidas por nivel.

Lo que el pedido no decía lo decidí yo; la tabla de abajo lo junta **para que lo confirmes o lo cambies**. Nada está
calibrado con gente: tamaños, precios, premios y alturas son un primer tiro.

## Las reglas (las del género)

- Cada flecha ocupa un camino de celdas y mira hacia donde va su último tramo. Al liberarla avanza como una víbora: la
  punta sigue derecho y el cuerpo pasa por donde pasó la punta. **Sale si la recta de su punta hasta el borde está vacía**;
  si no, avanza hasta tocar a la primera flecha de esa recta, rebota, vuelve a su lugar y **cuesta una vida**.
- Gana quien saca todas. Con 3 choques, el nivel vuelve a empezar igual (mismo tablero).
- Como sacar una flecha solo despeja caminos, todo tablero que tiene solución se resuelve sacando cualquiera libre: el
  desafío es leer cuáles están libres.

## Decisiones (para confirmar)

| Tema | Elegí | Alternativas |
| --- | --- | --- |
| Nombre | **FLECHAZO** (flecha + amor a primera vista) | DESENREDO, SALIDA |
| Escala | Celdas de **2,4 m**; el tablero más chico (tutorial) mide 17 × 14 m y uno EXTREMO grande, ~60 × 60 m | celdas de 2 m (más apretado) |
| Las flechas en 3D | **Paredes bajas de 1 m** (por la cintura) con lomo redondeado, curvas suaves y una punta triangular con la tapa inclinada; se ve por encima de ellas | setos más altos que la vista (laberinto puro); tubos de neón |
| ¿Bloquean el paso? | **Sí, son paredes**: hay que rodearlas o **subirse saltando** (el salto base alcanza para subirse, así nunca quedás encerrado) y caminar por arriba | que se puedan atravesar (solo dibujo) |
| Cómo se libera | Apuntar con la mira **a cualquier parte de la flecha** a menos de 3,4 m y clic / E / botón LIBERAR. En el teléfono, si la mira no le pega a ninguna, se toma la flecha cercana más alineada con la vista | solo tocando la punta |
| Vista del mundo | **Pastel claro**, como estar adentro de la pantalla de las referencias: piso blanco con puntos, cielo celeste-lila-rosa, nubes y flechas gigantes flotando a lo lejos | neón sobre fondo oscuro (la 4.ª referencia) |
| Dónde termina | El tablero **flota en el cielo**; hay un borde bajo y no se puede caer. Las flechas que salen cruzan el borde y **suben al cielo** desvaneciéndose | caer y reaparecer |
| Minimapa | Redondo, **centrado en el jugador y girado hacia donde mira**; su radio crece con la visibilidad. Tocarlo (o M) abre el **mapa grande** con el norte arriba, donde **tocar una flecha la marca como destino** (columna de luz celeste en el mundo y flechita en el borde del minimapa) | minimapa con el norte fijo |
| Dificultades | Tres escaleras de niveles **infinitas e independientes** (generadas y deterministas). FÁCIL de 6×6 a 10×10, flechas de 2–5; DIFÍCIL de 10×10 a 16×16, de 3–8; EXTREMO de 15×15 a 24×24, de 4–13 y con más cadenas. Cada 4 niveles el tablero tiene **figura** (rombo, círculo, corazón, cruz, estrella) | niveles a mano |
| Desbloqueo | DIFÍCIL con 3 niveles de FÁCIL; EXTREMO con 3 de DIFÍCIL (`?todo=1` abre todo para probar) | todo abierto desde el principio |
| Monedas | Solo al resolver un nivel: FÁCIL 10 + 2·n, DIFÍCIL 30 + 3·n, EXTREMO 70 + 5·n (topes en n = 20/30/40); **sin choques, ×1,5**; el tutorial da 40 | también monedas sueltas por el tablero |
| Mejoras | **Permanentes**, 5 escalones cada una, se compran desde el nivel (botón MEJORAS o T) y valen al instante. Velocidad 4,6 → 8,6 m/s. Salto: más alto → **doble salto** → más alto → **planeo** (mantener SALTO) → triple salto. Visibilidad: la niebla se aleja (17 → 72 m) y el minimapa abarca más; en el escalón 4 se ve **la trayectoria** de la flecha apuntada (puntitos en el piso hasta el borde) | mejoras que duran un solo nivel |
| Pista | Botón PISTA (H), **15 monedas**: marca con luz amarilla la flecha libre más cercana | gratis una por nivel |
| Mascotas | **9**, hechas con primitivas (sin modelos ni emojis): Gomita, Michi, Pío, Croac, Bu, Ajolote, Zumbi, Robi, Dragui (50 a 850 monedas). Se lleva **una a la vez**; camina delante tuyo (o vuela a la altura de la vista) para que se vea en primera persona, se sube a las flechas, festeja cada flecha que sale y se asusta con los choques. **Son compañía, no dan ventajas** | que cada una ayude en algo |
| Entrada | **Sin pantalla de título**: se abre directo en el nivel (la primera vez, el tutorial) con el logo que se desvanece. En la compu el primer clic solo captura el ratón; el teclado anda desde el principio | tarjeta de «clic para jugar» |
| Tutorial | FÁCIL 1, armado a mano (7 × 6, 7 flechas). Un cartel abajo (arriba en el teléfono) con el paso que sigue y marcas en el mundo y el minimapa: caminar hasta la luz → liberar la marcada → la roja está trabada por la verde (liberar primero la verde) → ahora la roja → abrir el mapa → subirse a una flecha → liberar el resto (después de 18 s quieto, marca una libre). Un paso hecho antes de tiempo se saltea solo. En el nivel 2, un consejo invita a comprar la primera mejora | globos que frenan el juego |
| Controles | Compu: WASD/flechas, ratón (puntero capturado), espacio, clic/E, M, T, H, Esc. Teléfono: joystick que aparece donde apoyás el pulgar izquierdo, arrastrar a la derecha para mirar, botones SALTAR y LIBERAR, tocar el minimapa | joystick fijo |

## El generador

Arma el tablero **al revés de como se resuelve**: cada flecha nueva sale antes que todas las que ya están, así que su recta
tiene que estar libre de ellas; su cuerpo, en cambio, puede tapar las rectas de las anteriores (eso crea las dependencias).
Así todo tablero generado tiene solución por construcción. Para que no queden casi todas libres al empezar, en cada lugar
prueba varias flechas y se queda con la que **traba más flechas todavía libres**, y entre varios tableros candidatos se
queda con el más **profundo** (más rondas de «sacar todas las libres» para resolverlo), con menos flechas libres al empezar
y sin huecos grandes.

## Más difícil (pedido del usuario, 2026-10-10)

El usuario notó que los juegos de flechas suben la dificultad con tres trucos y pidió aplicarlos a todo el juego y volver
más extremo EXTREMO. Cómo los llevé al generador (lo marcado *decidí yo*, para confirmar):

| Truco | Cómo quedó |
| --- | --- |
| Flechas larguísimas que encierran a otras | **Anillos**: un cuarto de 2×2 a 4×4 lleno de flechas cortas y una flecha que lo rodea entero (12–28 celdas) con la punta en una esquina, hacia afuera. Ninguna de adentro sale antes que el anillo. *El cuarto se arma a mitad del llenado*, así el anillo también traba flechas de afuera. EXTREMO: *la mitad son anillos dobles* (un anillo alrededor de otro). |
| Flechas largas, escalonadas y entrelazadas | **Escaleras** (doblan a un lado y al otro cada uno o dos pasos, a veces cambian de costado) y **gemelas** (el mismo camino corrido una celda, pegado al original). *En EXTREMO las gemelas son del mismo color* y el tablero usa *6, después 5 y después 4 colores* (vecinas del mismo color). Apuntar a una flecha la ilumina entera: así se ve dónde está su punta. |
| Bordes falsos e islas | **Dos o cuatro islas** sobre el vacío y **huecos al medio**. Las rectas cruzan el vacío: una flecha que apunta al borde de su isla puede chocar con la de enfrente. A otra isla se pasa **pisando un portal** (*en una celda del borde que mira a la otra isla, en el medio; los de un par, del mismo color y unidos con una línea punteada en el mapa grande*). No se cae ni se salta el vacío (*es una pared invisible, como el borde del tablero*). |
| Además | *Las flechas apuntan más hacia adentro* (la recta más larga), así lo que se pone después las tapa: menos libres al empezar. |

Cuándo aparece cada cosa: FÁCIL, un anillo en los impares desde el 3, dos islas en el 6, 14, 22… y hueco en el 10, 18…;
DIFÍCIL, 1–2 anillos, escaleras y gemelas siempre, y cada 4 niveles dos islas → hueco → cuatro islas; EXTREMO, 2–4
anillos, y dos o cuatro islas o un hueco en 2 de cada 4 niveles. La primera vez que aparece algo nuevo, un cartel lo
explica (una sola vez).

Promedio de los niveles 2–25 (rondas para resolverlo / flechas libres al empezar): FÁCIL 5,2 / 43 %, DIFÍCIL 7,1 / 37 %,
EXTREMO 9,0 / 33 % (antes 4,1 / 53 %, 6,4 / 47 %, 7,5 / 46 %).

## Modo ISLAS (pedido de un tester, 2026-10-10)

> «Añade un nuevo modo de juego con mapas segmentados en islas. La flecha solo puede ser liberada si su camino está libre de
> obstáculos en su isla y en todas las islas por las que tenga que pasar para salir del mapa. […] El jugador debe poder
> transportarse entre islas mediante puntos de teletransportación identificados claramente y visibles. El mapa al
> agrandarlo muestra todas las flechas sin liberar en cada isla así como se encuentran dispuestas en juego 3D, sin
> asimetrías.»

Antes del pedido el tester comentó que en EXTREMO la dificultad está más en el tamaño del mapa que en cómo se reparten las
flechas, porque desde donde estás ves la flecha entera y solo hay que recordar su dirección. ISLAS ataca eso: la flecha
que la traba puede estar en otra isla.

| Tema | Quedó así |
| --- | --- |
| Dónde | Cuarta tarjeta en NIVELES, con su escalera infinita; se abre con 3 niveles de FÁCIL (como DIFÍCIL). |
| Mapas | Grillas de islas cuadradas iguales, de lado impar (el portal queda justo en el medio): 2×1 de 5 → 1×2 → 2×1 de 7 → 2×2 → 3×1 → 1×3 → … → 3×3; después rotan 2×2, 3×2, 2×3 y 3×3 y crecen. Tres columnas de vacío entre islas. |
| La regla | La de siempre: la recta de la punta llega hasta el borde del tablero y cruza el vacío y las islas que haya en el camino. *El generador pone más flechas en el borde de una isla mirando a otra* (parecen libres) y prefiere tapar rectas de otras islas: ~45–60 % de las flechas trabadas lo están por una de otra isla. Flechas medianas (3–9), con algún anillo. |
| Portales | Uno por cada isla vecina, en el medio del lado que la mira. Remolino, aro y columna de luz del color de su par, y encima un cartel «→ ISLA n» que se lee de lejos (sin niebla). Al pasar: destello del color, sonido y el aviso «Isla n». El HUD dice en qué isla estás. |
| Mapa grande | Todas las flechas sin liberar de todas las islas, tal como están en 3D (misma escala en los dos ejes). Cada isla con su número en la esquina, cada portal con el número de la isla a la que lleva y una línea punteada hasta su par. El título dice «ESTÁS EN LA ISLA n DE m». |
| Simetría | Todas las islas del mismo tamaño y con el mismo margen de piso en los cuatro lados (también en las islas de las otras dificultades). |

## Pendiente / para calibrar jugando

- Alto de las flechas y del salto base (¿subirse debería costar una mejora?), ancho de los pasillos, alcance para liberar.
- Niebla base (17 m): ¿se siente perdido en EXTREMO sin mejoras?
- Precios de mejoras, mascotas y pista, y los premios; cuántos niveles para desbloquear.
- Si hace falta un «modo planificar» (ver el mapa grande mientras se camina) o si con el minimapa alcanza.
- Si las gemelas del mismo color y los 4 colores de EXTREMO son demasiado; cuántos anillos por nivel; si el vacío entre
  islas debería poder cruzarse con el planeo (hoy no).
