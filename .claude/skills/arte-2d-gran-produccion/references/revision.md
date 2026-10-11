# Ciclo de revisión

El salto de «correcto» a «de gran producción» sale de mirar el resultado una y otra vez con ojo de director de arte, no de escribir más código. En FILO, cada mejora visible (el velo del contraluz, la piel pálida, el primer plano invisible, los arcos rectos del rastro) apareció al **mirar una captura**, nunca al leer el código.

## 1. La vuelta

1. **Renderizar** lo que cambió:
   - un primer plano del asset a 4–6× (hoja de contactos del laboratorio);
   - la escena completa a tamaño de compu (1280×720);
   - la escena en un teléfono (844×390 acostado o 390×844 parado).
2. **Mirar.** Leer los PNG con la herramienta de lectura de imágenes. No alcanza con que el comando termine bien.
3. **Comparar con la referencia** (las imágenes del usuario o los juegos nombrados) en este orden:
   1. silueta;
   2. valores;
   3. color;
   4. calidad del borde;
   5. densidad de detalle;
   6. arcos y espaciado del movimiento;
   7. peso de los golpes.
4. **Anotar tres defectos concretos** con la causa probable. Por ejemplo: «la capa termina en una curva blanda: faltan esquinas en las puntas del ruedo». Evita los defectos vagos como «se ve raro».
5. **Corregir, volver a renderizar lo mismo y comparar** con la captura anterior (mismos parámetros y mismo cuadro).

Da al menos tres vueltas por asset. Si una vuelta no encuentra nada, mira otra escala, otro cuadro o el modo plano.

## 2. Herramientas

### Laboratorio (hojas de contactos sin WebGL)

Con el dev server de Vite corriendo, `kit/lab.html` acepta estos parámetros (en FILO es la misma página con `?lab=1`: `/games/filo/?lab=1&c=…`):

```
lab.html?c=idle,slash1&s=6&f=0-4&crop=0.26,0.3,0.66,0.88&bg=dark
```

| Parámetro | Qué hace |
|---|---|
| `c` | Clips |
| `s` | Px por unidad |
| `f` | Cuadros: lista y rangos |
| `crop` | Recorte en fracciones de la caja |
| `bg=dark` | Fondo oscuro, para ver el contraluz |
| `ch=brute` | Otro personaje |
| `flat` | Vector crudo, sin entintado |
| `rim=0` | Sin contraluz, para aislar el defecto |

`window.__labReady` avisa cuando terminó.

### Capturas con Chromium headless

Usa `scripts/shot.mjs` de esta skill:

```bash
node <skill>/scripts/shot.mjs "/src/kit/lab.html?c=idle&s=6&bg=dark" salida.png 900 900 "window.__labReady"
BASE=http://localhost:4173 DPR=2 TOUCH=1 node <skill>/scripts/shot.mjs "/?modo=scene" movil.png 390 844
EVAL="__app.step(2.3)" node <skill>/scripts/shot.mjs "/?shot=1" golpe.png 1280 720 "window.__app"
```

El script busca Playwright instalado (local, global o el de `/opt/node22`) y lanza Chromium con:

- `--disable-accelerated-2d-canvas`: sin esto, `screenshot`/`toDataURL` se cuelgan con miles de trazos recortados;
- WebGL por SwiftShader.

Para capturas deterministas, la página debería tener un modo sin `requestAnimationFrame` (`?shot=1`) y una función que avance el tiempo a mano (`step(segundos)`). Así un golpe se captura en el cuadro exacto del smear.

## 3. Síntomas → causas

| Síntoma | Causa probable | Arreglo |
|---|---|---|
| Un velo de color cubre todo el personaje | `destination-out` con un color translúcido solo borra en parte | Máscara opaca, `destination-out` y recién después el color con `source-in` |
| Contraluz en bordes interiores | La unión se hizo con un solo `Path2D` de piezas con sentidos de giro distintos | Pintar la unión pieza por pieza en el lienzo auxiliar |
| Personaje gris o pálido | ACES, luz sumada en vez de multiplicada, o piel de valor medio | Curva suave, luz que multiplica, pieles oscuras y saturadas |
| Se ve «hecho de figuras» | Contorno por pieza, sombras de degradé, rectas perfectas, miembros por segmentos | Contorno global, sombra en medialuna, `rough` y `limb` de una pieza |
| La animación se ve de Flash | Muestreo continuo, sin poses sostenidas, sin smear | Muestreo en cuadros enteros, `snap` en el contacto, sostener 2–3 cuadros |
| El rastro del arma es una recta | Se unieron posiciones de punta, no poses | Interpolar la pose (`lerpPose`) y pedir la hoja en cada paso |
| La tela explota o cruza la pantalla | Un salto de posición se tomó como velocidad | Ignorar desplazamientos de más de 40 unidades y limitar `maxD` |
| Sprites translúcidos o lavados de repente | La mezcla aditiva quedó puesta | `blendFunc` explícito antes de cada pasada |
| Texturas cruzadas en el primer cuadro | Una subida pisó la unidad del ruido | `activeTexture(TEXTURE0)` en toda subida y el ruido fijo en la 7 |
| No se ve el primer plano | El desenfoque por mipmap borró lo fino | Formas gruesas |
| No se ve la niebla | Muy oscura o detrás de todo | Más clara que lo que tapa y entre capas pintadas |
| El golpe «no pega» | El evento no cae en el cuadro del smear, o falta hitstop o sacudón | Evento en el cuadro exacto, más la receta completa de `vfx-y-game-feel.md` |
| Un actor revive o sigue atacando después de morir | La línea de tiempo lanza clips sin mirar la vida | Revisar `hp`/`dead` antes de cada `play` |
| Captura colgada o en negro | Lienzo 2D acelerado en headless, o se capturó antes de pintar | `--disable-accelerated-2d-canvas` y esperar una bandera (`__labReady`) |

## 4. Rendimiento (también se revisa)

- El actor redibuja solo cuando cambia el dibujo, en un lienzo ajustado a lo que ocupa el dibujo (no a la caja fija). En el teléfono es la diferencia entre subir 2 MB o 16 MB por dibujo.
- Las capas pintadas se pintan una sola vez. Las animadas (vaivén, niebla, haces) se animan en el shader.
- Revisa los fps en el teléfono emulado con la resolución adaptativa encendida.
