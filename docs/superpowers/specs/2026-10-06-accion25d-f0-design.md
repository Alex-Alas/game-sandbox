# Acción 2.5D (nombre de trabajo) — F0: diseño

Estado: **F0 entregada para revisión, no aprobada.** La fase cierra cuando apruebes cada decisión de la §0.
Inventario de assets: [`assets/MANIFEST.md`](../../../assets/MANIFEST.md) (KayKit medido; Quaternius pendiente
de medir porque el contenedor no puede bajar de Drive).

## 0. Decisiones que necesito que apruebes

| # | Decisión | Opciones | Recomiendo |
|---|---|---|---|
| D1 | Concepto de mundo (§3) | A Ciudad Faro · B Puerto Niebla · C Ciudad Santelmo | **A** |
| D2 | Nombre de trabajo | según el concepto (§3) | se decide con D1 |
| D3 | Línea de personajes | solo Quaternius (UBC + Outfits + UAL 1/2) · mezclar con KayKit | **solo Quaternius**; KayKit Character Animations queda sin uso |
| D4 | Ropa de época | trajes de Outfits Fantasy como trajes de festividad + accesorios propios · modelar ropa de época completa · pedir otro pack | **festividad + accesorios propios** |
| D5 | Huecos de assets (§6) | ver tabla | personajes: humanoides + objetos poseídos; armas propias; aprobar **Fantasy Props MegaKit** para objetos |
| D6 | Dónde viven los packs brutos | `assets/packs/` fuera de git + red del entorno con Drive · commitearlos · Git LFS | **fuera de git + habilitar Drive** |
| D7 | Kit por arquetipo (§4) | 2–3 opciones cada uno | **1B Cohetero · 2A Liniero · 3B Cadejo · 4A Cipote del carretón** |
| D8 | Lenguaje de color de gameplay (§5) | tabla propuesta | aprobar o ajustar |
| D9 | Hitstop con varios jugadores (§1.3) | global · por entidad | **por entidad** |
| D10 | Ataque pesado (§1.5) | mantener ATAQUE · direccional · ATAQUE + MOVIMIENTO | **direccional** |
| D11 | Determinismo entre navegadores (§1.6) | matemática propia desde F1 · posponer a F5 | **desde F1** |
| D12 | Dónde vive el código (§8) | `games/<nombre>/` en este repo · repo propio | **en este repo** |
| D13 | Partir F2 en dos entregas (§1.12) | sí · no | **sí** |

## 1. Contradicciones y riesgos frente a los pilares

1. **Dos estilos de personaje (contra «no mezclar estilos»).** UBC de Quaternius tiene proporciones humanas
   y ~13 k tris; el rig de KayKit (Rig_Medium/Large) es cabezón. Las animaciones de KayKit retargeteadas a UBC
   se deforman, y personajes de los dos packs juntos se ven de juegos distintos. → Personajes solo Quaternius
   (D3). Los entornos KayKit sí se pueden unificar con un material toon propio (§5).
2. **Ropa de fantasía en una ciudad de 1930–1950.** No hay ropa de época en los packs. → En los tres conceptos
   los trajes de Outfits Fantasy existen dentro del mundo como trajes de festividad (moros y cristianos,
   cofradías, Moriones), más accesorios de época modelados por nosotros (D4).
3. **Hitstop de 50–120 ms con 4 jugadores (contra pilar 2).** Un hitstop global congela a quien no participa
   del golpe. → Hitstop por entidad: solo atacante y víctima; global únicamente en remates de PVE de un
   jugador (D9).
4. **Telegrafiado (pilar 3) en PVP.** Un ataque ligero de ≤ 100 ms no se puede telegrafiar 300–600 ms. Lo
   acepto explícitamente: en PVP la claridad sale de poses legibles, audio por ataque y una repetición de la
   muerte (gratis con simulación determinista), no del telegrafiado.
5. **Ligero ≤ 100 ms con 4 botones.** Si el pesado es «mantener ATAQUE», el ligero tiene que esperar a que
   sueltes para saber cuál era: agrega la demora del umbral. → Pesado direccional: ATAQUE con ↑ lanza, con ↓
   en el aire pica, corriendo embiste; el ligero sale al apretar (D10).
