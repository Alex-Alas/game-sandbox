# HYPERFLOWGEON — F0: diseño

Estado: **F0 cerrada en papel, lista para implementar F1.** Todas las decisiones de la §0 están resueltas
(las tuyas y, donde no dijiste nada, mis recomendaciones). Nada está implementado.
Plan de F1: [`plans/2026-10-06-hyperflowgeon-f1.md`](../plans/2026-10-06-hyperflowgeon-f1.md).
Inventario de assets: [`assets/MANIFEST.md`](../../../assets/MANIFEST.md) (todo medido sobre los archivos desde
2026-10-06; ver §6.1 para lo que cambió respecto de lo supuesto).

**Nombre:** HYPERFLOWGEON = *hyper* (hype) + *flow* (estado de flujo) + *dungeon*. Carpeta
`games/hyperflowgeon/`, assets en `public/hyperflowgeon/`, mismo repo.

## 0. Decisiones (cerradas)

| # | Decisión | Resolución | Origen |
|---|---|---|---|
| D1 | Concepto de mundo | **Multiverso de estereotipos, tipo D&D**: una mazmorra viva con un reino por cultura. Arranca con piratas, vaqueros, vikingos y nativos latinoamericanos, cada uno con su mitología (§3). Reemplaza a Ciudad Faro / Puerto Niebla / Santelmo | tuya |
| D2 | Nombre | **HYPERFLOWGEON** | tuya |
| D3 | Línea de personajes | Solo Quaternius (UBC + Outfits + UAL 1/2). KayKit Character Animations queda sin uso | recomendación |
| D4 | Ropa | Ya no hay época que respetar, pero **Outfits Fantasy solo trae Peasant y Ranger** (medido): no hay armadura vikinga ni ropa de ninguna cultura. Todo lo cultural (sombreros, cascos, pecheras, capas, máscaras) se modela nosotros sobre UBC + Peasant/Ranger; se evalúa pagar el PRO (§6.1) | ajustada por D1 y por la medición |
| D5 | Huecos de assets | Enemigos = humanoides UBC + objetos poseídos; armas propias; se aprueba **Fantasy Props MegaKit** para objetos lanzables y rompibles | recomendación |
| D6 | Packs brutos | `assets/packs/` fuera de git. **Resuelto:** el acceso a Drive ya funciona y los 7 packs Quaternius están bajados y medidos | recomendación |
| D7 | Arquetipos | 1B + 2A + 3B + 4A, **renombrados como héroes de cada cultura** (§4) | recomendación + tu pedido de nombres |
| D8 | Lenguaje de color de gameplay | Aprobado como estaba (§5) | recomendación |
| D9 | Hitstop con varios jugadores | Por entidad; global solo en remates de PVE de un jugador | recomendación |
| D10 | Ataque pesado | Direccional (ATAQUE + ↑ lanza, ↓ en el aire pica, corriendo embiste) | recomendación |
| D11 | Determinismo | Matemática propia (solo `+ − × ÷ √` y trigonometría propia) **desde F1**, con test | recomendación |
| D12 | Dónde vive el código | `games/hyperflowgeon/` en **este** repo, TypeScript solo en esa carpeta | tuya |
| D13 | Partir F2 en dos entregas | Sí (§9) | recomendación |

## 1. Contradicciones y riesgos frente a los pilares

1. **Dos estilos de personaje.** UBC de Quaternius tiene proporciones humanas y ~13 k tris; el rig de KayKit
   es cabezón y sus animaciones retargeteadas a UBC se deforman. → Personajes solo Quaternius (D3). Los
   entornos KayKit se unifican con un material toon propio (§5).
2. **Cuatro culturas en un solo estilo.** Estereotipo no es lo mismo que mezcla: si cada reino usa su propia
   paleta, su silueta y sus accesorios pero el mismo shader toon, el juego se lee como un solo mundo variado.
   Sin ese shader común sería un collage. → Un material toon, una paleta base por reino (§5).
3. **Cultura sin caricatura.** El brief pide nivel superficial, y está bien: tricornio, sombrero vaquero,
   casco con cuernos y máscara de águila son guiños reconocibles. Pero «nativos latinoamericanos» no es un
   pueblo: es cientos. → Reglas de tratamiento en §3.3 (cada pieza nombra su pueblo; nada sagrado como
   botín ni como chiste).
4. **Hitstop de 50–120 ms con 4 jugadores (contra pilar 2).** → Por entidad (D9).
5. **Telegrafiado (pilar 3) en PVP.** Un ligero de ≤ 100 ms no se puede telegrafiar 300–600 ms. Lo acepto: en
   PVP la claridad sale de poses legibles, audio por ataque y repetición de la muerte (gratis con simulación
   determinista).
6. **Ligero ≤ 100 ms con 4 botones.** → Pesado direccional (D10): el ligero sale al apretar.
7. **Determinismo entre navegadores.** `Math.sin/cos/atan2/exp/pow` no dan los mismos bits en Chrome/Android
   y Safari/iOS; el rollback de F5 se desincronizaría. → D11, con un test que vigila que la simulación no
   llame a `Math.*` no exacto. Rapier 2D usa la build `rapier2d-deterministic-compat`.
