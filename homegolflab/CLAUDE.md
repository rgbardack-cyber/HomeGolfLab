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
- Una cámara lenta **no siempre se rechaza** (medido 18 nov 2026 con controles hechos con ffmpeg): la bajada tope→impacto fuera de 0,15–0,6 s se rechaza como "sin swing" (la 4× trasera midió 0,8 s y la 4× frontal también se rechaza), pero una 2× frontal o trasera da una bajada de 0,43–0,5 s, igual a la de un swing lento real (0,43 s en dos clips normales), y se acepta. No hay forma de separarlas por tiempos: hay que grabar a velocidad normal y no prometer que la app detecte la cámara lenta.

## Estructura
- `src/lib/swing.ts` — métricas y coaching por reglas a partir de puntos de MediaPipe Pose. Dos vistas: de frente (`coach`) y desde atrás sobre la línea de tiro (`coachDtl`); `analyzeSwing` elige sola con `detectView` según el ancho aparente del cuerpo al inicio. Pasarle siempre `aspect` (ancho ÷ alto del video). `framingCheck` revisa el encuadre (pies, aire sobre la cabeza, tamaño, centro) y alimenta la silueta guía del modo en vivo; para los pies basta ver un tobillo (de perfil el lejano queda tapado: antes daba "No veo tus pies" en 59 de 70 clips traseros aunque se veían).
- `src/lib/pose.ts` — carga del modelo y detección por cuadro. `detectResilient` rehace el modelo en CPU y reintenta el cuadro si el GPU aborta al detectar (con el equipo cargado pasaba); lo usan el muestreo de video y el modo en vivo (este a través de `createLiveDetector`, que corta con un mensaje tras 3 fallos seguidos en vez de congelarse).
- `src/lib/videoSeek.ts` — salto de cuadro del video con espera: si a los 8 s el navegador sigue saltando, espera el triple una vez más (antes daba "No se pudo leer el video" con el equipo cargado aunque el video estuviera bien).
- `src/lib/coach.ts` — coach con IA (Premium): arma lo que se envía al servidor (tres fotos limpias del swing y las medidas con nombre legible, `coachPayload`), llama a `/api/swing/coach` y limpia la respuesta (`coachInfo`). Se pide a mano desde `AiCoachCard` en `Swing.tsx` porque cuesta por uso; las fotos se mandan al servidor y no se guardan.
- `src/lib/ballflight.ts` + `src/components/VideoFlight.tsx` — pestaña **Video** del Ball tracking (experimental): se sube el video de un tiro, se toca la bola y se sigue SOLO el comienzo de su vuelo, cuadro por cuadro (manchas que cambian, aclaradas u oscurecidas, elegidas por cercanía a la posición predicha). Solo da trayectoria si vio la bola **quieta donde se tocó y luego salir de ahí** (`released`: mira únicamente el punto de la bola, no lo que pasa cerca) y si algo aparece en los 0,3 s siguientes; si no, muestra "No se detectó la bola" y no dibuja nada. Dibuja los puntos detectados; el ángulo de salida en la imagen se calcula (`launchAngleDeg`) pero **no se muestra** (#4, 19 nov 2026: sin referencia de vuelo no se sabe si se parece al real); nunca da distancia, velocidad ni dirección reales y no guarda nada en el historial de tiros. Un hueco sin detección va punteado y dorado, no como si se hubiera visto. Con 4 tiros reales de driving range (18 nov 2026) la versión anterior no siguió la bola en ninguno de 8 intentos (seguía el palo y los brazos mientras la bola estaba quieta). La versión con `released` quita ese error por construcción pero **no se ha confirmado que siga la bola**: falta una referencia de vuelo (≥10 tiros con la cámara detrás de la bola y el vuelo visible). Pendiente: descartar manchas dentro de la máscara del cuerpo (`bodyMask`, `club.ts`) y exigir que el primer punto sea posterior al impacto detectado en el swing; esta pestaña no corre la postura.
- `src/lib/club.ts` — búsqueda experimental de la varilla en un cuadro (`findShaft`), máscara del cuerpo y lectura del palo al inicio y en el tope (`readClub`). Solo se usa al subir un video (`captureKeyFrames` en `Swing.tsx`), no en vivo.
- `src/lib/tracking.ts` — detección de bola por diferencia de cuadros, análisis de putt, dispersión.
- `src/lib/homelab.ts` — zonas viables y plan diario según espacio y equipo.
- `src/lib/badges.ts` — medallas (cumplimiento y mérito), XP y niveles. Se otorgan una sola vez, al guardar una sesión.
- `src/pages/` — Home, Swing, HomeLab, Tracking, Logros, Perfil.

## Cómo se muestrea y se leen los videos (17 nov 2026, tras una auditoría con agentes)
- `Swing.tsx` muestrea en dos pasadas (`sampleVideo`): una gruesa (10 cuadros/s) para ubicar el swing con `findSwingWindow`, y una fina (30/s) solo desde 0,9 s antes del inicio hasta 0,7 s después del impacto. Con el tiempo real de cada cuadro (`v.currentTime`). Si no se ve un swing, se analiza la pasada gruesa para dar el error correcto. Hay tiempos de espera de 8 s y un mensaje claro si el video no se puede leer (HEVC/.mov).
- El tope es el último mínimo local de la altura de las manos cuya bajada es de las más rápidas (`topCandidates`, 18 nov 2026): las manos recuperan la mitad de lo que subieron en menos de 0,9 s (la mitad, porque en el impacto el cuadro sale borroso), sin pasarse del nivel de donde partieron (eso sería un salto del seguimiento, no una bajada), y solo cuentan los candidatos con ≥ 65 % de la velocidad del mejor y ≥ 75 % de la amplitud del mayor (un gesto posterior más chico, como volver a colocarse, no le gana al swing real por ser el último). Así ni la finalización (manos igual de altas o más y sostenidas, que bajan despacio) ni un swing de práctica anterior lo confunden. La regla anterior ("bajada más rápida que la subida") descartaba el tope real en clips traseros a 10 cuadros/s, y la foto "Tope" mostraba la finalización. Si ningún candidato cumple, el punto más alto, como antes. Cuando las manos se pierden en el impacto (contraluz) el impacto caía en el primer cuadro de recuperación, ≈0,3 s antes del real (en dos clips lo confirmé en hojas de contacto: caía en el tope) y la bajada salía < 0,15 s (tempos 4–79:1): ahora `analyzeSwing` rechaza bajadas fuera de 0,15–0,6 s (`MIN_DOWNSWING_SEC`, `MAX_DOWNSWING_SEC`; la mayor bajada válida medida en 90 clips fue 0,43 s). Cuesta tres swings reales que antes salían con el impacto mal puesto y ahora piden regrabar. Con varios swings en el video se sigue analizando el último, pero `findSwingWindow` cuenta cuántos hay (`swings`) y la pantalla avisa "Se vieron N swings en el video; se analizó el último": de los clips que no coincidían con el índice, varios tienen un segundo swing real (el índice marca el primero). Si el seguimiento del cuerpo salta en más de 30 % de los cuadros alrededor del swing (palo sobre la lente, otra persona) también se rechaza.
- Cabeza = centro de las orejas (la nariz gira); si no se ven en el 70 % de los cuadros, la nariz. Cabeza y caderas se miden contra la mediana del inicio y sin el desplazamiento **rígido** del cuerpo (los dos tobillos movidos igual, `drift`): un talón que se levanta no cuenta. La mano dominante también se mide sin ese desplazamiento.
- `stableFrames` descarta los cuadros donde el seguimiento salta a otra persona.
- El tempo se juzga con una banda ancha (`TEMPO`: bueno 2,3–3,7; `corregir` solo por debajo de 1,3 o por encima de 5). Con un mismo swing real salió entre 1,2 y 2,8 según dónde se marcaba el inicio de la subida (las manos casi no se mueven al arrancar), así que es una estimación para comparar entre swings, no un veredicto. Desde atrás no se juzga. De frente la inclinación lateral se llama así (`SPINE_SIDE` 15°/22°): de frente no se ve si el jugador se levanta o se agacha.
- Muñecas (`wristAngle`): ángulo entre antebrazo y mano con los puntos de índice y meñique; experimental, informativo, no entra en la nota.
- Si el jugador fija la vista a mano y el video parece de la otra, `viewMismatch` avisa.
- La cuota gratis es 1 análisis de video al día: en las pruebas hay que activar Premium (modo prueba) en Perfil.

## Publicar en GitHub Pages
- `.github/workflows/pages.yml` construye con `VITE_BASE=/<repositorio>/` y publica `homegolflab/dist` (con `404.html` para los enlaces directos). Solo se dispara a mano o al hacer push a `main`.
- `vite.config.ts` toma `base` de `VITE_BASE` (por defecto `/`, como siempre) y `main.tsx` usa `import.meta.env.BASE_URL` como `basename` del router.
- En Pages no hay `/api`: HomeLAB con foto y el coach con IA responden "esta versión de prueba no incluye…" (`not_configured`).
- `npm run build:static` (modo `static`) deja en `dist-static/` una build con rutas relativas y router con `#` que funciona soltada en cualquier hosting estático con HTTPS (Netlify Drop, Cloudflare Pages, Vercel…), en cualquier subdirectorio y sin configurar redirecciones. Comprobada sirviéndola bajo un subdirectorio sin `404.html`. Para llevarla a un teléfono sin GitHub Pages.
- El repositorio es **privado**: Pages en repositorios privados exige un plan de pago y el sitio es público de todas formas. Los ajustes de Settings > Pages y del entorno `github-pages` solo los puede hacer el dueño.

## Comandos
- `npm run dev` — servidor local (también accesible desde el teléfono en la misma red).
- `npm run typecheck`, `npm test`, `npm run build` — correr los tres antes de dar algo por terminado.

`node_modules` es un directorio real dentro de la carpeta, y iCloud lo sincroniza (dejó marcadores de nube): `C:\Users\Ryan\dev\hgl-node_modules` está vacía y no hay ningún enlace (comprobado el 18 nov 2026). Funciona; moverlo fuera de iCloud queda pendiente.

## Probar con videos reales
El gancho de QA es oficial desde el 19 nov 2026: `src/lib/debugHook.ts` publica `window.__hglDebug` (Swing) y `window.__hglBall` (tracking) **solo en desarrollo**; el build de producción no los contiene (`grep -r __hgl dist/` = 0). El harness puede apuntar al `npm run dev` del repo sin parchear nada.

Las skills `homegolflab-swing-qa-harness` (flujo real en Chrome, métricas con Wilson 95 %), `homegolflab-swing-events-lab` (laboratorio offline y anti-regresión sobre los 96 conjuntos de cuadros guardados), `golf-swing-phases`, `golf-video-groundtruth` y `golf-ball-flight-tracking` (en `../.claude/skills/`) explican cómo. Un área se declara "lista" solo con ≥ 85 % y límite inferior de Wilson 95 % ≥ 75 % con muestra suficiente. Los 90 clips son de un solo golfista zurdo con un teléfono: nada se ha probado con diestros ni otros equipos.

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
