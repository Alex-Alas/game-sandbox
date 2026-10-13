# GRISÚ — documento de diseño (GDD)

Pedido del usuario (2026-10-13): un juego para compu y teléfono **centrado en una mecánica de combate y movimiento**,
nacido como incremental. Se definió con cuatro rondas de preguntas; lo que eligió el usuario manda y lo que **decidí
yo** está marcado para que lo confirmes o lo cambies. Nada está calibrado con gente: los números son un primer tiro y
van a vivir en `RANGES` (como en HYPERFLOWGEON y CATAPUM) para afinarlos jugando.

Plan de implementación: [`plans/2026-10-13-grisu.md`](../plans/2026-10-13-grisu.md).

## 0. En una frase

**Un roguelite 2.5D de acción, en 3D pixelado, en una mina steampunk con magia:** bajas por un pozo sin fondo, piso a piso, alternando
galerías donde corres sin parar, caídas verticales y salas de oleadas. Una de cuatro clases, cada una con dos de cuatro
mecánicas (dash-corte, pogo, garfio y parry), se controla solo con gestos en el teléfono. Entre runs, los builds con
contras (variantes de arma a lo TF2, y mods y overclocks a lo Deep Rock Galactic) y una forja de rangos infinitos hacen
crecer los números.

### Pilares

1. **El movimiento es el ataque.** Toda mecánica mueve y pega a la vez: cortar te lanza, rebotar te sube, engancharte
   te arrastra, devolver un golpe te recarga. Quedarse quieto no paga.
2. **Una mano, cero botones.** En el teléfono acostado se juega solo con toque, deslizar y mantener. Lo que no entra en
   esos tres gestos no entra al juego.
3. **Cada contra cuenta una historia.** Toda mejora fuerte trae una contra que cambia cómo juegas, no solo un número
   más bajo (la regla de TF2).
4. **Runs cortas, números que crecen.** Una run ganada dura unos 25 min y un piso, menos de uno y medio. Lo que crece
   entre runs (arcanita, mods, forja, profundidad de SIN FONDO) es la parte incremental.

## 1. Decisiones

| Tema | Quedó | Quién | Alternativas que se descartaron |
| --- | --- | --- | --- |
| Bucle | Runner + descenso + arena **combinados en una torre por pisos** | usuario | modos separados, ciclo fijo |
| Mecánicas | **Las cuatro**: dash-corte, rebote/pogo, garfio y parry | usuario | una sola |
| Reparto | **Por arma o clase**: 4 armas, dos mecánicas cada una, cada mecánica en dos armas | usuario | todas desde el inicio, desbloqueo progresivo |
| Activo/idle | **Todo activo**: no juega solo ni gana nada sin conexión | usuario | idle premiado, mayormente idle |
| Progresión | **Roguelite con builds y subclases con contras, a lo TF2 y Deep Rock. Sin prestigio** | usuario | puntos de control, prestigio |
| Dentro de la run | **Pergaminos** (bendiciones mágicas) y **tiendas** con **gadgets** steampunk y **objetos mágicos** | usuario | solo pre-run |
| Mundo | **Pozo minero steampunk combinado con magia** | usuario | abismo oscuro, templo ninja, caricatura |
| Vista | **2.5D**: modelos 3D y movimiento en solo dos ejes; la cámara la decidí yo (§3) | usuario + yo | 2D pintado |
| Controles | **Teléfono acostado, gestos puros** (sin joystick ni botones en pantalla) | usuario | joystick y botones, teléfono parado |
| Jugadores | **Un jugador, con la simulación lista para co-op** (pura y por entradas) | usuario | co-op desde el inicio |
| Quién empuña | **4 clases**, una por arma | usuario | un minero que cambia de arma |
| Forma de la run | **4 estratos con jefe; ganar abre PRESIÓN y SIN FONDO** | usuario | sin fin desde el principio, expediciones |
| Modelos | **Mixto**: escenarios y props de packs CC0; personajes, armas y efectos por código | usuario | todo por código, todo de packs |
| Render | **3D pixelado**: los modelos se renderizan a ~400 px de alto y se amplían sin suavizar, con paleta corta, contorno de 1 px y animación en dos (§13). Lo pidió el usuario tras ver que sus 20 referencias son mayoría pixel art | usuario | 3D entintado en alta resolución |
| Reglas de las referencias | **Caras ocultas** con ojos o lentes que brillan, **un color mágico por escuela** sobre un mundo apagado, **autómatas de latón** como enemigos y **retratos ilustrados** en los menús (§13) | usuario | — |
| Nombre | **GRISÚ**: el gas explosivo de las minas. En el juego, las bolsas de grisú son un peligro que también es un arma | yo | VETA, HONDURA, LATÓN |
| Gesto por mecánica | Toque = salto en todas las clases; deslizar y mantener cambian según la clase (§4) | yo | un gesto fijo por mecánica |
| Cámara | Perspectiva de foco largo (28°), casi de costado (9° hacia abajo), **fija** y anclada a la grilla de píxeles; los modelos giran 30° hacia la cámara (vista 3/4) (§3) | yo | ortográfica, isométrica, giro dinámico (descartado: en pixel art girar la cámara hace parpadear todo) |
| Lo incremental | Forja de rangos infinitos + escalado exponencial de SIN FONDO (§12.5) | yo | solo árbol finito |
| Al morir | Te llevas **toda la arcanita** y pierdes el latón | yo | perder la mitad |

## 2. Mundo y tono

**La Compañía Hondura** abrió un pozo buscando carbón y encontró **arcanita**: un mineral turquesa que guarda magia. La
ciudad de arriba vive de él, pero cuanto más se baja, más se mezcla la magia con las máquinas: autómatas que rezan,
cristales que cantan, hornos que piensan. La **Brigada de Fondo** baja a buscar la veta madre. Nadie volvió del fondo,
y nadie sabe si lo tiene.

- **La Boca del Pozo** (el centro entre runs, como la plataforma espacial de DRG): una plataforma de andamios colgada
  sobre el abismo, con el montacargas, el taller, la forja, el tablero de hazañas y el manómetro.
- **Los cuatro estratos** (cada uno con enemigos, peligros, luz y paleta propios):

| # | Estrato | Qué es | Peligro del estrato | Luz |
| --- | --- | --- | --- | --- |
| 1 | **LAS GALERÍAS** | Mina de carbón con rieles, vigas y vagonetas | Bolsas de grisú, chorros de vapor | Faroles de aceite, cálida |
| 2 | **LAS GEODAS** | Cavernas de cristal que cantan | Esquirlas que rebotan, cristales que reflejan | Arcanita fría, turquesa y lila |
| 3 | **LA FUNDICIÓN** | Hornos y ríos de escoria de la compañía | Escoria que sube, ráfagas de calor | Brasa naranja, contraluz rojo |
| 4 | **LA CIUDAD HUNDIDA** | Ruinas arcanas anteriores a la compañía | Runas que se encienden, gravedad que se tuerce | Magia blanca y dorada, niebla |

