# Registro de implementación (rama `feat/video-review-export`)

Cada fase anota: adaptaciones respecto al plan (`plan-video-tracking-exportacion.md`), lo medido, lo no medido y los bloqueos.

## F0. Preparación y deudas (19 nov 2026)

Base: `feat/mvp-driving-range` @ `d9f4d3e`. Línea base: typecheck OK, 107/107 pruebas, build OK.

| # | Estado | Commit | Verificación |
|---|---|---|---|
| 0.1 | hecho | — | 107 pruebas en verde al empezar (el plan decía 107: coincide). |
| 0.2 (#17) | hecho | `fc3e453` | `lib/quota.ts` + 5 pruebas. Navegador (Chrome, Premium apagado, `i5_sr_t01`): botón pasa a "Ya analizado" y queda deshabilitado, 1 sesión; un segundo clic forzado no guarda otra. |
| 0.3 (#18) | hecho | `eec0259` | `lib/liveSession.ts` (`drainLiveSwings`) + 4 pruebas. Navegador con cámara falsa (y4m de `i5_sr_t01`): 1 swing detectado (82/100); doble clic en "Terminar" → 1 sesión `{live, shots:1}`. |
| 0.4 (#20) | hecho | `f394540` | `createLiveDetector`/`PoseFailure` en `pose.ts` + 3 pruebas (recupera por CPU, corta a los 3 fallos seguidos, un cuadro bueno reinicia). Regresión en navegador OK (mismo flujo que 0.3). **No medido en navegador**: forzar el aborto del GPU real no se puede sin tocar el código; está cubierto solo por las pruebas unitarias. |
| 0.5 (#4) | hecho | `768ecf4` | `flightStatCards` (sin ángulo) + prueba. Captura en navegador (`i4_sr_f01`): solo "Puntos detectados 17" y "Bola seguida 0,4 s". `launchAngleDeg` se conserva como dato interno. |
| 0.6 | hecho | `53d1d02` | `BRAND.md`: 12 s → 30 s (= `MAX_SECONDS`; con más duración solo se analizan los primeros 30 s). |
| 0.7 | hecho | `9b3bcb2` | `lib/debugHook.ts`; `run_swing.mjs` corre contra `npm run dev` sin parche (`i5_sr_t01`: atrás, 7,07/7,70/8,00 s, nota 75). `grep -r __hgl dist/` = 0 archivos. |
| 0.8 | hecho | `4574471` | `run_ball.mjs` lee `HGL_BALL_SHOTS`; manifiesto en `pruebas/ball_shots.json` (fuera del repo). `i5_sr_t01` se guardó en `resultados/ball_v2/` sin tocar `resultados/ball/`. |

### Adaptaciones al código vigente
- Los números de línea del plan se desplazaron un poco (`UploadAnalyzer` está en `Swing.tsx:560`, `analyze` en `:588`, `LiveAnalyzer` en `:693`); se localizó por símbolo, no por línea.
- #17: el plan dice "deshabilitar cuando ya hay resultado y el límite está alcanzado"; se implementó también para el caso de límite mayor que 1 (un archivo ya analizado no se reanaliza gratis). Premium sí puede reanalizar (y guarda otra sesión, comportamiento previo sin cambio).
- #18: al cambiar de cámara en vivo (`flip`) no se vacía la lista (`start(n, false)`); solo un inicio nuevo la vacía.
- El aviso de vista distinta (`viewMismatch`) sigue diciendo "analiza de nuevo": para un usuario Gratis eso ahora choca con "Ya analizado". Se resuelve en 3.5 (reanálisis sin consumir otra cuota); queda anotado, no se tocó el texto.

### Lo medido / lo no medido
- Medido: pruebas unitarias (121 al cierre de F0), builds, y los cuatro flujos de navegador de arriba.
- No se repitió el comportamiento anterior sin el cambio en el navegador (el defecto #17 se confirmó leyendo el código: botón activo y `addSession` en cada clic); la "prueba que falla sin el cambio" son las pruebas unitarias nuevas.
- Determinismo: el tope de `i5_sr_t01` en el navegador salió en 7 700 ms; la corrida guardada en `swing_fix` daba 7 667 ms (1 cuadro a 30 Hz; tempo 2,11 vs 1,8). El modelo no es determinista bit a bit (documentado en la skill); no se considera cambio de detección porque `swing.ts` no se tocó.
- `i5_sr_t01` en el tracker: **0 puntos, "No se detectó la bola"**. El toque (0,248; 0,571) lo estimé a mano mirando el cuadro a 6,5 s (la bola queda medio tapada detrás de la cara del hierro), así que ese resultado no prueba nada sobre el tracker; la referencia de vuelo es F5.1.
- Pendiente de marcar (tap `null` en el manifiesto): `i5_sr_t02`, `i6_sr_t06`, `i4_sr_t03`, `i7_stinger_sr_01/02/03`. Marcarlos requiere ver la bola en el cuadro; se hace en F5.1.

### Bloqueos
- Ninguno en F0.

## F1. Contratos y compositor puro (19 nov 2026)

| # | Estado | Commit | Verificación |
|---|---|---|---|
| 1.1 | hecho | `aaba4ae` | `lib/media/clock.ts`; 6 pruebas (60 fps, 30 fps, media velocidad, `firstFrameMs` ≠ 0, equivalencia 60 fps ↔ 30 fps a media velocidad, relojes inválidos). |
| 1.3 | hecho | `f9b7c97` | `lib/overlay/viewport.ts`; 8 pruebas. Ida y vuelta con letterbox y con recorte: error < 0,5 px. |
| 1.2 | hecho | `880f58a` + corrección de la revisión | `lib/overlay/{model,draw}.ts`; 33 pruebas en `lib/overlay`. Estilos de la tabla 4.6 como constantes. Dos mutaciones del código (quitar el umbral de confianza, quitar el desvanecido) hicieron fallar las pruebas. |
| 1.4 | hecho | `cf06e54` | `lib/flags.ts` + `components/FlagsPanel.tsx`; 6 pruebas. Navegador (Chrome limpio): panel con 9 banderas apagadas; 2 encendidas persisten tras recargar; "Restablecer" limpia. Build de producción: 0 apariciones de "Funciones de prueba" y de `hgl-flags-v1` (control positivo: "Subir video" sí aparece). |

### Revisión adversarial (workflow, 3 lentes + verificador escéptico por hallazgo)
10 hallazgos, 3 confirmados y corregidos (todos en `draw.ts`), 7 refutados:
- Confirmado: `show: { flight: undefined }` apagaba la capa (spread). Ahora `??` por capa.
- Confirmado: el esqueleto entre 0,4 y 0,6 iba atenuado pero no punteado, contra el contrato documentado. Ahora los huesos van punteados y atenuados (las articulaciones, que son puntos rellenos, solo atenuadas).
- Confirmado: el desvanecido de la continuación estimada iba por posición en el arreglo (un solo segmento largo quedaba fijo en 0,9; los ocultos por confianza contaban). Ahora va por longitud acumulada en orden cronológico y cada segmento se parte en 4 trozos. Se perdió la igualdad exacta 0,9/0,4 en los extremos: ahora el primer trozo queda cerca de 0,9 y el último cerca de 0,4 (media del trozo).
- Refutados (no son defectos hoy): `frameOf` con instantes anteriores al primer cuadro devuelve −0/−1 (es la fórmula del plan; recortar es decisión del llamador, F3/F5); `makeViewport` no valida recortes fuera de 0–1; pruebas de ida y vuelta algo tautológicas (hay pruebas de esquinas y letterbox que sí fijan valores); NaN en confianza; `pickSample` exige muestras ordenadas (precondición documentada); el trazo de la bola no usa la banda 0,4–0,6 (el plan solo la define para guías). La lente de banderas no halló nada.

### Lo no medido
- Contraste del morado `#9B7BEA` contra fondos reales (cielo, pasto): solo se midió ≥ 3:1 contra negro y blanco. Se valida con capturas reales en F5.6.
- Ninguna pantalla usa aún el compositor ni el reloj (llegan con F3/F5): lo de F1 está probado con pruebas unitarias y el panel de banderas, no con video real.

### Incidencia
- La caché de Vite (`node_modules/.vite`) quedó desfasada y el servidor devolvía 504 "Outdated Optimize Dep" (la comparten `vite build` y vitest). Se borró (es solo caché) y se reinició el servidor.

## F2. Persistencia y migración (19 nov 2026)

| # | Estado | Commit | Verificación |
|---|---|---|---|
| 2.1 | hecho | `2e98d64`, `3f4b1c5` | `lib/storeMigrate.ts`, `persist` versión 1. Fixture REAL generado por la app (`__fixtures__/store-v0-real.json`). 8 pruebas (2 de integración con el store real; fallan con el `store.ts` anterior). Chrome: el JSON v0 se migra al cargar (sesión, 2 medallas y perfil intactos, `exportPasses: []`). |
| 2.2 | hecho | `7a5c0a6` | `lib/media/*`; `@capacitor/filesystem` 8.1.5 (exacta, 35 días; transitiva `@capacitor/synapse` 1.0.4). 24 pruebas; 2 mutaciones detectadas. IndexedDB real en Chrome: 24 MB en 67 ms, persiste tras recargar, borrar deja 0. |
| 2.3 | hecho | `106a5ba` | `policy.ts` (pura) + `cleanup.ts` + tarjeta "Espacio usado" + limpieza al arrancar (solo con banderas de video). 13 pruebas con fechas simuladas. Chrome: la exportación de 30 h se borró sola, el video del usuario quedó, el botón borra. |

### Revisión adversarial de F2 (3 lentes + verificador escéptico): 12 hallazgos, 5 confirmados, 7 refutados
Corregido (commit de revisión de F2):
- `NativeFsBackend.putBlob`/`delete` ahora se serializan por id (dos `putBlob` concurrentes del mismo id mezclaban bloques y dejaban un archivo corrupto). Prueba nueva que falla sin el arreglo.
- "Borrar todos mis datos" borra primero los videos y, si falla, avisa y NO borra el resto (antes hacía `reset()` y tragaba el error: videos huérfanos sin sesión).

**Los tres pendientes quedaron CORREGIDOS en el commit siguiente (19 nov 2026):**
1. Reemplazo en el backend nativo: ahora escribe a `<id>.tmp` por bloques y solo al terminar borra el viejo y renombra; si falla a mitad, la versión anterior queda intacta (prueba nueva).
2. Huérfanos: `planOrphans` (pura) + `runCleanup`. Borra blobs/pistas/vuelos sin referencia y referencias sin video, SOLO si llevan más de 24 h (por eso un guardado en curso no se toca) y no los referencia una sesión. Las entradas del backend ahora traen `modifiedAt` (IndexedDB `at`, memoria, `mtime` nativo). Una mutación de la guarda de edad hizo fallar las pruebas.
3. El rollback de `saveMedia` ya no es silencioso (`console.warn`); si queda un huérfano, la pasada 2 lo borra.

Refutados (no son defectos hoy): guardado ilegible → `{}` (zustand lo fusiona con el estado inicial), guardado de versión futura, colisión del sufijo `-ref` (ids de usuario, que no existen), borrar recién guardados al pasar el tope (precondición documentada), foto de sesiones en `runCleanup`, `NaN` en fechas.

### Lo no medido
- Backend nativo: no probado en un dispositivo (no hay carpetas `android`/`ios`), solo con un sistema de archivos falso.
- Cuota del navegador casi llena: no probada en un navegador real.
- No hay pantalla para borrar una sesión: `removeSession`/`deleteSessionMedia` existen y tienen pruebas, pero ninguna pantalla los usa.

## F3. Revisión de swing en video, un ángulo (19 nov 2026)

| # | Estado | Commit | Verificación |
|---|---|---|---|
| 3.1 | hecho | `1102165` | `persistReview`; con `i5_sr_t01`: 1 video idéntico (23 564 157 bytes) y 1 pista de **42 KB** (< 200 KB, 79 muestras de 6,10 a 8,70 s) enlazados a la sesión (`mediaId`, `poseTrackId`). |
| 3.2 | hecho | `72696e8` | `lib/swingReview.ts`; 16 pruebas sintéticas (oclusión, zurdo/diestro, salto, interpolación). La mutación de invertir zurdo/diestro hizo fallar 5 pruebas. |
| 3.3 | hecho | `1fbd9fa` | `VideoReview`. Chrome con `i5_sr_t01` (atrás) e `i7_sr_f01` (frente): el cuadro mostrado en Inicio/Tope/Impacto coincide con `frameOf(t)` (diferencia 0 en los 6: 424/460/480 y 374/424/444); el paso de ±1 cuadro avanza 16,67 ms (60 fps estimados solos). Capturas del esqueleto y las guías. |
| 3.4 | hecho | `d5b97a6` | `lib/phases.ts` (10 pruebas; mutación detectada). **Laboratorio anti-regresión sobre los 96 conjuntos: 0 clips cambian** (no_swing 9, plausibles 67, ±0,5 s 66, referencia manual 5/7 · 6/7 · 7/7: idéntico a la línea base). `swing.ts` solo recibió dos campos de TIPO (`times.finish`, `phaseConf`). |
| 3.5 | hecho | `cec2e4c` | `lib/swingWindows.ts` (4 pruebas). Con cuadros guardados: `i9_sr_t04` (2 ventanas: 4,8–7,3 s y 14,9–17,5 s; el swing real ≈ 6,5 s cae en la primera, la que la app NO analizaba), `i9_ps_t02` (2), `i7_stinger_sr_03` (2). Chrome con `i7_stinger_sr_03` y Premium apagado: 2 miniaturas; al elegir el 1.º, la sesión cambió (inicio 7,10 → 1,77 s, nota 84 → 85), sigue 1 sola sesión, el botón continúa "Ya analizado" y la revisión se recargó en el cuadro 106. |
| 3.6 | hecho | `1fbd9fa` | La sesión MIGRADA del fixture real (sin video) abre `/swing?ver=` con el aviso "Este análisis es anterior y no guardó el video" y el resultado; con la bandera apagada no cambia nada. |

### Adaptaciones y decisiones
- **Confianza de landmark = visibilidad**: el JS de MediaPipe no entrega `presence` y `pose.ts` solo guarda `visibility`; la pista guarda la visibilidad en ambos canales. Se mejora si algún día se captura `presence`.
- **Los fps no se leen del archivo** (hace falta un demultiplexor, F8.1): el reloj guardado es `estimated`/30 y se corrige al cargar con una reproducción muda a 0,5× (`estimateFps`, probada). Si no hay evidencia suficiente se deja 30 y el usuario fija 30/60.
- **3.4 no amplía el muestreo de `analyzeSwing`**: `findEvents` usa `s = floor(n·0,1)` y `e = ceil(n·0,92)`, así que añadir cuadros movería los índices. El final sale de un tramo extra de 30 cuadros/s hasta 2,3 s tras el impacto, solo con la bandera encendida (+≈1,5 s de análisis).
- **3.5**: reanalizar otro swing REEMPLAZA el análisis de esa sesión (`replaceSessionSwing`), no guarda otra. Los ajustes manuales de fase se borran al cambiar de swing.
- Los umbrales de `phases.ts` (0,3 s de quietud, 0,06 del torso de radio, pesos de nitidez) son [PROPUESTA]; no se movieron mirando clips.

### Lo medido / lo no medido
- **Confianza por fase, sin calibrar**: en `i5_sr_t01` salió inicio 0,06, tope 0,53, impacto 0,51, final 0,73; en `i7_sr_f01` inicio 0,36, tope 0,82, impacto 0,83. El chip "Revisa esta fase" aparece en el **Inicio** de los dos clips. No sé si refleja un error real: la referencia manual de `i7_sr_f01` (auto-anotada, NO verificada por Ryan) pone el inicio en ≈6,40 s y la app en 6,23 s (167 ms, fuera de ±100 ms), pero con n = 7 clips anotados no se puede declarar nada ni ajustar el umbral.
- **Final**: en `i5_sr_t01` se encontró (8,567 s); en `i7_sr_f01` no (`null`: las manos no quedaron quietas 0,3 s en el tramo muestreado). Sin referencia manual del final: no medido.
- **No se corrió `run_swing.mjs` sobre los 90 clips** (≈100 s por clip) tras F3; como `analyzeSwing` no cambió y el laboratorio da 0 diferencias, no se espera diferencia, pero no está medido en el navegador.
- **Dispositivos reales (iPhone/Android)**: `requestVideoFrameCallback`, la estimación de fps y el rendimiento de la revisión solo se probaron en Chrome de escritorio. `i7_sr_f01`/`i5_sr_t01` son de un solo golfista zurdo y un teléfono.
- **Diestros**: la inversión del brazo guía está probada con puntos sintéticos, no con video de un diestro (no hay clips).

### Incidente del flujo de trabajo
- Un commit de F3.5 salió con 298 archivos "borrados" (`swingiq/`, `video-pitch/`, `.claude/`…) porque el índice de git quedó incompleto antes de confirmar (causa no determinada; el repo vive en iCloud Drive). Los archivos nunca salieron del disco. Se deshizo con `git reset --mixed HEAD~1` (commit local, sin push) y se rehízo con rutas explícitas (380 archivos en HEAD). **Desde aquí cada commit usa rutas explícitas y se revisa `git diff --cached --stat` antes de confirmar.** Los commits anteriores se comprobaron: 378 archivos en cada uno.

### Revisión adversarial de F3 (3 lentes + verificador escéptico): 6 hallazgos, 4 confirmados y corregidos, 2 refutados
- La sonda de fps competía con lo que el usuario tocara en el primer segundo (velocidad, fps, salto de cuadro): ahora los controles quedan bloqueados mientras mide ("Midiendo los cuadros por segundo…").
- Carreras en `Swing.tsx` (elegir swing mientras aún se guardaba el video; "Cambiar video" durante un reanálisis; guardado viejo escribiendo sobre un video nuevo): `tokenRef` descarta resultados de trabajos viejos, las acciones se bloquean durante el reanálisis y las miniaturas esperan a que termine el guardado.
- Orden de `chooseSwing`: primero se guarda la pista (reemplazo atómico) y solo después se cambia la sesión; si falla, se conserva el análisis anterior.
- Refutados: `play()` sin manejar el rechazo (sin consecuencia concreta) y `hz` 10 con el respaldo grueso.
- Reverificado en Chrome con `i7_stinger_sr_03` (mismo resultado que antes de las correcciones). Las carreras se corrigieron por lectura del código: **no se reprodujeron en el navegador** (ni antes ni después).

## F4. Comparación de dos clips (19 nov 2026)

| # | Estado | Verificación |
|---|---|---|
| 4.1 | hecho | `buildWarp` en `swingReview.ts`; 7 pruebas (alineación exacta, monotonía e inverso, pendiente 1 fuera de fases, fases comunes, orden inválido → null, tramo dudoso, ajuste manual). Mutar la interpolación hizo fallar 5. |
| 4.2 | hecho | `lib/safeCrop.ts`; 5 pruebas (margen de 1,3 × torso, varilla, proporción del panel y contención, letterbox, confianza baja). Chrome: `i5_sr_t01` + `i5_sr_t02` (atrás) y `i7_sr_f01` + `i7_sr_t01` (frente + atrás): cuerpo entero y palo visibles en el tope en los 4 paneles (capturas `compare_*_top.png`). |
| 4.3 | hecho | `CompareView` + `/comparar`. Chrome, fases Inicio/Tope/Impacto en ambas parejas: el cuadro mostrado de A y de B coincide con `frameOf` de su propia fase (diferencia 0 cuadros y 0,0 ms en los 12 casos, relojes de 60 fps medidos). El video cubre el panel. |
| 4.4 | **bloqueada** | Depende de F8.3 (audio). Mientras tanto la insignia no afirma "mismo golpe". |

### Adaptaciones y hallazgos
- Primera pasada en Chrome mostró una franja negra: el preflight de Tailwind pone `max-width: 100%` a `<video>` y recortaba el ancho ampliado del recorte. Se fijó `maxWidth/maxHeight: none`; después el video cubre el panel (comprobado con `getBoundingClientRect`).
- La sonda de fps de A dejó 30 fps en la primera corrida (B salió 60): la primera pasada no juntó pares suficientes. `probeClock` reintenta una vez con 1,6 s; luego ambos relojes salieron a 60.
- Con B moviéndose por la fase de B directamente (`goPhase`), la alineación en pausa es exacta; en reproducción B sigue la pendiente del tramo y se corrige si se aleja > 40 ms.
- No hay ajuste manual de fases dentro de la comparación: se ajustan en la revisión de cada swing (`reviewMarks`) y la comparación las usa.

### No medido
- **Reproducción continua sincronizada** (solo se midió en pausa sobre fases): la deriva de B durante el play no está medida.
- Diestros, otros teléfonos y dispositivos reales; los clips son del mismo golpeador zurdo. "Mismo golpe" por audio (4.4).
- Los clips de frente y de atrás de i7 son de golpes distintos: sirvieron para el recorte, no para una comparación significativa (el aviso de vista salió).

## F5. Ball tracking v2 (19 nov 2026)

| # | Estado | Commit | Verificación |
|---|---|---|---|
| 5.1 | **bloqueada** | — | Faltan las posiciones de la bola marcadas a mano: en `pruebas/ball_shots.json` los toques de `i5_sr_t02`, `i6_sr_t06`, `i4_sr_t03` e `i7_stinger_sr_01/02/03` son `null`, y no existe `pruebas/ground_truth/flight/`. Sin esa referencia, todas las métricas de F5 son **no medido**. |
| 5.2 | hecho (parcial) | ver `git log` | `BallTracker` acepta `clock`: la espera de 0,3 s tras salir la bola y `maxFollowMs` se miden en tiempo REAL (`realDeltaMs`). 3 pruebas: el mismo tiro a 60 fps y a media velocidad (30 nominal, timeScale 0,5) da los **mismos puntos**; sin reloj la media velocidad pierde el vuelo (la prueba muerde: quitar el reloj la hace fallar). **No hecho**: leer fps/rotación/audio con un demultiplexor (depende de F8.1) y la confirmación del usuario en la pantalla del tracker (`VideoFlight` todavía no pasa el reloj; llega con 5.6). |
| 5.3 | hecho (solo la parte pura) | ver `git log` | `lib/ballCrop.ts` (`nativeCropFor`, `cropGray`, `normalizeLocalContrast` en COPIA, `cropToFull`/`fullToCrop`) + 6 pruebas sintéticas: una bola de 3 px en un cuadro de 1920 se detecta en el recorte nativo y **no** a 640 px; una bola 20 niveles más clara sobre un degradado solo pasa el umbral tras normalizar; el original no se modifica. **No conectado** al muestreo de `VideoFlight` (5.6) y **no medido** sobre video real: sin la referencia de 5.1 no se sabe si mejora el seguimiento de bolas reales.
| 5.4 | hecho (solo funciones puras, sin conectar) | ver `git log` | `lib/ballChecks.ts`: `neighborCheck` (presente en t, ausente en t−1 y t+1 en el mismo sitio) e `isBackgroundFeature` (el contraste ya estaba en el cuadro previo a la salida); 5 pruebas sintéticas, la mutación de quitar el chequeo de vecinos hace fallar 2. `neighborCheck` es lo que `detectDescent` espera como `neighborOk`. **No hecho**: conectarlas al `BallTracker`, el ROI que se encoge con bolas pequeñas, y la **métrica de falsos positivos** (depende de 5.1). Sin referencia no se sabe si estas reglas rechazan bolas reales, que es el riesgo que el plan advierte («puede pasar a nunca detecta»); por eso no se activaron.
| 5.5 | hecho | ver `git log` | `lib/flightTrack.ts` (contrato `FlightTrack` v2, `findGaps`, `lastDistinguishable`, `detectDescent`, `estimateContinuation`, `buildFlightTrack`, `flightLayer`); 25 pruebas con trayectorias sintéticas: descenso claro ⇒ confirmed, ruido y subida sola ⇒ not_confirmed, < 8 puntos ⇒ insufficient y sin continuación. Mutaciones: quitar pendiente, caída mínima, x, mínimo de puntos a 60 fps, RMS o el tope de 1,0 s hacen fallar una prueba cada una. **La regla de curvatura positiva no tiene prueba que la muerda** (en datos con ápice mínimo la curvatura casi siempre es positiva); queda como salvaguarda. |
| 5.6 | hecho (un clip verificado; ver nota) | ver `git log` | `components/FlightPlayer.tsx` detrás de `flags.flightV2`: el video con el trazo creciendo cuadro a cuadro (compositor único, `flightLayer`), leyenda con los estilos presentes, chip "Bajada no confirmada", aviso de que la bajada es en la imagen y de que lo morado es estimación. Sin la bandera, `VideoFlight` queda como antes (imagen fija). Chrome con `i6_sr_f01` (toque marcado, 60 fps): 4 puntos detectados, tramo visto + hueco punteado + anillo "Última vez vista", el reproductor avanza hasta el cuadro 580 (captura `flight_i6f01.png`), 0 errores. **No sé si esa línea sigue a la bola real**: no hay referencia de vuelo (5.1). |
| 5.7 | hecho | ver `git log` | `lib/media/persistFlight.ts` (video + registro JSON del `FlightTrack`, sin dejar nada a medias si falla) + botón "Guardar este tiro". La sesión es `tracking` con `flightOnly`, que `computeStats` ignora: **no suma tiros, rachas ni la medalla "En la mira"** (la mutación de quitar ese filtro hace fallar la prueba). Chrome: 1 sesión `{flightOnly, mediaId, flightTrackId}`, medallas solo `first_session`, y en Inicio se lee "Seguimiento de un tiro (video)". |

- Umbrales [PROPUESTA] sin calibrar: 0,6 % del alto, 3σ, t ≥ 3, RMS 1,5 %, modelo cuadrático 2D (el racional 2D del plan no se implementó). La confianza de un punto detectado es un valor FIJO (0,8): el motor no la mide todavía.

### Resultados de los 4 clips frontales con toque marcado (F5.6, Chrome, 60 fps, `flightV2`)
| Clip | Detectados | Bola liberada | Fin | Nota |
|---|---|---|---|---|
| `i6_sr_f01` | 4 | sí | perdida | tramo + hueco + "Última vez vista" |
| `i4_sr_f01` | 17 | sí | perdida | "Bajada no confirmada"; guardado como sesión `flightOnly` |
| `pw_sr_f01` | 0 | **no** | perdida | no se confirmó que la bola saliera de donde se tocó: no se dibuja trazo |
| `i9_sr_f01` | 0 | **no** | perdida | igual |

Esto NO es una medida de acierto: los toques son auto-anotados, no hay referencia de vuelo (5.1) y no se comprobó a ojo que la línea siga la bola. Solo muestra que el flujo funciona de punta a punta y que, cuando no hay evidencia, no dibuja. Se verificaron 4 de los 11 clips que pide el plan (los otros 7 no tienen toque marcado).

### Revisión adversarial de F4 y F5 (3 revisores + escéptico por hallazgo: 13 hallazgos, 7 confirmados, 6 refutados)
Corregidos: (1) `detectDescent` medía el retroceso de x en fracción del ancho y σ en fracción del alto (ahora `aspect`); (2) un ápice en el índice 0 confirmaba una bajada monótona sin subida (ahora exige ≥ 3 puntos de subida); (3) `estimateContinuation` con `aspect` 0/NaN devolvía puntos NaN (ahora se abstiene); (4) en la comparación, B usaba la velocidad del primer tramo fuera del rango de fases (debe ser 1); (5) B se reiniciaba desde el cuadro 0 si terminaba antes que A o si su instante era negativo (ahora queda quieto en su borde); (6) al terminar A, el botón seguía en "Pausa" y B seguía solo; (7) `step()` partía de un instante viejo si se pulsaba antes de presentarse el cuadro; (8) el botón "Guardado" quedaba pegado para un tiro nuevo y un guardado cancelado dejaba video y registro huérfanos. Pruebas nuevas para (1), (2) y (3), cada una con mutación que la hace fallar; (4)–(8) son de interfaz y **no se probaron en el navegador** (se corrigieron leyendo el código).
Refutados: neighborOk/índices, `frame_exit` por abajo, atenuación de `normalizeLocalContrast` con bordes fuertes, y la sonda de fps compitiendo con la sincronía.
- La sesión de verificación en Chrome se hizo con un segundo servidor sin watcher/HMR (el HMR se disparaba por archivos tocados en iCloud y borraba el estado del seguimiento); ese archivo de configuración era temporal y se borró.
- **Incidente de git (2.ª vez)**: antes del commit de 5.6/5.7 el índice apareció vacío (todo "borrado" en staged). Se restauró con `git reset --mixed HEAD` (sin tocar archivos) y se confirmó HEAD intacto antes de commitear.

### Lo medido / lo no medido de F5
- **No medido**: precisión del seguimiento, falsos positivos, calibración de TODOS los umbrales [PROPUESTA] de 4.6 y de la continuación estimada (5.1 bloqueada: no hay posiciones marcadas a mano). 5.8 (bodyMask y compuerta de impacto) no se tocó: el plan la condiciona a esa referencia. 5.3/5.4 están como funciones puras sin conectar.
- **Medido**: los umbrales en tiempo real (mismo tiro a 60 fps y a media velocidad, mismos puntos), el contrato y las reglas con trayectorias sintéticas, y el flujo en Chrome.

## Decisiones de Ryan D1–D10 (recibidas el 20 nov 2026)
- **D1** Anuncio de recompensa: "1 anuncio con recompensa"; no prometer "30 segundos" en ningún texto (cambia `AdGate.tsx`, `ads.ts` y los textos del tracking; altera el límite gratis → actualizar `BRAND.md` en el mismo commit).
- **D2** Yardas por defecto para distancias de tiro, putts y espacios; Perfil permite metros; se guarda siempre en metros.
- **D3** Un pase = un análisis + una configuración de exportación, 24 h. Cambiar las opciones de exportación (formato, esqueleto, guías, marca de agua, línea de tiro) dentro del mismo análisis y el mismo día NO pide pase nuevo; reintentos y reenvíos incluidos. (Esto relaja la regla del plan 9.1 de que cambiar la configuración pide otro anuncio: `specHash` pasa a ser solo del análisis.)
- **D4** Comparación gratis; videos de un solo ángulo cada uno; `detectView` identifica frente/atrás y avisa si no coincide. Tres usos: (a) subir dos videos a la vez y verlos lado a lado (**hoy `CompareView` exige ambos analizados y guardados: falta la subida conjunta**), (b) analizar uno solo, (c) analizar dos por separado y comparar en `/comparar`. Exportar el comparado sigue D3/D5.
- **D5** Consentimiento: lo da el usuario (términos y condiciones; formulario UMP de Google en UE/Reino Unido; ATT de Apple en iOS). Si rechaza o no hay anuncio: 1 exportación gratis al día sin anuncio, registrada localmente. Verificar contra la política vigente de AdMob antes de cerrar.
- **D6** Launch monitor fuera de alcance: el ball tracking solo dibuja la trayectoria visible; sin distancia real, velocidad ni giro (7.4 cancelada).
- **D7** WebCodecs primero; la prueba exige dispositivos reales (si no hay: "no medido"); NO empezar código nativo (Swift/Kotlin) hasta que falle en un dispositivo real.
- **D8** iOS: solo permiso para AGREGAR a la galería (`NSPhotoLibraryAddUsageDescription`), sin leerla; nada de videos a servidores sin que el usuario lo pida; manifiesto de privacidad al día.
- **D9** Los clips de validación los trae Ryan la próxima semana: lo que los necesita queda bloqueado (5.1 y las validaciones de F6/F7).
- **D10** Marca de agua: logo oficial pequeño en exportaciones gratis; se quita en Premium.

## F8. Exportación (en curso)
| # | Estado | Verificación |
|---|---|---|
| 8.1 | hecho | `mediabunny` 1.65.2 (ver `CLAUDE.md`). `lib/media/probe.ts`. Chrome: `i5_sr_t01.mp4` H.264+AAC 60 fps 1080×1920 (0,16 s); `IMG_2097.MOV` HEVC+AAC 60 fps (498 MB, 0,12 s). El plan decía "HEVC + APAC": el archivo trae AAC. |