6. **Determinismo entre navegadores.** Rapier 2D tiene una build determinista multiplataforma
   (`rapier2d-deterministic-compat`), pero `Math.sin/cos/atan2/exp/pow` de JavaScript no dan los mismos bits
   en Chrome/Android y Safari/iOS. Replays y fantasmas del mismo dispositivo funcionan igual; el rollback
   online de F5 entre un iPhone y un Android se desincronizaría. → Desde F1, la simulación usa solo
   `+ − × ÷ √` (exactas en IEEE) y trigonometría propia, con un test que lo vigila. Hoy cuesta poco; en F5
   sería reescribir la simulación (D11).
7. **Auto-aim táctil contra mouse en PVP cruzado.** El mouse apunta mejor. → En PVP toda entrada se reduce a
   16 direcciones con el mismo magnetismo; el mouse solo elige la dirección.
8. **60 fps en gama media contra cel shading con contornos y fondos 3D.** Un contorno por post-proceso es un
   pase extra a pantalla completa, caro en móviles. → Contorno de casco invertido solo en personajes y objetos
   interactivos (de paso destaca lo jugable, pilar 3); escenario sin contorno; capas lejanas como impostores.
9. **Runs de 30+ min en móvil.** Compatible si el estado de la simulación es datos planos desde F1: suspender
   en cualquier momento = serializar el estado. Lo pongo como regla de arquitectura de F1.
10. **Vuelo en PVP corto.** El planeo necesita espacio; una arena chica lo anula y una grande aburre al de
    suelo. Condiciona las arenas de F4 (verticalidad y techo), no F0–F1.
11. **Medieval Hex está a escala de maqueta** (casa 0,93 de alto). Agrandado 5–8× se ve tosco: la Fortaleza
    tendrá menos detalle cercano que la Ciudad. Sirve para muros, torres y siluetas lejanas.
12. **Alcance de F2.** Cuatro arquetipos, cuatro herramientas y 12 interacciones cruzadas es más que todo F1.
    → Dos entregas: grapple + segundo arquetipo con sus interacciones; después los otros dos (D13).

## 2. GDD breve

**Fantasía:** sos un oficio de la ciudad con un don prestado por lo oculto. Cruzás la noche de festividad a
toda velocidad, encadenando movimiento y golpes, y nunca soltás el control.

**Estructura (orden de construcción):** sandbox de práctica (F1–F2) → run roguelite PVE (F3) → PVP asíncrono
y local (F4) → PVP online con rollback (F5).

**Bucles:**
- *Momento a momento (5–10 s):* moverse → leer el telegrafiado → elegir respuesta (esquivar, anclarse,
  golpear, redirigir) → conectar → ganar MOMENTUM → gastarlo → subir el rango de estilo.
- *Encuentro (30–90 s):* arena con 2–3 roles de enemigo y un entorno con propiedades legibles; siempre hay
  más de una solución (pilar 1).
- *Run (30–45 min):* 4–5 tramos por bioma, cada uno con 3–5 encuentros, un evento y un jefe; altares/ermitas
  como puntos de guardado; suspender en cualquier momento.
- *Meta:* PVE con progresión vertical; PVP solo sidegrades, maestría y cosméticos.

**Rejugabilidad de la run (detalle en F3):** ofrendas de facción que modifican reglas compartidas (p. ej.
«lo LANZADO explota al chocar una pared»), así cada build cambia sistemas y no solo números; rutas que se
bifurcan (calles, azoteas, quebradas); eventos (feria = tienda, velorio = riesgo/recompensa); mutadores
(lluvia de ceniza que corta el planeo, apagón que desactiva anclas eléctricas). Objetivos: combate, carrera de
traversal contra un fantasma, cacería de jefe, control de zona (defender un altar), desafío de estilo.

### Controles

| Acción | Móvil (híbrido) | Teclado + mouse | Gamepad |
|---|---|---|---|
| Mover / apuntar | joystick izquierdo | WASD / flechas; el mouse elige dirección si se mueve | stick izquierdo |
| SALTO | botón | Espacio | A |
| ATAQUE (ligero; direccional = pesado) | botón | J / clic izquierdo | X |
| MOVIMIENTO (habilidad del arquetipo) | botón | K / Shift | RB / RT |
| HERRAMIENTA (secundaria) | botón | L / clic derecho | LB / LT |
| Atajos opcionales | deslizar = dash direccional, deslizar ↓ en el aire = picada | — | — |

