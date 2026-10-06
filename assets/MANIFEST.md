# MANIFEST de assets 3D (F0)

Inventario de los packs para HYPERFLOWGEON (acción 2.5D; spec en `docs/superpowers/specs/2026-10-06-hyperflowgeon-f0-design.md`). Fuente: carpeta de Drive compartida el 2026-10-06
(43 archivos) y los repositorios oficiales de KayKit en GitHub.

> **Estado (2026-10-06): todos los packs aprobados están medidos, salvo KayKit Character Animations (sin uso).** La red del entorno ya deja bajar de Drive: los siete packs
> Quaternius (más Fantasy Props) se bajaron con `curl` y se midieron sobre los archivos. Siguen en 📄 solo
> KayKit Character Animations (sin uso, D3) y los de origen desconocido. Ver «Cómo bajar los packs» al final.

Leyenda: ✅ medido sobre los archivos · 📄 datos publicados por el autor, sin medir · ⚠ licencia dudosa o desconocida · ⛔ excluido

## 1. Packs aprobados en el brief

| Pack (archivo en Drive) | Autor | Licencia | Formatos | Contenido | Polycount | Animación | Estado |
|---|---|---|---|---|---|---|---|
| Universal Base Characters [Standard] (129 MB) | Quaternius | CC0 1.0 | FBX, glTF | **2 cuerpos** (Superhero Male / Female, `*_FullBody`), 6 peinados + barba + 2 cejas (**no** los 6 cuerpos ni 20 peinados del pack completo) | 14.318 / 15.060 tris el cuerpo (3 draw calls); peinados 830–3.284 | Rig de 65 huesos (`root, pelvis, spine_01…`), sin clips | ✅ |
| Universal Animation Library [Standard] (16 MB) | Quaternius | CC0 1.0 | GLB, FBX | **43 clips** (`UAL1_Standard.glb`, y `_RM` con root motion): locomoción, salto, agacharse, rodar, pistola, puñetazos, espada, hechizo simple, nadar, sentarse | 13.744 tris el maniquí | Mismo rig de 65 huesos que UBC (nombres idénticos, verificado) | ✅ |
| Universal Animation Library 2 [Standard] (19 MB) | Quaternius | CC0 1.0 | GLB, FBX, .blend | **43 clips**: combos de espada (`Sword_Regular_A/B/C` + `_Rec`, `Sword_Heavy_Combo`, `Sword_Dash`), escudo, **`Slide_Start/Loop/Exit`**, `Melee_Hook`, `Hit_Knockback`, `OverhandThrow`, `NinjaJump_*`, `ClimbUp_1m`, zombi, granja | 13.744 tris el maniquí | Mismo rig de 65 huesos (verificado) | ✅ |
| Modular Character Outfits – Fantasy [Standard] (294 MB) | Quaternius | CC0 1.0 | FBX, glTF | **Solo 2 trajes × H/M = 4**: *Peasant* (campesino) y *Ranger* (capucha, hombreras, botas) en piezas modulares (Body, Arms, Legs, Feet, Head_Hood, Acc_Pauldron). **No hay armadura vikinga ni de caballero** | pieza 1.1–9 k tris; traje completo 12,9 k (Peasant) y **27 k (Ranger, 10 draw calls)** | Mismo rig de 65 huesos (verificado); solo necesita la cabeza de UBC | ✅ |
| Downtown City MegaKit [Standard] (235 MB) | Quaternius | CC0 1.0 | FBX, glTF | 153 modelos únicos (Brick_*, etc.), manzanas urbanas modulares | 2 – 45.122 tris (mediana 48); hasta 13 draw calls | — | ✅ (en reserva, sin uso) |
| Stylized Nature MegaKit [Standard] (104 MB) | Quaternius | CC0 1.0 | FBX, OBJ, glTF | 68 modelos: árboles comunes, muertos, retorcidos y pinos (5 c/u), arbustos, pasto, flores, hongos, rocas (3), guijarros, rocas de camino; textura `Rocks_Desert`. **Sin cactus ni palmeras** | 13 – 10.104 tris (mediana 755) | — | ✅ |
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
2. **Trajes y accesorios: hay mucho menos de lo esperado.** Outfits Fantasy (Standard) trae solo Peasant y
   Ranger (4 trajes en total) y UBC solo 2 cuerpos y 6 peinados. No hay armadura vikinga, ni ropa pirata o
   vaquera, ni cascos. Todo lo propio de cada cultura (tricornio, sombrero vaquero, casco con cuernos, máscara
   de águila, pecheras, capas) se modela nosotros, o se evalúa pagar el PRO de UBC/Outfits (spec §6).
