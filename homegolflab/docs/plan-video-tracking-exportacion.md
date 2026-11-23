# Plan de implementación: revisión de swing en video, live Premium, ball tracking v2, distancia, exportación y anuncios

Versión 1 · 19 nov 2026 · Para ejecutar con un agente Claude Sonnet 5.5 (`claude-sonnet-5-5`).
Investigado y escrito por una sesión configurada con `claude-opus-5-5`. No se cambió código, no se hizo commit y no se publicó nada.

Convención de este documento:
- **[HECHO]** comprobado en esta investigación (código, archivos, ffprobe, cuadros extraídos), con ruta.
- **[OBJETIVO]** lo que Ryan quiere construir.
- **[DECISIÓN RYAN]** requiere su elección (sección 8). Lo demás lo decide el agente con la opción indicada.
- **[PROPUESTA]** umbral o número inicial que se fija con datos piloto y luego no se mueve mirando el conjunto de prueba.

---

## 0. Cómo usar este plan (léelo primero, Sonnet)

1. Antes de cada fase, comprueba que las rutas, símbolos y números de línea citados siguen vigentes (`git log -1`, `Grep` del símbolo). Si algo cambió, adapta la tarea al código actual y anótalo en el registro de la fase. No edites contra una línea que ya no existe.
2. Lee `homegolflab/CLAUDE.md`, `marketing/BRAND.md` y las skills `golf-ball-flight-tracking`, `homegolflab-swing-qa-harness`, `homegolflab-swing-events-lab`, `golf-swing-phases`, `golf-video-groundtruth` y `homegolflab-video-analysis` antes de tocar sus áreas.
3. Trabaja en la rama `feat/video-review-export` creada desde `feat/mvp-driving-range` (o desde donde esté esa rama al empezar). Un commit por tarea verificada. No hagas push ni PR sin que Ryan lo pida. No publiques nada en redes ni crees cuentas.
4. Cada tarea termina con `npm run typecheck`, `npm test` y `npm run build` en `homegolflab/` en verde, más la verificación propia de la tarea. Si una tarea toca pantalla, verifica en el navegador (preview de Vite) y guarda captura.
5. No muevas umbrales para que una métrica pase. Si no hay datos para medir algo, escribe "no medido" y por qué.
6. Si un cambio altera una función, medida, límite gratis, precio o estado de publicación, actualiza `marketing/BRAND.md` en el mismo commit (regla de `CLAUDE.md`).
7. Cuando algo bloquee (falta un dato, una cuenta, un dispositivo), detente en esa tarea, anota el bloqueo con evidencia y sigue con la siguiente tarea que no dependa de ella.

---

## 1. Diagnóstico del estado real

### 1.1 Repositorio
- **[HECHO]** Repo `C:\Users\Ryan\iCloudDrive\Desktop\HomeGolfLab_\Repo`, remoto `rgbardack-cyber/HomeGolfLab` (privado), rama `feat/mvp-driving-range`, HEAD `d9f4d3e` (18 nov 2026 19:24), árbol limpio al empezar.
- **[HECHO]** 107 pruebas vitest según el commit `d9f4d3e` (29 en `ballflight.test.ts`, 71 en `lib.test.ts`, 3 en `pose.test.ts`, 4 en `videoSeek.test.ts`). No se ejecutaron en esta investigación: la fase F0 las corre.
- **[HECHO]** Dependencias: React 19, Vite 8, TS 7, Capacitor 8.6 (`@capacitor/core`, `android`, `ios`), `@capacitor-community/admob` ^8.3, `@mediapipe/tasks-vision` ^1.2.2, zustand 5, zod 4. No hay `@capacitor/filesystem` ni `@capacitor/share`.
- **[HECHO]** No existen las carpetas `homegolflab/android` ni `homegolflab/ios`: las plataformas nativas no se han agregado. AdMob real, cámara nativa, exportación y compartir nativos nunca se han probado en un teléfono empaquetado.
- **[HECHO]** Graphify local (`graph.json`, foto del 9 nov 2026) solo contiene el contexto del prototipo SwingIQ (mayo 2026). No aporta nada sobre este trabajo; manda el código.

### 1.2 Análisis de swing (`homegolflab/src/pages/Swing.tsx`, `lib/swing.ts`, `pose.ts`, `club.ts`, `coach.ts`)
- **[HECHO]** Subida: `UploadAnalyzer` (`Swing.tsx:558`) muestrea en dos pasadas (`sampleVideo`, `:404`: 10/s para ubicar con `findSwingWindow`, 30/s desde 0,9 s antes del inicio hasta 0,7 s después del impacto), llama `analyzeSwing` y guarda con `addSession` (`:617`). Límite `MAX_SECONDS = 30` (`:378`).
- **[HECHO]** Lo que el usuario ve: tres **fotos fijas** JPEG (`captureKeyFrames`, `:444`) de inicio, tope e impacto con esqueleto (`drawSkeleton`, `pose.ts`), línea de caderas y varilla experimental. **No hay reproductor del video analizado, no hay pausas navegables por fase, no hay guías de cabeza/torso/brazo guía sobre el video, no hay comparación de dos clips.**
- **[HECHO]** Las fotos clave y el video no se persisten: la sesión guarda `swing: SwingResult` en `localStorage` (`store.ts`, `persist` con nombre `homegolflab-v1`, sin `version` ni `migrate`). Abrir una sesión guardada (`/swing?ver=`) muestra el resultado sin fotos.
- **[HECHO]** `SwingResult.times` trae `address/top/impact` en ms de video; `view` (`frente`/`atras`, `detectView`), `lefty` (mano dominante inferida del swing). No hay `finish`, ni confianza por fase, ni marca manual.
- **[HECHO]** Palo: `ClubPicker` (`:534`) lo elige el usuario; la app **no lee** el número. `readClub` (`club.ts:219`) solo da ángulos experimentales de la varilla.
- **[HECHO]** Live Premium: `LiveAnalyzer` (`:684`) usa `getUserMedia` (960×720 ideal, 60 fps ideal, sin audio), detecta por cuadro con `detect` (sin respaldo a CPU), máquina de estados `ready→top→settle→rearm` con manos arriba/abajo, analiza el segmento y muestra nota. **No graba, no guarda fragmentos, no maneja interrupciones (pestaña oculta, llamada), no distingue práctica de golpe real, no bloquea a una segunda persona.**
- **[HECHO]** Defectos conocidos y abiertos (`pruebas/verificacion-plan-fase-c.txt`): #17 la cuota gratis se salta reanalizando; #18 `LiveAnalyzer` no vacía `swingsRef` y `finish()` puede guardar dos veces; #20 live sin `detectResilient`; #13 avisos de encuadre falsos en trasera; #10 no deja escoger el swing cuando hay varios.
- **[HECHO]** Precisión medida (`pruebas/resultados/metricas_fix.json`, 90 clips de un solo golfista zurdo, un teléfono): vista 85/87 (97,7 %, Wilson 92–99,4); eventos contra referencia manual con n=7: inicio 5/7, tope 6/7, impacto 7/7 → **ninguna área de eventos es "lista"** (n insuficiente). 86 zurdo / 4 diestro detectado; no hay clips de diestros reales.
- **[HECHO]** Los 7 clips elegidos por Ryan se analizaron como `atras`, zurdo: i5_sr_t01 (inicio 7,07 s, tope 7,67, impacto 8,00, tempo 1,8), i5_sr_t02 (7,20/7,83/8,03), i6_sr_t06 (7,13/7,60/8,00, tempo 1,17), i4_sr_t03 (7,20/7,80/8,03), stinger 01 (7,03/7,70/8,00), 02 (7,13/7,73/8,03), 03 (7,00/7,70/7,97). Fuente: `pruebas/resultados/swing_fix/*.run1.json`. Sin referencia manual para estos 7.

### 1.3 Ball tracking (`lib/ballflight.ts`, `components/VideoFlight.tsx`, `pages/Tracking.tsx`)
- **[HECHO]** `BallTracker` (`ballflight.ts:225`): toque del usuario, polaridad y contraste de la bola quieta en el primer cuadro, espera a `released` (la bola deja su punto), ventana de 0,3 s tras soltarse, manchas por diferencia de cuadros dentro de una ROI que sigue la predicción, descarta manchas grandes o alargadas, `flightLike` exige alejarse del toque. Solo crea puntos `detected`; el tipo `estimated` existe pero no se usa.
- **[HECHO]** `VideoFlight.tsx`: analiza a 640 px de ancho, el usuario elige 30/60 fps a mano, recorre hasta 15 s, dibuja **sobre el cuadro inicial fijo** (no reproduce el video) líneas verdes continuas para lo detectado y **dorado punteado para huecos**, y muestra "ángulo en la imagen, no real". No guarda nada. Avisos honestos ya existen ("No se detectó la bola", "no adivino por dónde fue").
- **[HECHO]** Conflicto con la convención nueva de Ryan: hoy **dorado punteado = hueco sin detección**. La convención deseada usa **dorado continuo = descenso confirmado** y **morado punteado = continuación estimada**. Los huecos necesitan otro estilo (ver contrato 4.6).
- **[HECHO]** Pruebas reales del tracker: solo 4 tiros **frontales** (`i4/i6/i9/pw_sr_f01`) en `pruebas/resultados/ball*` . Versión vieja: 0/8 seguían la bola. Versión actual (`ball_fase_b3`, corrida antes del commit final pero con lógica equivalente según la verificación): 4/8 dibujan algo, 4/8 "No se detectó", ninguno confirmable como bola. **No hay ningún JSON de seguimiento de los clips traseros elegidos (i5_sr_t01/t02, i6_sr_t06, i4_sr_t03, stingers).** El trabajo de la sesión del 18 nov sobre esos clips quedó solo en los videos de demostración; los puntos verificados a mano no están guardados como datos.
- **[HECHO]** `run_ball.mjs` (skill harness) tiene la lista de tiros fija con los 4 frontales y depende de `patch_app.mjs`, que inyecta `window.__hglBall` en una copia anclando texto exacto de `VideoFlight.tsx`. Cambiar ese archivo rompe el parche.
- **[HECHO]** Registro manual y dispersión trabajan en **metros** (`Shot.carryM`, `Tracking.tsx` "Distancia media … m"). No hay yardas.
- **[HECHO]** `tracking.ts` (putt/chip con cámara) declara que un swing completo no se mide así.