8. **Auto-aim táctil contra mouse en PVP cruzado.** → En PVP toda entrada se reduce a 16 direcciones con el
   mismo magnetismo.
9. **60 fps en gama media contra cel shading con contornos.** → Contorno de casco invertido solo en personajes
   y objetos interactivos (de paso destaca lo jugable); escenario sin contorno; capas lejanas como impostores.
10. **Runs de 30+ min en móvil.** → El estado de la simulación son datos planos desde F1: suspender =
    serializar. Regla de arquitectura, con test de ida y vuelta.
11. **Vuelo en PVP corto.** Condiciona las arenas de F4 (verticalidad y techo), no F0–F1.
12. **Medieval Hex a escala de maqueta** (casa 0,93 de alto). Agrandado 5–8× se ve tosco de cerca: sirve para
    muros, torres y siluetas lejanas (Fiordos y fondos de la Frontera), no para detalle cercano.
13. **Alcance de F2.** Cuatro héroes, cuatro herramientas y 12 interacciones es más que todo F1. → Dos
    entregas (D13).
14. **Animación de los héroes (medido).** UAL 1+2 traen 86 clips (43 + 43) y cubren bien a Freydis y a Calicó,
    pero **no hay planeo, picada, tirón, columpio ni escalada de pared**: Cuauhtli y La Calamidad necesitan
    poses y movimientos propios (§4.7). Las animaciones de Quaternius no traen *frame data*: la simulación
    manda y el clip se estira a los cuadros del ataque.
15. **Polycount y huesos de los personajes (medido).** UBC 14–15 k tris, Ranger completo 27 k tris y 10 draw
    calls, rig de 65 huesos contra un presupuesto de ~6 k tris y ≤ 60 huesos. Hace falta un paso de build:
    simplificar con meshoptimizer, fusionar materiales y quitar huesos de dedos (los clips se recortan al
    mismo esqueleto).
16. **Alcance del mundo.** Cuatro reinos × (bioma + enemigos + jefe + héroe) es mucho contenido. → Cada reino
    es **datos + assets, no sistemas** (§3.4): F1–F2 juegan en un solo escenario de práctica; los reinos entran
    de a uno desde F3 y el primero (Mares) se termina antes de empezar el segundo.

## 2. GDD breve

**Fantasía:** sos un corredor que entra a la mazmorra viva para perseguir el flujo: encadenar movimiento y
golpes a toda velocidad sin soltar nunca el control, mientras el público invisible de la mazmorra se
entusiasma (hype) o se aburre.

**Estructura (orden de construcción):** sandbox de práctica (F1–F2) → run roguelite PVE (F3) → PVP asíncrono y
local (F4) → PVP online con rollback (F5).

**Bucles:**
- *Momento a momento (5–10 s):* moverse → leer el telegrafiado → elegir respuesta (esquivar, anclarse,
  golpear, redirigir) → conectar → ganar MOMENTUM → gastarlo → subir el rango de estilo.
- *Encuentro (30–90 s):* arena con 2–3 roles de enemigo y un entorno con propiedades legibles; siempre hay más
  de una solución (pilar 1).
- *Run (30–45 min):* un reino por run (o dos mezclados en modo avanzado), 4–5 tramos de 3–5 encuentros, un
  evento y un jefe; fogatas del Mesón como puntos de guardado; suspender en cualquier momento.
- *Meta:* PVE con progresión vertical; PVP solo sidegrades, maestría y cosméticos.

**HYPE (el medidor del público).** Es la capa de presentación del medidor de estilo (D·C·B·A·S): variedad de
acciones sube el hype, repetirse lo baja. El Maestro (§3.1) comenta en texto corto en pantalla. A rango alto
el reino reacciona (cielo, música en capas, público). No añade reglas: es feedback del estilo.

**Rejugabilidad de la run (detalle en F3):** ofrendas que modifican reglas compartidas (p. ej. «lo LANZADO
explota al chocar una pared»), así cada build cambia sistemas y no solo números; rutas que se bifurcan;
eventos (feria = tienda, apuesta del Maestro = riesgo/recompensa); mutadores propios de cada reino (marea
alta, tormenta de polvo, ventisca que corta el planeo, calor que apaga las anclas de hielo). Objetivos:
combate, carrera de traversal contra un fantasma, cacería de jefe, control de zona, desafío de estilo.

### Controles

| Acción | Móvil (híbrido) | Teclado + mouse | Gamepad |
|---|---|---|---|
| Mover / apuntar | joystick izquierdo | WASD / flechas; el mouse elige dirección si se mueve | stick izquierdo |
| SALTO | botón | Espacio | A |
| ATAQUE (ligero; direccional = pesado) | botón | J / clic izquierdo | X |
| MOVIMIENTO (habilidad del héroe) | botón | K / Shift | RB / RT |
| HERRAMIENTA (secundaria) | botón | L / clic derecho | LB / LT |
| Atajos opcionales | deslizar = dash direccional, deslizar ↓ en el aire = picada | — | — |

