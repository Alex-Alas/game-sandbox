# MANIFEST de assets 3D (F0)

Inventario de los packs para HYPERFLOWGEON (acción 2.5D; spec en `docs/superpowers/specs/2026-10-06-hyperflowgeon-f0-design.md`). Fuente: carpeta de Drive compartida el 2026-10-06
(43 archivos) y los repositorios oficiales de KayKit en GitHub.

> **Estado: incompleto.** El contenedor de desarrollo no puede bajar de Google Drive ni de quaternius.com
> (bloqueados por la política de red del entorno). Los packs KayKit se midieron sobre la copia oficial de
> GitHub (`github.com/KayKit-Game-Assets/*`, mismo autor y licencia). Los packs Quaternius y KayKit
> Character Animations figuran con los datos que publica el autor y quedan **PENDIENTE de medir** hasta que
> los archivos estén en `assets/packs/`. Ver «Cómo completar este inventario» al final.

Leyenda: ✅ medido sobre los archivos · 📄 datos publicados por el autor, sin medir · ⚠ licencia dudosa o desconocida · ⛔ excluido

## 1. Packs aprobados en el brief

| Pack (archivo en Drive) | Autor | Licencia | Formatos | Contenido | Polycount | Animación | Estado |
|---|---|---|---|---|---|---|---|
| Universal Base Characters [Standard] (129 MB) | Quaternius | CC0 1.0 | FBX, glTF | 6 cuerpos (Superhéroe / Normal / Adolescente × H/M), 20 peinados | ~13.000 tris por personaje (promedio publicado) | Rig humanoide propio de Quaternius, sin clips | 📄 |
| Universal Animation Library [Standard] (16 MB) | Quaternius | CC0 1.0 | FBX, glTF (a confirmar) | 45 clips en Standard (120+ en Source) | — | Mismo rig que UBC | 📄 |
| Universal Animation Library 2 [Standard] (19 MB) | Quaternius | CC0 1.0 | FBX, glTF (a confirmar) | ~70 % de 130+ clips: locomoción, parkour, combate cuerpo a cuerpo y con armas, combos de 3–4 golpes **separados en golpe + recuperación**, civiles, zombi | — | Mismo rig que UBC | 📄 |
| Modular Character Outfits – Fantasy [Standard] (294 MB) | Quaternius | CC0 1.0 | FBX, glTF (a confirmar) | 12 trajes en 62 partes, 3 variantes de textura por traje; usa cabezas de UBC | sin dato | Rig humanoide (compatible UBC/UAL) | 📄 |
| Downtown City MegaKit [Standard] (235 MB) | Quaternius | CC0 1.0 | OBJ, FBX, glTF | 300+ piezas modulares de manzanas estilo Boston/NYC (≈60–70 % en Standard), sets de textura compartidos | sin dato | — | 📄 |
| Stylized Nature MegaKit [Standard] (104 MB) | Quaternius | CC0 1.0 | FBX, glTF (a confirmar) | 68 modelos en Standard de 116 (40 árboles, 35 plantas/flores, 27 rocas, pasto, arbustos); hojas intercambiables | sin dato | — | 📄 |
| KayKit Prototype Bits 1.1 FREE (5 MB) | Kay Lousberg | CC0 1.0 | OBJ, FBX, glTF | 72 modelos (v1.0): primitivas, muros, puertas, **Dummy_Base**, dianas, barriles, cajas, palés, monedas | 6 – 3.130 tris (mediana 68); total 16 k | Ninguna | ✅ (v1.0; Drive trae 1.1) |
| KayKit Furniture Bits 1.0 FREE (4 MB) | Kay Lousberg | CC0 1.0 | OBJ, FBX, glTF | 53 muebles: sillas, sillones, camas, estantes, lámparas, cuadros, alfombras, libros, mesas | 44 – 1.018 tris (mediana 216); total 15 k | Ninguna | ✅ |
| KayKit Medieval Hexagon Pack 1.0 FREE (35 MB) | Kay Lousberg | CC0 1.0 | OBJ, FBX, glTF | 221 modelos: losetas hexagonales (pasto, agua, costa, ríos, caminos), 18 edificios × 4 colores + neutros (muros, puertas, torres, castillo, iglesia, molinos, andamio, puentes), naturaleza y utilería | 16 – 5.659 tris (mediana 288); castillo 5.659 | Ninguna | ✅ |
| KayKit Character Animations 1.1 (15 MB) | Kay Lousberg | CC0 1.0 | FBX, glTF (a confirmar) | 133 clips: generales, locomoción, cuerpo a cuerpo (1 mano, 2 manos, desarmado, dual, bloqueo), a distancia, simulación; 1.1 agrega 28 de herramientas | — | **Rig_Medium / Rig_Large de KayKit** (proporciones cabezonas) | 📄 |

