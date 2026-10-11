# Dirección de arte

Antes de escribir una línea de dibujo, decide qué se tiene que leer y desde qué distancia. Los juegos de referencia se ven caros porque cada decisión de forma, valor y color responde a una pregunta de lectura: ¿quién es?, ¿qué hace?, ¿qué es peligroso?

## 1. Silueta

- **Prueba de la miniatura.** Rellena todas las piezas en negro, sin contorno ni sombra, y achica a 48–64 px de alto. Se tiene que reconocer al personaje y su pose. Si dos poses de un clip se ven iguales en silueta, una de las dos sobra o hay que exagerarla.
- **La identidad va arriba.** Cabeza, capucha, casco, cuernos y arma son lo primero que se lee. En FILO, la heroína es una máscara de hueso blanca dentro de una capucha roja con una cinta larga (la cabeza mide un tercio del alto). El jefe es un casco de cráneo con cuernos, metido entre dos hombros enormes.
- **Espacio negativo.** Separa brazos del torso y piernas entre sí en las poses clave: los huecos son lo que hace leer una pose.
- **Línea de acción.** Cada pose clave sigue una curva (C o S) de la cabeza a los pies. Si el torso queda recto y vertical en un ataque, la pose está muerta. FILO lo maneja con `lean` (inclinación del torso) y `head` (contra-giro de la cabeza).

## 2. Lenguaje de formas

| Rol | Formas | Ejemplo en FILO |
|---|---|---|
| Ágil, heroico | Triángulos y curvas largas, puntas finas, piernas largas | La Errante: capa en punta, filo curvo, botas con punta, cinta |
| Pesado, amenazante | Bloques, joroba, masa adelante, piernas cortas, púas | El Verdugo: hombros que tapan la cabeza, hombrera con púas, hacha-cuchilla |
| Mágico o peligroso | Grietas, brillo, partículas | Grietas de brasa que laten en la piel del Verdugo |

Mezcla **rectas contra curvas** en cada pieza: una curva que se apoya en un lado recto se ve diseñada. Una forma con todos los lados curvos se ve como un globo, y una con todas rectas, como un polígono. Las esquinas agudas (`sharp` en `spline`) van donde la tela o el hueso terminan: puntas del ruedo, mentón, punta de la bota.

## 3. Valores (claro/oscuro)

- **Personajes oscuros sobre un fondo de valor medio.** El fondo se aclara con la distancia (perspectiva atmosférica), así el personaje del plano de juego siempre tiene el mayor contraste.
- **Tres valores por material:** base, sombra (−35 a −45 % de luminosidad) y oclusión (más oscura todavía, solo en los rincones). El brillo es una franja fina, no una zona.
- **El blanco puro es caro.** Resérvalo para la máscara, el filo y el núcleo de los efectos. Si todo es claro, nada brilla.
- **Prueba en gris.** Desatura la captura (`sat` 0 en el posproceso): el personaje se tiene que separar del fondo solo por valor.

## 4. Color

### Paleta por material (cinco tonos)

Cada material lleva cinco tonos, con el **giro de tono** que da el aspecto pintado:

- `base`;
- `S`, la sombra: más oscura y corrida hacia violeta o azul;
- `D`, la oclusión: más oscura todavía y algo más saturada;
- `R`, el contraluz: un frío claro, cian o turquesa, que es la luz rebotada del cielo;
- `H`, el brillo: más claro y corrido hacia naranja o amarillo, la luz cálida principal.

Paletas reales de FILO (valen como punto de partida):

```ts
// Heroína — capucha carmesí, máscara de hueso, cuerpo índigo, acero frío, brasa de acento
hood: '#b8263a', hoodS: '#6d1532', hoodD: '#420b25', hoodR: '#5fb7c8', hoodH: '#ff7a5e',
mask: '#efe7d8', maskS: '#bdb0c6', maskD: '#8e7fa4', maskR: '#9fd4e0', maskH: '#fffbf2',
body: '#2b2238', bodyS: '#191222', bodyR: '#5b86a8',
steel: '#e6edf5', steelS: '#8f9db3', steelD: '#5d6a82', steelR: '#bdf2ff',
ember: '#ffb054', emberHot: '#fff0c8', ink: '#140c1c',
// Jefe — piel de ceniza oscura y saturada, hueso, hierro, tela vino, brasa
skin: '#252536', skinS: '#15141f', skinD: '#0c0b12', skinR: '#7fc4c6', skinH: '#46405c',
bone: '#d9cfbe', boneS: '#958aa0', boneD: '#5f566c',
iron: '#5f6674', ironS: '#343a47', ironD: '#1e222b', ironR: '#b8f0ff', rust: '#8a4a2a',
cloth: '#4b2730', clothS: '#2b141c', clothR: '#c25d5d', ember: '#ff8a3d', ink: '#120c18',
```

