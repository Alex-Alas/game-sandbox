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
queda con el más **profundo** (más rondas de «sacar todas las libres» para resolverlo). Hoy: FÁCIL 3–4 rondas, DIFÍCIL 5–8,
EXTREMO 5–9.

## Pendiente / para calibrar jugando

- Alto de las flechas y del salto base (¿subirse debería costar una mejora?), ancho de los pasillos, alcance para liberar.
- Niebla base (17 m): ¿se siente perdido en EXTREMO sin mejoras?
- Precios de mejoras, mascotas y pista, y los premios; cuántos niveles para desbloquear.
- Si hace falta un «modo planificar» (ver el mapa grande mientras se camina) o si con el minimapa alcanza.