### Detalle de lo medido (KayKit)

Medido con `node tools/assets-inventory.mjs` sobre los glTF (una copia por modelo; los FBX/OBJ son duplicados
del mismo contenido).

- **Texturas:** cada pack usa **un solo atlas de gradiente de 1024×1024** (`prototype_texture`,
  `furniture_texture`, `hexagons_medieval`; Hex trae variantes por color). Se puede bajar a 128×128. Ningún
  material tiene metalness > 0,5, a diferencia de los modelos Kenney de ELYTRA.
- **Draw calls:** 1 por modelo en casi todos (máx. 6 en Prototype, 3 en Hex). Ideal para `InstancedMesh`.
- **Escala real (alto en unidades):** puerta de Prototype 2,8; `Dummy_Base` 1,8; silla 1,26; lámpara de pie
  2,5. **Medieval Hex está a escala de maqueta:** casa 0,93, iglesia 1,65, castillo 3,98, loseta de 2 de
  ancho. Para usarlo a escala humana hay que agrandarlo 5–8 veces (ver riesgos).
- **Lo más pesado:** Prototype `Pallet_Small_Decorated_B` 3.130 y `Dummy_Base` 2.454 tris; Furniture
  `cabinet_medium_decorated` 1.018; Hex `building_castle_*` 5.659 y `building_barracks_*` 4.007.
- **Útil para F1 (sandbox):** Prototype trae el muñeco de práctica (`Dummy_Base`, estático y sin rig), dianas
  rompibles en piezas (`target_pieces_A…F`), muros con ventana/puerta, rampas, escaleras y pilares: alcanza
  para el campo de entrenamiento entero.

### Riesgos de los packs aprobados

1. **Dos estilos de personaje.** Los personajes Quaternius (proporciones humanas, ~13 k tris) y el rig de
   KayKit (cabezón, low-poly) no combinan. KayKit Character Animations está hecho para Rig_Medium/Rig_Large:
   retargetearlo al rig de Quaternius deforma poses y mezclar personajes de los dos rompe la regla de no
   mezclar estilos. Propuesta en el GDD: personajes solo Quaternius.
2. **Trajes y accesorios.** Modular Outfits Fantasy son armaduras y túnicas medievales: sirven tal cual para
   el reino vikingo y de base para los demás. Los accesorios de cada cultura (tricornio, sombrero vaquero,
   máscara de águila, etc.) se modelan aparte (spec §6). Por medir: si trae cascos y armaduras vikingas.
3. **Peso.** Los Standard aprobados suman ~870 MB comprimidos (FBX + glTF + OBJ duplicados). Al juego solo
   llega lo exportado, optimizado (meshopt + KTX2) y partido por bioma; objetivo < 15 MB para el primer
   jugable.
4. **Polycount de personajes.** 13 k tris × 10–15 personajes en pantalla es demasiado para Android de gama
   media; enemigos con LOD simplificado (3–5 k tris).
5. **Medieval Hex a escala de maqueta.** Agrandado se ve tosco de cerca: sirve como silueta de fondo o
   geometría gruesa de fortaleza (muros, torres), no como detalle cercano.
6. **Downtown City MegaKit es urbano moderno** (estilo Boston/NYC): no encaja en los cuatro reinos de
   partida (piratas, vaqueros, vikingos, nativos latinoamericanos). Queda en reserva para un reino futuro
   de ciudad neón o alienígena; mientras tanto no se mide ni se usa.

## 2. Packs de la carpeta que no están en la lista aprobada

No se usan sin tu aprobación. Los marcados como candidatos cubren huecos (armas, enemigos).

### 3D con origen y licencia conocidos