Auto-aim: cono de 35° en la dirección del joystick; prioridad amenaza > anclable > objeto. Botones de al
menos 12 mm, reubicables y escalables (como el ajuste de tamaño de VÓRTICE). Todo remapeable.

### Reglas sistémicas

**MOMENTUM** (0–100, tres segmentos). Pasivo: daño ×(1 + 0,5·M/100) y +15 % de velocidad máxima a 100.
Cada arquetipo lo gana y gasta distinto (§4). Se pierde al recibir un golpe (−25) y decae tras 1,5 s quieto.
El **medidor de estilo** (D·C·B·A·S) suma por variedad: repetir la misma acción rinde cada vez menos.

**Estados compartidos** (valen igual para jugadores, enemigos y objetos):

| Estado | Entra | Efecto | Interacción clave |
|---|---|---|---|
| AÉREO | sin suelo (coyote 100 ms) | 1 acción aérea que se recarga al tocar suelo, anclarse **o conectar un golpe** | golpear en el aire te mantiene en el aire |
| ANCLADO | cable, pared o riel | no lo empujan los golpes: tensan | EN PICADA corta cables |
| LANZADO | impulso externo fuerte (golpe, tirón, explosión) | sin control; daña lo que choca según velocidad; rompe rompibles; **es rebotable 0,3 s** | permite usar enemigos como trampolín o como bala |
| ATURDIDO | golpe pesado, choque de LANZADO, electricidad | sin acciones; ícono + pose; se acorta si se repite | remates bonificados |
| EN PICADA | caída dirigida | armadura contra ligeros; onda al impactar según velocidad; recuperación cancelable con salto | rompe pisos rompibles |

**Entorno con propiedades legibles** (cada propiedad = un color y una forma; un objeto puede tener varias):
anclable (postes, tendido, cornisas de metal), rompible (pisos, tablones, cajas), lanzable (barriles,
sillas, enemigos livianos), rebotable (toldos, colchones, campanas), deslizable (rieles, cables tensos,
barandas, paredes lisas).

**Métricas base** (simulación a 60 Hz, ver §8):

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
(transitorio + cuerpo + cola; más capas con más momentum), destello en el golpeado, medidor de estilo. Sin
números de daño flotantes.

## 3. Tres conceptos de mundo

Ninguno toma nombres, facciones ni diseños de Deadlock: solo el tono (ciudad de época con lo oculto
filtrándose en lo cotidiano). En los tres, los trajes de fantasía y la fortaleza medieval tienen razón de ser.

### A. CIUDAD FARO — folclore centroamericano (recomendado)

*Títulos posibles:* **CADEJO** · **NOCHE DE FUEGO** · **FARO**.

**Premisa.** 1938. Ciudad Faro es una capital cafetalera al pie de un volcán que lleva 170 años en erupción
continua y que los marineros usan de faro. La Compañía de Luz y Tranvías empezó a cosechar el fuego del
volcán para electrificar la ciudad, y el tendido nuevo cruzó los caminos viejos por donde andaban los
espantos: el Cadejo, la Siguanaba, el Cipitío, la Carreta Chillona, el Justo Juez de la Noche. En cada noche
de feria el velo se adelgaza y los espantos entran a la ciudad moderna. Los gremios de oficios, con dones
prestados por los espantos, corren la procesión hasta el cráter para cortar la cosecha.

**Facciones.**
- *Compañía de Luz y Tranvías:* capital extranjero, técnicos, guardias y autómatas de la central. Ocultismo
  industrial. Antagonista.
- *Cofradía del Fuego:* custodia los ritos (Historiantes, coheteros, rezadoras). Aliada ambigua: quiere el
  fuego para sí.
- *Los Espantos:* ni buenos ni malos. El Cadejo blanco cuida, el negro caza.
- *Los Gremios:* linieros, coheteros, cargadores, añileros, ferrocarrileros. De ahí salen los jugadores; el
  tono punk está acá (sindicatos, imprenta clandestina, pirotecnia casera).

**Arquetipos.** Vuelo = cohetero de feria con alas de caña y papel de china. Grapple = liniero de la Compañía
que se pasó a los gremios. Melee = alguien que lleva al Cadejo blanco en su sombra. Suelo = cipote en
carretón de balineras.

