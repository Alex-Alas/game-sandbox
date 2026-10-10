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
| Dónde termina | El tablero **flota en el cielo**; hay un borde bajo y por el borde de afuera no se puede caer (por el vacío entre islas y los huecos, sí: ver la última sección). Las flechas que salen cruzan el borde y **suben al cielo** desvaneciéndose | caer y reaparecer |
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
| Bordes falsos e islas | **Dos o cuatro islas** sobre el vacío y **huecos al medio**. Las rectas cruzan el vacío: una flecha que apunta al borde de su isla puede chocar con la de enfrente. A otra isla se pasa **pisando un portal** (*en una celda del borde que mira a la otra isla, en el medio; los de un par, del mismo color y unidos con una línea punteada en el mapa grande*). ~~No se cae ni se salta el vacío~~ (desde la segunda tanda del 2026-10-10 el vacío es de verdad: ver la última sección). |
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
- Si las gemelas del mismo color y los 4 colores de EXTREMO son demasiado; cuántos anillos por nivel. (El vacío entre islas
  ya se cruza con planeo y velocidad 3: ver la última sección.)

## Caricias, tableros sin huecos, vuelo entre islas y cofres (pedido del usuario, 2026-10-10)

> «Opción para acariciar a las mascotas y generar una reacción adorable única para cada una. Nueva regla: no deben haber
> espacios en blanco o sin usar entre flecha y flecha. La distancia entre isla e isla se debe incrementar y eliminar las
> barreras invisibles […]: un jugador solo puede saltar entre isla e isla después de desbloquear el doble salto más la
> mejora de planear (y al menos 3 mejoras de velocidad); si no, está obligado a usar los portales […] y si no cumple,
> debe estar garantizado que caerá, quitándole 1 vida y regresándolo a un punto seguro, con un mensaje. Mecánica de
> farmeo de dopamina: un evento al azar […] da un cofre que, al pasar el nivel (si pierde, lo pierde), desbloquea estilos
> para las mascotas que ya tiene, con una animación como la de las cajas de MEGABONK.»

Lo marcado *decidí yo*, para confirmar:

| Tema | Quedó así |
| --- | --- |
| Acariciar | Apuntarle a la mascota con la mira (si le pega antes que a una flecha) cambia LIBERAR por **ACARICIAR** (clic / E / botón táctil con corazón). *Baja una mano de dibujito sobre la nuca*, salen corazones y la mascota se queda quieta mirándote ~2,5 s. *Con el jugador quieto la mascota no se mueve mientras la veas* (si no, al girar para apuntarle se corría). |
| Reacciones | Gomita tiembla entera, se pone rosada y suelta gotitas; Michi cierra los ojos, ronronea, frota la cabeza y amasa; Pío se esponja, aletea y da tres saltitos piando y un giro; Croac infla el buche, saca la lengua y da un mortal hacia atrás; Bu se tapa la cara colorado y después saluda dando una vuelta; el ajolote baila con las branquias encendidas soltando burbujas; Zumbi hace la danza del ocho de las abejas; Robi pone ojos de corazón, gira la cabeza y la antena titila en arcoíris con un bip-bup; Dragui abre las alas, ruge echando chispas y da una vuelta en el aire. Cada una con su sonido. |
| Sin huecos | **Toda celda de la figura es parte de una flecha**, también en el tutorial (rehecho: 7 × 5, la roja trabada por la verde). *Los huecos que deja el llenado al azar se los llevan flechas vecinas que se alargan; si no, flechas nuevas cortas o una vecina partida en dos*, siempre que el tablero siga teniendo solución. Llenar todo duplicó la profundidad: rondas para resolverlo / libres al empezar, FÁCIL 7,8 / 35 %, DIFÍCIL 13,1 / 26 %, EXTREMO 23,0 / 19 %, ISLAS 14,2 / 21 % (antes 4,9 / 41 %, 7,3 / 38 %, 8,8 / 31 %, 6,9 / 36 %). EXTREMO tiene ~74 flechas por nivel (antes 44): *quizá convenga achicar sus tableros*. |
| Distancia entre islas | De 3,6 m a **10,8 m** de vacío (6 columnas de la grilla en vez de 3: las rectas de las flechas lo cruzan igual). |
| El vacío | **Sin paredes invisibles**: entre islas y en los huecos no hay piso y se cae. *El borde de afuera del mapa sigue siendo una pared* (como antes; para no caerse por accidente rodeando el tablero). *Los huecos del medio también se volvieron vacío de verdad*, por coherencia. |
| La regla | Con **Salto 4** (doble salto + planeo) y **Velocidad 3** se salta de una isla a otra (con planeo llega a ~21 m; cualquier momento del doble salto sirve). Sin eso, *sobre el vacío la gravedad es 2,6 veces mayor y no hay planeo ni saltos en el aire*: nadie pasa de ~6 m, así que **siempre cae** (lo prueba un test con las 36 combinaciones de mejoras). |
| Caer | Cuesta **una vida** (cuenta como un choque para el premio sin errores), vuelve al último lugar firme a más de 2,2 m del vacío y frena el movimiento 0,6 s. Sin el equipo, el cartel dice «Aún no tenés suficiente velocidad y salto para viajar libremente» y explica qué mejoras faltan. La tienda MEJORAS muestra cuánto falta; la primera vez que se tiene el equipo en un mapa con islas, un cartel lo explica. |
| Eventos | *Con al menos una mascota adoptada*, el *55 %* de los niveles (no el tutorial) tiene **uno**, entre los 14 y 44 s: **FLECHA DORADA** (una de tu isla, mejor trabada, se vuelve de oro: liberarla sin que choque; si choca, pierde el brillo), **CHISPITA** (una estrellita con alas que salta escapándose, también por encima de las flechas: tocarla en 30 s; se cansa con el tiempo) y **SENDERO** (6 anillos dorados en el aire, de 1,7 a 3,4 m, uno detrás de otro: pasar por todos en ~35 s). Un chip del HUD dice qué hacer y cuánto falta; una columna de luz y el minimapa marcan hacia dónde. |
| El cofre | Ganado el evento, queda **pendiente** («COFRE · pasá el nivel»). Al ganar el nivel se guarda y se abre desde el cartel de nivel resuelto (o después, desde MASCOTAS). Perder o reiniciar el nivel **lo pierde**. |
| Estilos | *24 por mascota*: 16 pieles (6 colores comunes; rayas, lunares, cuadros y corazones raros; noche estrellada y neón épicos; oro, galaxia, arcoíris y cristal legendarios) y 8 accesorios (moño, flor y gorrito raros; galera, lentes y auriculares épicos; corona y aureola legendarios). Rarezas 52 / 29 / 15 / 4 %. Cada estilo es de una mascota y solo salen para las adoptadas; *nunca repite* (con todo ganado, 120 monedas). Cada mascota lleva una piel y un accesorio a la vez (MASCOTAS → ESTILOS). |
| Apertura | Como MEGABONK / Counter-Strike: el cofre tiembla cada vez más, revienta en luz, una tira de estilos (con su mascota y el color de su rareza) pasa a toda velocidad, frena de a poco con un tic por carta y cae en el premio; *a veces la de al lado es legendaria*. Al caer: destello y rayos del color de la rareza, papelitos, fanfarria que crece con la rareza y vibración. PONÉRSELO viste a la mascota y la lleva; ABRIR OTRO si quedan; tocar salta. |

Pendiente: calibrar la probabilidad de los eventos, el tiempo de la chispita y del sendero, los pesos de las rarezas y si
EXTREMO (ahora mucho más profundo) necesita tableros más chicos.

## Mascotas más interactivas: agarrar, lanzar, cuerpos, caricias y pleito (pedido del usuario, 2026-10-10)

> «Deben poder arrojarse y manejarse de alguna manera con físicas realistas. Debe haber una opción para que tengan un cuerpo
> un poco más sólido, más suave o más "rebotante". Debe haber distintas maneras o animaciones para acariciarlas. Debe haber
> alguna interacción para cuando el jugador toma a la mascota y la arroja al vacío (puede ser que genere un pleito o que
> dispare un breve evento de combate).»

Lo marcado *decidí yo*, para confirmar:

| Tema | Quedó así |
| --- | --- |
| Agarrar | *Mantener apretado* LIBERAR / clic / E sobre la mascota *0,3 s* (o **Q** / clic derecho, al instante). Un toque corto sigue siendo la caricia (ahora sale al soltar). No se puede en el pleito ni ofendida. |
| En brazos | *Abajo a la derecha de la vista* (no tapa la mira), colgando de un resorte y sostenida con las dos manos: se bambolea al caminar o girar. *Mecerla* (girar suave) le gusta: corazones y un arrullo; *sacudirla* (girar fuerte y seguido) la **marea** (estrellitas, ojos a media asta). |
| Lanzar | Con ella en brazos, *mantener para cargar (0,9 s)* y soltar: sale hacia la mira (un poco hacia arriba) a *3 a 13,5 m/s* según la carga, **más la velocidad que ya traía** (corriendo, va más lejos) y girando hacia adelante. Mientras se carga, un anillo en la mira y *la trayectoria con puntos naranjas* hasta donde va a tocar (un aro); **rojos si termina en el vacío**. Q la deja en el piso. |
| Física | Pelota con giro (cuaternión) a 120 Hz, *sin motor de física*: rebote, fricción de Coulomb hacia rodar sin deslizar y resistencia a la rodadura; choca con las flechas, el piso de cada isla (esquinas redondas, huecos, el canto de la losa), *el bordecito de la losa* (una que rueda despacio se queda; lanzada pasa por encima) y **con vos** (si cae sobre tu cabeza, rebota; si la empujás, rueda). Gravedad propia *18 m/s²* (la del jugador es 26). Se aplasta al pegar y se estira al volar (un resorte). Al quedarse quieta se levanta; *si el golpe fue fuerte queda mareada* (las blandas no). |
| Cuerpos | **SÓLIDO** (rebota poco, da tumbos, casi no se deforma), **BLANDO** (no rebota, se aplasta mucho, tiembla y se pega) y **SALTARÍN** (rebota y rebota). Uno *por mascota*, en *MASCOTAS → ESTILOS → CUERPO*. *Por defecto*: Gomita, Bu y Ajolote blandos; Pío, Croac y Zumbi saltarines; Michi, Robi y Dragui sólidos. También cambia cómo cuelga en la mano y el sonido de cada rebote (tok / splat / boing). |
| Caricias | **Según dónde apuntes** (el cartel lo dice): *arriba* LA CABEZA (la reacción única de cada una, como antes), *al medio* EL MENTÓN (la mano debajo rasca; estira el cuello y ronronea), *abajo* LA PANZA (se tira de espaldas pataleando y la mano hace círculos) y *a los costados* COSQUILLAS (se retuerce de risa, lejos de la mano). Cada una con su sonido y la voz de la mascota. *Las cuatro en 20 s = «¡Mimos completos!»* (lluvia de corazones). El cartel va *al costado de la mira* para no taparla. |
| Al vacío | Cae gritando; *a los 0,9 s vuelve de un salto mortal* por el borde más cercano hacia vos, **furiosa** (cejas, 💢, roja y echando vapor) y empieza el **PLEITO**. |
| El pleito | Te persigue y **embiste**: antes de cada embestida se agacha y tiembla *0,85 s* mientras *una franja roja con chevrones* marca por dónde va a pasar; sale derecha a 12 m/s y se pasa 2,6 m de largo. *Si te pega, te empuja* (un instante sin control y la pantalla roja). **Esquivarla** (corriéndote de costado; a las que caminan, también saltándolas) la deja *mareada 2,4 s* contra el piso: una **caricia la calma** un poco. **Atajarla** (apretar apuntándole cuando llega) también. Las que caminan no se meten al vacío (y si estás en otra isla, aparecen de un salto al lado tuyo); las que vuelan te embisten a la altura del pecho. Marcador arriba: ENOJO (3) y AGUANTE (3). |
| Final | *3 caricias* (o atajadas) → **hacen las paces**: salta a tus brazos con corazones y fanfarria. *Te pega 3 veces* → **gana ella**: festeja y queda **ofendida 18 s** (te da la espalda, te espía de reojo y no se deja tocar ni agarrar). *Pasados 34 s* → se cansa (ofendida 8 s). *Sin premio en monedas* (si no, convendría tirarla al vacío a propósito); cuenta en las estadísticas. Las vidas del nivel no se tocan, *salvo que su empujón te tire al vacío*. |
| Cómo se enseña | Primero el cartel de las caricias (ahora menciona las cuatro zonas) y, ya visto, uno nuevo: «Mantené apretado sobre tu mascota para agarrarla» (y que no la tires al vacío…). En el pleito, el cartel de abajo explica qué hacer. |

Pendiente: calibrar con gente la fuerza del lanzamiento, cuánto marea sacudirla, el ritmo del pleito (aviso, velocidad,
cuánto dura mareada) y si el empujón debería poder tirarte al vacío.
