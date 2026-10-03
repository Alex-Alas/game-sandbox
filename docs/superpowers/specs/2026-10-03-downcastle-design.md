# DOWNCASTLE — prototipo (diseño)

Fecha: 2026-10-03 · Rama: `downcastle` · Estado: acordado en chat (grilling de 6 rondas)

## Objetivo

Un *friendslop* para teléfono, en vertical y jugable con una mano. Lo juegan de 2 a 4
aventureros atados con una cuerda elástica, que bajan por las entrañas de un castillo
mágico al estilo Downwell. Mecánicas que premian el trabajo en equipo pero dejan
sabotear en broma. El tono es de campaña de D&D.

Éxito del prototipo:
- 2–4 teléfonos juegan una run de varios tramos por internet.
- Se pueden probar el bungee, el ancla, el tirón, las botas-cañón y el sabotaje.
- Al final de cada tramo se muestran premios sociales y se pide una nota de 1 a 5.

Fuera de alcance por ahora, aunque se dejan los ganchos:
- presión (derrumbe);
- tienda o mejoras;
- habilidades por clase;
- minijuegos y eventos;
- exterior de la torre;
- voz integrada;
- traspaso del rol de anfitrión;
- PWA con service worker.

## 1. Plataforma

- Web, **mobile first**, vertical fija. En horizontal aparece «girá el teléfono».
- Pantalla completa:
  - Android: botón con la API de pantalla completa más `screen.orientation.lock('portrait')`.
  - iPhone, que no tiene esa API para elementos: `manifest.webmanifest` con
    `display: fullscreen` y aviso de «Compartir → Agregar a inicio».
  - Sin service worker.
- `100dvh`, sin zoom, sin scroll y sin recargar al deslizar (`touch-action: none`,
  `overscroll-behavior: none`).
- En PC se juega con el ratón y teclas de depuración. No se diseña para PC.

## 2. Partida

- **Run**: una sesión de 15–20 min hecha de tramos (niveles cortos) procedurales y
  cada vez más largos. La run termina si caen todos.
- **Sin presión** en el prototipo: no hay reloj ni derrumbe. El derrumbe vuelve como
  modificador.
- **Ganchos (R4):** cada tramo se describe con datos
  (`{ seed, n, chunks, mods: [] }`). Los modificadores implementan
  `onTramoStart / onStep / onEvent` y se registran en una tabla. El prototipo trae la
  tabla vacía y un modificador de ejemplo apagado.
- **Objetivo del tramo:** que todos los vivos lleguen al piso de salida (el bloque FIN).
- **Gemas del equipo:** un pozo común que funciona como puntaje de la run. Salen de
  gemas sueltas, de la gema grande del bungee y de los enemigos.

## 3. Personajes y controles

- 2–4 jugadores. Cada uno elige nombre, color (uno libre de 4) y héroe. El héroe es
  solo estético: caballero, mago, elfo, enano o lagarto, en versión m/f (0x72).
- Vida: **3 corazones**, con 1,5 s de invulnerabilidad tras cada golpe.
- **Fuera de combate** con 0 corazones: queda como peso muerto colgando de la
  cuerda. Al inclinar se balancea un poco. Vuelve con 1 corazón al terminar el tramo.
- **Desconexión:** el personaje del invitado queda como peso muerto y vuelve si
  reconecta con el mismo link.

| Gesto | Acción |
|---|---|
| Inclinar (gamma relativo a la calibración) | moverse en horizontal |
| Toque (< 180 ms, < 12 px) | saltar en el suelo; en el aire, disparar hacia abajo |
| Mantener apretado (≥ 180 ms) | junto a una pared, **ancla** mientras se mantiene; en el aire, ráfaga |
| Deslizar arriba | **tirón** de cuerda: impulso hacia vos a tus dos vecinos |
| Deslizar abajo | **picada**: caída rápida, pisotón fuerte y atraviesa plataformas de madera |

- **Calibración:** al tocar «Listo» en la sala se guarda la inclinación neutra
  («sostené el teléfono como vas a jugar»).
- **Permiso en iPhone:** `DeviceOrientationEvent.requestPermission()` dentro de ese
  mismo toque.
- **Arrastre (alternativa en Ajustes):** el desplazamiento horizontal desde el punto
  de toque equivale a la inclinación.
- **Botas-cañón:**
  - 6 balas que se recargan al pisar suelo o pisotear un enemigo.
  - Cada disparo frena la caída (impulso hacia arriba leve).
  - El fuego amigo **empuja y aturde** (0,6 s), no hace daño.
- **Pisotón:** caer encima de una criatura malvada la mata, rebota y recarga.

## 4. La cuerda (corazón del juego)

- Cadena en línea A–B–C–D. El orden se sortea en cada tramo.
- Cada eslabón entre dos jugadores es una cadena de partículas Verlet que choca con
  los tiles. Mide ~48 px (3 tiles) en reposo.