- **Tono:** aventura industrial con asombro mágico. Humor seco en los textos (la compañía manda memos a la brigada), y
  jefes inquietantes.

## 3. Cámara y 2.5D

**La simulación es 2D** (plano z = 0, metros, y hacia arriba) y **todo se dibuja en 3D**. Elegí:

- **Perspectiva con FOV vertical de 28°.** El foco largo achata la perspectiva: el plano de juego se lee como 2D y los
  modelos conservan volumen. Lo lejano tiene parallax real, sin trucos de capas.
- **Inclinación de 9° hacia abajo.** Se ve un poco el techo de las plataformas y de los modelos, así se lee dónde
  termina un borde. Con más inclinación, el POZO y los saltos se deforman.
- **Cámara fija en ángulo, anclada a la grilla de píxeles.** En 3D pixelado, girar la cámara hace parpadear cada
  borde, así que la orientación no cambia nunca. La posición se ancla a la grilla de píxeles del plano de juego y el
  resto de la fracción se corre en la ampliación: el desplazamiento se ve suave sin que los píxeles bailen (la técnica
  de t3ssel8r, §13.4).
- **Los modelos giran 30° hacia la cámara.** Aunque se muevan de costado, se los ve en 3/4, como los sprites de las
  referencias. Los ataques y las caras se leen mejor, y el volumen 3D se nota sin mover la cámara.
- **Encuadre por tipo de piso** (alto mínimo de la vista; el ancho sale de la pantalla):
  - PASILLO: 13 m de alto, el héroe en el tercio izquierdo y la mira adelantada un 30 % hacia donde corre.
  - POZO: 17 m de alto, el héroe en el tercio superior (se ve lo que viene abajo) y la mira adelantada según la caída.
  - SALA: encuadra la arena entera (unos 28 × 14 m); sigue al héroe solo si la sala es más grande.
- **Profundidad del escenario:**
  - primer plano oscuro y desenfocado a z −4…−8, con formas gruesas (vigas, cadenas, rocas);
  - plano de juego en z = 0 (lo único que colisiona);
  - fondo cercano a z 6–15 (galerías, maquinaria, otros pozos);
  - fondo lejano a z 40–150 (cavernas, bruma y rayos de luz).
- **Descartadas:**
  - la ortográfica pierde volumen y parallax;
  - la isométrica o una inclinación alta confunden alturas y bordes en un juego de saltos;
  - el giro dinámico hace parpadear el pixel art.
- **Riesgo propio de la perspectiva:** lo que no está en el plano de juego (fondos y primer plano) se mueve en fracciones
  de píxel distintas y puede titilar. Se prueba en el ensayo de estilo de F1 (plan). Si molesta, cada banda de
  profundidad se renderiza en su propia capa anclada a su grilla.

## 4. Controles

### Teléfono (acostado, gestos puros)

Se reconocen tres gestos en cualquier lugar de la pantalla. Los umbrales vienen de DOWNCASTLE (`input.js`) y se
calibran:

| Gesto | Cómo | Qué hace |
| --- | --- | --- |
| **TOQUE** | < 180 ms y < 12 px | **SALTO** en todas las clases (doble salto en el aire). Enganchado: suelta con impulso |
| **DESLIZAR** | ≥ 30 px en < 350 ms; dirección en 16 sectores con imán a enemigos | La **acción direccional** de la clase (§7) |
| **MANTENER** | ≥ 180 ms sin deslizar; el punto bajo el dedo es el objetivo | La **acción sostenida** de la clase (§7); soltar la termina |

- **Sin joystick, ¿cómo se camina?**
  - En el PASILLO se corre solo.
  - En la SALA hay **caminata asistida**: en el suelo el héroe va hacia el enemigo más cercano (o hacia el último que
    golpeaste) y se frena a su alcance.
  - En el POZO se cae solo.
  - Todo lo demás (esquivar, reposicionarse, cruzar) sale de las mecánicas.
  - Es el **riesgo número uno** del diseño y lo primero que se prueba en F1. Si no funciona, se agrega un esquema
    JOYSTICK opcional (el de CATAPUM) sin tocar la simulación.
- Gestos con el segundo dedo: se ignoran en el MVP. Quedan libres para una herramienta de clase futura.

### Compu

- Espacio: salto.
- Ratón: clic izquierdo = acción direccional hacia el cursor; clic derecho mantenido = acción sostenida hacia el cursor.
- Solo teclado: WASD/flechas dan la dirección, J = direccional, K = sostenida.
- Esc: pausa.

### Mando

Palanca para la dirección, A = salto, X = direccional, gatillo derecho = sostenida.

Todo llega a la simulación como la misma `Input` (`jump`, `dir`, `hold`, `ax`, `ay`, `tx`, `ty`): el gesto es solo
entrada, como los esquemas de garfio de HYPERFLOWGEON.

## 5. Movimiento base (todas las clases)

| Valor | Primer tiro | Nota |
| --- | --- | --- |
| Caja del héroe | 0,8 × 1,6 m | `p.x` = centro, `p.y` = pies |
| Carrera automática (PASILLO) | 8 m/s en el estrato 1 → 10 m/s en el 4 | aceleración 40 m/s² |
| Caminata asistida (SALA) | 5 m/s | se frena al alcance de la clase |
| Salto | 2,4 m en 0,32 s de subida | caída con gravedad × 1,6, como el «floaty» de CATAPUM |
| Doble salto | 1,5 m, 1 en el aire | vuelve al tocar suelo o al rebotar |
| Coyote / buffer | 6 / 8 cuadros | a 60 Hz |
| Caída máxima | 22 m/s (POZO: 14 m/s) | |
| Salto variable | **no**: un toque no se mantiene | alturas fijas, también con espacio, por paridad |

**Caer a un foso** en el PASILLO no mata: cuesta 15 de integridad y vuelves al último suelo firme (la regla de
FLECHAZO).

## 6. Las cuatro mecánicas

Números iniciales, todos en `RANGES`.

### 6.1 Dash-corte

- Recorre **5,5 m en 9 cuadros** (~37 m/s) y conserva el 40 % de la velocidad al terminar.
- Invulnerable los cuadros 1–7; golpea todo lo que barre (cápsula de radio 0,6 m) y atraviesa enemigos livianos.
- **2 cargas.** Cada una se recarga en 0,9 s solo en el suelo; matar con un dash devuelve una al instante (Katana Zero,
  Hades). Rebotar con pogo también devuelve una.
- Imán: con un enemigo a menos de 7 m dentro de ±20° de la dirección deslizada, el dash apunta a él.
- Cancela la recuperación de cualquier otra acción.