3. **Peso.** Los Standard aprobados suman ~870 MB comprimidos (FBX + glTF + OBJ duplicados). Al juego solo
   llega lo exportado, optimizado (meshopt + KTX2) y partido por bioma; objetivo < 15 MB para el primer
   jugable.
4. **Polycount de personajes (medido).** UBC 14–15 k tris; Ranger completo **27 k** y 10 draw calls; el
   presupuesto es ~6 k para el jugador y 3–5 k por enemigo. Hace falta un paso de simplificación
   (meshoptimizer) y fusionar materiales en el build antes de poner más de 2 personajes en pantalla.
5. **Medieval Hex a escala de maqueta.** Agrandado se ve tosco de cerca: sirve como silueta de fondo o
   geometría gruesa de fortaleza (muros, torres), no como detalle cercano.
6. **Texturas y materiales (medido).** Outfits y Props traen texturas de 4096² y materiales con metalness >
   0,5; Downtown también. El material toon propio (spec §5) los reemplaza: del original solo se conservan
   las máscaras de material, a ≤ 1024².
7. **Downtown City MegaKit es urbano moderno** (estilo Boston/NYC): no encaja en los cuatro reinos de
   partida (piratas, vaqueros, vikingos, nativos latinoamericanos). Queda en reserva para un reino futuro
   de ciudad neón o alienígena; mientras tanto no se mide ni se usa.

## 2. Packs de la carpeta que no están en la lista aprobada

No se usan sin tu aprobación. Los marcados como candidatos cubren huecos (armas, enemigos).

### 3D con origen y licencia conocidos

| Archivo | Autor | Licencia | Nota |
|---|---|---|---|
| Fantasy Props MegaKit [Standard] (150 MB) | Quaternius | CC0 1.0 ✅ | 94 modelos: armas (`Sword_Bronze`, `Axe_Bronze`, `Pickaxe_Bronze`), `Shield_Wooden`, `Barrel`, `Crate_*`, `Chest_Wood`, `Coin_Pile`, `Chain_Coil`, `Rope_1-3`, `Anvil`, `Banner_*`, `Cage_Small`, `Cauldron`, `Torch_Metal`, `Stall_Cart`, `Dummy`; 52–5.738 tris (mediana 776). **Aprobado (D5)** para lanzables y rompibles; no hay cañones, armas de fuego ni sombreros. |
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

## 4. Cómo bajar los packs

La red del entorno ya permite `drive.google.com` y `drive.usercontent.google.com`. Los ZIP son archivos
privados del usuario: el conector de Drive (`search_files`) da el `id` de cada uno y se bajan por shell
(`download_file_content` devuelve base64 y no sirve para cientos de MB):

```bash
curl -sSL -o pack.zip "https://drive.usercontent.google.com/download?id=<ID>&export=download&confirm=t"
unzip -q pack.zip -d "assets/packs/<Nombre del pack>"      # la carpeta está en .gitignore
node tools/assets-inventory.mjs assets/packs --pack "<Nombre del pack>"
```

Verificar el tamaño contra `fileSize` de Drive. Los packs brutos pesan ~1 GB y no van al repositorio; al juego
llega solo lo exportado y optimizado.
