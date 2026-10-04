# DOWNCASTLE — ronda 2: hoja de ruta

Fecha: 2026-10-03 · Estado: acordado en chat (grilling de 6 rondas, tras probarlo con 2 jugadores)

Parte del prototipo ([`2026-10-03-downcastle-design.md`](2026-10-03-downcastle-design.md)), que funciona
y divierte con 2: las muertes son chistosas y los tramos se sienten como retos que se resuelven
en equipo aprendiendo los controles. Esta ronda le da **profundidad** sin quitarle lo casual.
Cada fase lleva su propia spec y su aprobación; esta hoja es el marco común.

## Principios

- **Sin mejoras incrementales.** Nada te hace más fuerte. El progreso es **experiencia**: haber
  llegado más hondo, conocer más criaturas, presumir hazañas.
- **Más complejo, no más frustrante.** La dificultad sube pidiendo actuar más seguido y de
  formas más variadas, sin dejar que una sola estrategia rígida alcance. Entre bloque y bloque
  nunca debe parecer otro juego.
- **Caso principal: 2 jugadores.** Se diseña y balancea para 2; con 3–4 se verifica que funcione
  (escala de enemigos, cadena de cuerda).
- **Regla de controles (desde ya).** Ninguna mecánica puede depender de un gesto sin equivalente en
  teclado o gamepad (nada de «agitar el teléfono»), porque PC será una plataforma real.
- **Mecánicas de cuerda nuevas: fuera por ahora** (poleas, palancas a distancia, cortes, cuerda
  conductora). Se consideran experimentales; la cuerda no cambia en esta ronda.

## 1. Run infinita en ciclos

- La run es **infinita** y termina cuando caen todos (como hoy).
- Se divide en **ciclos**: **4 tramos + jefe**.
  - Dentro del ciclo la dificultad sube poco: cada tramo es más largo que el anterior y la
    densidad crece, pero **no aparecen novedades a mitad de ciclo**.
  - El primer tramo del ciclo siempre es normal y corto, para presentar las novedades sin nada
    encima.
  - Tras vencer al jefe hay un **salto**: más largo, y además **criaturas, obstáculos, mecánicas,
    modificadores u objetivos nuevos**.
- **Largo:** bloques = 5 + 1 por tramo + 3 por ciclo (el tope se ajusta jugando).
- **Presupuesto de complejidad.** Cada elemento tiene un costo y cada tramo un tope que crece con
  el ciclo y el tramo. El generador llena el tramo sin pasarse. Los modificadores y objetivos
  caros (derrumbe, arena, carga) obligan a elegir bloques baratos. Es la pieza que garantiza
  «más complejo, no más frustrante».
- **Currículo fijo** en los primeros ciclos (siempre se presenta lo mismo en el mismo orden). Al
  acabarse el contenido nuevo, la run entra en un bucle «+1»: mezcla al azar de todo lo visto,
  más modificadores.

| Ciclo | Bioma (paleta) | Novedades | Objetivo nuevo | Jefe |
|---|---|---|---|---|
| 1 | Mazmorra (la actual) | esqueleto arquero, plataformas que se derrumban, derrumbe (en uno de los tramos 3–4) | — | **El Ojo** |
| ext. | Exterior de la torre | viento, gárgola, plataformas móviles, murciélago | — | — |
| 2 | Bodegas inundadas (azul y verde) | péndulo con pinchos, mímico, murciélago en el interior | arena | **Gusano devorador** |
| 3 | Biblioteca arcana (violeta) | cultista, duende chismoso, golem dormilón | carga | **Rey Goblin** |
| 4 | Criptas (gris y verde) | por definir | llave y puerta, escolta del hada | por definir |
| 5+ | bucle «+1» | mezcla al azar + modificadores | — | rotación |

- Los biomas se distinguen con **cambio de paleta**, accesorios y criaturas propias. Si hace falta
  arte nuevo, sale del pipeline de Aseprite.
- **Ninguna criatura propuesta se descarta.** Después del currículo también entran los objetivos
  restantes.

## 2. Modificador «derrumbe»: cámara forzada

Sustituye al `EJEMPLO_DERRUMBE` (huir de una línea que baja) por una **cámara forzada**:
el objetivo no es escapar, sino **adaptarse a un ritmo**.

- La cámara deja de seguir a cada jugador. Es **una sola cámara compartida**, la simula el
  anfitrión y baja junto con el derrumbe, que es su borde superior.
- **Velocidad base:** sube linealmente a medida que avanza el tramo, bloque a bloque, y se escala
  con el costo del bloque (más lenta en bloques densos, más rápida en pasillos). La base sube con
  el ciclo.