### 6.2 Pogo

- Deslizar ↓ en el aire hace una **picada** (vy = −24 m/s) con la caja de golpe bajo los pies.
- Al pegarle a un enemigo, a un objeto pogueable (válvulas, vetas, bolsas de grisú) o a un peligro marcado:
  - rebote de 2,6 m;
  - recupera los saltos en el aire y 1 carga;
  - 6 cuadros invulnerable.
- Contra el suelo sin pegarle a nada, es un aterrizaje pesado con onda chica.
- Encadenar rebotes sin tocar el suelo es el combo más alto del juego (Downwell, Hollow Knight).

### 6.3 Garfio

Es **la liga de HYPERFLOWGEON** (`games/hyperflowgeon/src/sim/`), portada:

- una sola fuerza central que solo tira, con tope de velocidad radial de 18 m/s;
- alcance de 9 m; la punta viaja en ~0,08 s;
- contra enemigos, el tirón se reparte por masa: los livianos vienen y los pesados te llevan;
- soltar conserva la velocidad; un toque enganchado suelta con impulso de 6 m/s hacia arriba.

Lo calibrado en los pasos A–E de HYPERFLOWGEON es el punto de partida, no se redescubre.

### 6.4 Parry

- **Telegrafía obligatoria:**
  - destello **blanco** de 0,35–0,6 s antes = se puede devolver;
  - aura **roja** = no se puede, hay que esquivar.
- **Ventana perfecta de 7 cuadros** (117 ms) antes del cuadro activo del golpe, y **5 cuadros «buenos»** después
  (bloquea la mitad, sin aturdir).
- Parry perfecto:
  - un proyectil vuelve con daño × 2 y velocidad × 1,5;
  - un golpe cuerpo a cuerpo deja al atacante **ATURDIDO 1,2 s** (los golpes le hacen × 1,5);
  - recarga una carga o una recuperación;
  - hitstop de 0,1 s y, solo con un jugador, cámara lenta de 0,25 s al 40 %.
- Fallar deja 0,35 s vulnerable, así no se puede abusar.

## 7. Clases y armas

Cada mecánica aparece en dos armas que **la usan distinto**. Los nombres son provisionales; las siluetas siguen la
regla de las referencias: **la cara nunca se ve**, y lo que brilla es lo que mira.

| Clase | Arma | Mecánicas | Rol | DESLIZAR | MANTENER |
| --- | --- | --- | --- | --- | --- |
| **LA PERFORADORA** («Remache») | Taladro-lanza | dash + pogo | La flecha: velocidad y líneas | **Dash-taladro** (↓ en el aire = **picada-taladro**, el pogo) | **Cargar**: el siguiente dash dobla su distancia y perfora roca blanda y escudos |
| **EL ESGRIMISTA** («Don Válvula») | Sable de pistón | dash + parry | El duelista: precisión y contragolpe | **Dash-corte** (desvía los proyectiles que toca, a lo Katana Zero) | **Guardia**: bloquea de frente el 60 %; un golpe que llega en los primeros 7 cuadros de la guardia es parry perfecto (Sekiro) |
| **EL ESTIBADOR** («Ancla») | Martillo-ancla | pogo + garfio | El péndulo: peso y verticalidad | **Martillazo** en esa dirección: lento (18 cuadros), empuja fuerte y se lanza 2 m (↓ en el aire = **picada-ancla**, un pogo con onda que rompe escudos) | **Ancla**: el garfio al punto, pesado; columpio amplio y tira a los enemigos hacia ti |
| **LA MAGNETISTA** («Bobina») | Guantelete imán | garfio + parry | La titiritera: control y redirección | **Pulso repulsor**: cono que empuja y devuelve (parry a distancia; perfecto en la ventana). Contra una pared o el suelo te empuja al revés: es su movilidad | **Imán**: un garfio que **solo se pega a metal** (vigas, rieles, enemigos metálicos) pero tira el doble y permite lanzar lo enganchado con un deslizar |

Las parejas que comparten mecánica se diferencian así:

- **Dash:** el de la Perforadora perfora terreno y va en línea; el del Esgrimista es corto, preciso y desvía.
- **Pogo:** la Perforadora sigue taladrando lo blando; el Estibador hace onda y rompe escudos.
- **Garfio:** el del Estibador se pega a todo y es pesado; el de la Magnetista, solo a metal, pero es fuerte y lanza.
- **Parry:** el del Esgrimista es una guardia cuerpo a cuerpo y en el lugar; el de la Magnetista, un pulso direccional
  y a distancia.

**Siluetas** (prueba de la miniatura: se reconocen en negro a 48 px por la cabeza y el arma):

| Clase | Cabeza (la cara oculta) | Cuerpo y arma | Qué brilla |
| --- | --- | --- | --- |
| **Perforadora** | Gafas de soldar enormes sobre una capucha de lona; debajo solo hay sombra (la hoja del chico de las gafas) | Chica y compacta, chaquetón de cuero con frascos y una mochila-caldera; el taladro-lanza mide más que ella | Los dos lentes |
| **Esgrimista** | Chistera alta con un manómetro en la cinta y gafas sobre el ala; la cara queda en la sombra del ala (el alquimista de EV Ganin) | Alto y flaco, levita con faldones largos y el sable con el pistón en el guardamano | El monóculo |
| **Estibador** | Escafandra de latón de buzo, con la ventanilla redonda (el casco del set de íconos) | Enorme, hombros de grúa, un brazo mecánico y el ancla al hombro con la cadena enroscada | La ventanilla |
| **Magnetista** | Sombrero de bruja de ala ancha que tapa los ojos, con bobinas de cobre en la copa (el mago de las armas que flotan) | Capa corta, pelo que flota con estática y un guantelete gigante de imanes | Los ojos bajo el ala |

**Lo que brilla toma el color de la escuela dominante del build** (la que más pergaminos tiene en la run). Al empezar
brilla en el turquesa de la arcanita. Así el build se lee en la pantalla sin abrir un menú.

**MVP: Esgrimista + Estibador.** Entre los dos cubren las cuatro mecánicas, con el contraste ágil/pesado.

## 8. Combate

- **Integridad** (vida) 100 base.
  - Golpes enemigos de 10 a 25.
  - El **contacto daña 10**, salvo con invulnerabilidad: hay que pasar *a través* con un dash o *por encima* con un pogo.
  - Curas escasas: tienda, pergaminos raros y la fuente de vapor entre estratos.
- **Hitstop por entidad** (como CATAPUM, apto para co-op): el golpeado se congela 0,06–0,12 s según el peso del golpe;
  el sacudón y el destello siguen corriendo.
- **Receta de golpe** de la skill: estallido, chispas, destello, aro, onda de choque y sonido en el mismo cuadro (§13).
- **Aturdimiento y LANZADO** (de HYPERFLOWGEON): lo empujado fuerte queda LANZADO y daña a lo que choca. Así el
  Estibador y la Magnetista hacen billar con los enemigos.
