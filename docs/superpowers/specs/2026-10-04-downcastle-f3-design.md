# DOWNCASTLE F3 — perfil, bestiario, cosméticos y cuentas

Fecha: 2026-10-04 · Estado: aprobado en chat e implementado (rama `downcastle-f3`, sale de `downcastle-f2`).
Marco: [hoja de ruta de la ronda 2](2026-10-03-downcastle-ronda-2-roadmap.md), §7 y §8.

## Decisiones

- **Supabase:** proyecto nuevo `downcastle` (`mkohmjfzuyxtpccvckub`, us-east-1, plan gratis).
- **Login:** enlace mágico por correo desde ya. El botón de Google aparece solo cuando el proveedor
  está habilitado en el proyecto, según `/auth/v1/settings`.
- **Cosméticos v1:** un escalón por título (8, uno por premio social) y 8 cuerdas por hitos.
- **La cuerda entre dos jugadores se dibuja mitad y mitad**, con el estilo de cada extremo.

## Perfil (`src/profile.js`, puro)

La forma es la misma en local (`downcastle.profile`) y en la nube (`profiles.data`):

- **Elecciones:** `name, color, hero, title, rope`, con `prefAt`. Al fusionar gana la más reciente.
- **Contadores:** `stats` (los de `sim.js` más `tramosWon` y `runs`), `beasts[kind]`
  (`seen, kills, killedMe, fought, beaten`) y `feats` (`ojo`, `bajadaLimpia`).
- **Marcas:** `best` (`ciclo, tramos, gems`).
- **Inventario:** `inv` es una lista de `{ id: 't:…' | 'r:…' | 'e:<sku>', origen: 'hazaña' | 'compra', at }`.
- **Solo locales:** `acct` (la cuenta enlazada) y `lastRes`/`lastRun` (para no contar dos veces).

El perfil viejo (`{ name, color, hero }`) se migra sin perder datos.

## Datos desde la simulación

- `hurt(…, src)` anota `stats.ko_<src>` al quedar fuera de combate. `src` es el tipo de criatura,
  `spikes`, `derrumbe`, `techo`, `cube` o `skeleton` (flecha).
- `damage` anota `stats.kill_<kind>`.
- `sim.seen` guarda los tipos de criatura vivos a menos de 160 px en vertical y 7 tiles en
  horizontal de un jugador en pie (se revisa cada 0,25 s). El jefe cuenta como visto al cerrarse
  la puerta.
- El `res` del anfitrión lleva `rid` (id de la run), `seen` y las stats de cada jugador. El
  `runend` lleva `rid`.
- Cada cliente suma su parte (`accumulateTramo`/`accumulateRun`). La clave `rid:c:s` evita contar
  dos veces si el anfitrión reenvía el `res` tras una reconexión. El que miraba no suma.

## Cosméticos (`src/cosmetics.js`)

- **Títulos** por contador acumulado: Ancla 60 s, Bungee 10, Fuego 30, Tirón 10, Salvavidas 15,
  Hadas 10, Gracia 1 y Peso Muerto 120 s.
- **Cuerdas:** Soga (gratis), Roja (10 tramos), Trenzada (vencer a El Ojo), Cadena (ciclo 2),
  A rayas (bajada sin caídos), Dorada (500 gemas), Espinas (50 KO) y Brillante (bestiario
  completo).
- `evalUnlocks` agrega lo ganado al inventario, y premios y fin de run muestran «¡Nuevo título…!».
- **Sala:** `hello`/`prof` llevan `title` y `rope`. El anfitrión acepta cualquier id del catálogo
  (confía en el cliente). El roster lleva `rope`, y el título se ve en la sala y en los premios.

## Bestiario

Es una pantalla accesible desde el título:

- **Grilla:** las criaturas no vistas aparecen como silueta negra con «???».
- **Ficha:** bajas, «te mató N veces», tramos en que se vio y una frase al estilo de un manual de
  monstruos.
- **Jefes:** sección propia con veces enfrentado, vencido y «te mató».
- **Debajo:** la lista de cosméticos con su barra de progreso.

## Cuentas (`src/cloud.js`)

- **Carga.** `supabase-js` es un chunk aparte que se importa solo si hay sesión guardada, si se
  vuelve de un enlace o al tocar «Enviar enlace». Usa flujo implícito, para que el enlace funcione
  aunque el correo se abra en otro navegador.
- **Esquema** (`server/supabase/001_profiles.sql`), con RLS:
  - `profiles(id = auth.uid, data jsonb < 64 KB)`: cada cuenta lee y escribe solo su fila.
  - `entitlements(user_id, sku, source, platform)`: solo lectura de las propias. La escribe el
    backend de compras en F6.
- **Sincronización.** Se dispara al iniciar sesión, con 4 s de demora tras cada cambio, al volver
  la red y con el botón. Pasos: traer perfil y derechos, fusionar, subir y guardar la base.
- **Fusión de tres vías:** `nube + max(0, local − base)` para los contadores, máximo para las
  marcas, unión para el inventario (si una copia es `compra`, queda `compra`) y la elección más
  reciente.
  - La base es lo último sincronizado con esa cuenta (`downcastle.profile.base`).
  - Un perfil de invitado no tiene base, así que se suma entero a la cuenta.
  - Si el perfil local estaba enlazado a otra cuenta, se reemplaza por el de la nube.
- **Sin muro de login.** Cerrar sesión deja el progreso en el dispositivo.

## Pendiente de configuración (fuera del código)

- **URL Configuration de Auth:** Site URL `https://alex-alas.github.io/game-sandbox/games/downcastle/`
  y Redirect URLs `http://localhost:5173/**`, `http://*:5173/**` y la de Pages. Sin eso, el enlace
  del correo vuelve a `localhost:3000`.
- **Google:** crear un cliente OAuth (aplicación web) en Google Cloud Console con el redirect
  `https://mkohmjfzuyxtpccvckub.supabase.co/auth/v1/callback` y pegar el ID y el secreto en
  Supabase → Authentication → Providers → Google. El botón aparece solo.
- **Correo:** el SMTP de Supabase en el plan gratis manda pocos correos por hora. Para producción
  hace falta un SMTP propio.

## Verificación

- `node games/downcastle/tools/profiletest.mjs`: migración, acumulación, antidoble conteo,
  desbloqueos, fusión y derechos, más la sim con bots (todo KO tiene fuente, las bajas por tipo
  suman `kills`, las criaturas vistas, el exterior y El Ojo).
- `simrun.mjs`: la suite sigue en OK.
- En el navegador:
  - Solo con bots: tramo y jefe con desbloqueos, sala con título y cuerda, cuerda mitad y mitad,
    y bestiario.
  - 2 pestañas: el anfitrión y el invitado ven el título y la cuerda del otro, y una recarga del
    invitado en premios no cuenta dos veces.
  - Un invitado no descarga supabase-js.
- Falta probar con una cuenta real: enlace mágico y sincronización entre dos dispositivos.