- **Elástica** hasta 2× el largo; desde ahí, rígida. Solo tira, nunca empuja.
- Restricciones por posición (PBD/XPBD):
  - El jugador anclado tiene masa infinita.
  - La energía del estiramiento devuelve el **rebote bungee**.
- **Ancla:** te frena a vos y a los que cuelgan. Te deja hacer péndulos o dejar a
  alguien colgado sobre un peligro.
- **Tirón:** impulso a los vecinos hacia vos. Sirve para salvar a alguien (sacarlo del
  cubo, frenar una caída) o para sabotear (tirarlo contra pinchos o enemigos).
- Los jugadores no chocan entre sí. Solo los une la cuerda.

## 5. Criaturas (alineamiento caótico)

| Alineamiento | Rol | Prototipo | Señal visual |
|---|---|---|---|
| Malvadas | enemigos, hay que eliminarlas | **goblin** (camina por cornisas y se da vuelta en los bordes), **diablillo** (vuela hacia el jugador más cercano) | contorno **rojo** y ojos brillantes |
| Neutrales | obstáculos indestructibles, hay que esquivarlas | **cubo gelatinoso** (se desliza por las paredes; atrapa al que toca durante 3 s o hasta que un tirón lo saque; si se cumple el tiempo, −1 corazón y lo expulsa) | contorno **violeta punteado**, que significa «intocable» |
| Buenas | ayudan, a su manera caótica | **hada** (al tocarla da un corazón, o munición si estás completo; si le disparan, **se enoja** 5 s y persigue al que disparó: empuja y aturde, no daña) | **turquesa** con destellos |

- *Cambio sobre lo hablado:* las buenas pasan de dorado a **turquesa**. El castillo de
  RottingPixels es marrón y naranja, y el dorado se perdía en el fondo.
- Colores de los jugadores, distintos de los alineamientos: amarillo, verde lima, rosa
  y blanco. Cada jugador lleva un contorno de su color y un chevrón sobre la cabeza.
- Malvadas y pinchos: tocarlos de costado o desde abajo quita 1 corazón y empuja.

## 6. Pozo

- 12 tiles de 16 px de ancho (192 px de arte), con paredes en las columnas 0 y 11.
  Es el ancho de la pantalla, así que la cámara solo se mueve en vertical.
- **Bloques de 12×12 hechos a mano en ASCII**, apilados por semilla (mulberry32).
- Cada tramo: INICIO + (5 + n, tope 9) bloques intermedios, con **al menos un
  bloque bungee**, + FIN.
- Leyenda:
  - `#` piedra, `-` plataforma de madera (se cruza desde abajo y con la picada)
  - `^` pinchos, `*` gema, `G` gema grande
  - `g` goblin, `i` diablillo, `c` cubo, `f` hada, `?` criatura al azar según el nivel
  - `T` antorcha (decoración y luz)
- Verificaciones al cargar (`console.assert`):
  - cada bloque mide 12×12 y tiene las paredes en su lugar;
  - las filas de arriba y de abajo dejan un hueco de ≥ 3 tiles.
- **Bloque bungee:** una gema grande sobre un foso de pinchos, bajo una saliente.
  - Uno se ancla y otro se tira, la agarra y rebota.
  - Si el ancla suelta antes de tiempo, el que se tiró cae a los pinchos.
  - Si suelta tarde, el rebote lo estrella contra el techo.
- El anfitrión manda la semilla y cada teléfono genera el mismo mapa.
- **Perspectiva futura (R7):** el descenso es una secuencia de segmentos
  `interior | exterior`, donde el exterior es una torre cilíndrica a la que se da
  vuelta, con la x que da la vuelta. Desde ya, el dibujado pasa por una
  `project(x, y)` (identidad en el interior) y la consulta de tiles admite ancho
  envolvente.

## 7. Red

- **Transporte:** un Worker nuevo con Durable Object por sala (`games/downcastle/server/`).
  `elytra-online` no se toca. La lógica de sala (`room.js`) es pura y se comparte:
  - en producción la usa el Durable Object;
  - en desarrollo la usa un plugin de Vite que atiende `/downcastle-ws` en el mismo
    servidor, así que también funciona con teléfonos reales en la misma Wi-Fi
    (`vite --host`).
- **Salas:**
  - Al crear una, el cliente propone un código de 4 letras (sin I ni O) y conecta con
    `create=1`; si ya existe, prueba otro.
  - Se comparte con link `?sala=ABCD`, con la Web Share API y con un QR (`uqr`).
  - 4 jugadores como máximo.
  - Se puede unir alguien entre tramos, no a mitad de un tramo, y entra al final de la
    cadena.
  - Si se va el anfitrión, la sesión termina con un aviso.
  - La sala se cierra cuando queda vacía 2 min.