- **Combo:**
  - cada golpe sin recibir daño suma 1; se pierde al recibir daño o tras 2 s sin pegar;
  - multiplica el latón y la arcanita que sueltan los enemigos: × (1 + 0,05 por golpe), tope × 3;
  - se ve en el HUD con un manómetro que sube de presión.
  - Es el premio a jugar activo y bien.
- **Bolsas de grisú:** explotan al recibir chispas, fuego o un golpe de metal, en cadena, y dañan a enemigos **y a ti**.
  Son la mecánica del nombre: un peligro que se puede usar como arma.

## 9. La run

### 9.1 Forma

| Tramo | Pisos | Duración aproximada |
| --- | --- | --- |
| Estrato 1 LAS GALERÍAS | 5 pisos + TIENDA + JEFE | ~6 min |
| Estrato 2 LAS GEODAS | 5 + TIENDA + JEFE | ~6 min |
| Estrato 3 LA FUNDICIÓN | 5 + TIENDA + JEFE | ~6 min |
| Estrato 4 LA CIUDAD HUNDIDA | 5 + TIENDA + JEFE FINAL | ~7 min |

Entre estratos, una **fuente de vapor** cura el 30 % y se elige la puerta del siguiente.

### 9.2 Tipos de piso (40–90 s cada uno)

| Piso | Qué es | Termina | Premio típico |
| --- | --- | --- | --- |
| **PASILLO** | Runner lateral de 120–200 m con carrera automática. Fosos, vagonetas que embisten, chorros de vapor, enemigos en el camino. **Rutas altas y bajas**: las vetas de arcanita están arriba, para quien encadena pogos o garfios | Al llegar a la bajada | latón y arcanita |
| **POZO** | Caída vertical de 80–150 m en un pozo de 10–14 m de ancho. Salientes, voladores, bolsas de grisú y plataformas que se rompen. Para moverse de costado: dash, garfio a las paredes, martillazo lateral o pulso contra la pared | Al aterrizar en el fondo | arcanita en las paredes |
| **SALA** | Arena cerrada de unos 28 × 14 m con plataformas y 2–4 oleadas; las puertas se cierran | Al limpiar la última oleada | **un pergamino** (1 de 3) |
| **TIENDA** | La Buhonera y su caminante a vapor (§11.2) | Al irte | — |
| **JEFE** | Sala especial con fases | Al vencerlo | pergamino raro, arcanita y núcleo de overclock |

- **Dos puertas.** Al final de cada piso (salvo antes de la tienda y del jefe) se elige entre dos bajadas. Cada una
  muestra el tipo del piso siguiente y su premio: pergamino, latón, arcanita, núcleo o reparación (las puertas de
  Hades).
- **Semilla.** Los pisos se arman con bloques diseñados a mano (§15.3) según la semilla de la run y el estrato.
  Restricción: cada estrato tiene al menos una SALA, un PASILLO y un POZO.

### 9.3 Al terminar

- **Morir:** te llevas toda la arcanita, los núcleos y la XP de clase; el latón se pierde.
- **Ganar** (vencer al jefe final): abre **PRESIÓN** y **SIN FONDO** (§12.6).

## 10. Enemigos y jefes

Regla de las referencias: **los enemigos de la compañía son autómatas de latón** con engranajes a la vista y ojos que
brillan en **rojo** (el color del peligro). Lo que vive en la profundidad es orgánico o mágico, y se va mezclando con
las máquinas a medida que se baja: la magia se mete en los autómatas.

### 10.1 Estrato 1 (el del MVP)

| Enemigo | Qué es | Rol | Qué enseña |
| --- | --- | --- | --- |
| **Topo-barrena** | Autómata de latón con taladro en el hocico | Cuerpo a cuerpo; sale del suelo con un destello blanco | parry y dash a través |
| **Farolero** | Minero hueco con un farol por cabeza | Lanza bombas de grisú en arco (se pueden devolver) | parry de proyectil, la bolsa como arma |
| **Murciélago de hollín** | Criatura de la mina | Volador en enjambres de 3–5 | pogo en el aire, combos sin tocar suelo |
| **Capataz autómata** | Autómata de latón con escudo frontal de hierro (metálico) | Bloquea de frente | rodear con pogo, garfio o imán; romper con la picada-ancla |
| **Vagoneta poseída** | Vagoneta con caldera y ojos rojos | Embiste por los rieles en el PASILLO (aura roja) | saltar o esquivar; pogueable desde arriba |

**Jefe: EL TOPO REY.** La máquina de excavar más grande de la compañía: un autómata-topo de latón con la caldera a la
vista, que perfora la sala:

- Fase 1: aparece desde el suelo y las paredes con destellos blancos; su cabeza-taladro se puede devolver.
- Fase 2: las válvulas de su lomo son pogueables y enganchables.
- Fase 3: inunda la sala de grisú y hay que hacerlo explotar contra él.

### 10.2 Estratos 2–4 (boceto)

| Estrato | Enemigos | Jefe |
| --- | --- | --- |
| **GEODAS** | **Raptores de latón** en jauría (los de la cueva de cristal de las referencias: saltan en grupo), Cristalino (dispara esquirlas que se devuelven), Golem de geoda (pesado y frágil al pogo), Polillas de luz (enjambre) | **EL DRAGÓN DE LA COMPAÑÍA**: un esqueleto de dragón de latón a medio armar (el de las referencias) que vuela por la caverna. Se engancha a sus costillas y se rebota en su lomo |
| **FUNDICIÓN** | Fundidor (autómata con un cono de fuego rojo), Salamandra de escoria, Torreta de vapor, Ánima de brasa | **EL ALTO HORNO**: un gólem-horno; se le devuelve la escoria y se rebota en su crisol |
| **CIUDAD HUNDIDA** | Guardia rúnico (solo se vence con parry), Archimago mecánico (un autómata con sombrero de mago y báculo), Libro volador, Sombra encapuchada con ojos rojos | **EL CORAZÓN DEL POZO**: el motor arcano que mezcla todo lo anterior. Su forma final es un ojo rojo gigante en la oscuridad (la referencia de los ojos rojos) |

Cada estrato introduce una amenaza que pide a otra clase, pero ninguna sala es imposible para ninguna clase: el bot de
pruebas lo verifica (§15.4).

## 11. Dentro de la run

### 11.1 Pergaminos (las bendiciones)

Al limpiar una SALA o vencer a un jefe se elige **1 de 3 pergaminos**. Vienen de **escuelas de magia** (los dioses de
Hades), y cada pergamino ocupa una **ranura** de mecánica (DASH, POGO, GARFIO, PARRY o SALTO) o es pasivo. **Solo
aparecen los de las mecánicas de tu clase.**