| Archivo | Autor | Licencia | Nota |
|---|---|---|---|
| Fantasy Props MegaKit [Standard] (150 MB) | Quaternius | CC0 1.0 📄 | 94 modelos en Standard: armas, herramientas, cofres, pociones, puestos de mercado, rompibles. **Candidato para armas y objetos lanzables.** |
| Ultimate Nature Pack by Quaternius (23 MB) | Quaternius (legacy) | CC0 1.0 📄 | Versión vieja de color plano; se superpone con Stylized Nature MegaKit. No hace falta. |
| KayKit_Skeletons_1.1_FREE (8 MB) | Kay Lousberg | CC0 1.0 📄 | Esqueletos animados con Rig_Medium. Candidato a enemigos solo si se elige el estilo KayKit para personajes; con Quaternius chocan. |
| KayKit_Forest_Nature_Pack_1.0_FREE (6 MB) | Kay Lousberg | CC0 1.0 📄 | Naturaleza estilo KayKit. Se superpone con Stylized Nature. |
| KayKit_BlockBits_1.0_FREE (6 MB) | Kay Lousberg | CC0 1.0 📄 | Bloques tipo vóxel: estilo incompatible. ⛔ |
| kenney_tower-defense-kit (5 MB) | Kenney | CC0 1.0 📄 | Estilo Kenney, no aporta a los biomas. ⛔ |

### ⚠ Origen desconocido: licencia dudosa hasta saber de dónde salieron

No se pueden usar en un proyecto que se quiere publicar sin conocer autor y licencia. Si me decís de dónde
los bajaste los clasifico; si no, quedan fuera.

`Legacy Collection.zip` (21 MB), `FreeSample.zip` (33 MB), `EXTW_rigs.zip` (20 MB), `EXTW_UnityRigs.zip`
(19 MB), `Stylized Trees.rar` (8 MB), `mp_character_animation_asset_pack_v1.0.zip` (6 MB),
`Textures.zip` (5 MB), `Tall Building 01.zip`, `Small Building 01.zip`, `Small Building 02.zip`,
`VoxelGraveyard_Assets.zip` (vóxel: además, estilo incompatible), `Models.zip` y `Models (1)…(6).zip`,
`Package.zip`, `Free 3D Modular Game Assets For Prototyping.zip`, `Free Essential Animation CC0.zip` (el
nombre dice CC0 pero no hay autor), `Warrior-V1.3.zip`, `Bot Wheel.zip`, `Textures (1)…(3).zip`
(`Textures (1)` trae tres paletas `Car Colorscheme 1/2` y `Road Colorscheme`: probablemente de un pack de
autos low-poly).

### ⛔ 2D pixel art: excluidos por el brief

`Farm RPG FREE 16x16 - Tiny Asset Pack.rar`, `Tiny RPG Character Asset Pack 01 v2.0 (Soldier & Orc)`,
`Tiny RPG Character Asset Pack 02 v1.01 (Demon & Blood Monster)`, `Tiny Swords (Free Pack)`,
`Modern_Interiors_Free_v2.2`, `Base Animations 1.1.zip` (abierto: `Bunny Hero Revised Colours 1.1.aseprite`
y `Tiny Alchemist Sprite Sheet 48x32.png`).

## 3. Dependencias de código (todas aptas para uso comercial)

| Dependencia | Licencia | Uso |
|---|---|---|
| three | MIT | Render |
| @dimforge/rapier2d-compat o rapier2d-deterministic-compat | Apache-2.0 | Física 2D (la variante determinista garantiza mismos resultados en todas las plataformas) |
| vite | MIT | Build |
| typescript | Apache-2.0 | Tipos |
| meshoptimizer / gltfpack | MIT | Compresión y LOD de mallas (en build) |
| Basis Universal (KTX2) | Apache-2.0 | Texturas comprimidas |

Las opciones de panel de tuning y runner de tests (lil-gui, Tweakpane, Vitest: todas MIT) se proponen en F1.

## 4. Cómo completar este inventario

1. Que el contenedor pueda bajar los ZIP: en la configuración del entorno, *Network access* → *Custom* y
   agregar `drive.google.com` y `drive.usercontent.google.com` (pasos en
   <https://code.claude.com/docs/en/cloud-environments#network-access>). Alternativa: subir los ZIP aprobados
   a otro lugar accesible.
2. Descomprimir cada pack en `assets/packs/<Nombre del pack>/` (la carpeta está en `.gitignore`: los brutos
   pesan ~1 GB y no van al repositorio; al juego llega solo lo exportado y optimizado).
3. Correr `node tools/assets-inventory.mjs assets/packs` y reemplazar las filas 📄 por las medidas
   (`--pack "<nombre>"` da el detalle archivo por archivo, con clips y duraciones).