**Biomas como una sola procesión.** Barrio de la estación (Ciudad) → cafetales y quebradas (Naturaleza) →
castillo colonial de la costa tomado por la Compañía (Fortaleza) → la central eléctrica y las casonas
(Interiores) → el cráter (final). Entrenamiento: el patio de la Cofradía, con maquetas de madera para
practicar (Prototype Bits). Los puntos de guardado son ermitas de la procesión.

**Raíces reales, poco vistas en videojuegos:** Bolas de Fuego de Nejapa, Talcigüines de Texistepeque,
Historiantes (danzas de moros y cristianos con trajes medievales y máscaras), barriletes gigantes de Sumpango,
Día de la Cruz, añil y pirotecnia artesanal.

**Encaje con assets.** Outfits Fantasy = trajes de Historiantes. Medieval Hex = fortaleza colonial (como
Omoa o San Felipe de Lara). Downtown es lo que más hay que envejecer: el ladrillo neoyorquino pasa a repello
pintado, balcones de hierro y lámina troquelada.

**Riesgos.** Tratar el folclore con investigación y sin caricatura (fuentes salvadoreñas y guatemaltecas). El
fuego es el tema del mundo, pero el rojo-naranja está reservado al peligro: el resplandor del volcán va
desaturado y de valor bajo (§5).

### B. PUERTO NIEBLA — folclore galaico-portugués

*Títulos posibles:* **COMPAÑA** · **NIEBLA**.

**Premisa.** 1924. Un puerto de granito en el Atlántico, cubierto por una niebla que no se levanta. Cada
noche la Santa Compaña (procesión de almas con velas) recorre las calles, y la Naviera Transatlántica embotella
la niebla como combustible para sus vapores.

**Facciones.** Naviera Transatlántica (antagonista), Sindicato de estibadores y conserveras (punk,
anarquistas), meigas (brujas, ambiguas), la Santa Compaña.

**Arquetipos.** Vuelo = jinete de tormentas (Nubeiro) con alas de lona. Grapple = arponera con arpón ballenero.
Melee = estibador con garfio de carga, o un lobisome. Suelo = repartidora de la conservera en patines por los
rieles del funicular, con latas que rebotan.

**Biomas.** Puerto (Ciudad) → fragas y acantilados (Naturaleza) → castillo costero (Fortaleza) → conserveras y
tabernas (Interiores) → santuario del cabo (final); astillero (Entrenamiento).

**Encaje.** El que menos hay que envejecer: Downtown pasa por almacenes portuarios casi sin cambios.

**Riesgo.** Puerto ballenero, niebla y aceite que alimenta máquinas queda muy cerca de Dishonored; cuesta
diferenciarlo del gótico europeo ya visto.

### C. CIUDAD SANTELMO — folclore filipino

*Títulos posibles:* **AGIMAT** · **SANTELMO**.

**Premisa.** 1936. Una capital portuaria de la Mancomunidad: ciudad amurallada española, avenidas art déco
americanas, tranvías y calesas. Un tifón rajó los montículos del nuno bajo la nueva planta eléctrica; desde
entonces aswang y tikbalang cazan de noche, y los agimat (amuletos) dan dones.

**Facciones.** Compañía Eléctrica (antagonista), Hermandad de los Moriones (máscaras de centurión de Semana
Santa; ambigua), clanes aswang, gremios de cocheros y estibadores.

**Arquetipos.** Vuelo = alas de sarimanok. Grapple = pescador con pana (arpón de mano). Melee = portador del
tikbalang, que confunde a los viajeros (pasos de sombra), con golpes de arnis. Suelo = chico de la calle con
trumpo y sipa (pelota de ratán que rebota).

**Biomas.** Escolta art déco (Ciudad) → terrazas de arroz y volcán (Naturaleza) → Intramuros (Fortaleza) →
casonas con ventanas de capiz (Interiores) → gimnasio de arnis (Entrenamiento).

**Encaje.** Outfits Fantasy = Moriones; Medieval Hex = murallas de Intramuros.

**Riesgo.** El que más investigación cultural exige para tratarlo bien.

**Por qué recomiendo A:** es el menos explotado, sus arquetipos salen del mundo sin forzarlos (cohetes,
tendido eléctrico, Cadejo, carretón) y la ciudad de época llena de cables y rieles es justo el entorno que
el grapple y el skater necesitan.

## 4. Arquetipos