- **Rubber banding solo en eventualidades:**
  - Mientras haya un jugador adelantado (en el 25 % inferior de la pantalla), la cámara
    **acelera para alcanzarlo, con retraso**. El que se apura baja un momento a ciegas.
  - Si el equipo recibe **más de 1 golpe del derrumbe en muy poco tiempo**, la cámara **afloja
    muy poco**.
  - Pasada la eventualidad, vuelve suave a la velocidad que marca el bloque. Fuera de esos
    momentos se siente el aumento lineal normal.
- **Tocar el derrumbe:** −1 corazón, empujón hacia abajo e invulnerabilidad.
- **Abajo no hay barrera.** Los bloques de tramos con derrumbe se diseñan con peligros que
  castigan bajar sin ver (murciélagos colgados, esqueletos que miran hacia arriba, plataformas que
  se derrumban). **Se premia el buen ritmo, no bajar de golpe.**
- **No hay racha ni puntaje de ritmo.**
- Reglas que el generador cumple siempre:
  1. Presupuesto alto: con derrumbe solo entran bloques baratos y aptos (rutas anchas, sin
     callejones, sin cubo y sin bungee).
  2. Nunca en el primer tramo del ciclo, nunca en dos tramos seguidos, nunca junto a un elemento
     presentado en ese mismo ciclo, y nunca junto con la carga hasta los ciclos avanzados.
  3. Aviso de 3 s: temblor, «¡DERRUMBE!» y «la cámara se suelta de ti».
  4. Calibración con bots en Node: la velocidad se ajusta hasta que 2 bots terminen con margen y
     casi no toquen el derrumbe. Un bloque que falla no entra al pool del derrumbe.
  5. Telemetría: la nota de 1 a 5 por tramo guarda los modificadores activos. Si los tramos con
     derrumbe sacan menos nota, se ajusta.

## 3. Jefes

- **Uno por bioma**, con un cuarto de una pantalla (12×24) que se cierra al entrar todos.
  - **El Ojo** (Mazmorra): flota y lanza rayos que barren el cuarto. Los rayos empujan y aturden,
    pero no dañan. Su ojo central solo se daña con la **picada** cuando está abierto.
  - **Gusano devorador** (Bodegas): jefe de persecución; sube desde abajo mientras se baja y se
    reutiliza la cámara forzada.
  - **Rey Goblin** (Biblioteca): salta, invoca goblins y hace temblar el piso.
- Quedar todos fuera de combate frente al jefe termina la run (como cualquier tramo).

## 4. Exterior de la torre

- **Cilindro** de 32 tiles de circunferencia. La simulación usa la x que da la vuelta
  (`lv.wrap`); el render, una **proyección tipo Nebulus**: el jugador queda centrado y la torre
  gira bajo él, con los tiles achatados hacia los bordes y la cara de atrás oculta.
- **Siluetas.** Un compañero detrás de la torre (o tapado por la geometría) se dibuja como silueta
  a través de la piedra, y la cuerda se ve rodeando la torre.
- **Anillos ASCII de 32×8** hechos a mano, apilados por semilla y con las mismas verificaciones de
  alcanzabilidad. Llevan muros, pisos, plataformas móviles y obstáculos: restringen la libertad
  sin dejar una sola ruta posible.
- **Dónde aparece:**
  - **Siempre después del jefe**: rompen una ventana y bajan rodeando la torre hasta el siguiente
    bioma. Es el respiro narrativo del ciclo.
  - **Mini-tramos exteriores** de 2–3 anillos entre tramos del ciclo, para variar. No cuentan
    entre los 4 del ciclo.
  - Ambos terminan con su **pantalla de premios** (si no, se sentirían como un tramo larguísimo).
- Mecánicas propias: **viento** (empuja alrededor de la torre), **gárgola** (sopla ráfagas),
  **plataformas móviles**, **murciélago**.
- Más adelante: **ventanas dentro de un tramo** (salir, explorar afuera y volver a entrar).

## 5. Mecánicas de mundo nuevas

- **Plataformas que se derrumban** (ciclo 1) y **plataformas móviles** (exterior). Interior y
  exterior.
- **Viento** (exterior).

## 6. Objetivos de tramo

Hoy solo existe «todos los vivos llegan al FIN». Orden de desarrollo (valor y esfuerzo, decidido):

1. **Derrumbe** (modificador) y **jefe**: los que entran más directo al ciclo actual.
2. **Arena:** sala cerrada con oleadas; la salida se abre al limpiarla. Comparte la sala cerrada
   con el jefe.
3. **Carga:** un cofre o prisionero atado a la cuerda como un nodo más, que es peso muerto real y
   hay que bajarlo vivo. Toca el corazón de `sim.js` (`ropePath`, red, render).
4. **Llave y puerta** y **escolta del hada.**

