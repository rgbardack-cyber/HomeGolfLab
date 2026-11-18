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
No mostrar números que la app no mide. El swing reporta lo estimable desde la postura (tempo, giros, postura, cabeza, cadera, y manos y brazos al inicio y en el tope). El ball tracking con cámara mide putts y chips rodados; el swing completo se registra a mano.

Lo que se aprendió al probar con swings reales (nov 2026, cuatro swings de una profesional en un video de Wikimedia Commons, más unas 50 fotos):
- El palo se busca aparte, con visión clásica (`src/lib/club.ts`), solo al inicio y en el tope, que es cuando está casi quieto. Es **experimental**: se dibuja sobre la foto para que el usuario lo compare, nunca entra en la nota y no dice nada de la cara, el plano ni la trayectoria. En ese video acertó la dirección en los 6 cuadros que se podían juzgar; en fotos sueltas con fondos cargados da falsos positivos. No se ha probado con un video grabado por nosotros.
- El "inicio" es el último cuadro con las manos quietas, no el primero en que suben: al arrancar, las manos van hacia atrás casi sin subir. Con la regla vieja el tempo de la profesional salía 1,6:1 y las manos "atrasadas"; con la nueva, 2,6–2,8:1 y manos al centro.
- La mano dominante y el lado del objetivo salen del propio swing (hacia dónde va la subida), no del perfil.
- Desde atrás el tempo no se juzga: el arranque va hacia la cámara y la subida sale corta (1,4–1,8:1 en la misma jugadora).
- El codo trasero en el tope se calcula pero no se muestra: el modelo lo estima mal cuando el brazo queda tapado (139–154° donde lo real ronda 90°).
- El giro de hombros y el cambio de postura en el impacto varían bastante entre swings iguales (el giro depende de la profundidad que adivina el modelo; el impacto, de acertar el cuadro a 20 cuadros por segundo). Son los candidatos a revisar con videos propios.
- Un video en cámara lenta se rechaza como "sin swing" porque los tiempos no cuadran: hay que grabar a velocidad normal.

## Estructura
- `src/lib/swing.ts` — métricas y coaching por reglas a partir de puntos de MediaPipe Pose. Dos vistas: de frente (`coach`) y desde atrás sobre la línea de tiro (`coachDtl`); `analyzeSwing` elige sola con `detectView` según el ancho aparente del cuerpo al inicio. Pasarle siempre `aspect` (ancho ÷ alto del video). `framingCheck` revisa el encuadre (pies, aire sobre la cabeza, tamaño, centro) y alimenta la silueta guía del modo en vivo.
- `src/lib/pose.ts` — carga del modelo y detección por cuadro.
- `src/lib/coach.ts` — coach con IA (Premium): arma lo que se envía al servidor (tres fotos limpias del swing y las medidas con nombre legible, `coachPayload`), llama a `/api/swing/coach` y limpia la respuesta (`coachInfo`). Se pide a mano desde `AiCoachCard` en `Swing.tsx` porque cuesta por uso; las fotos se mandan al servidor y no se guardan.
- `src/lib/club.ts` — búsqueda experimental de la varilla en un cuadro (`findShaft`), máscara del cuerpo y lectura del palo al inicio y en el tope (`readClub`). Solo se usa al subir un video (`captureKeyFrames` en `Swing.tsx`), no en vivo.
- `src/lib/tracking.ts` — detección de bola por diferencia de cuadros, análisis de putt, dispersión.
- `src/lib/homelab.ts` — zonas viables y plan diario según espacio y equipo.
- `src/lib/badges.ts` — medallas (cumplimiento y mérito), XP y niveles. Se otorgan una sola vez, al guardar una sesión.
- `src/pages/` — Home, Swing, HomeLab, Tracking, Logros, Perfil.

## Comandos
- `npm run dev` — servidor local (también accesible desde el teléfono en la misma red).
- `npm run typecheck`, `npm test`, `npm run build` — correr los tres antes de dar algo por terminado.

