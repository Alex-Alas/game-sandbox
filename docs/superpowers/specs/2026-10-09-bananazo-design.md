# BANANAZO — diseño (clon de BOMBANANA!)

Pedido del usuario (2026-10-09): «haceme un clon del Boom Banana». Es **BOMBANANA!** (Lefto Studio / TARK, Steam, 2 de
septiembre de 2026): co-op online de 3 en primera persona donde tres monos desactivan bombas y cada uno tiene un sentido
menos. Lo armé sin preguntas de por medio; todo lo de abajo son **decisiones mías para revisar**. Lo que el usuario quiera
cambiar se cambia; nada está calibrado con gente.

## Qué tomé del original

- Tres papeles: **CIEGO** (el único que toca la bomba; no ve colores ni pantallas; lee braille y oye la bomba), **SORDO** (ve
  la bomba y los gestos; no oye), **MUDO** (el único con el manual; no habla, solo gestos).
- La red de comunicación de las guías: el SORDO no oye a nadie y lo oyen todos; el CIEGO oye solo al SORDO; el MUDO oye a los
  dos pero nadie lo oye; el MUDO y el CIEGO no se ven, así que los gestos pasan por el SORDO.
- Bombas con módulos, reloj y errores permitidos; módulos de **caos** que no se desactivan y hay que atender; peligros del
  lugar (apagón, ruido, sacudones); campaña de 30, modo infinito y personalizado; lugares: una combi, un avión y otro más.
- Las mismas familias de módulos que listan las guías (cables, calculadora, direcciones, correderas, panel de sonido,
  símbolos, piano, «el mono dice», morse, laberinto, interruptores; de caos, presión, palanca que sube y alarma), con
  **reglas y tablas propias**: las del original no son públicas y además cambian por sesión.
- Cachetadas / bananas tiradas: acá es el **bananazo** (se siente aunque no te vean ni te oigan).

## Decisiones (para confirmar)

| Tema | Elegí | Alternativas |
| --- | --- | --- |
| Nombre | **BANANAZO** (bananazo = golpe con banana y explosión) | MONOBOMBA, TRES MONOS |
| Vista | **Canvas 2D en caricatura procedural**, una pantalla distinta por papel (como el resto del repo) | 3D en primera persona con Three.js (como ELYTRA) |
| Jugadores | **Exactamente 3, online**, más una **práctica** solo donde se cambia de papel | variante de 2 (ver + tocar) |
| Bots | **No hay**: el juego es comunicarse | — |
| Voz | **WebRTC en malla** (la de DOWNCASTLE) con el ruteo de arriba, abierta en la sala | solo chat de texto |
| Sin micrófono | **Chat de texto con las mismas reglas**; lo que escribe el SORDO el CIEGO lo oye con voz sintética | — |
| Gestos | Botonera fija: sí, no, ¿qué?, esperá, otra vez, ¡ojo!, bien, mal, **números 0–10**, flechas y «al medio». **Sin colores**: el SORDO pregunta y el MUDO asiente | rueda de gestos más chica |
| Quién oye la bomba | El CIEGO todo; el MUDO solo lo fuerte (tic tac, errores, piano, presión, alarma, radio); el SORDO nada | que el MUDO oiga todo |
| Tablas | Salen de la semilla de **cada bomba** | una tabla fija por sesión |
| Errores | Hay `miss` permitidos y **cada error acelera el reloj** 20 % | sin aceleración |
| Peligros | **Baches** (todo salta y el CIEGO pierde la mano un instante), **radio** (tapa las voces; solo el SORDO la ve y la apaga), **apagón** (el SORDO ve solo lo que brilla, el MUDO lee con linterna; al CIEGO le da igual) | obstrucciones físicas |
| Lugares | La combi (1–10), la avioneta (11–20), el tren (21–30) | — |
| Progreso | Campaña desbloqueada por el anfitrión ganando online; estrellas por errores; récord del infinito | — |

## Módulos

Normales (se desactivan): CABLES, CALCULADORA, FLECHAS, CORREDERAS, TIMBRES, PIANO, RULETA, MONO DICE, MORSE, LABERINTO,
PALANCAS. De caos: PRESIÓN (bombear la válvula; el siseo dice cuánto falta) y ALARMA (apretar todo lo que quema en 12 s).
Lo que hace cada papel en cada uno está en `HOW` (`src/manual.ts`), que es lo mismo que muestran la sesión informativa y el
manual. Quedó afuera la «palanca que sube» (se parece demasiado a PRESIÓN).

## Pendiente / para calibrar jugando

- Tiempos de cada nivel (supuse ~70 s por módulo para un equipo que ya se entiende) y errores permitidos.
- Ritmo de PRESIÓN (llena en 50 s), de la ALARMA (cada 28–48 s) y de los peligros.
- Si los gestos alcanzan o hace falta una seña de color.
- La voz es solo con STUN (sin TURN): entre algunas redes no conecta y queda el chat. Las salas andan en la versión publicada
  con el Worker de DOWNCASTLE (verificado el 2026-10-09).

## Segunda vuelta (pedido del usuario: multijugador, jugar en el teléfono y botón de pantalla completa)

- Multijugador: verificado contra el Worker de producción con tres teléfonos emulados; el anfitrión limita a 3 (el Worker
  desplegado no respeta el cupo); QR e INVITAR en la sala.
- Teléfono: cada uno acomoda la bomba a su pantalla (parado, 2 columnas), la mano viaja por módulo, tocar acerca un módulo y
  ahí se aprieta, ◀ ▶ para pasar de módulo, vibración al tantear, módulos numerados, paneles que no tapan lo importante.
- Pantalla completa: botón en todas las pantallas, automática en táctil al entrar, y en iPhone «Agregar a inicio» (manifest).