Auto-aim: cono de 35° en la dirección del joystick; prioridad amenaza > anclable > objeto. Botones de al menos
12 mm, reubicables y escalables (como el ajuste de tamaño de VÓRTICE). Todo remapeable.
*(Cerrado en F1, paso C, 2026-10-07: el cono es de cada perfil del garfio, 8–18°, no 35°; como todo es anclable, la
prioridad quedó amenaza > esquina > superficie, con el imán a enemigos prendido y el de esquinas y las 16 direcciones
apagados fuera de PVP.)*

### Reglas sistémicas

**MOMENTUM** (0–100, tres segmentos). Pasivo: daño ×(1 + 0,5·M/100) y +15 % de velocidad máxima a 100. Cada
héroe lo gana y gasta distinto (§4). Se pierde al recibir un golpe (−25) y decae tras 1,5 s quieto.

**Estados compartidos** (valen igual para jugadores, enemigos y objetos):

| Estado | Entra | Efecto | Interacción clave |
|---|---|---|---|
| AÉREO | sin suelo (coyote 100 ms) | 1 acción aérea que se recarga al tocar suelo, anclarse **o conectar un golpe** | golpear en el aire te mantiene en el aire |
| ANCLADO | cable, pared o riel | no lo empujan los golpes: tensan | EN PICADA corta cables |
| LANZADO | impulso externo fuerte (golpe, tirón, explosión) | sin control; daña lo que choca según velocidad; rompe rompibles; **es rebotable 0,3 s** | permite usar enemigos como trampolín o como bala |
| ATURDIDO | golpe pesado, choque de LANZADO, electricidad | sin acciones; ícono + pose; se acorta si se repite | remates bonificados |
| EN PICADA | caída dirigida | armadura contra ligeros; onda al impactar según velocidad; recuperación cancelable con salto | rompe pisos rompibles |

**Entorno con propiedades legibles** (cada propiedad = un color y una forma; un objeto puede tener varias):
anclable (ganchos, vigas, cornisas, mástiles; *desde F1 paso B todo es anclable: la propiedad pasa a ser «no
anclable», una superficie lisa que se agrega solo si un nivel la pide*), rompible (pisos, tablones, cajas), lanzable (barriles, sillas,
enemigos livianos), rebotable (velas, toldos, colchones, campanas), deslizable (rieles, cables tensos,
barandas, jarcias, paredes lisas).

**Métricas base** (simulación a 60 Hz):

| Métrica | Valor | Cuadros |
|---|---|---|
| Startup ligero | ≤ 100 ms | ≤ 6 |
| Startup pesado | ≤ 250 ms | ≤ 15 |
| Recovery | cancelable con SALTO o MOVIMIENTO | — |
| Coyote time | ~100 ms | 6 |
| Buffer de entrada | ~120 ms | 7 |
| Telegrafiado enemigo | 300–600 ms (pose + color + audio) | 18–36 |
| Hitstop | 50–120 ms según peso | 3–7 |

**Feedback:** hitstop por entidad, sacudida de cámara por «trauma» (ajustable), partículas, audio en capas
(transitorio + cuerpo + cola; más capas con más momentum), destello en el golpeado, medidor de estilo/HYPE.
Sin números de daño flotantes.

## 3. El mundo: HYPERFLOWGEON

### 3.1 Premisa

Bajo todos los mundos hay una mazmorra que nunca terminó de construirse: el **Hyperflowgeon**. Se alimenta de
*hype*: cada vez que alguien, en cualquier ficción, hace algo con estilo, la mazmorra gana un piso. Con los
siglos se volvió un multiverso apilado de estampas reconocibles —un mar de piratas, un desierto de vaqueros,
un fiordo de vikingos, unas tierras de sol y selva— y cada piso es un reino con su cielo, su gente y sus
monstruos de leyenda. Un narrador sin cuerpo, **el Maestro** (guiño al Dungeon Master), relata y apuesta a
favor o en contra de los corredores: entran porque quien encadena el flujo sin soltarlo se lleva el hype del
público, que es la moneda de la mazmorra.

- **El Mesón del Maestro:** taberna entre pisos, hub de la run, de entrenamiento y de los puntos de guardado.
  Su patio es el escenario de F1–F2 (maquetas de madera, Prototype Bits). Cada reino tiene una puerta.
- **Tono:** aventura de mesa, humor de estereotipo cariñoso, ritmo punk-arcade. Nada de lore profundo: cada
  reino se entiende en una pantalla.
- **Facciones:** en cada reino, una autoridad que cuida su piso (antagonista local), el pueblo del lugar
  (aliado ambiguo) y los monstruos de leyenda (neutrales o jefes). Los corredores son de afuera.

### 3.2 Los cuatro reinos de partida