Fíjate en el patrón: la sombra del hueso blanco es **lila** (`#bdb0c6`), no gris. La tinta no es negra: es un violeta casi negro (`#140c1c`).

### Reglas de color

- **Uno o dos colores dominantes por personaje y un acento.** El acento (la brasa naranja) aparece solo en ojos, filo cargado, grietas y golpes: así el ojo aprende que el naranja es importante.
- **Contraste entre personajes.** La heroína es cálida (rojo y hueso) y el jefe es frío (carbón) con acento cálido. En una pelea, cada uno tiene que poder seguirse por color.
- **Los colores emisivos van en HDR** (componentes > 1, por ejemplo `[3.0, 1.3, 0.35]` para una brasa). El bloom los encuentra solos y el resto del cuadro no brilla.
- **El escenario se apaga hacia el fondo.** Menos saturación, más bruma y un tono que tiende al color del cielo. El primer plano va casi negro, con un toque del color de la luz en el borde.

## 5. Proporciones y detalle

- **Cabezona y estilizada para heroínas ágiles.** Cabeza ≈ 1/3 del alto, piernas finas, pies con punta y manos chicas: la masa visual está en la cabeza, la capa y el arma.
- **Para un bruto, masa arriba y adelante.** Torso enorme, cabeza baja entre los hombros, piernas cortas y gruesas, brazos que llegan al suelo.
- **El detalle se agrupa.** Una zona rica (cara, hombrera, empuñadura) y zonas de descanso planas. Si se reparte parejo, se vuelve ruido.
- **Detalles que cuentan algo:** la muesca gastada en la máscara, las vendas del antebrazo, la cadena rota de la muñeca, la marca roja que atraviesa el ojo. Cada uno es un trazo afinado (`stroke`) recortado a su pieza.

## 6. Referencias: qué tomar de cada una

- **Hades** (Supergiant):
  - contorno grueso y continuo;
  - sombras planas en medialuna con rayado de tinta;
  - contraluz de color;
  - paletas saturadas sobre fondos oscuros;
  - VFX con borde de tinta y formas sólidas;
  - mucho bloom en lo mágico.
- **Hollow Knight / Silksong** (Team Cherry):
  - siluetas mínimas y elegantes, con la identidad en la cabeza;
  - capas atmosféricas con bruma y partículas flotando;
  - animación con anticipaciones largas y ataques secos;
  - tela que sigue con retraso;
  - polvo de caricatura al aterrizar.
- **Death's Door** (Acid Nerve):
  - poca paleta, mucha atmósfera;
  - haces de luz y polvo en suspensión;
  - impactos con cuadro en blanco y pausa;
  - ánimo melancólico.
- **Hojas de animación con smears**:
  - el arma barre una medialuna en un solo cuadro;
  - el cuerpo se estira en el cuadro rápido y se aplasta en el contacto;
  - los recobros sostienen la pose antes de volver a la guardia.

## 7. Variante pixel art (si la piden)

El usuario lo permitió solo si es súper estilizado y detallado. **Esto todavía no se probó en FILO.** Es el camino previsto, para validarlo con el ciclo de revisión:

1. Dibuja con el mismo entintador a baja escala (`actor.scale` tal que el personaje mida 48–96 px). Usa `fixedBox` para que todos los cuadros queden registrados igual, y amplía con vecino más cercano (`imageSmoothingEnabled = false`, `image-rendering: pixelated`).
2. Cuantiza a una paleta corta (12–24 colores por personaje, los cinco tonos de cada material) y quita el antialiasing: cada píxel toma el color de paleta más cercano y el alfa se corta en 0,5.
3. Contorno de 1 px con *selout* (el contorno toma el tono oscuro del material del lado de la luz, en vez de tinta pura) y sin escaleras dobles. El rayado se vuelve un tramado de 1 px.
4. Los smears, en pixel art, son medialunas sólidas de 2–3 colores (blanco, color del filo, tinta). Los rastros del kit funcionan igual encima del sprite.
5. Anima a 10–12 fps en las poses lentas y deja el cuadro de smear un solo cuadro. Las referencias de espadas en pixel art del usuario usan 3–5 cuadros por golpe con el arma fuera de la silueta en el smear.

Si se valida, documéntalo y actualiza esta sección.