Cada escuela tiene **su color emisivo**: es el único color saturado del juego, junto con la arcanita y el rojo del
peligro (regla de las referencias, como el personaje que cambia el color de su fuego). El pergamino, sus efectos y lo
que brilla en el héroe (§7) llevan ese color.

| Escuela | Color | Tema | Ejemplos |
| --- | --- | --- | --- |
| **PIROMANCIA** | naranja fuego `#ff9a3c` (núcleo `#ffd36a`) | Brasa, quemadura, explosiones (sinergia con el grisú) | *Dash ígneo*: estela que quema 1,5 s · *Pogo de brasa*: el rebote suelta una explosión de 3 m · *Parry fundente*: el parry perfecto incendia al atacante |
| **ELECTROMANCIA** | azul eléctrico `#47beec` (núcleo `#d8f6ff`) | Rayo encadenado (sinergia con la Magnetista) | *Dash centella*: al terminar salta un rayo a 2 enemigos · *Garfio conductor*: el enganchado recibe descargas · *Parry de chispa*: lo devuelto se electrifica y encadena |
| **ALQUIMIA** | verde ácido `#8fd72a` (núcleo `#e4ff7a`) | Frascos, ácido, transmutación (los frascos verdes de las referencias) | *Pogo corrosivo*: el rebote salpica ácido que derrite escudos · *Frasco de reserva*: un escudo de vidrio bloquea 1 golpe cada 20 s · *Ancla transmutada*: el punto enganchado se vuelve un charco de ácido |
| **CRONOMANCIA** | violeta `#9b5cff` (núcleo `#e6d4ff`) | Relojería arcana | *Eco*: el dash se repite 0,4 s después como fantasma · *Segundo extra*: ventana de parry +4 cuadros · *Péndulo*: el columpio no pierde velocidad · *Reloj de arena*: con < 20 % de vida, cámara lenta 2 s una vez por sala |

- **Rarezas:** común, raro, épico y legendario.
- **Pergaminos sellados:** dúos de dos escuelas, que aparecen cuando ya tienes de las dos (por ejemplo, *Plasma*:
  Piro + Electro).
- **Pergaminos malditos:** con contra, al estilo TF2. Por ejemplo:
  - *Pacto del grisú*: +60 % de daño de explosiones, pero tus explosiones también te dañan.
  - *Prisa del capataz*: +30 % de carrera automática, −1 carga.
  - *Sangre de vapor*: matar cura, pero la vida baja sola 1 por segundo.
- **Tinta:** con ella se vuelven a sortear los tres pergaminos (se compra en la tienda).
- **Quinta escuela** para después del MVP: UMBRAMANCIA, en magenta `#c12d69` (sombras, copias, ataques por la
  espalda).

### 11.2 La tienda (La Buhonera)

La Buhonera es una alquimista que viaja en un caminante a vapor: delantal violeta, frascos de colores colgando y
tanques de latón a la espalda (la referencia 20).

Está **al final de cada estrato** (antes del jefe) y se paga con el **latón** de la run.

- **Gadgets** (steampunk, **2 ranuras**). **Se disparan solos con una condición**, así no piden botón:
  - *Mina de grisú*: el parry deja una mina.
  - *Dron-colibrí*: dispara al último enemigo golpeado cada 2 s.
  - *Caldera de bolsillo*: al recibir daño suelta vapor que empuja (recarga 8 s).
  - *Botas de muelle*: +1 salto en el aire.
  - *Gancho de recambio*: sin cargas, te da una de emergencia cada 6 s.
  - *Brújula de vetas*: marca las vetas ocultas.
  - *Tornillo*: autómata-mascota que junta el latón suelto.
- **Objetos mágicos** (pasivos con contra, **3 como máximo**):
  - *Monóculo del augur*: los telegrafiados aparecen un 30 % antes; −10 % de vida máxima.
  - *Guante de la avaricia*: +50 % de latón; los precios suben un 25 %.
  - *Corazón de engranaje*: revives una vez con el 30 % y se rompe.
  - *Reloj parado*: el combo no caduca por tiempo, pero recibir daño lo pierde y te cuesta latón.
  - *Vela de cera negra*: +25 % de daño en los POZOS y −25 % en los PASILLOS.
  - *Pluma mecánica*: caída máxima −30 %; dash −15 % de distancia.
- **Otros:** parche de latón (cura 35), tinta (vuelve a sortear los pergaminos) y un pergamino a la venta por estrato.

## 12. Fuera de la run: builds y lo que crece

### 12.1 Monedas

| Moneda | Dónde se consigue | Para qué | Al morir |
| --- | --- | --- | --- |
| **Latón** | Enemigos y cofres de la run | Tienda | Se pierde |
| **Arcanita** | **Vetas** (minarlas golpeándolas: pogo, dash o martillo), élites y jefes | Mods, forja de overclocks, Forja de la Brigada | Se conserva |
| **Núcleos** | Cofres sellados (raros) y jefes | Forjar overclocks | Se conservan |
| **XP de clase** | Jugar la run | Niveles de clase (desbloquean niveles de mods) | Se conserva |

### 12.2 Variantes de arma (TF2)

Cada arma tiene una base y dos variantes. Cada variante **cambia una regla** con una ganancia y una contra, y se
desbloquea con una **hazaña** de la clase (los logros de TF2). Por ejemplo:

| Arma | Variante | Ganancia | Contra | Hazaña |
| --- | --- | --- | --- | --- |
| Sable de pistón | **Florete de aguja** | Ventana perfecta × 1,5 | Sin parry «bueno»: todo o nada; dash más corto | 50 parries perfectos |
| Sable de pistón | **Cuchilla de caldera** | Cada parry acumula presión; llena, el siguiente dash explota | Si te golpean con presión, te quemas | Vencer al Topo Rey sin recibir daño en la fase 3 |
| Martillo-ancla | **Ancla pesada** | La picada hace onda grande y rompe escudos | Saltas un 20 % menos | 100 rebotes encadenados de a 5 |
| Martillo-ancla | **Cadena larga** | Alcance del garfio × 1,6 | Tira más lento | Cruzar un POZO sin tocar las paredes |
| Taladro-lanza | **Barrena larga** | Dash × 1,5 de largo | Una sola carga | — |
| Taladro-lanza | **Mecha doble** | 3 cargas | Cada dash hace × 0,6 de daño | — |
| Guantelete imán | **Bobina de Tesla** | El pulso encadena un rayo a 3 enemigos | Ventana perfecta más angosta | — |
| Guantelete imán | **Polaridad inversa** | El imán arroja lejos a los livianos en vez de traerlos | Ya no te acerca a ellos | — |

### 12.3 Mods por niveles (Deep Rock)