| Reino | Cultura | Bioma y arquitectura | Mitología y bestiario | Jefe (F3, a medida) | Héroe |
|---|---|---|---|---|---|
| **Mares de Calavera** | Piratas (Edad de Oro, Caribe romantizado) | puerto-taberna, galeón varado, arrecife, cueva de tesoro; jarcias y mástiles (anclables y deslizables), barriles, velas (rebotables), cañones | Kraken, Davy Jones y su tripulación, Holandés Errante (barco fantasma), sirenas, esqueletos de tesoro, loros y gaviotas espectrales | **El Kraken** | Calicó |
| **Frontera del Polvo Rojo** | Vaqueros (Far West de película) | pueblo fantasma, cañón con puentes, mina con rieles, tren; postes, vigas, rieles, toldos, barriles de pólvora | Jackalope, buitres, pistoleros espectrales, el Diablo del Cruce (trato de encrucijada), bandidos de la mina, toros bravos | **El Tren Fantasma** | La Calamidad |
| **Fiordos del Fin** | Vikingos (sagas nórdicas, casco con cuernos incluido) | salón de hidromiel, drakkar, fiordo helado, árbol del mundo; vigas de salón, cadenas, hielo (deslizable), escudos | Draugr, gigantes de hielo, cuervos de Odín, valquirias, Fenrir y Jörmungandr, runas | **Jörmungandr** | Freydis |
| **Sol Alto** | Nativos latinoamericanos: pueblos concretos, no uno genérico (§3.3) | pirámides escalonadas, selva y cenote, terrazas de sierra; escalones, lianas, puentes colgantes, juego de pelota | Camazotz y Xibalbá (maya), nahuales y colibrí/águila (mexica), Cadejo y Chaneques, Curupira y Mapinguari (guaraní/tupí), Supay (andino) | **Camazotz** | Cuauhtli |

Final de la mazmorra: **el Núcleo del Hype** (F3+, a definir cuando haya reinos suficientes). Su jefe cierra la
run larga que mezcla reinos.

**Roles de enemigo (comunes, con piel por reino).** Los roles son sistema; la piel es dato.

| Rol | Se lee por | Mares | Frontera | Fiordos | Sol Alto |
|---|---|---|---|---|---|
| Embestidor | corre derecho; telegrafía agachándose | marinero con barril | toro bravo | draugr con hacha | guerrero-jaguar |
| Tirador | brazo extendido + línea de mira bermellón | artillero de mano | pistolero | arquero draugr | cerbatanero |
| Blindado | escudo grande; hay que aturdirlo o picarlo | pavés de abordaje | bandido con tapa de barril | escudero | guerrero con chimalli |
| Volador | silueta alada; pasa en barrida | loro/gaviota espectral | buitre | cuervo | murciélago (camazotz menor) |

F1–F2 usan solo dummies de Prototype Bits (sin rol real); F3 trae los roles con piel del primer reino.

### 3.3 Cómo tratamos cada cultura

1. **Guiño reconocible, no burla.** El estereotipo es la puerta de entrada (tricornio, sombrero vaquero, casco
   con cuernos, máscara de águila); el detalle viene de la mitología real y se investiga con fuentes del
   propio pueblo cuando existan.
2. **Cada pieza nombra su pueblo.** En Sol Alto, Cuauhtli y su entorno son mexicas; Xibalbá y Camazotz, mayas;
   Curupira y Mapinguari, guaraní/tupí; Supay, andino. Nunca se funden en una sola «tribu»; los próximos
   héroes de este reino serán de pueblos distintos (la Reserva, §4.6).
3. **Nada sagrado como botín, chiste ni cosmético comprable.** Sin rituales reales como mecánica de daño, sin
   gore de sacrificios, ni objetos sagrados como skin de tienda. Criaturas y mitología narrativa: sí.
4. **Revisión con sensibilidad.** Antes de F3 se revisan los reinos con el usuario, uno por uno, en una nota
   corta por reino.

### 3.4 Un reino es datos y assets, no sistemas

Para que sumar ninjas, samuráis, romanos, ángeles, aliens o dragones (la lista abierta del brief) sea barato,
un reino se define en `src/realms/<id>.ts` como datos: paleta y shader params, kit de piezas del escenario,
pieles de los 4 roles de enemigo, jefe, mutadores, música (semillas del audio procedural) y puerta del Mesón.
**Regla:** ningún reino puede requerir una regla nueva; si la pide, esa regla se discute como sistema
compartido y vale para todos los reinos. Checklist de un reino nuevo: paleta, 4 pieles, 1 jefe, 2 mutadores,
1 héroe como variante de kit (§4.6), 1 evento, 30 s de audio.

### 3.5 Conceptos descartados

Ciudad Faro (folclore centroamericano de 1938), Puerto Niebla (galaico-portugués) y Ciudad Santelmo (filipino)
quedan como reinos futuros posibles: sus mitologías (Cadejo, Santa Compaña, aswang y tikbalang) encajan en la
estructura de §3.4 sin rehacer nada.

## 4. Héroes (arquetipos)

Cada héroe es un **arquetipo de movimiento + una cultura**. Los nombres de trabajo están inspirados en
personajes de la tradición de cada reino (la Anne Bonny / Calico Jack de los piratas, Pecos Bill y Calamity
Jane, las valquirias y Freydís de las sagas, Cuauhtémoc «el águila que desciende»), sin copiar a ninguna
persona real. Cada jugador elige héroe y **una herramienta secundaria de otro héroe** (12 combinaciones);
cosméticos y variantes de kit vienen después.

Vocabulario común (los verbos del sistema; la piel cambia el nombre en pantalla): **IMPULSO** (empuje
instantáneo), **TIRÓN**, **PASO** (paso de sombra), **LANZAR** (proyectil que rebota y vuelve).

### 4.1 Cuauhtli · VUELO · Sol Alto (mexica)