Los nombres son del concepto A; con B o C cambian piel y nombre, no el kit. Cada personaje lleva su
arquetipo principal + 1 herramienta secundaria de otro arquetipo.

### 4.1 VUELO

Base común: planeo con cabeceo (joystick ↑↓); energía = altura + velocidad (picar suma velocidad, subir la
gasta); bajo la velocidad mínima entra en pérdida (cae, no ataca y un golpe lo aturde); los golpes en picada
escalan con la velocidad.

| Opción | Extra | A favor | En contra |
|---|---|---|---|
| 1A Zopilote (nagual) | 2 aletazos por vuelo que se recargan al conectar; atravesar a alta velocidad corta | el más puro y legible | menos decisiones |
| **1B Cohetero** | 3 cohetes de empuje instantáneo en la dirección del joystick (salir de pérdida o embestir); conectar recarga cohetes; aterrizar en picada = bola de fuego | ata vuelo y momentum, más expresión | más ruido visual; hay que cuidar que el cohete no reemplace al planeo |
| 1C Barrilete | vuela atado a un barrilete; corrientes de calor (fogatas, chimeneas) como combustible; cortar el hilo = picada | el más sistémico | depende de que cada nivel tenga corrientes; flojo en PVP |

- *Momentum:* gana con velocidad sostenida y golpes en picada; gasta en cohetes extra y en la pasada ardiente.
- *Combos:* picada → golpe que lanza arriba → convertir velocidad en altura → segunda picada antes de que caiga;
  rasante sobre un riel → grind → salir con cohete; cohete contra un aturdido → lo estrella en un rompible.
- *Progresión PVE:* Altura (menos pérdida), Picada (onda mayor), Pirotecnia (buscaniguas que corre por el
  suelo, volcancito que deja fuego). *PVP:* elegir 2 cohetes de 4.

### 4.2 GRAPPLE + ARMA DE CUERDA

Base común, en el orden de prioridad del brief. MOVIMIENTO dispara el gancho a lo anclable o enemigo del cono:
1. **Tirón** (Titanfall): recoge cable con aceleración; soltar conserva la velocidad; soltar con SALTO suma impulso.
2. **Enganchar enemigo** (Scorpion): liviano viene a vos, pesado te lleva a él; ATAQUE mientras está
   enganchado lo lanza hacia donde apunta el joystick (LANZADO).
3. **Columpio:** ancla arriba sin recoger = péndulo de largo fijo.
4. **Arma con cuerda** (GoW): se lanza, se clava en paredes (un ancla propia) y vuelve golpeando lo que cruza.
5. **Doble anclaje** (AoT): progresión tardía.

| Opción | Extra | A favor | En contra |
|---|---|---|---|
| **2A Liniero** | garfio de liniero, cable de cobre y llave con cadena; si tu cable toca tendido eléctrico, lo enganchado queda aturdido | anclas por todas partes en la ciudad de época; el brief al pie de la letra | — |
| 2B Arriero | reata (lazo) y cutacha atada; enlazar a dos enemigos a la vez los hace chocar | lazo = Scorpion natural, carisma | el lazo no se clava en paredes: el tirón depende de postes |
| 2C Campanero | cuerdas de campanario e incensario en cadena que barre en círculo y deja humo | muy gótico, control de área | el tirón queda en segundo plano: contradice la prioridad |

- *Momentum:* gana con tirones encadenados sin tocar el suelo y con enemigos lanzados que pegan contra algo;
  gasta en tirón a máxima tensión (atraviesa enemigos).
- *Combos:* tirón → soltar con salto → patada voladora con toda la velocidad; enganchar a A y lanzarlo contra
  B → tirón hacia B; clavar la llave en una pared lejana → tirón hacia tu arma → recogerla golpeando todo
  en el camino.

### 4.3 IMPULSO MELEE

Base común: salto explosivo (se carga mientras corrés, nunca parado), picada desde cualquier altura, paso de
sombra corto (el destino se telegrafía 100–150 ms) y momentum por cada golpe conectado.

| Opción | Extra | A favor | En contra |
|---|---|---|---|
| 3A Historiante | machete y máscara; combos como pasos de baile con bonus por ritmo | identidad cultural muy fuerte | el ritmo exige audio sincronizado, difícil en web móvil |
| **3B Cadejo** | la sombra del perro aparece primero y te jala (telegrafiado natural); picada de pezuñas; cadenas como agarre corto; con momentum alto, transformación parcial (más alcance) sin animación larga | fantasía de bestia clara (Mutant/Toji) y justifica el teletransporte | — |
| 3C Cargador | mecapal; agarra y lanza enemigos y objetos | el más sistémico con el entorno | menos movilidad; se pisa con el grapple |