### 1.4 Anuncios y cuotas (`lib/ads.ts`, `components/AdGate.tsx`, `store.ts`)
- **[HECHO]** Regla vigente: Ball tracking gratis por 15 min (`AD_RULES`), luego **2 anuncios con recompensa** para otros 15; Premium sin anuncios. Swing: 1 análisis de video gratis por día (`FREE.swingUploadsPerDay`).
- **[HECHO]** `showNativeRewarded` escucha solo `Rewarded` y `Dismissed`; no escucha `FailedToLoad`/`FailedToShow`, no usa `ssv`, no precarga, no evita dobles toques, no maneja consentimiento (UMP) ni ATT. En navegador hay un anuncio simulado de 30 s.
- **[HECHO]** IDs de prueba de Google en el código; reales por `VITE_ADMOB_REWARDED_ANDROID/IOS`. No hay App ID de AdMob porque no hay plataformas nativas.
- **[HECHO]** No existe ninguna función de descarga o exportación de video en la app.

### 1.5 Marca y documentación
- **[HECHO]** `marketing/BRAND.md` dice "máximo 12 s" para el video de swing; el código permite 30 s (`MAX_SECONDS`). Discrepancia a corregir en F0.
- **[HECHO]** `BRAND.md` afirma "dibuja … un ángulo en la imagen que no es real"; la verificación fase C (#4) recomienda ocultarlo hasta tener referencia de vuelo.
- **[HECHO]** Brand kit: `brand-kit/logos/*.png`, `brand-kit/capturas/01–05`, colores `#276749` (verde), `#D4A735` (dorado de marca), `#6DCF8E` (verde trazo), `#CE2727` (error). En la app el dorado de trazo es `#e8c04a` (`VideoFlight.tsx:20`).

### 1.6 Videos de demostración (montajes, no producto)
Carpeta `C:\Users\Ryan\iCloudDrive\Desktop\My Agents\HomeGolfLab - Stories 2026-11-18\`. Revisados con ffprobe, hojas de 1 cuadro/s y envolvente de audio (no se escucharon: se midió la señal).
- **[HECHO]** `Pausa-y-compara-HomeGolfLab-Story-V2.mp4`: 1080×1920, 30 fps, 14,6 s, H.264 + AAC 48 kHz. Interfaz completa simulada ("Análisis de swing · Pausa y compara · Hierro 7", insignia "Vista previa", barra de reproducción, chips Inicio/Tope/Impacto, leyenda "Guías de referencia: Cabeza, Torso, Brazo guía"). Dos paneles lado a lado, **recortados en franjas verticales** (cada panel ≈ 9:19, cuerpo entero visible). En el tope, el panel frontal muestra línea punteada vertical de cabeza/columna y línea del brazo guía; el trasero solo la del brazo guía. Audio: **silencio digital** salvo un impacto a 8,70 s.
- **[HECHO]** `Stingers-Hierro-7-HomeGolfLab-Story-V2.mp4`: 1080×1920, 30 fps, 12,97 s. Interfaz simulada de Ball tracking ("Tiro 1 de 3", "Tramo visible"). Línea verde corta y baja saliendo de la bola en cada tiro. Audio: silencio digital salvo tres impactos a 2,10 s, 6,30 s y 10,50 s.
- **[HECHO]** Archivos de prueba del hierro 5 (limpios, sin interfaz, comprobado en cuadros): `Hierro-5-Tiro-01-Ball-tracking-Original.mp4` (60 fps, 2,700 s, 162 cuadros, audio con ambiente ≈ −34 dBFS e impacto a 1,50 s con pico −1,4 dBFS) y `Hierro-5-Tiro-02-…-Original.mp4` (60 fps, **2,867 s**, 171 cuadros; Ryan dijo 2,85 s). `…-Swing-completo-Lento.mp4` de cada tiro: 30 fps, 14,5 s (media velocidad), audio solo con el impacto.
- **[HECHO]** `…-Trayectoria-estimada.mp4`: trazo verde que sube, se curva en gancho y una continuación morada punteada casi vertical; leyenda "Tramo visible · Descenso · Trayectoria estimada". Fondo grisado por la capa de interfaz.
- **[HECHO]** Originales: `IMG_2097.MOV` (hierro 5) es **HEVC + AAC + Apple APAC (audio espacial 4 canales) + pistas de datos**, 60 fps nominal (VFR), 253 s. Los clips `i*_sr_*.mp4` en `HomeGolfLab_\Social Media_\` son H.264 1080×1920 60 fps de 20 s con el impacto indexado a 8,00 s.
- **Diferencias demostración ↔ producto:** todo lo siguiente existe solo en los montajes: reproducción del swing con guías animadas, pausas por fase, comparación sincronizada de dos clips, trazo de bola sobre video en movimiento, cambio a dorado por descenso, continuación morada, etiquetas "Tiro 1 de 3"/"Hierro 5", audio aislado del impacto a velocidad normal sobre cámara lenta, y cualquier exportación vertical. Las líneas se agregaron en edición; no prueban detección automática ni vuelo completo.

### 1.7 Datos de prueba disponibles
- **[HECHO]** `HomeGolfLab_\pruebas\inventario.csv` (110 filas: clips y controles), `resultados\inventario.json`, `resultados\swing_fix\` (479 archivos, 90 clips + controles, con `debug` de cuadros), `ground_truth\` (37 carpetas con hojas de contacto; entre ellas `i5_sr_t01\sheet.png`), `controles\` (6), `ball\frames\` (18 PNG de manchas). Directorios sin resultados útiles para este plan: `resultados\fallos_harness`, `swing_fix_v2_previo`, `swing_fix_v3_previo` (previos, no vigentes).
- **[HECHO]** Herramientas: ffmpeg/ffprobe 9.0.2 (WinGet) y `C:\Users\Ryan\dev\hgl-video-tools` (`ffmpeg-static`, `puppeteer-core`). Variables `HGL_*` documentadas en la skill harness.

---

## 2. Objetivos, límites y lo que no se promete

**[OBJETIVO]** Revisar un swing subido (frente o atrás) en un reproductor nítido con guías de cabeza, torso y brazo guía; pausar en inicio, tope e impacto; comparar dos clips sincronizados por fase; live Premium con detección por golpe, grabación de fragmentos y resultados; ball tracking desde el impacto hasta el último cuadro distinguible con verde/dorado/morado; tipo de tiro con "sin determinar" y etiqueta manual; distancia en yardas con incertidumbre o "no disponible"; exportación vertical con audio de impacto natural; descarga Premium libre y Freemium con anuncio recompensado.

**Límites físicos que el plan respeta** (de la skill `golf-ball-flight-tracking` y de la geometría):
- A 60 fps el contacto cae entre cuadros; la cara del palo y el punto de contacto no se miden.
- Con una cámara sin calibrar no hay velocidad, ángulo de salida, altura ni dirección reales.
- **Desde atrás, "bajar en la imagen" no equivale a "bajar en el aire"**: para una cámara a altura h que mira horizontal, un punto a altura Z y distancia D aparece a (Z − h)/D sobre el horizonte. Si la bola se aleja más rápido de lo que sube, su imagen ya baja antes del ápice real. Por eso el descenso se declara **"en la imagen"** salvo que la vista y la calibración permitan más (sección 4.6).
- La distancia (carry o total) no sale de la duración del vuelo ni de unos pocos cuadros.

---

## 3. Flujos por plan

Planes: **Gratis**, **Premium**, **Navegador** (versión web de prueba: anuncios simulados, sin compartir nativo).

### 3.1 Subir y revisar un swing (un ángulo)
1. Swing → "Subir video". Gratis: 1 análisis por día (sin cambio). Premium: ilimitado.
2. El usuario elige o confirma el palo (manual, como hoy) y la vista (Automática por defecto).
3. Análisis (igual que hoy) + se guardan el video fuente y la pista de postura de la ventana fina (F2/F3).
4. Pantalla de revisión: reproductor a tamaño completo del video sin recorte (letterbox si hace falta), color original, guías de cabeza, torso y brazo guía según confianza, chips Inicio/Tope/Impacto que pausan en el cuadro exacto, avance cuadro a cuadro, velocidad 1×/0,5×/0,25×, ajuste manual de cada fase (±1 cuadro, con marca "ajustado por ti").
5. Resultado (nota, correcciones, fotos) debajo, como hoy.
6. Exportar (3.5).
- Sesiones antiguas (sin video guardado): se ven como hoy con el aviso "Este análisis es anterior y no guardó el video".

### 3.2 Comparar dos clips
1. Desde una revisión o desde Sesiones → "Comparar" → elegir el segundo análisis guardado (o subir otro; cuenta como análisis en Gratis).
2. Cada clip muestra su palo confirmado y su vista. Si los palos difieren, aviso visible.
3. Sincronización por fases (inicio, tope, impacto) con mapa de tiempo por tramos; ajuste manual por fase.
4. Insignia obligatoria: **"Dos golpes distintos, sincronizados por fase"**. Solo dice **"Mismo golpe, dos cámaras"** si ambos videos se alinean por el sonido del impacto (correlación, sección 4.5) y el usuario lo confirma.
5. Diseño 9:16: dos paneles lado a lado con **recorte seguro** (solo fondo; nunca cuerpo ni palo) o, si no cabe, apilados/letterbox.
- Gratis: comparar dos análisis ya guardados es libre; la exportación sigue la regla de anuncio. **[DECISIÓN RYAN D4]** si la comparación es Premium.

### 3.3 Live Premium
1. Gratis: ve la puerta Premium (como hoy).
2. Premium: pantalla previa con permisos explicados (cámara; micrófono opcional para reconocer golpes reales), guía de encuadre con silueta y aviso de batería/almacenamiento.
3. En sesión: detecta cada swing, muestra fase y guías si hay confianza, resultado y una corrección tras cada golpe; marca "práctica" o "con bola" solo si hay evidencia (sonido de impacto); ignora movimientos entre golpes y a otras personas.
4. Interrupciones: pestaña oculta, llamada o bloqueo → pausa automática, se conserva lo grabado; al volver, "Reanudar".
5. Al terminar: lista de golpes con miniatura; el usuario elige cuáles guardar como fragmentos (el resto se borra); cada fragmento guardado abre la revisión 3.1 y puede exportarse.

### 3.4 Ball tracking en video
1. Tracking → Video (cuenta para el tiempo gratis de 15 min, sin cambio).
2. Sube el clip; la app propone fps y cámara lenta leídos del archivo; el usuario confirma o corrige (60 fps, 30 fps, "media velocidad").
3. Toca la bola quieta antes del golpe (como hoy); opcional: tocar el objetivo/línea de tiro y el horizonte (mejoran clasificación y descenso).
4. Resultado **animado sobre el video**: verde (observado), dorado (descenso confirmado en la imagen), huecos en gris punteado, morado punteado "Trayectoria estimada" si pasa los criterios, marcador de "bola perdida".
5. Tipo de tiro: "Sin determinar" por defecto; el usuario puede etiquetar ("Etiqueta tuya: stinger/draw/fade/…"). Automático solo tras la validación de la sección 6.
6. Distancia: "Distancia no disponible" + "Registrar a mano (yardas)"; estimación automática solo con la evidencia de 6.2.
7. Guardar el tiro en el historial (nuevo, opcional) y exportar.

### 3.5 Exportar y descargar
1. "Exportar video" → editor simple: plantilla (Revisión de swing, Comparación, Ball tracking), qué guías, pausas por fase, cámara lenta, audio (impacto natural / silencio), vista previa WYSIWYG.
2. Premium: genera y guarda/comparte sin anuncio.
3. Gratis (app nativa): botón "Ver anuncio para descargar" con aviso claro del intercambio → anuncio con recompensa → al recibir la recompensa se emite un **pase de exportación** (4.8) → genera → Guardar en Fotos/Archivos o Compartir.
4. Navegador: anuncio simulado; descarga por `<a download>` o Web Share con archivos si `navigator.canShare({files})`.

---

## 4. Arquitectura y contratos

Módulos nuevos (todos bajo `homegolflab/src/`):

```
lib/media/clock.ts        tiempo, cuadros, fps, cámara lenta
lib/media/probe.ts        lectura de metadatos (fps, rotación, códecs, audio)
lib/media/store.ts        persistencia de videos y datos pesados (IndexedDB / Filesystem)
lib/overlay/model.ts      modelo de capas (datos puros)
lib/overlay/draw.ts       buildDrawList (puro) + paint(ctx, ops)
lib/swingReview.ts        guías por cuadro, fases, sincronización de dos clips
lib/ballflight.ts         (extender) seguimiento v2, descenso, continuación
lib/shotShape.ts          rasgos y clasificación con abstención
lib/distance.ts           distancia: manual, estimación con referencias, intervalos
lib/audio/impact.ts       detección y aislamiento del impacto
lib/export/timeline.ts    línea de tiempo de exportación
lib/export/render.ts      compositor de cuadros (usa overlay/draw)
lib/export/encode.ts      codificación y multiplexado
lib/exportGate.ts         pases de exportación y anuncio
lib/flags.ts              banderas de funciones
components/VideoReview.tsx, CompareView.tsx, ExportSheet.tsx, FlightPlayer.tsx
```

### 4.1 Tiempo y cuadros
```ts
/** Tiempo de medio: ms del video fuente tal como lo reporta el decodificador (v.currentTime*1000 tras 'seeked' o VideoFrame.timestamp/1000). */
type MediaMs = number;
interface Clock {
  fpsNominal: number;          // 30 | 60 | otro, del contenedor o del usuario
  fpsSource: 'container' | 'user' | 'estimated';
  timeScale: number;           // 1 = tiempo real; 0.5 = media velocidad (1 s de medio = 0,5 s reales)
  firstFrameMs: MediaMs;       // marca del primer cuadro (edit lists)
}
const frameOf = (c: Clock, t: MediaMs) => Math.round(((t - c.firstFrameMs) * c.fpsNominal) / 1000);
const realMs  = (c: Clock, t: MediaMs) => (t - c.firstFrameMs) * c.timeScale; // para física y umbrales en segundos reales
```
Regla: toda medida en segundos reales (bajada del swing, ventana de 0,3 s del tracker, `maxFollowMs`, tempo) usa `realMs`. Los clips de 14,5 s a media velocidad se cargan con `fpsNominal 30` y `timeScale 0.5`; así cada paso de 1/30 s de medio toca un cuadro original de 60 fps y los umbrales siguen en tiempo real. Las marcas guardadas son siempre `MediaMs` del archivo fuente más `frame`.

### 4.2 Coordenadas
- Normalizadas 0–1 sobre el **cuadro mostrado** (rotación ya aplicada, sin letterbox ni recorte), origen arriba-izquierda, y hacia abajo. Es lo que ya usan MediaPipe y `FlightPoint`.
- Análisis en otra resolución o en un recorte: `toSource(p, roi)` convierte siempre a normalizadas del cuadro completo antes de guardar. Nunca se guardan píxeles de análisis.
- Vista: `Viewport { srcW, srcH, dstRect, crop? }`; `project(p, vp)` → píxeles de destino. El mismo `project` sirve a la vista previa y a la exportación.
- Distancias en pantalla se escalan con `u = max(dstW, dstH)/320` (convención actual de `VideoFlight.tsx`).

### 4.3 Confianza
```ts
type Conf = number; // 0–1
interface Scored<T> { value: T | null; conf: Conf; reason?: 'occluded' | 'low_visibility' | 'out_of_frame' | 'unstable' | 'not_enough_data' }
```
- Landmark: `conf = min(visibility, presence)` de MediaPipe (ambos 0–1 según la documentación oficial). Guías: segmento si ambos extremos ≥ 0,6 y estable (salto < 8 % del torso respecto al cuadro anterior); entre 0,4 y 0,6 se dibuja **atenuado y punteado**; < 0,4 no se dibuja y aparece el chip "Guía oculta: no se ve bien".
- Fase: `conf` de una fase = combinación de la nitidez del criterio (p. ej. separación entre el mejor candidato a tope y el siguiente) y la visibilidad de las manos; < 0,5 → chip "Revisa esta fase" y se sugiere ajuste manual.
- Bola: por punto, `conf` = f(contraste local, área compatible con la bola, residuo respecto a la predicción, confirmación de cuadros vecinos).

### 4.4 Fases y guías del swing
```ts
type PhaseKey = 'address' | 'top' | 'impact' | 'finish';
interface PhaseMark { key: PhaseKey; t: MediaMs; frame: number; source: 'auto' | 'manual'; conf: Conf }
interface PoseTrack { v: 1; sourceId: string; fromMs: MediaMs; toMs: MediaMs; hz: number; t: Float64Array; lm: Float32Array /* n×33×4: x,y,vis,pres */ }
interface GuideSet { head: boolean; torso: boolean; leadArm: boolean; hips: boolean }
```
Guías (definición única en `lib/swingReview.ts`, usadas por vista previa y exportación):
- **Cabeza**: punto en el centro de las orejas (o nariz si las orejas faltan en > 30 % de cuadros, igual que `swing.ts`) y referencia **fija** en su posición del inicio (círculo punteado). Muestra el desplazamiento, no un juicio.
- **Torso**: línea centro de hombros → centro de caderas en el cuadro actual y línea punteada de la del inicio.
- **Brazo guía**: hombro → codo → muñeca del lado guía (`lefty` del resultado; zurdo = brazo derecho). Solo de inicio a impacto; en la subida es la guía principal.
- Diestro/zurdo: del resultado (`r.lefty`), no del perfil. Si el usuario cambia la mano en la revisión, se recalcula y se marca "elegido por ti".
- Vista: si `viewMismatch` o el usuario cambia la vista, las guías de la otra vista no se muestran mezcladas.
- Swing de práctica vs real: la app no lo sabe por postura. Se muestra "Swings en el video: N; analizado: el último" (ya existe) y en F3 se permite elegir otro (cierra #10).

### 4.5 Sincronización de dos clips
- Mapa de tiempo por tramos lineales entre fases: `warp(tB)` tal que address_B→address_A, top_B→top_A, impact_B→impact_A, (finish_B→finish_A si ambos existen). Fuera del rango, desplazamiento constante.
- Ajuste manual: ±1 cuadro por fase con vista previa inmediata; se guarda `source: 'manual'`.
- Mismo golpe con dos cámaras: correlación cruzada de la envolvente de audio (banda 1–8 kHz) en ±2 s; aceptar si el pico normalizado ≥ 0,6 y la diferencia de impactos visuales tras alinear ≤ 1 cuadro. Si no, siempre "Dos golpes distintos".

### 4.6 Seguimiento de bola v2 y estilos
```ts
interface FlightPointV2 { t: MediaMs; frame: number; x: number; y: number; conf: Conf; source: 'detected' | 'estimated' }
interface FlightTrack {
  v: 2; sourceId: string; clock: Clock; tap: { x: number; y: number; t: MediaMs };
  observed: FlightPointV2[];                // solo 'detected'
  gaps: { fromFrame: number; toFrame: number }[];
  lastDistinguishable: { frame: number; t: MediaMs } | null;
  descent: { state: 'confirmed' | 'not_confirmed' | 'insufficient'; fromIndex?: number; evidence: DescentEvidence; frame: 'image' };
  continuation: { state: 'shown' | 'abstained'; reason?: string; points: FlightPointV2[]; model?: 'quad2d' | 'rational2d'; horizonMs?: number };
  released: boolean; endReason: 'lost' | 'window' | 'clip_end' | 'frame_exit' | null;
  engine: string;                           // versión del motor, p. ej. 'ballflight@2'
}
```
Estilos (constantes en `lib/overlay/model.ts`, una sola fuente):

| Elemento | Estilo | Etiqueta |
|---|---|---|
| Tramo observado | verde `#6DCF8E`, continuo, contorno oscuro | "Tramo visto" |
| Descenso confirmado (en la imagen) | dorado `#E8C04A`, continuo, mismo grosor | "Bajada vista en el video" |
| Hueco sin detección entre puntos vistos | gris claro `rgba(255,255,255,.7)`, punteado fino | "Sin ver la bola" |
| Continuación estimada | morado `#9B7BEA` [PROPUESTA de tono, validar contraste], punteado, opacidad que baja de 0,9 a 0,4, más fino que el observado | "Trayectoria estimada · no medida" |
| Bola perdida | anillo pequeño sobre el último punto visto | "Última vez vista" |

**Detección del descenso** (en coordenadas de imagen, y crece hacia abajo). Se confirma solo si se cumplen todas:
1. Ápice candidato `a` = mínimo de y suavizado (mediana de 3) que no es el último punto.
2. Después de `a` hay ≥ 4 puntos detectados a 60 fps (≥ 3 a 30 fps reales), con `conf ≥ 0,6`, sin hueco > 2 cuadros.
3. Caída total y_último − y_a ≥ max(3·σ, 0,6 % de la altura del cuadro), con σ = desviación de los residuos de un ajuste cuadrático al tramo ascendente (mínimo 1,5 px de análisis). [PROPUESTA]
4. Ajuste cuadrático de y(t) en la ventana alrededor de `a` con curvatura positiva y pendiente posterior con t ≥ 3. [PROPUESTA]
5. x sin inversiones mayores que σ (descarta saltar a otro objeto).
6. Cada punto del tramo pasa la comprobación de vecinos: la mancha está presente en t y ausente en la misma posición en t−1 y t+1 (lo que Ryan hizo a mano).

Si no se cumplen: el trazo queda verde; si había un descenso candidato que falló, chip "Bajada no confirmada". `state: 'insufficient'` si hay < 8 puntos. En vista trasera la etiqueta añade "(en la imagen; desde atrás la perspectiva puede adelantarla)". Ni el ápice ni el descenso se usan como ápice real.

**Continuación estimada**: se muestra solo si
- ≥ 8 puntos observados en ≥ 0,25 s reales, sin huecos > 3 cuadros en los últimos 6;
- el modelo elegido (cuadrático 2D o racional 2D con denominador común, que aproxima la perspectiva de una curva 3D cuadrática) tiene RMS ≤ 1,5 % de la altura del cuadro [PROPUESTA];
- el horizonte de extrapolación ≤ min(duración observada, 1,0 s real, fin del clip, salida del cuadro, cruce de la línea del suelo si el usuario marcó el horizonte);
- la validación de la sección 6.3 pasó para el tipo de vista (frente/atrás). Hasta entonces se muestra solo con la bandera `flags.flightEstimate` (pruebas internas).
Nunca alimenta distancia, velocidad ni tipo de tiro.

### 4.7 Tipo de tiro y distancia
```ts
type ShotShape = 'stinger' | 'bajo' | 'recto' | 'draw' | 'fade' | 'hook' | 'slice' | 'sin_determinar';
interface ShotShapeResult { auto: { value: ShotShape; conf: Conf; features: ShapeFeatures } | null; manual: ShotShape | null; source: 'auto' | 'manual' | 'none' }
interface ShapeFeatures { lateralCurvaturePct: number | null; startDirImageDeg: number | null; elevationRelHorizonPct: number | null; observedRealMs: number; view: 'frente' | 'atras' }
interface DistanceResult {
  kind: 'carry' | 'total';
  state: 'measured_manual' | 'estimated' | 'unavailable';
  yards?: number; interval90?: [number, number];
  method?: 'manual' | 'landing_reference' | 'launch_monitor_import';
  assumptions: string[];
}
```
Unidad: yardas por defecto para distancias de tiro **[DECISIÓN RYAN D2]**; se guardan en metros internamente (compatibilidad con `Shot.carryM`) y se convierten (1 yd = 0,9144 m exacto) solo al mostrar.

### 4.8 Exportación y anuncios
```ts
interface ExportSpec { template: 'swing' | 'compare' | 'flight'; w: 1080; h: 1920; fps: 30 | 60; videoBitrate: number; audio: 'impact' | 'silence'; segments: Segment[]; overlays: OverlayModel; chrome: ChromeSpec }
type Segment =
  | { kind: 'play'; sources: string[]; fromMs: MediaMs; toMs: MediaMs; speed: 1 | 0.5 | 0.25 }
  | { kind: 'hold'; sources: string[]; atMs: MediaMs; durMs: number; label?: string };
interface AudioCue { sourceId: string; srcFromMs: MediaMs; srcToMs: MediaMs; atExportMs: number; fadeMs: 30 }
interface ExportPass { id: string; analysisId: string; specHash: string; grantedAt: number; expiresAt: number; via: 'premium' | 'reward' | 'placeholder'; rewardEventId?: string; uses: number; consumed: boolean }
```
- **Compositor único:** `buildDrawList(model, t, viewport): DrawOp[]` (puro, probado en Node) + `paint(ctx, ops)`. La vista previa y la exportación llaman a las mismas funciones con el mismo `t` y `Viewport`; la interfaz exportada ("chrome": título, chips, leyenda, logo) se dibuja en canvas con plantillas que usan los tokens de marca, no capturando el DOM.
- **Formato de salida:** MP4 (H.264 High, 1080×1920, 30 fps; 60 si la fuente es 60 y no hay cámara lenta), 8–12 Mbps, AAC 48 kHz estéreo 160 kbps, `faststart`, ≤ 60 s. Nombre `HomeGolfLab-<plantilla>-<AAAA-MM-DD-HHmm>.mp4`.
- **Audio del impacto** (`lib/audio/impact.ts`): decodificar la pista de audio de la fuente con Web Audio (`decodeAudioData` sobre el `ArrayBuffer` del archivo); buscar el inicio del impacto en ±0,3 s del impacto visual (máximo del flujo espectral en 1–8 kHz); aislar [−0,15 s, +0,8 s] a velocidad normal con fundidos de 30 ms; colocarlo en `atExportMs` = momento del impacto en la línea exportada aunque la imagen vaya lenta. Aceptar solo si: pico ≥ 15 dB sobre la mediana de 2 s alrededor, ningún otro transitorio ≥ (pico − 10 dB) en ±1,0 s (otra bola cercana), sin recorte digital. Si falla: exportar **en silencio** con el aviso "No se pudo aislar el sonido del golpe" (alternativa: el usuario elige "sonido original a velocidad normal solo en los tramos 1×"). Nunca música ni sonidos generados.
- **Pase de exportación:** ver 5.F9.

### 4.9 Persistencia
- `localStorage` (zustand `homegolflab-v1`) guarda solo metadatos e ids: nunca video, pose ni imágenes. Se añade `version: 1` y `migrate` (de 0 a 1 conserva todo y agrega campos opcionales).
- Pesado en `lib/media/store.ts`: navegador → IndexedDB (sin dependencias nuevas, envoltorio mínimo); nativo → `@capacitor/filesystem` en `Directory.Data` con escritura por bloques (evitar un solo `writeFile` base64 de cientos de MB). Registros: `MediaRef`, `PoseTrack`, `FlightTrack`, exportaciones temporales.
```ts
interface MediaRef { id: string; kind: 'source' | 'live_recording' | 'export'; mime: string; bytes: number; durationMs: number; w: number; h: number; rotation: 0 | 90 | 180 | 270; clock: Clock; createdAt: string; expiresAt?: string; sessionId?: string }
```
- Limpieza: exportaciones temporales y grabaciones live sin guardar se borran al terminar y al arrancar la app si tienen > 24 h; tope total configurable (p. ej. 2 GB [PROPUESTA]) con `navigator.storage.estimate()`; al borrar una sesión se borran sus medios. Ajustes → "Espacio usado" con botón para borrar videos guardados.
- Privacidad: los videos no salen del dispositivo (el coach con IA ya envía fotos al servidor y requiere su aviso; no se amplía a video).

### 4.10 Banderas
`lib/flags.ts`: `videoReview`, `compare`, `flightV2`, `flightEstimate`, `shotShapeAuto`, `distanceEstimate`, `export`, `exportGate`, `liveRecording`. Valores por `VITE_FLAG_*` y un panel "Funciones de prueba" en Perfil visible solo con `import.meta.env.DEV` o un `VITE_INTERNAL=1`.

---

## 5. Fases y tareas

Orden: F0 → F1 → F2 → F3 → F4 → F5 → F8 → F9 → F6 → F7 → F10 → F11 → F12. F6/F7 se pueden empezar en paralelo a F8 porque solo dependen de F5. F11 (plataformas nativas) puede adelantarse si Ryan tiene cuenta de desarrollador; F9 nativo depende de F11.

### F0. Preparación y deudas que bloquean
| # | Tarea | Archivos | Verificación |
|---|---|---|---|
| 0.1 | Confirmar rama, HEAD, árbol limpio; crear `feat/video-review-export`. Correr `npm ci` solo si falta algo, luego `npm run typecheck`, `npm test`, `npm run build`. | — | 107 pruebas en verde (o anotar el número real). |
| 0.2 | Arreglar #17 (cuota saltada al reanalizar): deshabilitar "Analizar swing" cuando ya hay resultado para ese archivo y el límite está alcanzado; contar por archivo analizado, no por clic. | `pages/Swing.tsx`, `store.ts` | Prueba unitaria de la regla de cuota extraída a una función pura; en el navegador con Premium apagado, un segundo clic no guarda sesión. |
| 0.3 | Arreglar #18 (live guarda dos veces / arrastra swings): vaciar `swingsRef` al iniciar, `finish` idempotente. | `Swing.tsx` | Prueba de la función de cierre; dos toques rápidos guardan una sesión. |
| 0.4 | Arreglar #20: `detectResilient` en live, con corte tras 3 fallos seguidos y mensaje. | `Swing.tsx`, `pose.ts` | `pose.test.ts` amplía el caso. |
| 0.5 | Ocultar el "ángulo en la imagen" (#4) y quitarlo de `BRAND.md`. | `VideoFlight.tsx`, `marketing/BRAND.md` | Prueba de que no se muestra; BRAND sin la frase. |
| 0.6 | Corregir `BRAND.md` "máximo 12 s" → 30 s (o el valor real). | `marketing/BRAND.md` | Coincide con `MAX_SECONDS`. |
| 0.7 | Gancho oficial de depuración solo en desarrollo: `if (import.meta.env.DEV) window.__hglDebug/__hglBall = …` con los mismos campos que inyecta `patch_app.mjs`; actualizar la skill harness para usarlo y dejar `patch_app.mjs` como respaldo. | `Swing.tsx`, `VideoFlight.tsx`, `.claude/skills/homegolflab-swing-qa-harness/` | `run_swing.mjs` y `run_ball.mjs` funcionan contra el repo sin parche; el build de producción no contiene `__hgl` (`grep` en `dist/`). |
| 0.8 | `run_ball.mjs` lee los tiros de `HGL_BALL_SHOTS` (JSON) con `tap`, `startT`, `fps`, `timeScale`; manifiesto en `pruebas/ball_shots.json` (fuera del repo) con los clips de la sección 6.1. | skill harness | Corre `i5_sr_t01` y guarda en `resultados/ball_v2/` sin pisar `resultados/ball`. |

### F1. Contratos y compositor puro
| # | Tarea | Verificación |
|---|---|---|
| 1.1 | `lib/media/clock.ts` con `Clock`, `frameOf`, `realMs`, pruebas (60 fps, 30 fps, media velocidad, `firstFrameMs` ≠ 0). | vitest |
| 1.2 | `lib/overlay/model.ts` (capas: esqueleto, guías, trazo de bola por tramos con estilo, marcadores, etiquetas) y `lib/overlay/draw.ts` (`buildDrawList` puro + `paint`). Estilos de la tabla 4.6 como constantes. | vitest: misma entrada ⇒ misma lista; tramos con estilo correcto; nada se dibuja con `conf < 0,4`. |
| 1.3 | `project`/`Viewport` con letterbox y recorte seguro; prueba de ida y vuelta (error < 0,5 px). | vitest |
| 1.4 | `lib/flags.ts` y panel de pruebas en Perfil. | vitest + captura |

### F2. Persistencia y migración
| # | Tarea | Verificación |
|---|---|---|
| 2.1 | `persist` con `version: 1` y `migrate` que conserva sesiones, medallas, perfil y `trackingUsedSec`; nuevos campos opcionales `mediaId`, `poseTrackId`, `flightTrackId`, `exportPasses`. | Prueba con un JSON de `localStorage` de la versión actual (copiar uno real del navegador de pruebas) que migra sin perder datos. |
| 2.2 | `lib/media/store.ts` (IndexedDB en web). Instalar `@capacitor/filesystem` (versión de la línea 8 compatible con Capacitor 8.6; fijar versión exacta publicada hace ≥ 2 semanas con `npm view`). Escritura por bloques en nativo. | Prueba con IndexedDB falso (`fake-indexeddb` solo como devDependency si hace falta) o pruebas del envoltorio con interfaz inyectada. |
| 2.3 | Limpieza y tope de espacio; pantalla "Espacio usado" en Perfil. | Prueba de la política (fechas simuladas). |

### F3. Revisión de swing en video (un ángulo)
| # | Tarea | Verificación |
|---|---|---|
| 3.1 | Guardar el video fuente (`MediaRef`) y la `PoseTrack` de la pasada fina al terminar un análisis exitoso (sin cambiar `analyzeSwing`). | Harness: `i5_sr_t01` guarda 1 media y 1 pose; tamaño de pose < 200 KB. |
| 3.2 | `lib/swingReview.ts`: guías por cuadro (4.4) con interpolación entre muestras de pose (30/s) para mostrar a 60 fps; confianza y razones. | vitest con cuadros sintéticos: oclusión del brazo → guía atenuada/oculta; zurdo/diestro invierte el brazo guía. |
| 3.3 | `components/VideoReview.tsx`: reproductor con `<video>` real (sin recompresión, color original), canvas superpuesto del mismo tamaño mostrado, `requestVideoFrameCallback` para sincronizar el dibujo con el cuadro presentado (respaldo: `timeupdate` + `seeked`), chips de fase que hacen `seek` exacto, avance ±1 cuadro, 1×/0,5×/0,25×, interruptores de guías, ajuste manual de fase. `object-fit: contain`, nunca recorte en la revisión. | Navegador con `i5_sr_t01` (atrás) y `i7_sr_f01` (frente): capturas de inicio/tope/impacto; el cuadro mostrado coincide con `frameOf(t)` (comparar `presentedFrames`/`mediaTime`). |
| 3.4 | Fases: añadir `finish` (manos alcanzan su mínimo y quedan quietas 0,3 s tras el impacto) y `conf` por fase sin cambiar la nota. Pasar por el procedimiento anti-regresión de `homegolflab-swing-events-lab` (96 conjuntos): 0 clips peores en inicio/tope/impacto. | Laboratorio + vitest. |
| 3.5 | Elegir otro swing cuando hay varios (#10): lista de ventanas de `findSwingWindow` con miniatura; reanalizar la elegida sin consumir otra cuota. | Navegador con `i7_stinger_sr_03` (2 candidatos según la verificación). |
| 3.6 | Sesiones antiguas: aviso "no guardó el video". Abrir `/swing?ver=` de una sesión migrada. | Captura. |

### F4. Comparación de dos clips
| # | Tarea | Verificación |
|---|---|---|
| 4.1 | `warp` por tramos y ajuste manual en `lib/swingReview.ts`. | vitest: fases alineadas exactamente; monotonía. |
| 4.2 | Recorte seguro: unión de la caja de todos los landmarks de la ventana + margen arriba para el palo (≥ 1,3 × largo del torso sobre las manos en el tope [PROPUESTA], o la punta de la varilla si `findShaft` la encontró) + 5 % lateral; si la caja no cabe en el panel, letterbox. | vitest + capturas con `i7_sr_f01` + `i7_sr_t01`: cuerpo entero y palo vertical visibles en el tope. |
| 4.3 | `components/CompareView.tsx`: dos paneles, reloj maestro A, B por `warp`; insignia de golpes distintos/mismo golpe (4.5); aviso si los palos difieren. | Navegador: en tope e impacto la diferencia entre fases ≤ 1 cuadro tras sincronizar. |
| 4.4 | Detección "mismo golpe" por audio (opcional, tras F8.3). | Prueba con dos recortes del mismo archivo desplazados (correlación debe encontrar el desfase exacto). |

### F5. Ball tracking v2
| # | Tarea | Verificación |
|---|---|---|
| 5.1 | **Datos de referencia primero.** Script `gen_flight_sheets.mjs` (skill `golf-ball-flight-tracking`) que extrae, desde el impacto, recortes ampliados alrededor de la bola cuadro a cuadro y genera hojas de contacto numeradas; anotación en `pruebas/ground_truth/flight/<clip>.json`: `{ clip, fps, timeScale, impactFrame, tap, points: [{frame, x, y, vis: 'clara'|'tenue'|'ausente'}], lastVisibleFrame, descentStartFrame|null, notes }`. Anotar: i5_sr_t01, i5_sr_t02, i6_sr_t06, i4_sr_t03, i7_stinger_sr_01/02/03 y los 4 frontales. Coordenadas sobre el cuadro original, aunque se haya anotado sobre una copia contrastada. | 11 archivos JSON revisados por una segunda pasada (o por Ryan). Sin esto, las métricas de F5 son "no medido". |
| 5.2 | `Clock` en el tracker (fps del contenedor + confirmación del usuario + `timeScale`); umbrales temporales en tiempo real. Leer fps/rotación/audio con un demultiplexor (ver 5.F8.1) y respaldo manual. | vitest: el mismo tiro a 60 fps y a media velocidad 30 fps produce los mismos puntos (±1 cuadro). |
| 5.3 | Análisis en recorte a resolución nativa alrededor de la ROI (no solo 640 px de ancho) con normalización local de contraste en una **copia**; las coordenadas vuelven al cuadro completo (4.2). | vitest sintético: bola de 3 px detectada en recorte nativo y no a 640 px. |
| 5.4 | Referencia visual previa al impacto: parche del fondo alrededor de la trayectoria predicha tomado del último cuadro antes de `released`; una mancha que coincide con ese fondo se rechaza. Comprobación de vecinos (t−1, t+1). ROI que se encoge cuando la bola es pequeña. | Métrica de falsos positivos sobre la referencia 5.1. |
| 5.5 | `lastDistinguishable`, `gaps`, `descent` (4.6) y `continuation` (4.6) en funciones puras sobre `FlightTrack`. | vitest con trayectorias sintéticas: descenso claro ⇒ confirmed; ruido ⇒ not_confirmed; < 8 puntos ⇒ insufficient y sin continuación. |
| 5.6 | `components/FlightPlayer.tsx`: reproduce el clip con el trazo creciendo cuadro a cuadro (mismo compositor), leyenda con los cuatro estilos, marcador de pérdida. Sustituye la imagen fija de `VideoFlight.tsx` detrás de `flags.flightV2`; el flujo viejo sigue siendo el predeterminado hasta pasar 6.3. | Navegador con los 11 clips; capturas. |
| 5.7 | Guardar el tiro (opcional) en una sesión `tracking` con `flightTrackId`; no mezclar con dispersión (que sigue siendo manual/cámara). | Prueba de store. |
| 5.8 | Exclusión opcional por `bodyMask` y compuerta de impacto del swing **solo** si la referencia muestra que hacen falta (riesgo alto según fase C: puede pasar a "nunca detecta"). Medir antes y después. | Métricas de 6.1. |

### F6. Tipo de tiro
| # | Tarea | Verificación |
|---|---|---|
| 6.1 | Etiqueta manual siempre disponible ("Etiqueta tuya"), guardada con el tiro; nunca se muestra como detectada. | vitest + captura. |
| 6.2 | `lib/shotShape.ts`: rasgos (4.7) calculados solo del tramo observado; requieren línea de tiro marcada (dirección/curvatura) y horizonte marcado o estimado (altura relativa). Zurdo/diestro invierte draw/fade. Salida `sin_determinar` salvo validación. | vitest con trayectorias sintéticas. |
| 6.3 | Clasificación automática detrás de `flags.shotShapeAuto`, apagada en producción hasta cumplir 6.2 de la sección 6. | — |

### F7. Distancia en yardas
| # | Tarea | Verificación |
|---|---|---|
| 7.1 | Preferencia de unidad (yardas/metros) en Perfil; el registro manual existente acepta yardas; conversión exacta; los datos viejos en metros se muestran convertidos. | vitest de conversión y migración. |
| 7.2 | Estado "Distancia no disponible" con explicación breve y botón "Registrar a mano"; la distancia manual se rotula "Medida por ti". Distingue carry y total (campo `kind`). | Captura. |
| 7.3 | Prototipo interno `landing_reference` detrás de `flags.distanceEstimate`: el usuario marca en el primer cuadro dos o más referencias de distancia conocida sobre el suelo (banderas/carteles del range con su yardaje) y la línea de tiro; si la caída de la bola se ve en el video, el usuario o el tracker marcan el punto de caída; distancia por interpolación sobre la recta de tiro en el plano del suelo (homografía con ≥ 4 puntos o modelo de perspectiva 1D con ≥ 2 referencias colineales) con intervalo por propagación del error de marcado (±N px). Carry = punto de caída; total = punto donde se detiene (si se ve). | vitest con escena sintética; validación 6.2 antes de mostrarlo a nadie. |
| 7.4 | Importación de launch monitor (CSV) como fuente "medida por dispositivo" **[DECISIÓN RYAN D6]**: solo si Ryan elige un equipo; investigar su exportación oficial antes. | — |

### F8. Exportación
| # | Tarea | Verificación |
|---|---|---|
| 8.1 | Elegir biblioteca de demultiplexado/multiplexado MP4 sin servidor (candidatas: `mediabunny`, `mp4box`). Requisitos: lee H.264/HEVC/AAC de MP4/MOV, escribe MP4 con H.264+AAC, licencia compatible con app comercial, mantenida. Fijar versión exacta publicada hace ≥ 2 semanas. Registrar la decisión en `homegolflab/CLAUDE.md`. | Prueba en navegador: leer metadatos de `i5_sr_t01.mp4` (60 fps, 1080×1920, AAC) y de `IMG_2097.MOV` (HEVC + APAC). |
| 8.2 | `lib/export/timeline.ts` (segmentos, pausas, cámara lenta, `AudioCue`) puro. Plantillas: swing (inicio-pausa 1 s, subida 0,5×, pausa en tope 1 s, bajada 0,25×, pausa en impacto 1 s, final 1×), comparación (igual en paralelo), vuelo (golpe 1× → 0,5× desde 0,2 s antes del impacto hasta el fin del trazo). | vitest: duración total, impacto de audio cae en el instante exacto. |
| 8.3 | `lib/audio/impact.ts` (4.8) con pruebas sobre envolventes sintéticas y fixtures cortos de audio real recortado de `Hierro-5-Tiro-01-Ball-tracking-Original.mp4` (impacto esperado ≈ 1,50 s) guardados fuera del repo o, si se incluyen, < 200 KB. | vitest: inicio detectado ±5 ms; caso con dos golpes en ±1 s ⇒ rechazo. |
| 8.4 | `lib/export/render.ts`: por cada cuadro de salida, `seek` exacto a la fuente (o `VideoDecoder` si 8.1 lo permite), dibujar el cuadro a 1080×1920 con `Viewport`, superponer `buildDrawList` y el "chrome". Sin reescalar dos veces; `imageSmoothingQuality = 'high'`. | Navegador: cuadros de salida en tope/impacto idénticos a la vista previa (8.7). |
| 8.5 | `lib/export/encode.ts`: WebCodecs `VideoEncoder` H.264 + `AudioEncoder` AAC si existen (`isConfigSupported`); si falta `AudioEncoder` (Safari < 26), codificar audio con el respaldo que ofrezca la biblioteca o exportar en silencio con aviso. Si falta `VideoEncoder`, respaldo `MediaRecorder` sobre `canvas.captureStream()` en tiempo real (formato según `isTypeSupported`) y, en nativo, plugin propio (AVAssetWriter / MediaCodec) **[DECISIÓN RYAN D7 si hace falta]**. Cancelable, con progreso y sin bloquear la UI más de 50 ms seguidos. | Navegador Chrome: exportar `i5_sr_t01` a MP4 que ffprobe lee como H.264+AAC 1080×1920; duración = la de la línea de tiempo ±1 cuadro. |
| 8.6 | `components/ExportSheet.tsx`: plantilla, guías, audio, vista previa (mismo compositor), estimación de tamaño, guardar/compartir: web `<a download>` o `navigator.share({files})` si `canShare`; nativo `@capacitor/share` con `files` (archivo en `Directory.Cache` en Android, o declarado en `file_paths.xml`) y guardado en galería **[DECISIÓN RYAN D8]**. Borrar temporales al terminar. | Captura + archivo descargado. |
| 8.7 | Prueba de coincidencia vista previa ↔ exportación: (a) Node: mismas `DrawOp[]` para el mismo `t`; (b) navegador: decodificar el MP4 exportado en 5 instantes (inicio, tope, impacto, mitad del trazo, fin) y comparar contra la vista previa en esos instantes: diferencia media en píxeles de las capas ≤ 4/255 y desplazamiento de las líneas ≤ 2 px a 1080×1920 [PROPUESTA]. | Script `export_parity.mjs` en la skill harness; informe en `pruebas/resultados/export/`. |
| 8.8 | Sincronía de audio: en el MP4 exportado, detectar el inicio del impacto en el audio y el cuadro de impacto en el video; diferencia ≤ 1 cuadro (33 ms a 30 fps). | Mismo script, con ffmpeg. |

### F9. Descarga y anuncios
| # | Tarea | Verificación |
|---|---|---|
| 9.1 | `lib/exportGate.ts` como máquina de estados pura: `idle → requesting_ad → showing → rewarded → exporting → done` y salidas `ad_unavailable`, `ad_failed_to_show`, `cancelled`, `export_failed`. Reglas: <br>• Premium ⇒ pase `via: 'premium'` sin anuncio. <br>• Gratis ⇒ un anuncio con recompensa por exportación. El pase se emite **solo** con el evento `Rewarded` (o la promesa resuelta de `showRewardVideoAd` con su item), una vez por `rewardEventId` (ignorar duplicados). <br>• Alcance: un pase vale para ese análisis y esa configuración (`specHash`) durante 24 h [PROPUESTA]; cubre reintentos por fallas recuperables (error al codificar, falta de espacio, compartir cancelado, la app pasa a segundo plano) y volver a guardar/compartir el mismo archivo generado. Cambiar la configuración pide otro anuncio. <br>• `Dismissed` sin `Rewarded` ⇒ "Cerraste el anuncio antes de terminar". <br>• `FailedToLoad`/sin relleno ⇒ reintentar con espera (2 intentos); luego **[DECISIÓN RYAN D5]**. <br>• El pase persiste en el store (sobrevive a cierre de la app). | vitest exhaustivo de transiciones, duplicados, expiración, cambio a Premium a mitad (pase válido y sin anuncio), fallo tras desbloqueo (pase sigue vivo). |
| 9.2 | `lib/ads.ts`: escuchar `Loaded`, `FailedToLoad`, `Showed`, `FailedToShow`, `Rewarded`, `Dismissed`; precargar al abrir la hoja de exportación; descartar el anuncio cargado tras 1 h (caduca según Google); bloqueo de reentrada; `ssv` con `userId`/`customData` solo cuando exista servidor que lo valide (F11.6). Mantener intacta la regla de 15 min + 2 anuncios del tracking. | vitest con el plugin simulado; en dispositivo con IDs de prueba (F11). |
| 9.3 | Textos de aviso antes del anuncio (política de AdMob: divulgación clara de la acción y la recompensa; opt-in explícito). **No prometer "30 segundos"**: la duración la decide el anuncio (ver 8, D1). Corregir también `AdGate.tsx` ("anuncios de 30 segundos") según D1. | Revisión de texto + `BRAND.md`. |
| 9.4 | Navegador: anuncio simulado (cuenta atrás) ⇒ pase `via: 'placeholder'`; la build de producción web decide con D5. | Captura. |

### F10. Live Premium
| # | Tarea | Verificación |
|---|---|---|
| 10.1 | Pantalla previa: explicación de permisos, comprobación `navigator.permissions` cuando exista, manejo de `NotAllowedError`/`NotFoundError`/`NotReadableError` con textos y botón a ajustes (nativo). | Chrome con `--use-fake-device-for-media-stream` y un `.y4m` hecho con ffmpeg de `i7_sr_f01` (la verificación fase C ya lo propone). |
| 10.2 | Detector por golpe robusto: estados existentes + histéresis (manos sobre hombros ≥ 3 cuadros), bajada en tiempo real 0,15–0,6 s (mismas constantes que `analyzeSwing`), separación mínima de 3 s entre golpes, rearme solo tras 0,5 s quieto en dirección. Bloqueo de identidad: `numPoses: 2`; se sigue a la persona del encuadre inicial (centro y tamaño del torso); si aparece otra más cerca o la principal desaparece, pausa con aviso. | Fake stream con 3 swings y un video con dos personas (si no hay, componer con ffmpeg `overlay`). Sin duplicados. |
| 10.3 | Práctica vs con bola: si el usuario permite micrófono, un golpe es "con bola" si hay transitorio de impacto (4.8) en ±100 ms del impacto visual; si no, "sin sonido de golpe" (no se afirma práctica). | Fake stream con audio del `.mp4` original. |
| 10.4 | Grabación: `MediaRecorder` sobre el stream de cámara (+ audio si se permitió), tipo según `isTypeSupported` (preferir `video/mp4`), fragmentos de 1 s a almacenamiento temporal; marcas de cada golpe en `MediaMs` de la grabación; tope 15 min por sesión [PROPUESTA] con aviso a los 12; al terminar, cortar los golpes elegidos (±2 s) con el pipeline de F8 y borrar la grabación. | Chrome fake stream: 3 golpes ⇒ 3 fragmentos reproducibles; grabación temporal borrada. |
| 10.5 | Interrupciones: `visibilitychange`/`pagehide` ⇒ detener cámara y grabación de forma segura, conservar lo grabado; reanudar crea un segmento nuevo. En nativo, `App` `pause/resume` de Capacitor. | Simular `visibilitychange` en el navegador. |
| 10.6 | Rendimiento: medir cuadros procesados por segundo; si < 12 en 5 s, bajar resolución de entrada a 640×480 y avisar. Objetivo ≥ 15 fps procesados en teléfono de gama media [PROPUESTA, medir en F11]. | Registro de rendimiento. |

### F11. Plataformas nativas, permisos y proveedores
| # | Tarea | Verificación |
|---|---|---|
| 11.1 | `npx cap add ios` y `npx cap add android` (requiere Xcode/Android Studio; **bloqueo** si no están). Commit de las carpetas generadas sin secretos. | Builds de depuración abren la app. |
| 11.2 | Permisos: iOS `NSCameraUsageDescription`, `NSMicrophoneUsageDescription`, `NSPhotoLibraryAddUsageDescription`, `NSUserTrackingUsageDescription`; Android `CAMERA`, `RECORD_AUDIO`; textos en español. | Revisión de `Info.plist`/`AndroidManifest.xml`. |
| 11.3 | AdMob: App ID de prueba de Google en desarrollo; `GADApplicationIdentifier`, `SKAdNetworkItems` (iOS) y meta-data `APPLICATION_ID` (Android) según el README del plugin; consentimiento UMP (`requestConsentInfo`, `showConsentForm` si aplica, no inicializar anuncios si `canRequestAds` es falso); ATT en iOS. | Anuncio de prueba con recompensa completo en un iPhone y un Android reales. |
| 11.4 | `@capacitor/share` y `@capacitor/filesystem` en la línea 8; guardado en galería **[D8]**. | Exportar y compartir a Fotos/WhatsApp en ambos. |
| 11.5 | Matriz de dispositivos (6.6). | Informe. |
| 11.6 | (Opcional, D5) Verificación del lado del servidor (SSV) en `server/index.ts`: endpoint que valida la firma ECDSA con las claves públicas de AdMob (caché ≤ 24 h) y marca el `transaction_id` como usado. Solo funciona con anuncios de producción. | Pruebas con firmas de ejemplo de la documentación. |

### F12. Documentación, marca y despliegue gradual (ver sección 7)

---

## 6. Pruebas

### 6.1 Clips y cómo cargarlos
Videos en `C:\Users\Ryan\iCloudDrive\Desktop\HomeGolfLab_\Social Media_\<palo>\swings_reales\` (20 s, 60 fps, impacto indexado a 8,00 s, índice débil) y en la carpeta de Stories.

| Clip | Uso | Cómo cargarlo | Esperado (a comprobar, no asumido) |
|---|---|---|---|
| `Hierro-5-Tiro-01-Ball-tracking-Original.mp4` (2,70 s) | Tracker, descenso, continuación, audio | 60 fps, `timeScale 1`, tocar la bola en el cuadro 0 | Según la sesión del 18 nov: descenso confirmado → dorado. Confirmar con la referencia 5.1. |
| `Hierro-5-Tiro-02-Ball-tracking-Original.mp4` (2,867 s) | Tracker, descenso no confirmado | 60 fps | Según la sesión: bola perdida antes de un descenso claro → todo verde, chip "Bajada no confirmada" o nada. |
| `Hierro-5-Tiro-0X-…-Swing-completo-Lento.mp4` (14,5 s) | Media velocidad, swing completo, audio | 30 fps + "media velocidad" | Mismos puntos que el original (±1 cuadro); análisis de swing debe avisar o rechazar cámara lenta si no se declara `timeScale` (hoy una 2× se acepta: no prometer detección). |
| `i5_sr_t01.mp4`, `i5_sr_t02.mp4` | Ambos: swing trasero completo y tracker en el clip de 20 s | 60 fps, inicio ≈ 7,5 s | Igual que arriba; swing: vista atrás, zurdo. |
| `i6_sr_t06.mp4` | Tracker con fondo difícil | 60 fps | Puede necesitar recorte + contraste (5.3/5.4); verificar que no se desvía al fondo. |
| `i4_sr_t03.mp4` | Tramo inicial de salida | 60 fps | Tramo corto verde; sin descenso; continuación probablemente abstenida. |
| `i7_stinger_sr_01/02/03.mp4` | Tiro bajo, clasificación, export de Stories | 60 fps | Trazo corto y bajo; clasificación `sin_determinar` (solo 3 ejemplos, sin horizonte marcado). |
| `i4/i6/i9/pw_sr_f01.mp4` | Frente: regresión del tracker | 60 fps, inicio 6,8 y 7,9 s | No empeorar falsos positivos frente a `ball_fase_b3`. |
| Práctica: `pw_ps_t01`, `i6_ps_f01`, `i9_ps_f02` (3 swings) | Varios swings, práctica | swing | Aviso de N swings; elegir otro (3.5). |
| Controles `pruebas/controles/*` | Sin persona, sin swing, cámara lenta | swing | Rechazos actuales se mantienen (lento 2× sigue aceptándose: documentado). |
| `IMG_2097.MOV` (HEVC + APAC, 253 s) | Archivo "antiguo"/pesado | swing y export | Mensaje claro si el navegador no decodifica HEVC; si decodifica, solo los primeros 30 s. |
| Diestro | Mano dominante | — | **No hay clips reales de diestros.** Espejar con ffmpeg (`hflip`) da un control sintético, no una validación. Pedir a Ryan clips de otra persona (D9). |

### 6.2 Pruebas automáticas (vitest, entorno Node)
- Reloj y tiempo real (F1.1); compositor y estilos (F1.2); proyección (F1.3); migración del store (F2.1); política de limpieza (F2.3); guías y confianza (F3.2); fase `finish` y anti-regresión (F3.4); `warp` (F4.1); recorte seguro (F4.2); tracker con `timeScale` (F5.2), recorte nativo (F5.3), descenso y continuación (F5.5); rasgos de forma (F6.2); unidades (F7.1); estimador con referencias (F7.3); línea de tiempo (F8.2); impacto de audio (F8.3); draw lists idénticas preview/export (F8.7a); máquina de estados del pase (F9.1); anuncios con plugin simulado (F9.2).
- Cada arreglo lleva una prueba que falla sin él (costumbre del repo).

### 6.3 Pruebas en navegador (harness, Chrome headless, máx. 2–3 en paralelo)
- `run_swing.mjs` sobre los 90 clips tras F3: mismas métricas de `metricas_fix.json` o mejores (vista ≥ 97 %, sin clips nuevos con error).
- `run_ball.mjs` con el manifiesto 0.8 en `resultados/ball_v2/`.
- Métricas del tracker contra la referencia 5.1 (de la skill): cuadros bien ubicados (≤ 1,5 % del cuadro) ≥ 85 % con Wilson inferior ≥ 75 %; falsos positivos ≤ 10 %; continuidad ≥ 80 %; huecos dibujados como hueco 100 %; descenso: acuerdo con el anotador en todos los clips anotados (con n = 11 no es "listo": reportar k/n).
- Continuación: validación por truncado — cortar cada trayectoria anotada al 60 % de su duración, predecir el resto visible (hasta 0,5 s) y medir error mediano normalizado por la altura del cuadro. Criterio para mostrarla fuera de pruebas: error mediano ≤ 2,5 % y p90 ≤ 6 % en ≥ 85 % de las trayectorias, con ≥ 20 trayectorias por vista [PROPUESTA]. Con los 11 actuales solo se informa.
- Exportación: paridad (8.7), sincronía de audio (8.8), ffprobe del archivo, reproducción en Chrome.
- Cámara falsa para live (10.1–10.5).

### 6.4 Detección insuficiente y casos límite
Toque lejos de la bola; bola blanca contra cielo; clip que termina antes del impacto; clip sin audio; dos bolas en el cuadro (otro jugador); cámara movida (comparar estabilidad del fondo: si > 2 % de desplazamiento global, avisar y no dibujar continuación); video girado (rotación 90); video de 30 fps declarado como 60; archivo > 30 s; HEVC no decodificable; poca memoria (exportación cancelable).

### 6.5 Anuncios (solo IDs de prueba)
Completo; cerrar antes; sin relleno; `FailedToShow`; doble toque; `Rewarded` duplicado; app a segundo plano durante el anuncio; pase persistido tras cerrar la app; error de codificación tras el pase (reintento sin anuncio); cambio de configuración (pide anuncio); pase caducado; Premium activado durante el flujo; consentimiento denegado (`canRequestAds` falso ⇒ mensaje y sin anuncio; decide D5 si exporta). Regla de 15 min + 2 anuncios del tracking: sin cambios (prueba de regresión).

### 6.6 Dispositivos
Mínimo: un iPhone con iOS reciente y uno con iOS 17/18 (WebCodecs parcial: sin audio), un Android de gama media (API ≥ 24) y Chrome/Safari de escritorio. Medir: tiempo de análisis de un clip de 20 s, fps live, tiempo y memoria de exportación de 30 s, temperatura/batería en 10 min de live. Sin dispositivos, escribir "no medido".

---

## 7. Validación de clasificación y distancia

### 7.1 Tipo de tiro
- **Qué se puede inferir con una cámara:** desde atrás, la dirección inicial en la imagen respecto a la línea de tiro marcada y la curvatura lateral del tramo visto (draw/fade/hook/slice, invertidos para zurdos); la "altura" solo relativa al horizonte y sin escala. Desde el frente, la elevación en la imagen y nada sobre curvatura lateral. Tiro bajo (stinger/bajo) y curvatura lateral son ejes independientes: un stinger puede ser recto, draw o fade.
- **Datos etiquetados necesarios:** ≥ 30 tiros por clase y por vista, de ≥ 3 jugadores (al menos uno diestro), con etiqueta independiente: (a) launch monitor (curvatura/spin axis y altura máxima) o (b) dos etiquetadores que vean el vuelo completo en un video de referencia de mayor alcance, ciegos a la salida del algoritmo, con acuerdo (kappa ≥ 0,7 [PROPUESTA]); sin acuerdo ⇒ `sin_determinar`.
- **Métricas:** precisión por clase, cobertura (tiros con decisión / total), matriz de confusión, calibración de `conf`.
- **Criterio para habilitar** cada clase: precisión ≥ 90 % con Wilson inferior ≥ 80 % y n ≥ 30 de esa clase en el conjunto de prueba, cobertura ≥ 50 %; si no, esa clase se queda en `sin_determinar` [PROPUESTA]. Dividir en desarrollo/prueba **por sesión de grabación** antes de mirar resultados.
- **Cómo obtener los datos:** sesión de range con la cámara trasera fija, línea de tiro marcada con una varilla de alineación visible, horizonte visible, y un launch monitor prestado o del range; registrar cada tiro con su número. Hoy hay 3 stingers sin etiqueta independiente y ningún draw/fade etiquetado ⇒ automático desactivado.

### 7.2 Distancia en yardas
**Carry** = vuelo hasta el primer bote; **total** = carry + bote y rodada hasta detenerse. Qué necesita cada una y opciones:

| Opción | Carry | Total | Precisión esperable | Costo | Condiciones | Complejidad |
|---|---|---|---|---|---|---|
| Registro manual (ya existe, pasar a yardas) | Sí, si el usuario la conoce (banderas, láser) | Sí | La del usuario | 0 | Ninguna | Baja |
| Referencias visibles + punto de caída en el video (F7.3) | Solo si la caída se ve en el cuadro | Solo si se ve la bola detenerse | Depende de la distancia y del px por yarda en la zona de caída; a 100+ yd una bola de 42,67 mm ocupa < 1 px a 1080 px de ancho: rara vez se ve caer | 0 | Cámara fija, ≥ 2 referencias de yardaje conocido en el suelo y en la línea de tiro, buena luz | Media |
| Calibración de cámara y terreno (homografía con ≥ 4 puntos medidos) | Igual que la anterior, más precisa fuera de la línea de tiro | Igual | Mejor que la anterior; el error crece con la distancia | Tiempo del usuario | Medir puntos en el terreno (no práctico en un range) | Alta |
| Modelo físico desde la salida (velocidad, ángulo, spin) | No con 60 fps sin calibración: la velocidad de bola necesita escala y ≥ 240 fps cerca de la bola; sin spin el error es grande | No | No defendible hoy | 0 | — | Alta |
| Launch monitor compatible (importar CSV o SDK) | Sí (medido por el equipo) | Según el equipo | La del equipo | Equipo del usuario | Las del equipo | Media (CSV) / alta (SDK y acuerdos) |
| Promedio del palo del propio usuario | No es medida: solo "referencia de tus tiros registrados" | — | — | 0 | Historial | Baja |

**Presentación:**
- `measured_manual`: "152 yd · medida por ti".
- `estimated`: "≈ 148 yd (138–158) · estimada con 2 referencias del campo; supone terreno plano y que marcaste bien la caída". Siempre con intervalo del 90 % y supuestos visibles.
- `unavailable`: "Distancia no disponible: el video no muestra dónde cayó la bola" + "Registrar a mano".
- Nunca convertir duración del vuelo o pocos cuadros en distancia.

**Validación antes de mostrar estimaciones automáticas:**
- Referencia independiente: launch monitor (carry y total) o láser medido al piquete de la caída por un ayudante. ≥ 60 tiros: ≥ 20 por grupo (hierros cortos, medios, largos/maderas), ≥ 2 ángulos de cámara, mañana/tarde/nublado, incluidos tiros donde el seguimiento es incompleto (deben salir `unavailable`).
- Métricas: error absoluto medio (yd), error porcentual medio, sesgo, cobertura real del intervalo del 90 %, tasa de abstención.
- Criterio [PROPUESTA]: por grupo, error porcentual medio ≤ 7 %, cobertura del intervalo entre 85 y 95 %, y "dentro de ±10 %" con Wilson inferior ≥ 75 %; la abstención no cuenta como acierto pero tampoco como error, y se reporta.
- Cómo fijar umbrales pendientes: sesión piloto de 20 tiros para ajustar el modelo de error de marcado (px) y la fórmula del intervalo; congelar; medir en tiros nuevos.

---

## 8. Integración, migración, despliegue y marca

- **Migración:** `persist` v0→v1 sin pérdida (F2.1); sesiones antiguas visibles; `Shot.carryM` se conserva; los nuevos registros pesados viven fuera de `localStorage`.
- **Despliegue gradual:** todo detrás de banderas. Orden de encendido: `videoReview` → `compare` → `export` + `exportGate` (Premium primero, luego Gratis) → `flightV2` (con estimado apagado) → `liveRecording`. `flightEstimate`, `shotShapeAuto` y `distanceEstimate` siguen apagados hasta cumplir la sección 7. GitHub Pages y `build:static` siguen funcionando (sin `/api`, anuncios simulados).
- **Anuncios de prueba y credenciales:** IDs de prueba de Google en desarrollo (usar IDs reales en desarrollo puede suspender la cuenta, según Google); IDs reales solo por variables de entorno en la build de tienda; App ID de AdMob en la config nativa; nada de claves en el repo (`.env` ignorado: comprobar con `git check-ignore`). SSV solo con servidor desplegado.
- **Documentación** en el mismo commit de cada cambio: `homegolflab/CLAUDE.md` (estructura nueva, decisiones, lo medido), skill `golf-ball-flight-tracking` (estilos, descenso, continuación, referencia), skill harness (gancho oficial, manifiesto, paridad).
- **Marca (`marketing/BRAND.md`):** actualizar la tabla de funciones solo con lo encendido en la build que se muestre: revisión de video con guías, comparación ("dos golpes distintos sincronizados"), exportación (Premium libre; Gratis con anuncio), tracking con "tramo visto / bajada vista en el video / trayectoria estimada, no medida". En "Qué no afirmar": distancia medida automáticamente, velocidad, ángulo de salida real, dónde cayó la bola, tipo de tiro automático (mientras esté apagado), que la app detecta cámara lenta, "anuncio de 30 s" si D1 lo cambia. Los videos de Stories del 18 nov deben llevar en su publicación el marco de "demostración/montaje" mientras el producto no lo haga (consultar a `hgl-fact-checker`).
- **`marketing/LAUNCH.md`:** añadir los pendientes (plataformas nativas, AdMob, consentimiento, pruebas en dispositivos).

---

## 9. Riesgos, dependencias y decisiones para Ryan

### 9.1 Riesgos reales
1. **El tracker puede no seguir la bola en la mayoría de los videos de usuarios.** Hoy no hay una sola trayectoria confirmada por la app con referencia. Mitigación: referencia 5.1 antes de cualquier promesa; abstenerse por defecto.
2. **Perspectiva trasera:** el "descenso" en la imagen puede no ser descenso real. Mitigación: etiqueta "en la imagen".
3. **WebCodecs/AudioEncoder incompletos en iOS < 26** y en WKWebView sin verificar. Mitigación: detección de capacidades, respaldo MediaRecorder, posible plugin nativo (D7).
4. **Memoria al exportar y guardar videos grandes en nativo** (base64 en `writeFile`). Mitigación: escritura por bloques, límites de duración.
5. **Datos de un solo golfista zurdo y un teléfono.** Nada generaliza a diestros ni a otros equipos.
6. **AdMob:** no se puede fijar la duración del anuncio; sin relleno en algunos países; consentimiento puede impedir anuncios. Política de divulgación obligatoria.
7. **iCloud** renombra archivos recién editados (`nombre 2.ext`) y `node_modules` vive dentro de iCloud (#19): revisar `git status` tras cada tarea.
8. **El parche del harness** se rompe al editar `Swing.tsx`/`VideoFlight.tsx` (mitigado con 0.7).
9. **HEVC/MOV**: Chrome de escritorio en Windows puede no decodificar HEVC; los usuarios de iPhone graban HEVC por defecto.

### 9.2 Dependencias externas
Xcode y Android Studio (F11); cuentas de Apple Developer, Google Play y AdMob (publicar); dispositivos de prueba; launch monitor o láser para validar distancia/forma; clips de diestros.

### 9.3 Decisiones para Ryan (con recomendación)
- **D1 "Anuncio de 30 segundos":** Google no deja fijar la duración; la documentación indica que la recompensa se concede como máximo a los 30 s del anuncio y muchos duran menos. Recomendado: "1 anuncio con recompensa" por descarga y cambiar los textos que prometen 30 s (también en el tracking). Alternativa: exigir varios anuncios hasta sumar 30 s (peor experiencia, divulgación extra).
- **D2 Unidades:** yardas por defecto para distancias de tiro y metros para putts/espacios, con preferencia en Perfil. Recomendado.
- **D3 Ámbito de la recompensa:** 1 pase = un análisis + una configuración, 24 h, reintentos y reenvíos incluidos. Recomendado.
- **D4 Comparación de dos clips:** ¿Premium o gratis? Recomendado: ver gratis, exportar con la regla general.
- **D5 Anuncio no disponible / consentimiento denegado:** recomendado permitir 1 exportación gratis al día sin anuncio en ese caso (registro local), o bien bloquear con "inténtalo más tarde". Y si se quiere SSV (servidor desplegado).
- **D6 Launch monitor:** ¿qué equipo, si alguno? Sin elección, solo registro manual.
- **D7 Plugin nativo de codificación** si WebCodecs no basta en iOS: más trabajo (Swift/Kotlin).
- **D8 Guardar en galería** además de compartir (requiere permiso de fotos en iOS).
- **D9 Clips de validación:** sesión con línea de tiro marcada, horizonte visible, láser o launch monitor, y al menos un golfista diestro.
- **D10 Marca de agua/logo** en las exportaciones de usuarios Gratis (recomendado: logo oficial pequeño en ambas; quitarlo en Premium es otra palanca de venta).

---

## 10. Lista final de verificación

- [ ] F0 completo: #17, #18, #20, #4 cerrados con pruebas; BRAND corregido; gancho de depuración solo en DEV; `run_ball` con manifiesto.
- [ ] `persist` versionado y migración probada con datos reales.
- [ ] Revisión de swing con guías y fases en frente y atrás; guías ocultas/atenuadas con baja confianza; zurdo y diestro (espejado) correctos.
- [ ] Comparación con insignia de golpes distintos y ajuste manual; recorte seguro sin cortar cuerpo ni palo.
- [ ] Referencia de vuelo anotada para los 11 clips; métricas del tracker informadas con Wilson; ningún umbral movido.
- [ ] Estilos verde/dorado/gris/morado según la tabla; descenso solo con evidencia; continuación abstenida cuando corresponde y apagada en producción.
- [ ] Tipo de tiro: manual disponible, automático apagado. Distancia: "no disponible" + manual en yardas; estimador apagado.
- [ ] Exportación 1080×1920 H.264/AAC; paridad vista previa ↔ exportación ≤ umbrales; audio del impacto ≤ 1 cuadro; silencio cuando no se aísla.
- [ ] Pase de exportación probado en todas las transiciones; regla de 15 min + 2 anuncios intacta.
- [ ] Live: sin duplicados, interrupciones manejadas, grabación temporal borrada.
- [ ] Nativo: permisos, AdMob de prueba con consentimiento, compartir/guardar en iOS y Android (o "bloqueado" con motivo).
- [ ] `npm run typecheck`, `npm test`, `npm run build`, `npm run build:static` en verde.
- [ ] `CLAUDE.md`, skills y `BRAND.md` actualizados en los mismos commits.
- [ ] Informe final con lo medido, lo no medido y los bloqueos.

---

## 11. Prompt de traspaso para Sonnet

```text
Eres el agente de implementación de HomeGolfLab. Sigue al pie de la letra homegolflab/docs/plan-video-tracking-exportacion.md, fase por fase y en el orden indicado.
Antes de cada tarea, verifica que las rutas, símbolos y contratos citados siguen vigentes en el código; si cambiaron, adapta y anótalo.
Lee homegolflab/CLAUDE.md, marketing/BRAND.md y las skills que el plan nombra antes de tocar su área. Responde y escribe la interfaz en español.
Trabaja en la rama feat/video-review-export; un commit por tarea verificada; no hagas push, PR ni publicaciones sin que Ryan lo pida.
Cada tarea termina con typecheck, test y build en verde y con su verificación propia (prueba que falla sin el cambio, captura o métrica del harness).
No inventes resultados: lo que no puedas medir, escríbelo como "no medido" y por qué. No muevas umbrales para que algo pase.
Si algo falla, diagnostica la causa y arréglala; si te bloquea una decisión de Ryan (D1–D10), una cuenta, un dispositivo o datos que no existen, detén esa tarea, deja constancia con evidencia y sigue con la siguiente que no dependa de ella.
Al terminar cada fase, entrega un resumen corto: qué se hizo, comandos y resultados, lo medido, lo no medido y los bloqueos.
```

---

## Fuentes oficiales consultadas (19 nov 2026)
- AdMob, anuncios con recompensa en Android (caducidad de 1 h, orden de `onUserEarnedReward`, SSV, ID de prueba): https://developers.google.com/admob/android/rewarded
- AdMob, verificación del lado del servidor: https://developers.google.com/admob/android/ssv · https://developers.google.com/admob/ios/ssv
- AdMob, políticas de anuncios con recompensa (opt-in, divulgación, duración máxima para conceder la recompensa): https://support.google.com/admob/answer/7313578 · https://support.google.com/admob/answer/9905527
- `@capacitor-community/admob` (eventos `Loaded/FailedToLoad/Showed/FailedToShow/Rewarded/Dismissed`, `ssv`, UMP, ATT, App ID, compatibilidad con Capacitor 8): https://github.com/capacitor-community/admob
- Capacitor Share (`files` solo iOS/Android; en Android solo la carpeta de caché por defecto): https://capacitorjs.com/docs/apis/share
- Capacitor Filesystem: https://capacitorjs.com/docs/apis/filesystem (límite práctico de memoria con `writeFile` base64 reportado por la comunidad: https://forum.ionicframework.com/t/ionic-save-large-file-capacitor-filesystem-out-of-memory-error/223180)
- MediaPipe Pose Landmarker para web (modo VIDEO con marcas crecientes, `numPoses`, umbrales, `visibility` y `presence`): https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker/web_js
- WebCodecs (soporte en Safari iOS parcial 16.4–18.x, completo desde 26): https://developer.mozilla.org/docs/Web/API/WebCodecs_API · https://caniuse.com/webcodecs
- MediaRecorder en WebKit: https://webkit.org/blog/11353/mediarecorder-api/

Las cifras marcadas [PROPUESTA] no vienen de ninguna fuente: son puntos de partida que se fijan con datos piloto.