El águila que desciende. Planeo con cabeceo (joystick ↑↓); energía = altura + velocidad (picar suma, subir
gasta); bajo la velocidad mínima entra en pérdida (cae, no ataca, un golpe lo aturde); los golpes en picada
escalan con la velocidad.

- **Kit (1B):** 3 IMPULSOS = aleteos de colibrí, empuje instantáneo en la dirección del joystick (salir de
  pérdida o embestir); conectar recarga impulsos; aterrizar en picada = *caída del sol* (onda de calor).
- *Momentum:* gana con velocidad sostenida y golpes en picada; gasta en impulsos extra y en la pasada solar.
- *Combos:* picada → golpe que lanza arriba → convertir velocidad en altura → segunda picada antes de que
  caiga; rasante sobre un riel → grind → salir con impulso; impulso contra un aturdido → lo estrella en un
  rompible.
- *Progresión PVE:* Altura (menos pérdida), Picada (onda mayor), Plumaje (rastro que quema y chispas).
  *PVP:* elegir 2 impulsos de 4.
- *Salvaguarda:* que el IMPULSO no reemplace al planeo (gasta energía y tiene recarga por conexión).

### 4.2 La Calamidad · GRAPPLE + ARMA DE CUERDA · Frontera (vaquera)

Vaquera de pecado y de soga larga. MOVIMIENTO dispara el garfio de la reata a lo anclable o enemigo del cono,
con las cinco habilidades del brief en este orden de prioridad:
1. **Tirón** (Titanfall): recoge cable con aceleración; soltar conserva la velocidad; soltar con SALTO suma
   impulso.
2. **Enganchar enemigo** (Scorpion): liviano viene a vos, pesado te lleva a él; ATAQUE mientras está
   enganchado lo lanza hacia donde apunta el joystick (LANZADO).
3. **Columpio:** ancla arriba sin recoger = péndulo de largo fijo.
4. **Arma con cuerda** (GoW): el cuchillo bowie atado a la reata se lanza, se clava en paredes (un ancla
   propia) y vuelve golpeando lo que cruza.
5. **Doble anclaje** (AoT): progresión tardía (después de F2).

- **Kit (2A):** garfio de reata + bowie atado. Si el cable toca un ancla **conductora** (rieles de mina,
  pararrayos, cadenas de hierro), lo enganchado queda aturdido.
- *Momentum:* gana con tirones encadenados sin tocar el suelo y con enemigos lanzados que pegan contra algo;
  gasta en tirón a máxima tensión (atraviesa enemigos).
- *Combos:* tirón → soltar con salto → patada voladora con toda la velocidad; enganchar a A y lanzarlo contra
  B → tirón hacia B; clavar el bowie en una pared lejana → tirón hacia el arma → recogerlo golpeando todo en
  el camino.

### 4.3 Freydis la Loba · IMPULSO MELEE · Fiordos (vikinga)

Guerrera que lleva a Fenrir en la sombra. Salto explosivo (se carga mientras corrés, nunca parado), picada
desde cualquier altura, PASO corto (el destino se telegrafía 100–150 ms) y momentum por cada golpe conectado.

- **Kit (3B):** la sombra del lobo aparece primero y te jala (telegrafiado natural); picada de zarpas;
  cadenas de Gleipnir como agarre corto; con momentum alto, forma parcial de ulfhednar (más alcance) sin
  animación larga.
- *Momentum:* el que más gana por golpe; gasta en PASOS extra y picada potenciada.
- *Combos:* PASO detrás → lanzador ↑ → salto explosivo → picada que rebota al enemigo contra el suelo
  (LANZADO otra vez) → PASO al rebote; picada sobre piso rompible = abrir ruta con los enemigos cayendo
  aturdidos; PASO a través de un proyectil (invulnerabilidad breve y visible).

### 4.4 Calicó · VELOCIDAD A RAS DE SUELO · Mares (grumete)

Grumete de cubierta sobre un tablón de abordaje con ruedas de cureña. Acelera en bajada y manteniendo
dirección; grind y wall-ride en deslizables (jarcias, barandas, rieles de cureña); el golpe escala con la
velocidad.

- **Kit (4A):** ollie, grind automático al caer sobre un deslizable (sin minijuego de equilibrio), derrape que
  barre; **bala encadenada**: dos balas de cañón unidas por una cadena que rebotan en paredes y enemigos y
  vuelven.
- *Momentum:* velocidad sostenida y trucos (grind largo, rebotes encadenados); gasta en bala encadenada de
  fuego (perfora) y derrape largo.
- *Combos:* grind en la jarcia → salto → bala encadenada hacia abajo que rebota en tres enemigos → recogerla
  en el aire; embestir a un aturdido = «chuza» (sale LANZADO por el suelo como bola de boliche); derrapar
  alrededor de un mástil con la bala en órbita.

### 4.5 Herramienta secundaria

| Herramienta | Viene de | Versión reducida |
|---|---|---|
| Alas plegables | Cuauhtli | 1,5 s de planeo y 1 impulso por salto |
| Garfio corto | La Calamidad | 1 tirón a ancla o enemigo, sin columpio; recarga 3 s |
| Paso de sombra | Freydis | 1 paso de 3 m; recarga 4 s |
| Bala encadenada | Calicó | rebota 2 veces y vuelve |

