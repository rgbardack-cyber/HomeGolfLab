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