- Cada arma tiene **5 niveles de mods**, que se abren con el nivel de clase (1, 4, 8, 12 y 16).
- En cada nivel se elige **1 de 2–3 opciones**. Cada opción se compra **una vez** con arcanita y después se cambia
  libremente en la Boca del Pozo.
- Los niveles bajos ajustan números (alcance o recarga, daño o combo) y los altos cambian mecánicas. Por ejemplo, el
  nivel 5 del sable: *el dash deja una estela de vapor que oculta* o *el dash atraviesa escudos*.

### 12.4 Overclocks (Deep Rock)

- Con un **núcleo** y arcanita, la forja crea un overclock **al azar** de la clase. Se lleva uno por arma.
- **LIMPIO:** ganancia chica, sin contra. Por ejemplo, *Válvula pulida*: +10 % de daño del dash.
- **EQUILIBRADO:** ganancia y contra medianas. Por ejemplo, *Pistón doble*: 2 dashes seguidos sin pausa, recarga +40 %.
- **INESTABLE:** gran ganancia, gran contra. Por ejemplo, *Sed*: matar cura 3, pero 3 s sin matar te quema 2 por
  segundo.

### 12.5 Lo incremental: la Forja de la Brigada

Lo que pidió el usuario al principio era un incremental. Con «todo activo y sin prestigio», lo incremental queda **en la
meta** (decidí yo, para confirmar):

- **Forja de la Brigada:** mejoras generales con **rangos infinitos** y costo geométrico (× 1,15 por rango). Por
  ejemplo: +2 % de integridad, +3 % de latón inicial, +1 % de daño, suerte de pergaminos raros. Se abre al ganar la
  primera run, así la run base no se vuelve trivial antes de tiempo.
- **SIN FONDO** escala exponencial: la vida de los enemigos × 1,12 por piso y la arcanita × 1,10 por piso. Ahí los
  números se vuelven grandes (con sufijos K, M, B), y la Forja es lo que empuja el récord.

### 12.6 PRESIÓN y SIN FONDO (tras ganar)

- **PRESIÓN** (el Calor de Hades o el Peligro de DRG): un **manómetro de 1 a 10** que se sube antes de bajar. Cada punto
  activa una regla elegible y multiplica la arcanita. Algunas reglas:
  - los enemigos atacan un 15 % más rápido;
  - el grisú se vuelve inestable (explota solo);
  - la tienda vende un objeto menos;
  - los jefes tienen una fase más;
  - la caminata asistida es más lenta;
  - las ventanas de parry son un 2 cuadros más angostas.
- **SIN FONDO:** pisos infinitos con los estratos rotando y un jefe cada 6 pisos (con variantes). Hay récord de
  profundidad por clase.

### 12.7 La Boca del Pozo

Pantallas DOM sobre la escena 3D de la plataforma:

| Pantalla | Qué tiene |
| --- | --- |
| **Montacargas** | Clase y bajada |
| **Taller** | Variantes y mods |
| **Forja** | Overclocks y Forja de la Brigada |
| **Hazañas** | El tablero de logros |
| **Manómetro** | La PRESIÓN |
| **Vestuario** | Cosméticos, después del MVP |

## 13. Dirección de arte

### 13.1 Las referencias del usuario (2026-10-13)

El usuario pasó 20 imágenes: **«no necesariamente tienes que usar directamente las imágenes, pero sí tomarlas en
consideración para entender el diseño que espero»**. Son de terceros y no se suben al repo. Por eso quedan descritas
acá, con los colores medidos de cada una; si una sesión futura las necesita, se le piden de nuevo al usuario.

| # | Qué es | Qué se toma |
| --- | --- | --- |
| 1 | Pixel art (Daniel Cramer): mago encapuchado magenta con báculo de media luna verde, ojos verdes que brillan y fuego verde en la mano; fondo pizarra `#3d354c` | Cara oculta con ojos que brillan; un emisivo saturado (verde `#69c81d`) sobre una paleta corta; halo de píxeles escalonado |
| 2 | Pixel art: torre steampunk de tubos y cobre sobre el mar, con árboles y cascadas | La superficie (pantalla de título o la Boca del Pozo vista de afuera); tubos y depósitos como lenguaje de formas |
| 3 | Pixel art: cuatro clases de RPG chicas (bardo, mecánico con llave inglesa, arquera, maga violeta) | Una clase se reconoce por silueta y prop a ~50 px; cada una con su color |
| 4 | Pixel art oscuro: encapuchado de ojos rojos bajo ojos rojos gigantes, negro y pergamino | El rojo `#c92821` como peligro; el jefe final como ojo gigante; contraste extremo para los jefes |
| 5 | Pixel art: laboratorio de alquimista en piedra gris, con estantes, frascos verdes y velas | Salas de la Ciudad Hundida y el taller de la Boca del Pozo |
| 6 | Pixel art: un mismo encapuchado de báculo en estudios de valor (de gris a negro) y con el fuego en azul, naranja y violeta | **El diseño se resuelve en valores y el color mágico cambia por escuela** (§11.1) |
| 7 | Pixel art (NEO, Graffity Smash): encapuchado con cadenas, engranajes, faroles y fuego, en azul noche, carmesí y naranja | Steampunk + magia en un solo personaje; cadenas y engranajes como adorno de las armas |
| 8 | Set de íconos pixel: sombreros, gafas, escafandra, ropa, pistolas, cuchillos, herramientas, llaves y engranajes | Los íconos de gadgets y objetos de la tienda; la escafandra del Estibador |
| 9 | Pixel art: encapuchado con máscara y báculo-farol, capa verde desflecada y cuero | Cara oculta; báculo-farol (el Farolero); capas desflecadas con física |
| 10 | Pixel art (Feichtmeir): mago de sombrero y abrigo azul con ribetes dorados, cuadros de reposo y de conjuro con ráfaga | Cuadros de animación pocos y fuertes; un efecto que cruza la pantalla en un cuadro |
| 11 | Pixel art animado: mago de sombrero con armadura de cobre, capa y báculo de brillo verde | Sombrero de mago + armadura de cobre: la Magnetista |
| 12 | Pixel art: esqueleto de dragón de latón volando sobre una ciudad | EL DRAGÓN DE LA COMPAÑÍA (jefe de las Geodas) |
| 13 | Pixel art: un pozo vertical de tubos de cobre, engranajes y hornos que bajan en perspectiva, con vapor y una pasarela | **El POZO y la Fundición**: lo más parecido al juego; paleta de óxido `#88564a` y hornos `#d17647` |
| 14 | Ilustración: cueva de cristales turquesa con raptores de latón y un chico con gafas y farol-artefacto | **Las Geodas** y sus autómatas; la arcanita `#3bded3` |
| 15 | Hoja de personaje: chico de gafas verdes, chaquetón de cuero con frascos verdes y botas | La Perforadora; el verde ácido de la Alquimia |
| 16 | Ilustración: mago de sombrero ancho con armas rúnicas cian que flotan | Sombrero que tapa los ojos; runas emisivas; color plano limpio |
| 17 | Ilustración (EV Ganin): alquimista de chistera con gafas, entintado pesado y gris verdoso con un rojo | El Esgrimista; el estilo de los retratos ilustrados |
| 18 | Ilustración: mago de cara negra vacía con sombrero, capa blanca y báculo-farol, con luces cálidas | Cara vacía; pequeñas luces cálidas flotando como ambiente |
| 19 | Concepto: chamán-tecnológico de sombrero con plumas y máscara, piezas con luces naranjas y vendas | Mezcla de lo tribal y lo mecánico para la profundidad; emisivos en ranuras |
| 20 | Ilustración: elfo alquimista steampunk de delantal violeta, frascos de colores y tanques de latón | **La Buhonera** (la tienda) |

