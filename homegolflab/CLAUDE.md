# HomeGolfLab

App de práctica de golf. Esta carpeta es la reconstrucción (noviembre 2026) y es la base vigente.
`../swingiq/` (prototipo Expo + FastAPI, nunca ejecutado) y `../swingiq/base44-export/` (copia de la app de Base44) son solo referencia: no se editan.

Dueño: Ryan. Responder y escribir la interfaz en español.

## Decisiones tomadas
- Nombre: HomeGolfLab (por ahora).
- Plataforma: web React + Vite + Tailwind, empaquetada con Capacitor para App Store y Play Store (`capacitor.config.ts`, appId `com.homegolflab.app`). Todo debe funcionar dentro de la app sin depender de servidores externos: el modelo de postura y el motor WASM están en `public/`.
- Dos modos: **Casa** y **Cancha** (selector en el encabezado). HomeLAB es solo de Casa.
- Versión 1 = Análisis de swing, HomeLAB, Ball tracking y medallas. Los desafíos quedan para una actualización futura.
- Swing: subir video es gratis (1 por día); análisis en vivo es Premium.
- Sin backend ni cuentas todavía: los datos se guardan en el dispositivo (`src/store.ts`, zustand persist). Premium es un interruptor de prueba en Perfil; los pagos reales irán por compras dentro de las tiendas.

## Honestidad de las medidas
No mostrar números que la app no mide. El swing reporta solo lo estimable desde la postura (tempo, giros, postura, cabeza, cadera), no trayectoria del palo ni cara. El ball tracking con cámara mide putts y chips rodados; el swing completo se registra a mano.

## Estructura
- `src/lib/swing.ts` — métricas y coaching por reglas a partir de puntos de MediaPipe Pose.
- `src/lib/pose.ts` — carga del modelo y detección por cuadro.
- `src/lib/tracking.ts` — detección de bola por diferencia de cuadros, análisis de putt, dispersión.
- `src/lib/homelab.ts` — zonas viables y plan diario según espacio y equipo.
- `src/lib/badges.ts` — medallas (cumplimiento y mérito), XP y niveles. Se otorgan una sola vez, al guardar una sesión.
- `src/pages/` — Home, Swing, HomeLab, Tracking, Logros, Perfil.

## Comandos
- `npm run dev` — servidor local (también accesible desde el teléfono en la misma red).
- `npm run typecheck`, `npm test`, `npm run build` — correr los tres antes de dar algo por terminado.

`node_modules` es un enlace a `C:\Users\Ryan\dev\hgl-node_modules` para que iCloud no lo sincronice.

## Monetización (decidido el 10 nov 2026)
- **Ball tracking es la función para todos**: gratis por bloques de 15 minutos de uso; al agotarse, el usuario ve 2 anuncios de 30 s para abrir otros 15 (`src/lib/ads.ts`, `src/components/AdGate.tsx`). Premium: sin anuncios ni límite.
- En la app nativa los anuncios son de AdMob con recompensa (`@capacitor-community/admob`). Por defecto usa los identificadores de PRUEBA de Google; los reales van en `VITE_ADMOB_REWARDED_ANDROID` / `VITE_ADMOB_REWARDED_IOS`. En el navegador se muestra un espacio publicitario de prueba.
- Falta para publicar: cuenta de AdMob y su App ID en AndroidManifest / Info.plist al añadir las plataformas; compras dentro de la app para Premium (hoy es un interruptor de prueba).

## HomeLAB con foto o video
- Idea central: el usuario NO mide nada. Toma una foto o video y la app estima el espacio y le dice qué hacer. La entrada manual queda solo como alternativa.
- `server/index.ts` (Node, `npm run server`, puerto 8787) recibe las imágenes y usa visión de Claude (`claude-opus-5-5`, salida estructurada) para devolver medidas, piso, equipo, observaciones, seguridad y pasos de montaje. La clave `ANTHROPIC_API_KEY` vive solo en el servidor (`.env`, ver `.env.example`); nunca en la app.
- En desarrollo Vite redirige `/api` al servidor. En producción la app necesita `VITE_API_URL` apuntando al servidor desplegado.
- `src/lib/scan.ts` valida y recorta todo lo que devuelve el servidor antes de usarlo.

## Marketing
Lo que se puede decir en público sobre la app está en `../marketing/BRAND.md`. Si un cambio aquí altera una función, una medida, un límite de la versión gratuita, un precio o el estado de publicación, actualiza ese archivo en el mismo commit.