- **Autoridad: anfitrión.**
  - El teléfono que crea la sala simula a 60 Hz y manda el estado de la partida a 20 Hz.
  - Los invitados mandan entradas a 30 Hz (inclinación y mantener) más eventos
    puntuales con número de secuencia (toque, tirón, picada).
- **Predicción suave:**
  - Los invitados dibujan a los demás interpolados con 100 ms de retraso.
  - A su propio personaje lo dibujan extrapolado desde el último estado recibido.
  - El destello del disparo, el sonido y la vibración propios suenan al instante en el
    teléfono local.
- **Protocolo:** JSON con valores redondeados. Mensajes de 16 KB como máximo.
- **Despliegue:** a mano con `npx wrangler deploy` (requiere `wrangler login` una vez).
  El cliente apunta a `CFG.WS_URL`, que se puede cambiar con `?ws=`.

## 8. Pantallas

1. Título: Crear sala / Unirse / Pantalla completa / Ajustes (control, música, efectos,
   vibración).
2. Sala: código, QR, compartir; nombre, color, héroe; «Listo», que calibra y pide el
   permiso. El anfitrión arranca con 2–4 jugadores (con `?solo=1`, 1 más bots).
3. Tramo.
4. Premios sociales y nota de 1 a 5.
5. «Siguiente tramo», que decide el anfitrión.
6. Fin de la run: gemas, tramos y premios de la run, y vuelta a la sala.

## 9. Premios sociales y telemetría

- Contadores por jugador y por tramo:
  - tiempo anclado con carga;
  - gemas conseguidas en rebote;
  - disparos a compañeros;
  - tirones que terminaron en daño a otro;
  - rescates;
  - hadas enojadas;
  - tiempo fuera de combate;
  - caídas y golpes recibidos.
- **Premios, cada uno con mínimo (R5):** se muestran hasta 3, ordenados por cuánto
  superan el mínimo. Si nadie llega a ninguno: «Sin trofeos este tramo».

| Premio | Contador | Mínimo |
|---|---|---|
| Ancla de Hierro | s anclado con alguien colgando | 6 s |
| Bungee de Oro | gemas conseguidas en pleno rebote | 1 |
| Fuego Amigo | disparos que dieron en compañeros | 3 |
| Tirón Traicionero | tirones que terminaron en daño a otro (≤ 1,5 s después) | 1 |
| Salvavidas | tirones que sacaron a alguien del cubo o lo libraron de un daño seguro | 1 |
| Domador de Hadas | hadas enojadas | 1 |
| Peso Muerto | s fuera de combate | 12 s |

- **Telemetría:** al terminar cada tramo se guarda en `localStorage['downcastle.tel']`
  (los últimos 200) el tramo, la duración, las gemas, los contadores, el resultado y la
  nota de 1 a 5 de ese teléfono.

## 10. Arte y audio

- Pixel art de 16×16, dibujado en un canvas de baja resolución (192 px de ancho) y
  escalado a un factor entero con `image-rendering: pixelated`. Rellenar ese canvas
  casi no cuesta nada en el teléfono.
- Assets:
  - **0x72 DungeonTileset II** (CC0): héroes, goblin, diablillo, corazones, monedas.
  - **RottingPixels Castle Platformer** (libre, crédito apreciado): interior.
  - Cubo, hada, pinchos y gemas se dibujan en código.
- Mazmorra oscura:
  - una capa de oscuridad con círculos de luz alrededor de antorchas y jugadores;
  - contornos por color generados al cargar.
- Interfaz pegada al personaje: corazones y balas como puntitos sobre la cabeza
  propia. Arriba solo van las gemas. Los corazones ajenos aparecen al cambiar.
  Flechas en el borde marcan a los compañeros fuera de pantalla.
- Música: `tankards_at_the_hearth` (título, sala y premios) y
  `trouble_at_the_iron_gate` (pozo).
  - Un loop por contexto que suena por un elemento `<audio>` pasando por un
    pasabajos de Web Audio.
  - El filtro se cierra en menús y al quedar fuera de combate.
- Efectos procedurales (disparo, golpe, tirón, gema, atrapado, pisotón, rebote) y
  vibración en Android.
- Rendimiento: 60 fps en un Android de gama media de unos 4 años. Paquete JS por
  debajo de 150 KB, sin contar música ni imágenes.

## 11. Verificación

- `window.__downcastle`: `bots(n)` (jugadores locales con IA simple en el anfitrión),
  `advance(seg)`, `state()`, `seed(s)`.
- `?solo=1` arranca con un solo jugador más bots.
- Playwright con 2–4 páginas que emulan teléfonos (390×844, `hasTouch`) contra
  `npm run dev`:
  - se crea y se une a la sala;
  - se juega un tramo con bots;
  - aparecen los premios;
  - se reconecta;
  - el anfitrión se va.
- `npm run build` sin errores. El Worker no se despliega sin pedírtelo.