### 13.2 Brief

- **Siluetas.** Ver §7: la cara oculta (gafas, chistera, escafandra o sombrero de bruja), y la identidad en la cabeza
  y el arma.
- **Formas.**
  - Latón redondeado con remaches (curvas) contra hierro angular (rectas).
  - Tubos, depósitos y engranajes para lo de la compañía.
  - Capas y ruedos **desflecados** para los personajes.
  - Cristales facetados y runas para la magia.
- **Valores.**
  - El mundo es medio-oscuro y apagado.
  - Los personajes, oscuros y con la cara en sombra.
  - Lo más claro de la pantalla es siempre lo emisivo.
  - El blanco puro solo en los núcleos (el destello del parry, el centro de un brillo).
- **Paleta base** (medida en las referencias):

| Material | Tonos |
| --- | --- |
| Pizarra y hollín (fondos) | `#3d354c`, `#262531`, `#20202c` |
| Tinta (contorno) | `#1b1420` |
| Cobre y óxido | `#ab5c44`, `#88564a`, `#5c3839` |
| Latón | `#b88e44`, `#a57138`, `#906527`, `#583e20` |
| Cuero | `#5b3e2a`, `#291e18` |
| Piedra | `#79706f`, `#635a5b`, `#3f3f45` |
| Pergamino | `#dbbf9b`, `#d6cfbd` |

- **Emisivos** (lo único saturado):
  - la arcanita, turquesa `#3bded3`;
  - el color de cada escuela (§11.1);
  - el **rojo `#c92821`**, solo para el peligro (ojos de enemigos, telegrafías que no se devuelven);
  - el blanco, para lo que se devuelve.
- **Paleta por estrato** (la base cambia de tono y la luz, de color):

| Estrato | Base | Luz principal | Contraluz |
| --- | --- | --- | --- |
| Galerías | Carbón y cobre | Farol cálido `#ffb35a` | Pizarra fría |
| Geodas | Pizarra verdiazul (`#223332`, `#476c65`) | Arcanita | Lila |
| Fundición | Óxido (`#5c3839`, `#88564a`) | Hornos `#d17647` | Rojo profundo |
| Ciudad Hundida | Piedra gris y pergamino | Blanco y dorado `#f1ce49` | Azul niebla |

- **Ánimo:** aventura industrial con asombro mágico; los jefes, inquietantes (la referencia 4).
- **Retratos ilustrados**, que no son pixel art:
  - dónde: menús, elección de clase, la Buhonera, el arte de cada pergamino y las pantallas de jefe;
  - estilo: tinta y color plano con sombras duras (EV Ganin, la hoja del chico de las gafas);
  - cómo: el entintador 2D de la skill (`draw/ink.ts` de FILO) por código, en alta resolución.
  - Así cada clase tiene una cara pública, y en el juego se ve como sprite.

### 13.3 3D pixelado: cómo se hace

| Paso | Cómo |
| --- | --- |
| Resolución interna | Alto entre 340 y 420 px, elegido para que el alto de la pantalla sea múltiplo entero (1080 → 360 con ×3; 1440 → 360 con ×4; 720 → 360 con ×2); el ancho sale de la pantalla. El héroe de 1,7 m en 13 m de vista mide ~47 px |
| Luz toon | 3 bandas por material con la rampa de cinco tonos de la skill (base, sombra hacia violeta, oclusión, contraluz frío y brillo cálido). Luz principal del farol, contraluz en banda dura y, en el metal, una banda de brillo nítida (el latón tiene que «chispear») |
| Paleta | Cuantización final con una LUT 3D por estrato (24–32 colores + los emisivos). Tramado ordenado 4×4 solo en los degradés grandes (niebla, haces, cielo) |
| Contorno | Pasada a baja resolución con profundidad y normales: borde exterior de 1 px en tinta (o el tono de oclusión del material del lado de la luz: el *selout* de la skill §7), bordes convexos interiores aclarados y pliegues oscurecidos (la técnica de t3ssel8r). Sin casco invertido: a 1 px el posproceso es más limpio y más barato |
| Brillo | Bloom en la resolución baja, cuantizado en 2–3 escalones: un halo de píxeles como el báculo de la referencia 1, no un desenfoque suave |
| Cámara anclada | La posición se ancla a la grilla del plano de juego; se renderiza con 1 px de margen y la fracción se corre al ampliar (desplazamiento suave sin píxeles que bailan) |
| Ampliación | Vecino más cercano a factor entero; lo que sobra va en bordes |
| Animación | Cuerpos **en dos** (12 fps). Un **cuadro de smear** que llega de golpe (medialuna sólida de 2–3 colores: blanco, el color del arma o la escuela, tinta) y la pose de contacto sostenida. La física secundaria (capas desflecadas, cadenas, faldones) se calcula a 120 Hz y se muestrea al cuadro |
| Efectos | Partículas de 1–3 px, chispas, polvo de caricatura con contorno y explosiones de grisú de 3–4 colores. La receta de golpe de la skill (hitstop, destello, onda) con el sacudón en **píxeles enteros** |
| Interfaz | HUD en píxel (tipografía pixel, íconos de gadgets y objetos de 24 × 24 dibujados por código, como el set de la referencia 8) y menús con los retratos ilustrados |

**Rendimiento:** a ~360 px de alto el costo por píxel es mínimo. El teléfono va a rendir mucho mejor que FLECHAZO, que
renderiza a resolución completa; el presupuesto se va a los draw calls y a la geometría, no al relleno.

### 13.4 Mixto: qué sale de dónde

- **Packs CC0 (se evalúan en F4):** rocas, vigas, rieles, tubos, maquinaria y cajas. Candidatos: KayKit y los
  Quaternius ya medidos para HYPERFLOWGEON; inventario con `tools/assets-inventory.mjs`.
  - El pixelado, la luz toon y la LUT de paleta del estrato son los mismos para todo, así que **la mezcla no se nota**:
    el pipeline unifica más que cualquier textura.
  - Las texturas de los packs se ignoran (color plano por material).