- *Momentum:* el que más gana por golpe; gasta en pasos de sombra extra y picada potenciada.
- *Combos:* paso de sombra detrás → lanzador ↑ → salto explosivo → picada que rebota al enemigo contra el
  suelo (LANZADO otra vez) → paso de sombra al rebote; picada sobre piso rompible = abrir ruta con los
  enemigos cayendo aturdidos; paso de sombra a través de un proyectil (invulnerabilidad breve y visible).

### 4.4 VELOCIDAD A RAS DE SUELO (3 variantes)

Base común: acelera en bajada y manteniendo dirección; grind y wall-ride en deslizables; el golpe escala con
la velocidad; proyectiles que rebotan.

| Opción | Kit | A favor | En contra |
|---|---|---|---|
| **4A Cipote del carretón** | carretón de balineras: ollie, grind automático al caer sobre un deslizable (sin minijuego de equilibrio), derrape que barre; **trompo con pita** que rebota en paredes y enemigos y vuelve | la lectura más clara de skater + grind + rebote | — |
| 4B Mensajero del telégrafo | parkour sin vehículo: barrida, carrera por paredes; **mables** que rebotan hasta 3 veces y pegan más en cada rebote | no depende de un vehículo | se parece al melee en el suelo |
| 4C Pelotero | juego de pelota mesoamericano: la pelota de hule es el arma, rebota por el escenario y acelera cada vez que la volvés a golpear (pinball); barrida de cadera | lo más original | controlar personaje y pelota con un pulgar es exigente; ilegible en PVP de 4 |

- *Momentum:* velocidad sostenida y trucos (grind largo, rebotes encadenados); gasta en trompo de fuego
  (perfora) y derrape largo.
- *Combos:* grind en el tendido del tranvía → salto → trompo hacia abajo que rebota en tres enemigos →
  recogerlo en el aire; embestir a un aturdido = «chuza» (sale LANZADO por el suelo como bola de boliche);
  derrapar alrededor de un poste con el trompo en órbita.

### 4.5 Herramienta secundaria

| Herramienta | Viene de | Versión reducida |
|---|---|---|
| Alas plegables | Vuelo | 1,5 s de planeo y 1 cohete por salto |
| Gancho corto | Grapple | 1 tirón a ancla o enemigo, sin columpio; recarga 3 s |
| Paso de sombra | Melee | 1 paso de 3 m; recarga 4 s |
| Trompo | Suelo | rebota 2 veces y vuelve |

### 4.6 Interacciones cruzadas (2+ por par)

Cada una sale de una regla compartida, no de un caso programado aparte (pilar 1). Funcionan entre la
herramienta principal y la secundaria del mismo personaje y entre jugadores.

| Par | Interacción | Regla que la produce |
|---|---|---|
| Vuelo–Grapple | Enganchar un ancla en plena picada convierte la caída en péndulo y te dispara hacia arriba | la cuerda conserva la velocidad tangencial |
| Vuelo–Grapple | Enganchar a un planeador: si va más rápido de lo que recoge el cable, te remolca; si va más lento, entra en pérdida y queda LANZADO | la tensión se resuelve por masa × velocidad |
| Vuelo–Melee | Picada sobre un ATURDIDO = remate ×2 | ATURDIDO + EN PICADA |
| Vuelo–Melee | El salto explosivo lanza enemigos hacia arriba; el volador rebota sobre ellos y recupera altura | lo LANZADO es rebotable 0,3 s |
| Vuelo–Suelo | Pasar rasante sobre un riel en ángulo bajo entra en grind sin perder velocidad | deslizables para cualquiera que llegue rápido y rasante |
| Vuelo–Suelo | El trompo le quita sustentación a un planeador | los proyectiles que rebotan transfieren impulso |
| Grapple–Melee | Un enemigo enganchado está ANCLADO: los golpes no lo alejan y el combo no se escapa | ANCLADO tensa en vez de empujar |
| Grapple–Melee | Una picada sobre un cable tenso lo corta (defensa contra grapplers; el enemigo columpiándose cae) | EN PICADA corta ANCLADO |
| Grapple–Suelo | El doble anclaje (o arma clavada + gancho) tiende un cable que el skater usa como riel | todo cable tenso es deslizable |
| Grapple–Suelo | Engancharse a algo en movimiento (skater, tranvía, trompo) te transfiere su velocidad: remolque | anclarse a un cuerpo en movimiento hereda su velocidad |
| Melee–Suelo | La onda de una picada levanta todo lo lanzable, trompos incluidos, contra los enemigos aéreos | la onda empuja lanzables |
| Melee–Suelo | Embestir a un ATURDIDO lo convierte en proyectil a ras del suelo que derriba a otros | LANZADO daña lo que choca |