### 4.6 Reserva de kits

Las opciones que no entraron no se pierden: son los próximos héroes de reinos nuevos (cada uno con su
cultura): *1A Zopilote / 1C Barrilete* (Sol Alto, otros pueblos), *2B Arriero* (Frontera), *2C Campanero*
(reino de monjes o samuráis), *3A Historiante* (reino de bailarines o romanos), *3C Cargador* (Fiordos),
*4B Mensajero* (reino ninja), *4C Pelotero* (juego de pelota mesoamericano, Sol Alto; el más caro de leer).
Se construyen después de F5, o antes si el usuario lo pide.

### 4.7 Cobertura de animación (medida en UAL 1 y 2)

| Héroe | Qué hay en los clips | Qué hay que hacer nosotros |
|---|---|---|
| Freydis | `Sword_Regular_A/B/C` + `_Rec`, `Sword_Heavy_Combo`, `Sword_Dash`, `Punch_*`, `Melee_Hook`, `NinjaJump_*` (salto explosivo), `Roll`, `Hit_Knockback` | casi todo está; el PASO de lobo y la picada de zarpas |
| Calicó | `Slide_Start/Loop/Exit` (grind), `Roll`, `Sprint_Loop`, `NinjaJump_*`, `Jump_*` | postura sobre el tablón y la bala encadenada |
| La Calamidad | `Pistol_Aim_Up/Neutral/Down` (apuntado del garfio), `OverhandThrow` (bowie), `Idle`, `Jump_*` | pose de tirón y de columpio (control de huesos por código sobre un clip base) |
| Cuauhtli | solo `Jump_Loop` y `NinjaJump_Idle_Loop` como base | planeo, cabeceo, picada, pérdida, impulsos: poses procedurales con control de huesos por código |
| Enemigos | `Zombie_*`, `Hit_*`, `Sword_*`, `Shield_*`, `Punch_*` | voladores y jefes a medida |

Los clips no traen *frame data*: la simulación es la autoridad y cada animación se estira para que el
momento de impacto coincida con el cuadro del golpe. Cuauhtli y La Calamidad son los que más trabajo de
animación necesitan, y La Calamidad es el héroe de F1.

### 4.8 Interacciones cruzadas (2+ por par)

Cada una sale de una regla compartida, no de un caso programado aparte (pilar 1). Funcionan entre la
herramienta principal y la secundaria del mismo jugador y entre jugadores.

| Par | Interacción | Regla que la produce |
|---|---|---|
| Vuelo–Grapple | Enganchar un ancla en plena picada convierte la caída en péndulo y te dispara hacia arriba | la cuerda conserva la velocidad tangencial |
| Vuelo–Grapple | Enganchar a un planeador: si va más rápido de lo que recoge el cable, te remolca; si va más lento, entra en pérdida y queda LANZADO | la tensión se resuelve por masa × velocidad |
| Vuelo–Melee | Picada sobre un ATURDIDO = remate ×2 | ATURDIDO + EN PICADA |
| Vuelo–Melee | El salto explosivo lanza enemigos hacia arriba; el volador rebota sobre ellos y recupera altura | lo LANZADO es rebotable 0,3 s |
| Vuelo–Suelo | Pasar rasante sobre un riel en ángulo bajo entra en grind sin perder velocidad | deslizables para cualquiera que llegue rápido y rasante |
| Vuelo–Suelo | La bala encadenada le quita sustentación a un planeador | los proyectiles que rebotan transfieren impulso |
| Grapple–Melee | Un enemigo enganchado está ANCLADO: los golpes no lo alejan y el combo no se escapa | ANCLADO tensa en vez de empujar |
| Grapple–Melee | Una picada sobre un cable tenso lo corta (defensa contra grapplers; el enemigo columpiándose cae) | EN PICADA corta ANCLADO |
| Grapple–Suelo | El doble anclaje (o bowie clavado + garfio) tiende un cable que el grumete usa como riel | todo cable tenso es deslizable |
| Grapple–Suelo | Engancharse a algo en movimiento (grumete, tren, bala encadenada) te transfiere su velocidad: remolque | anclarse a un cuerpo en movimiento hereda su velocidad |
| Melee–Suelo | La onda de una picada levanta todo lo lanzable, balas encadenadas incluidas, contra los enemigos aéreos | la onda empuja lanzables |
| Melee–Suelo | Embestir a un ATURDIDO lo convierte en proyectil a ras del suelo que derriba a otros | LANZADO daña lo que choca |

## 5. Estética

**Render:** cel shading de 2 bandas + luz de borde; contorno solo en lo jugable; fondos entre 15 y 40 % de
valor, personajes entre 40 y 70 %; los acentos saturados quedan reservados al gameplay. Niebla por altura (la
técnica de ELYTRA).

**Lenguaje de color de gameplay (D8, aprobado).** Siempre color **y** forma, para daltónicos y para no pelear
con los colores de los jugadores:

| Significado | Color | Forma |
|---|---|---|
| Peligro / telegrafiado | bermellón `#FF3B30` | dientes, rombo que se cierra |
| Anclable | jade `#2EE6D6` | anillo |
| Rompible | ámbar `#FFB020` | grietas |
| Rebotable | magenta `#FF4FD8` | ondas de resorte |
| Deslizable | hueso `#F2F2E8` | chevrones |
| Momentum / recurso | oro `#FFD84A` | rombo de tres segmentos |
| Jugadores 1–4 | color de contorno + marcador ▲ ● ■ ◆ | en PVP, los ataques rivales se telegrafían en bermellón sin importar quién los hace |

**Paleta base por reino** (desaturada; nunca usa los acentos de arriba como dominante):

| Reino | Cielo / luz | Dominantes (valor 15–40 %) |
|---|---|---|
| Mares de Calavera | atardecer violáceo, luz de farol | añil `#2E3A55`, madera mojada `#4A3B30`, sal `#8A8F94` |
| Frontera del Polvo Rojo | mediodía polvoriento | arcilla `#6B4638`, ocre `#8A7348`, hierro `#3A3740` |
| Fiordos del Fin | aurora fría | pizarra `#3C4650`, hielo `#7C8C98`, pino `#2F3F33` |
| Sol Alto | amanecer dorado entre nubes | selva `#2F4033`, piedra caliza `#8A7F72`, tierra `#5B4A42` |

Mesón del Maestro: carbón `#1B1A1F`, ceniza `#3A3740`, madera cálida (luz de hogar).

**Un material toon para todo.** El pipeline rematerializa cada pack con el mismo shader: la textura original
solo distingue material (madera, piedra, metal, tela, vidrio) y el color sale de la paleta del reino. Así
KayKit (Hex, Furniture, Prototype) y Quaternius (Nature, Props) se unifican, y un reino nuevo solo trae paleta.
Downtown City MegaKit (urbano moderno) queda en reserva para un futuro reino de ciudad neón o alienígena; no
se usa en los cuatro reinos de partida.

**Capas 2.5D:** fachadas y decorados en el plano de juego; capa media a 10–30 m instanciada; capas lejanas
horneadas como impostores.

**Personajes:** UBC + piezas de Outfits Fantasy + accesorios propios de cada cultura, low-poly con atlas
compartido (lista en §6).

## 6. Huecos de assets

| Hueco | Opciones | Resolución |
|---|---|---|
| Enemigos 3D | humanoides UBC + Outfits + máscaras y accesorios propios (rol leído por silueta) · objetos poseídos de Furniture, Prototype y Fantasy Props · criaturas a medida para jefes | **humanoides + objetos poseídos** desde F3; **jefes a medida** (Kraken, Tren Fantasma, Jörmungandr, Camazotz) en F3 una vez por reino |
| VFX | procedurales en shader + partículas instanciadas propias; texturas CC0 solo como máscaras | **procedurales** |
| Audio | procedural con Web Audio + bancos CC0 filtrados; música compuesta o encargada | **procedural + CC0**; música por reino en F3 (marimba, acordeón y cuerdas, tambores, sea shanties como semillas) |
| Armas y props de cultura | modelarlas (100–500 tris, atlas compartido) · Fantasy Props MegaKit · armas KayKit Adventurers | **modelarlas** las de los héroes; **Fantasy Props** para lanzables y rompibles |

**Accesorios propios a modelar** (F2–F3, atlas compartido): tricornio, parche y sable corto (piratas);
sombrero vaquero, pañuelo, revólver y bowie (vaqueros); casco con cuernos y capa de piel (vikingos); máscara de
águila y adornos de plumas no sagrados (mexicas); cañón de mano, barril, bala encadenada.
Escenario propio: jarcia y mástil, riel de mina, poste, cadena, tablón de abordaje, escalón de pirámide.

### 6.1 Lo medido en los packs Quaternius (2026-10-06)

| Supuesto del spec | Realidad |
|---|---|
| UBC: 6 cuerpos, 20 peinados | **2 cuerpos** (Superhero M/F) y 6 peinados + barba + cejas; el resto es del pack de pago |
| Outfits Fantasy: 12 trajes en 62 partes | **4 trajes** (Peasant y Ranger, H/M) en 24 piezas; sin armaduras de caballero ni vikingas |
| UAL: 45 + ~91 clips | **43 + 43 = 86 clips**, con `Slide_*` (grind), `Sword_*` (combos), `Hit_Knockback`, `Pistol_*`, `Zombie_*`, `Shield_*` |
| Rigs compatibles | **Confirmado**: 65 huesos con nombres idénticos en UBC, Outfits y UAL 1 y 2 |
| Licencia CC0 | **Confirmada** en el texto de cada pack (`License_Standard.txt`) |
| Nature para selvas y desiertos | árboles, pinos, árboles muertos y retorcidos, rocas y textura de desierto; **sin cactus ni palmeras** |
| Fantasy Props para armas y lanzables | 94 modelos: espada, hacha, pico, escudo, barril, cajas, cofre, monedas, cadena, sogas, yunque, estandartes; **sin cañón, arma de fuego, sombrero ni casco** |

**Qué cambia en la práctica:**
- El PRO de UBC y de Outfits resolvería parte del vestuario, pero igual no trae cultura pirata, vaquera o
  mexica: **el vestuario cultural es trabajo propio en cualquier caso**. El PRO se evalúa solo si el costo de
  modelar ropa completa supera su precio; no es prerrequisito de F1–F2.