- **Por código:** héroes, enemigos, jefes, armas, pergaminos, vetas y todos los efectos. Las técnicas son las de las
  mascotas de FLECHAZO (primitivas, tornos y extrusiones), con rig e IK propios.

## 14. Audio

Web Audio procedural, sin archivos (como en todo el sandbox):

- **Golpes:** metal y vapor.
- **Por mecánica:** silbido del dash, «tonc» del pogo, cadena del garfio, campanazo del parry.
- **Grisú:** el siseo antes de la explosión.
- **Música:** por pasos (la de VÓRTICE y CATAPUM), que suma capas con el combo y cambia por estrato.
- **Mezcla:** reverb de caverna generada por convolución.

## 15. Técnica

### 15.1 Base

- TypeScript en `games/grisu/`, con solo sintaxis borrable e imports con `.ts`, como CATAPUM y FLECHAZO.
- Three.js (ya es dependencia, con tipos de `@types/three`); colisión propia, sin Rapier.
- Se registra en `vite.config.js`, `tsconfig.json`, `npm test` y la portada.

### 15.2 Simulación pura y lista para co-op

- `src/sim/` corre en Node sin DOM, a 60 Hz, con datos planos que van y vuelven por JSON.
- Firma: `step(s, world, inputs[])`, con **un `Input` por jugador** desde el día 1.
- Azar con semilla en el estado: misma semilla y mismas entradas dan el mismo estado (test).
- El anfitrión es la verdad (como CATAPUM), así que se permite `Math.sin`.
- Hitstop por entidad. La cámara lenta del parry es solo visual y solo con un jugador.

### 15.3 Pisos por bloques

- Bloques ASCII diseñados a mano por tipo de piso, como `blocks.js` de DOWNCASTLE:
  - PASILLO: tramos de 24 × 12 celdas de 1 m;
  - POZO: tramos de 14 × 16;
  - SALA: plantillas enteras con tabla de oleadas.
- Los bloques se espejan y se encadenan con la semilla.
- Al cargar, se validan con asserts: medidas, caracteres conocidos y que **cada clase pueda atravesarlos**.

### 15.4 Bot y arneses

- `bot.ts`: un piloto por clase que usa la misma `Input`.
- `tools/simrun.mjs`: completa pisos y runs y mide tiempos, daño recibido, combos, uso de cada mecánica y economía.
- `tools/movelab.mjs`: alturas, distancias y envolventes de cada clase, como en CATAPUM.

### 15.5 Render y rendimiento

- `src/render/`: escena, rig de cámara anclada (§3), materiales toon con rampa por material, el pipeline de 3D
  pixelado (§13.3: render a baja resolución, contorno y bordes, brillo escalonado, LUT de paleta, ampliación con
  corrimiento subpíxel), modelos por código, animación en dos y efectos.
- `src/portraits/`: los retratos ilustrados en Canvas 2D con el entintador de la skill (copiado del kit, como hizo
  FILO).
- La resolución interna es fija por diseño (~360 px de alto), así que la resolución adaptativa de FLECHAZO no hace
  falta. Lo que se ajusta por calidad es el tamaño de las sombras, la cantidad de partículas y la distancia de los
  fondos. Lo aprendido de FLECHAZO en el teléfono:
  - ninguna transparencia grande con la cámara adentro;
  - instanciado para lo repetido;
  - sombras chicas.
- Meta: 60 fps en la compu y ≥ 45 fps en un teléfono medio.

### 15.6 Depuración y guardado

- `window.__grisu`: `state()`, `advance(n, input)`, `run(seed, clase)`, `floor(tipo, bloque)`, `auto(on)`, `give(...)`
  y `cfg`.
- AJUSTES generado desde `RANGES`, con «copiar JSON» (el patrón de HYPERFLOWGEON).
- Guardado en `grisu.save` (localStorage), con un `parse` que tolera datos rotos.

## 16. Alcance

### MVP: la rebanada vertical

- **Esgrimista y Estibador**, con las cuatro mecánicas.
- **Estrato 1 completo**: los tres tipos de piso, con bloques suficientes para que no se repita en 10 runs; sus cinco
  enemigos; la tienda y EL TOPO REY.
- **Pergaminos:** 4 escuelas, unos 24, más 3 malditos.
- **Tienda:** 6 gadgets y 6 objetos mágicos.
- **La Boca del Pozo:** mods de los niveles 1–3 y 1 variante por arma con su hazaña.
- **El arte final del estrato 1** en 3D pixelado, en compu y teléfono.
- **Los retratos ilustrados** de las dos clases, de la Buhonera y del Topo Rey.

Con esto se decide si el juego tiene alma antes de hacer los estratos 2–4.

### Después del MVP

- Perforadora y Magnetista.
- Estratos 2–4 con sus jefes.
- UMBRAMANCIA.
- El resto de las variantes, los mods de los niveles 4–5 y los overclocks.
- PRESIÓN, SIN FONDO y la Forja.
- El tutorial integrado en los primeros pisos.
- Después, el co-op de 2–4 por el relay de DOWNCASTLE.

## 17. Riesgos

1. **Gestos puros sin caminar** (SALA y POZO). Se prueba primero, en gris (F1). Plan B: esquema JOYSTICK opcional.
2. **Leer el parry a velocidad en una pantalla chica.** Telegrafías de 0,35 s como mínimo, colores reservados y prueba
   en el teléfono desde F1.
3. **El 3D pixelado.**
   - Titileo de lo que no está en el plano de juego con una cámara en perspectiva.
   - Legibilidad de un personaje de ~47 px con la cara oculta en una pantalla de teléfono.
   - Se prueba con un **ensayo de estilo en F1**, con un modelo gris y el pipeline completo, antes de hacer arte. Plan B
     del titileo: renderizar cada banda de profundidad en su capa.
4. **Alcance.** 4 clases × 3 variantes × 5 niveles de mods, 4 estratos y 4 jefes es mucho: el MVP corta a 2 clases y
   1 estrato.
5. **Cohesión del arte mixto.** Shader y paleta compartidos, y revisión con capturas en cada vuelta (el ciclo de
   revisión de la skill).

## 18. Preguntas abiertas (para confirmar)

1. ¿El nombre **GRISÚ** y los nombres de las clases (Remache, Don Válvula, Ancla, Bobina) te gustan?
2. **Caminata asistida** en la SALA: ¿hacia el enemigo más cercano o quedarse quieto hasta un gesto?
3. ¿Conservar **toda** la arcanita al morir?
4. ¿Lo incremental como **Forja de rangos infinitos + SIN FONDO** te alcanza, o quieres más «números que suben»
   dentro de la run?
5. ¿La **paleta por estrato** de §13.2 va bien, o algún estrato tiene que tener otro color de luz?