## 5. Estética de época

**Época:** 1930–1950: electricidad nueva, tranvías, radio y telégrafo, pocos autos, carretas y ferrocarril.

**Render:** cel shading de 2 bandas + luz de borde; contorno solo en lo jugable; fondos entre 15 y 40 % de
valor, personajes entre 40 y 70 %; los acentos saturados quedan reservados al gameplay. Noche de feria: luna
fría, faroles cálidos y el volcán como contraluz lejano desaturado; niebla por altura (la técnica de ELYTRA).

**Lenguaje de color de gameplay (D8).** Siempre color **y** forma, para daltónicos y para no pelear con los
colores de los jugadores:

| Significado | Color | Forma |
|---|---|---|
| Peligro / telegrafiado | bermellón `#FF3B30` | dientes, rombo que se cierra |
| Anclable | jade `#2EE6D6` | anillo |
| Rompible | ámbar `#FFB020` | grietas |
| Rebotable | magenta `#FF4FD8` | ondas de resorte |
| Deslizable | hueso `#F2F2E8` | chevrones |
| Momentum / recurso | oro `#FFD84A` | rombo de tres segmentos |
| Jugadores 1–4 | color de contorno + marcador ▲ ● ■ ◆ | en PVP, los ataques rivales se telegrafían en bermellón sin importar quién los hace |

Base desaturada: carbón `#1B1A1F`, ceniza `#3A3740`, adobe `#5B4A42`, añil `#2E3A55`, cafetal `#2F3F33`,
repello `#8A7F72`.

**Envejecer Downtown City MegaKit** (la lista pieza por pieza se arma cuando el pack esté medido):
1. **Filtrar** lo anacrónico: aires acondicionados, antenas y parabólicas, carteles luminosos y señalética
   vial modernos, semáforos actuales, contenedores, autos modernos, vidrio espejado. Se queda: ladrillo,
   cornisas, escaleras de incendio (de fines del siglo XIX; además anclables y deslizables), tanques de
   agua de madera en las azoteas, toldos lisos o rayados, bocas de incendio, marquesinas.
2. **Rematerializar** con un shader toon propio para todos los packs: la textura original solo distingue
   material (ladrillo, repello, madera, metal, vidrio) y el color sale de la paleta del bioma. Vidrio en
   paneles chicos con parteluces y pocas ventanas encendidas con luz de tungsteno; hollín como gradiente de
   abajo hacia arriba; para A, el ladrillo pasa a repello encalado desaturado.
3. **Sumar época** (que además es gameplay): tendido eléctrico y del tranvía como geometría procedural
   (anclable y deslizable), postes de madera con aisladores, rieles en la calle (grind), faroles, rótulos
   pintados a mano (tipografías con licencia OFL), banderines y papel picado entre fachadas (rebotables y
   rompibles), balcones de hierro, persianas, carretas, quioscos y 2–3 autos de los 30 hechos con primitivas.
4. **Silueta:** cúpulas, campanarios, tanques de agua y chimeneas contra el resplandor del volcán: esa es la
   imagen clave.
5. **Capas 2.5D:** fachadas frontales en el plano de juego; capa media a 10–30 m instanciada; capas lejanas
   horneadas como impostores.

**Personajes:** UBC + piezas de Outfits Fantasy como trajes de festividad + accesorios de época propios
(sombrero de palma, saco, tirantes, delantal de cuero, gorra de liniero), low-poly con atlas compartido.

## 6. Huecos de assets