`node_modules` es un enlace a `C:\Users\Ryan\dev\hgl-node_modules` para que iCloud no lo sincronice.

El repo vive en iCloud Drive, y iCloud a veces renombra un archivo recién editado a `nombre 2.ext` y borra el original (pasó con `lib.test.ts` el 16 nov 2026). Si `git status` muestra un archivo borrado junto a un `… 2.…` sin seguimiento, es eso: devolverle el nombre.

## Monetización (decidido el 10 nov 2026)
- **Ball tracking es la función para todos**: gratis por bloques de 15 minutos de uso; al agotarse, el usuario ve 2 anuncios de 30 s para abrir otros 15 (`src/lib/ads.ts`, `src/components/AdGate.tsx`). Premium: sin anuncios ni límite.
- En la app nativa los anuncios son de AdMob con recompensa (`@capacitor-community/admob`). Por defecto usa los identificadores de PRUEBA de Google; los reales van en `VITE_ADMOB_REWARDED_ANDROID` / `VITE_ADMOB_REWARDED_IOS`. En el navegador se muestra un espacio publicitario de prueba.
- Falta para publicar: cuenta de AdMob y su App ID en AndroidManifest / Info.plist al añadir las plataformas; compras dentro de la app para Premium (hoy es un interruptor de prueba).

## Coach con IA del swing
- `server/index.ts` tiene dos rutas con visión de Claude (`claude-opus-5-5`, salida estructurada, `effort: medium`, con el modelo de respaldo por rechazos de seguridad): `/api/homelab/scan` y `/api/swing/coach`. Comparten la clave `ANTHROPIC_API_KEY` (solo en el servidor), la tabla `ROUTES` y el límite de 10 solicitudes por hora por dirección **y por ruta**.
- El coach recibe 1–3 fotos JPEG sin marcas (`cleanFrame` en `Swing.tsx`, hasta 1024 px), la vista, la mano dominante, la nota y las medidas. Su prompt le prohíbe juzgar velocidad, trayectoria, cara del palo y vuelo de la bola, le pide anotar en `disagreements` lo que no cuadre con las medidas y no comentar el aspecto de la persona.
- Estado (17 nov 2026): probado el servidor sin clave (503), con datos inválidos (400), con el límite por ruta (429) y con la IA caída (502), y la pantalla de punta a punta contra un servidor falso de respuesta fija. **Nunca se ha llamado a la IA real**: falta una clave, medir el costo por consulta y revisar a mano varias respuestas contra fotos conocidas antes de ofrecerlo.
- Falta para publicarlo: desplegar el servidor (`VITE_API_URL`), cuentas para que Premium no sea un interruptor, y un aviso de privacidad (las fotos del jugador viajan al servidor y a la API de Anthropic).

## HomeLAB con foto o video
- Idea central: el usuario NO mide nada. Toma una foto o video y la app estima el espacio y le dice qué hacer. La entrada manual queda solo como alternativa.
- `server/index.ts` (Node, `npm run server`, puerto 8787) recibe las imágenes y usa visión de Claude (`claude-opus-5-5`, salida estructurada) para devolver medidas, piso, equipo, observaciones, seguridad y pasos de montaje. La clave `ANTHROPIC_API_KEY` vive solo en el servidor (`.env`, ver `.env.example`); nunca en la app.
- En desarrollo Vite redirige `/api` al servidor. En producción la app necesita `VITE_API_URL` apuntando al servidor desplegado.
- `src/lib/scan.ts` valida y recorta todo lo que devuelve el servidor antes de usarlo.

## Marketing
Lo que se puede decir en público sobre la app está en `../marketing/BRAND.md`. Si un cambio aquí altera una función, una medida, un límite de la versión gratuita, un precio o el estado de publicación, actualiza ese archivo en el mismo commit.