- Reino por reino con lo que ya hay: *Fiordos* = el más cubierto (Pine, Axe, Shield, Banner, Barrel, rocas;
  casco y capa de piel propios). *Mares* = Barrel, Chest, Coin_Pile, Chain, Rope, Crate; faltan velas,
  mástiles, cañón y tricornio. *Frontera* = Barrel, Crate, Pickaxe, Anvil, Stall, DeadTree, rocas de desierto;
  faltan sombrero, revólver, cactus y rieles. *Sol Alto* = rocas y árboles; faltan pirámide, máscara y
  cualquier arquitectura propia (la parte más cara).
- Enemigos: `Zombie_*` sirve para draugr y esqueletos de tesoro, `Shield_*` para el Blindado, `Sword_*` y
  `Hit_*` para casi todos.
- El kit de estilo sigue sin mezclarse: todo Quaternius (más Prototype Bits para el campo de práctica).

## 7. Presupuesto para Android de gama media (Adreno 610/618, Mali-G57, 4 GB)

- 16,6 ms por cuadro: simulación ≤ 3 ms, envío de render ≤ 5 ms.
- ≤ 120 draw calls; ≤ 250 k tris visibles; ≤ 12 personajes con piel en pantalla (jugador ~6 k tris con LOD,
  enemigos 3–5 k); ≤ 60 huesos; texturas KTX2 ≤ 1024²; ≤ 150 MB de memoria de GPU.
- `InstancedMesh` con culling por instancia (como `instanced()` de ELYTRA); impostores para capas lejanas; LOD
  generado con meshoptimizer en el build; un material toon compartido con atlas por reino; sombra de mancha
  bajo los personajes; resolución adaptativa; carga por reino con import dinámico y caché offline.
- Descarga: primer jugable ≤ 15 MB comprimido; cada reino ≤ 8 MB.

## 8. Decisiones técnicas de F1 (cerradas)

| Sistema | Resolución |
|---|---|
| Ubicación del código | `games/hyperflowgeon/` en este repo (multi-página, Pages, link gratis), TypeScript solo en esa carpeta |
| Controlador del personaje | cinemático propio (coyote, buffer y cancelaciones exactos; determinista) con **colisión propia por barrido de cajas** (cambiado al empezar F1; antes: shape-casts de Rapier) |
| Frecuencia de simulación | 60 Hz fijo (frame data en cuadros, rollback más barato) |
| Física | plano de juego 2D (el 3D es solo render); `@dimforge/rapier2d-deterministic-compat` (0.21.0, existe) entra solo si hacen falta cuerpos dinámicos |
| Panel de tuning | deslizadores nativos generados desde `params.ts` (cambiado al empezar F1; antes: Tweakpane) |
| Tests de la simulación | `node --test` sin dependencias (cambiado al empezar F1; antes: Vitest) |
| Contorno | casco invertido |
| Estado de simulación | datos planos serializables; sin clases con referencias circulares |
| Matemática | `sim/math.ts` propia; la simulación no importa `Math.sin/cos/atan2/exp/pow`; test que lo vigila |

## 9. Cierre de F0 y fases siguientes

- **Funciona (en papel):** reglas compartidas (estados, LANZADO rebotable, cables tensos deslizables) de las
  que salen las 12 interacciones sin casos especiales; un mundo (Hyperflowgeon) que absorbe reinos nuevos como
  datos; cuatro héroes con cultura propia y nombre.
- **Todavía no sabemos si es divertido:** nada está jugado. La pregunta más riesgosa es si el grapple con
  auto-aim en el pulgar se siente preciso; F1 existe para contestarla.
- **Cortaría:** 4C Pelotero y 1C Barrilete en la partida (van a la Reserva, §4.6); el doble anclaje hasta
  después de F2; el todos contra todos de 4 con vuelo hasta probar 1v1.

**Fases:**

| Fase | Entrega | Cierra cuando |
|---|---|---|
| F1 | Núcleo + La Calamidad en el Patio del Mesón (plan en `plans/`) | el grapple se siente preciso en teléfono y las métricas de §2 se cumplen |
| F2a | Freydis + interacciones Grapple–Melee + enemigos dummy con estados | las 2 interacciones salen de las reglas, sin casos especiales |
| F2b | Cuauhtli y Calicó + las 8 interacciones restantes | las 12 interacciones jugables |
| F3 | Run PVE: Mares de Calavera completo (roles, jefe, ofrendas, eventos), luego Frontera | una run de 30 min jugable en móvil |
| F4 | PVP asíncrono y local | 1v1 y 2v2 locales |
| F5 | PVP online con rollback | iPhone contra Android sin desincronizar |

**Qué necesito de vos fuera del código:**
1. *(Resuelto)* El acceso a Drive ya funciona. Decidir si hay presupuesto para los PRO de UBC y Outfits (§6.1);
   no bloquea F1.
2. Un teléfono real Android de gama media para medir en la primera semana de F1 (contorno y personajes).
3. Revisar cada reino con una nota corta antes de F3 (§3.3).

Las fases siguientes a F1 avanzan solo con tu aprobación explícita; antes de cada sistema nuevo presento 2–3
opciones.