## 7. Progreso por experiencia

- **Ahora:**
  - **Contenido por profundidad**: lo nuevo solo se ve si se llega.
  - **Bestiario**: una pantalla en el título. Cada criatura aparece como silueta hasta verla, y
    después con nombre, bajas, «te mató N veces» y una frase de D&D. Los jefes tienen página
    propia.
  - **Cosméticos v1** ganados con hazañas acumuladas (contadores de los premios sociales):
    colores o patrones de cuerda y **títulos** que se ven en la sala («El Traicionero», por 10
    Tirones Traicioneros). Se dibujan en código.
  - **Ningún héroe existente se bloquea**: quien entra por un link siempre puede elegir.
- **Después:**
  - Sombreros y variantes de héroe (v2, con arte).
  - Atajos al estilo Spelunky (empezar en un ciclo ya alcanzado).
  - Modificadores desbloqueables.
- **Por teléfono:** cada jugador presente cuenta como que vio o mató a la criatura. Los cosméticos
  viajan en el perfil de la sala, así que los demás los ven.

## 8. Cuentas y producto

- **Cuentas opcionales** para persistir el progreso en cualquier dispositivo. Se juega como
  invitado y el perfil local se migra a la cuenta al iniciar sesión. Un amigo que entra por link
  nunca ve un muro de login.
- **Supabase**: Auth (Google y enlace mágico por correo) más Postgres con RLS. Las salas siguen en
  el Durable Object de Cloudflare. El progreso confía en el cliente: es casual y cooperativo, sin
  tablas competitivas.
- El perfil local se diseña desde ya con la forma que tendrá en la nube. El inventario de
  cosméticos lleva `origen: hazaña | compra`, y los derechos se guardan en una tabla
  `entitlements` ligada a la cuenta.
- **Plataformas:**
  - Ahora web/PWA.
  - Después Play Store y App Store (Capacitor), itch.io y Steam. Steam exige teclado y gamepad de
    primera clase y juego cruzado móvil↔PC; el canvas sigue en vertical con arte a los costados.
  - Muy a futuro, un port a Roblox. La lógica guiada por datos (bloques ASCII, tablas) facilita
    portarla.
  - Login con Google y enlace mágico. «Iniciar sesión con Apple» se agrega al empaquetar para iOS.
- **Monetización (nunca pagar para ganar):**
  - Web y móvil gratis con anuncios: **solo un intersticial al terminar la run**, como máximo 1
    cada ~10 min. Nunca durante ni entre tramos, sin banners y sin anuncios con premio que den
    ventaja.
  - **«Sin anuncios» US$3,00.** **«Aventurero (contribuidor)» US$4,99**: sin anuncios, cosméticos
    especiales y personalización (paleta del héroe, color de nombre, estilo de cuerda propio).
  - Si alguien de la sala tiene la versión sin anuncios, **nadie de la sala ve anuncios**.
  - Los derechos van ligados a la cuenta y valen en todas las plataformas. Steam e itch.io son de
    pago, sin anuncios, e incluyen «Aventurero».
  - Las reglas de las tiendas sobre compras hechas fuera de la app se revisan en F6.

## 9. Fases

| Fase | Contenido | Desbloquea |
|---|---|---|
| **F0 · Herramientas** | `?ciclo=&tramo=`, etiquetas y costo de los bloques, arnés de bots en Node con métricas, visor de bloques | iterar rápido en todo lo demás |
| **F1 · Ciclo jugable** | estructura de ciclo, rampa de largo, presupuesto, derrumbe con cámara forzada, El Ojo, esqueleto arquero, plataformas que se derrumban | probar con 2 un ciclo completo |
| **F2 · Exterior** | cilindro Nebulus, anillos, siluetas, viento, gárgola, plataformas móviles, murciélago, bajada después del jefe y mini-tramos | el respiro y la transición entre biomas |
| **F3 · Perfil** | bestiario, cosméticos v1, cuentas Supabase, forma del inventario y de los derechos | persistencia multiplataforma |
| **F4 · Ciclo 2** | Bodegas, arena, péndulo, mímico, Gusano | segundo bioma |
| **F5 · Ciclo 3** | Biblioteca, carga, cultista, duende, golem, Rey Goblin | tercer bioma |
| **F6 · Plataformas** | PWA pulida, itch.io, Steam (controles de PC, empaquetado), tiendas móviles, anuncios y compras | producto |

Después: ciclo 4 (Criptas, llave y escolta), ventanas dentro del tramo, atajos, modificadores
desbloqueables y cosméticos v2. Spec de F0+F1:
[`2026-10-03-downcastle-f0-f1-design.md`](2026-10-03-downcastle-f0-f1-design.md).
