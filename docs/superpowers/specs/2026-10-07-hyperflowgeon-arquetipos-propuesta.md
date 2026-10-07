# HYPERFLOWGEON — propuesta de arquetipos y sistemas

Estado: **propuesta, nada aprobado.** Divergencia → laboratorio → convergencia sobre los tres héroes que faltan
(Cuauhtli, Freydis, Calicó) y los sistemas complementarios, medida contra lo decidido en F0
([spec](2026-10-06-hyperflowgeon-f0-design.md)) y en los pasos A–D de F1 ([plan](../plans/2026-10-06-hyperflowgeon-f1.md)).
Versión visual (códice con identidad preliminar, lluvia de ideas filtrable y gráficos):
<https://claude.ai/artifact/8XDyn8AUbx7YkpS19DHzuf> (privado; se comparte desde su menú).

Laboratorio reproducible: `node games/hyperflowgeon/tools/banco/banco.mjs [--honda] [--envolvente]` (~1 min).
Prototipos v0 de los tres héroes montados sobre el `step` real (misma carrera, salto y colisión) y La Calamidad tal cual;
una búsqueda ciega con semilla fija elige la mejor ejecución por héroe y recorrido. Mide techos, no es un bot jugable.

## 1. Hallazgos

1. **La honda (en lo que ya existe).** En el aire, enganchar el piso ~11 m adelante y soltar antes de llegar a más de
   32 m/s devuelve la carga: 120 m en 2,52 s, picos de 65 m/s, 53 devoluciones seguidas. Con «todo es anclable», La
   Calamidad gana 7 de 8 recorridos (puntaje 0,99 contra 0,56–0,71) y le quita su terreno a Calicó.
2. **Ley de la energía.** Mis prototipos repitieron tres veces el mismo agujero: recargar al tocar el suelo (Cuauhtli a
   93 m/s a saltitos) y convertir la caída del propio salto en avance (PASO de Freydis a 32 m/s; aterrizaje limpio de
   Calicó). Regla: la energía solo viene de correr hasta el tope, del salto (se pierde al aterrizar en plano), de la
   altura perdida y de cargas presupuestadas; las herramientas convierten, solo las cargas inyectan, y ninguna carga
   vuelve por tocar el suelo. Propuesta: volverla test («auditoría de energía»: 30 s de búsqueda ciega en piso liso no
   pasan del tope declarado de cada héroe).
3. **La sobrevelocidad no se va** (el salto con buffer la conserva, decisión del paso A que no se toca): cualquier
   herramienta que pase de RUN una vez en piso liso la deja para siempre. Por eso los topes van en las herramientas.
4. **Planeo.** Con arrastre solo ∝ v², 422 m desde 16 m (26:1); con arrastre inducido ∝ 1/v², 66 m (4,5:1) y crucero
   natural en 22 m/s. Picar y tirar recupera el 40–65 % de la altura. Con alas plegadas en la picada (⅓ del arrastre),
   Cuauhtli gana el descenso que antes le ganaba el columpio de la liga.

Banco (segundos; menos es mejor):

| Recorrido | La Calamidad hoy | La Calamidad propuesta | Cuauhtli | Freydis | Calicó |
|---|---|---|---|---|---|
| Recta 120 m | 2,98 | 5,15 | 5,13 | 6,05 | **4,87** |
| Larga 300 m | 5,77 | 13,72 | 13,05 | 15,07 | **10,50** |
| Foso de vigas 25 m | 2,10 | **2,32** | 3,20 | 3,65 | 3,77 |
| Torre 16 m | 2,58 | **2,58** | 5,28 | 2,85 | ✕ (sin vertical) |
| Ida y vuelta 40 m | 3,85 | 3,95 | **3,88** | 4,08 | 4,82 |
| Pelea (foso 40 m) | 2,37 | 4,37 | 3,48 | **2,78** | 3,53 |
| Pelea ancha (foso 64 m) | 2,92 | 5,20 | 4,37 | **3,20** | 4,92 |
| Descenso 30 m | 4,07 | 6,08 | **3,90** | 6,05 | 5,33 |
| Puntaje medio · gana | 0,99 · 7 | 0,82 · 2 | 0,81 · 2 | 0,83 · 2 | 0,70 · 2 |

(Ganadores en negrita con la propuesta. Calicó cae por la torre, su debilidad declarada; sin la torre, 0,80.)

## 2. Reglas compartidas propuestas

- **Cargas:** toda herramienta recarga con el tiempo (más rápido en el suelo, nunca al tocarlo) y con una técnica propia.
  Con 0 cargas, MOVIMIENTO gasta un rombo de MOMENTUM y sale el EX.

  | Héroe | Herramienta | Cargas | Tiempo | Técnica |
  |---|---|---|---|---|
  | La Calamidad | Liga | 3 | 2,5 s (×2 en suelo) | soltar ≥ 32 m/s (opción: pasado el ancla) · chispas |
  | Cuauhtli | Aleteo | 3 | solo en el suelo, 0,5 s | conectar · rebotar en LANZADO · chispas |
  | Freydis | PASO | 2 | 3 s | conectar un golpe |
  | Calicó | Bala | 1 | vuelve sola (~1,2 s) | atraparla en el aire |