| Hueco | Opciones | Recomiendo |
|---|---|---|
| Enemigos 3D | (a) humanoides UBC + Outfits + máscaras propias, rol leído por silueta; (b) objetos poseídos de Furniture, Prototype y Fantasy Props (sillas, roperos, carretas) con animación procedural, sin rig; (c) criaturas a medida para jefes (Blender o encargo); (d) KayKit Skeletons (choca de estilo) | **a + b** ya; **c** para jefes en F3 |
| VFX | (a) procedurales en shader (estelas, chispas, ondas, humo toon por pasos, calcos) con partículas instanciadas propias; (b) texturas CC0 (Kenney Particle Pack) como máscaras | **a**, con b solo para ruido y máscaras |
| Audio | (a) procedural con Web Audio (como VÓRTICE y ELYTRA); (b) bancos CC0 (Kenney, Freesound filtrado a CC0); (c) música compuesta o encargada («marimba punk» para A). Evitar el bundle de Sonniss: prohíbe redistribuir los archivos sueltos y en la web quedan descargables | **a + b**; **c** en F3 |
| Armas | (a) Fantasy Props MegaKit (en tu Drive, CC0, no está en la lista); (b) modelarlas: machete, garfio, llave, trompo, cohetes (100–500 tris, atlas compartido); (c) armas de KayKit Adventurers (estilo cabezón) | **b** para las de los arquetipos; **a** para objetos lanzables y rompibles |

## 7. Presupuesto para Android de gama media (Adreno 610/618, Mali-G57, 4 GB)

- 16,6 ms por cuadro: simulación ≤ 3 ms, envío de render ≤ 5 ms.
- ≤ 120 draw calls; ≤ 250 k tris visibles; ≤ 12 personajes con piel en pantalla (jugador ~6 k tris con LOD,
  enemigos 3–5 k); ≤ 60 huesos; texturas KTX2 ≤ 1024²; ≤ 150 MB de memoria de GPU.
- `InstancedMesh` con culling por instancia (como `instanced()` de ELYTRA); impostores para capas lejanas; LOD
  generado con meshoptimizer en el build; un material toon compartido con atlas por bioma; sombra de mancha
  bajo los personajes; resolución adaptativa; carga por bioma con import dinámico y caché offline.
- Descarga: primer jugable ≤ 15 MB comprimido; cada bioma ≤ 8 MB.

## 8. Adelanto de F1 (no se implementa nada hasta aprobar F0)

Para cada sistema de F1 voy a presentar opciones formales antes de construirlo; adelanto mis recomendaciones
para que puedas contestar antes si querés:

| Sistema | Opciones | Recomiendo |
|---|---|---|
| Ubicación del código | `games/<nombre>/` en este repo (multi-página, Pages, link gratis) · repo propio | este repo, TypeScript solo en esa carpeta |
| Controlador del personaje | cinemático propio con shape-casts de Rapier · `KinematicCharacterController` de Rapier · cuerpo dinámico | **cinemático propio** (coyote, buffer y cancelaciones exactos; determinista); Rapier dinámico para objetos |
| Frecuencia de simulación | 60 Hz · 120 Hz | **60 Hz** (frame data en cuadros, rollback más barato) |
| Panel de tuning | lil-gui · Tweakpane · propio (todos MIT) | Tweakpane |
| Tests de la simulación | Vitest · `node:test` | Vitest (TypeScript sin configuración) |
| Contorno | casco invertido · post-proceso | casco invertido |

## 9. Cierre de F0 (preliminar)

- **Funciona (en papel):** reglas compartidas (estados, LANZADO rebotable, cables tensos deslizables) de las que
  salen las 12 interacciones sin casos especiales; un mundo (A) que justifica cada arquetipo y cada bioma.
- **Todavía no sabemos si es divertido:** nada está jugado. La pregunta más riesgosa es si el grapple con
  auto-aim en el pulgar se siente preciso; F1 existe para contestarla.
- **Cortaría:** 4C Pelotero y 1C Barrilete (los más caros de leer); el doble anclaje hasta el final de F2; el
  todos contra todos de 4 con vuelo hasta probar 1v1.
- **Riesgos para F1:** que el contenedor no pueda bajar los packs (bloquea el tramo de Ciudad, no el campo de
  entrenamiento, que sale de Prototype Bits ya medido); el rendimiento del contorno y de los personajes de
  13 k tris en gama media (medirlo en la primera semana con un teléfono real); montar TypeScript y tests en un
  repo que hoy es JavaScript sin tests.