- **Acción aérea:** sin doble salto universal (rompería el paso A). Es el pesado aéreo (↑ remonte/lanzador, ↓ picada), una
  por vuelo; vuelve al tocar suelo, anclarse o conectar. Todo golpe conectado en el aire da vy ≥ 8 m/s.
- **Estados:** EN PICADA y la bala encadenada cortan cables tensos. Masa por héroe: Cuauhtli 0,7 · Calicó 0,85 · La
  Calamidad 1 · Freydis 1,3 (usa el reparto por masa del paso D).
- **HYPE:** el rango D·C·B·A·S se muestra como el dado del público (d4 → d20, «¡veinte natural!»). Puntos = valor del verbo ×
  frescura por verbo (1 → 0,75 → 0,5 → 0,25 al repetir en 6 s) × (1 + rapidez/RUN); cadena de 4 s alimentada solo por
  verbos frescos. No cambia reglas; se cobra como monedas de la run.
- **Ofrendas** cambian una regla de estado o propiedad (Pólvora, Alambre de púas, Hielo de fiordo, Campana, Viento de cola,
  Ancla de plomo, Chispa avara) y dos compatibles forman una doble (Pólvora + Alambre = Mecha).
- **Pruebas del Patio:** los recorridos del banco como desafíos con medalla (oro ≈ mejor del banco ×1,15), con fantasma por
  repetición de entradas.

## 3. Kits (números de partida)

- **La Calamidad (liga, F1):** sin cambios salvo la decisión A. EX: tirón a máxima tensión. Prestada: garfio corto = la liga
  con el perfil CORTO y 1 carga cada 3 s (el «sin columpio» del spec pediría un caso especial).
- **Cuauhtli (vuelo):** planeo con SALTO mantenido cayendo; arrastre CD0·v² + CDI/v² con mínimo en 22 m/s a 4,5:1; pérdida
  bajo 9 m/s; giro con 60 m/s² laterales. Aleteo: +150 J/kg en la dirección del joystick, tope 24 m/s, girar conserva
  (1 + cos θ)/2 de la rapidez. Picada con alas plegadas (⅓ del arrastre, tope 55 m/s, gira la mitad). EX: aleteo sin tope.
- **Freydis (melee de impulso):** correr derecho a tope carga sola el salto (0,1–0,6 s): vy = √(vy² + k·vx²),
  vx′ = vx·√(1 − k), k ≤ ¾. PASO de 4 m con 6 cuadros de aviso: gira solo |vx|. Gleipnir: agarre corto = la liga con un
  perfil propio (4 m, sin reposo). EX: PASO doble; con 3 rombos, Ulfhednar 4 s.
- **Calicó (suelo):** tope por compromiso 20 → 26 → 32 m/s (0,6 s y 1,6 s a tope sin soltar la dirección); paredes como cuarto
  de tubo (≥ 15 m/s, ×0,85 ida y vuelta); aterrizaje limpio que convierte solo la altura perdida por debajo de donde dejó el
  suelo (0,6·g·Δh); bala encadenada libre: 30 m/s, 3 rebotes, +10 % por enemigo (tope 45), corta cables, rebotable.

## 4. Decisiones (recomendada primero)

- **A. La honda.** (1) La liga hacia anclas por debajo de la mano solo lleva hasta RUN (larga: 5,77 → 13,72 s; foso y torre
  casi iguales). (2) Devolución solo de columpio + tope total de 40 m/s (cambia el tirón calibrado). (3) Dejarla y subir los
  techos de los demás.
- **B. Pendientes.** (1) Segmentos inclinados en el barrido desde F2b. (2) Solo rectángulos (Calicó vive de paredes).
  (3) Pendientes solo visuales.
- **C. Relanzar lo LANZADO** (a lo Lethal League). (1) Ofrenda en F3 y regla del modo PVP «La Pelota». (2) Regla del núcleo
  desde F2a. (3) No.
- **D. MOMENTUM.** (1) Un rombo = el EX de la herramienta cuando no hay cargas. (2) Un definitivo por héroe a 3 rombos.
- **E. Cultura.** (1) Renombrar ya «aleteos de colibrí» (el colibrí es Huitzilopochtli) y «caída del sol» (cosmología del
  Quinto Sol) por «aleteo» y «descenso del águila»; excluir wolfsangel, othala y valknut del set de Freydis (ADL); los
  barcos negreros nunca como decorado. (2) Revisar en F3, como dice el spec §3.3.
- **F. Orden de F2.** (1) Como el spec: F2a Freydis; Calicó en F2b con las pendientes. (2) Calicó primero.
