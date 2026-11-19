---
name: homegolflab-swing-qa-harness
description: Correr el flujo REAL de la app HomeGolfLab (Análisis de swing en /swing y Ball tracking en /tracking, pestaña Video) con videos en Chrome headless, guardar JSON crudo, capturas y fotos clave, y calcular métricas con intervalo de Wilson 95 % y la regla de "área lista". Usar cuando Ryan pida "probar con los videos", "medir la precisión", "correr el harness", "reproducir este clip en el navegador", "comparar antes y después", "prueba de determinismo", "controles de cámara lenta / sin persona", o cuando un cambio en swing.ts, pose.ts, ballflight.ts o Swing.tsx deba comprobarse contra videos reales y no solo con vitest. No es para iterar sobre eventos sin navegador (usar homegolflab-swing-events-lab).
---

# Harness de QA del Análisis de swing y del Ball tracker

Mide la app **como la usa una persona**: sube el video por el `input[type=file]`, pulsa "Analizar swing" y lee lo que la app calculó. Los tests de vitest validan lógica con puntos sintéticos; esto valida el modelo de postura, el muestreo y las pantallas con video real.

## Variables de entorno (ninguna ruta va fija en los scripts)

| Variable | Qué es |
|---|---|
| `HGL_PRUEBAS` | carpeta de pruebas: `resultados/`, `ground_truth/`, `controles/`, `harness/` (obligatoria) |
| `HGL_TOOLS` | carpeta con `package.json` que tenga `puppeteer-core` y `ffmpeg-static` |
| `HGL_CHROME` | `chrome.exe` (por defecto la instalación estándar de Windows; se probó con Chrome 157) |
| `HGL_VIDEOS` | carpeta de videos con `indice_clips.csv` |
| `HGL_REPO` | carpeta `homegolflab/` del repo |
| `HGL_URL`, `HGL_OUT` | URL del servidor de la copia (por defecto `http://127.0.0.1:5199`) y carpeta de salida (`$HGL_PRUEBAS/resultados/swing`) |

Los scripts están en `scripts/` (`node scripts/<x>.mjs`). Antes de empezar: `node scripts/inventario.mjs` genera `resultados/inventario.json` (lo leen `run_swing` y `analyze_swing`).

## 1. Servir la app con el gancho `window.__hglDebug` / `window.__hglBall`

**Desde el 19 nov 2026 el gancho es oficial** (`homegolflab/src/lib/debugHook.ts`, usado por `Swing.tsx` y `VideoFlight.tsx`). Solo existe con `import.meta.env.DEV`: el servidor de desarrollo (`npm run dev`, o una copia servida con Vite) lo trae y el build de producción **no** (se comprueba con `grep -r __hgl homegolflab/dist/`, debe dar 0). Expone `window.__hglDebug` (cuadros gruesos y finos, ventana, resultado, encuadre, fotos, palo, `done`, `ms`, `thrown`) y `window.__hglBall` (cuadros, puntos, resumen, `done`; si el seguimiento falla marca `done` y `error`).

Lo más simple: apuntar el harness al servidor del propio repo, sin copia ni parche.

```powershell
npm --prefix "$env:HGL_REPO" run dev -- --port 5173 --strictPort     # en segundo plano
$env:HGL_URL = 'http://127.0.0.1:5173'
```

Para comparar **antes y después** sí hace falta una copia congelada (la línea base) con su puerto y su caché de Vite propios:

```powershell
node scripts/prepare_app_copy.mjs "$env:HGL_PRUEBAS/harness/app_nueva" vite-cache-nueva   # copia + enlace a node_modules + caché propia
node scripts/serve_app.mjs "$env:HGL_PRUEBAS/harness/app_nueva" 5211                       # en segundo plano
$env:HGL_URL = 'http://127.0.0.1:5211'
```

- Mantén dos copias: `app/` **intacta** (la línea base, "antes") y `app_fix/` (con el cambio, "después"). Cada una con su **puerto** y su **caché de Vite** (`cacheDir` distinto): compartir caché hace que dos servidores se pisen al reiniciar.
- Tras cambiar `src/` del repo hay que volver a copiar (`prepare_app_copy.mjs`).
- `patch_app.mjs` queda **solo como respaldo** para copias de versiones anteriores al gancho oficial: si la copia trae `src/lib/debugHook.ts` no hace nada. Si dice "No encontrado en…", el código que parchea cambió: actualizar las cadenas, no forzar.
- Premium de prueba: el script escribe en `localStorage` la clave `homegolflab-v1` con `profile.premium: true` antes de cargar la página (la cuota gratis es 1 video al día). La app migra ese JSON (`version: 0`) al formato vigente (`version: 1`) al cargar, así que los scripts viejos siguen valiendo.

## 2. Correr clips

```powershell
node scripts/run_swing.mjs 1 0/2 i7_sr_t01,pw_sr_f01     # corrida 1, fragmento 0 de 2, solo esos ids  (all = todos + controles)
node scripts/run_swing.mjs 2 0/2 all                       # corrida 2 (determinismo)
node scripts/run_ball.mjs i4_sr_f01                        # Ball tracker; HGL_STARTT=7.9 cambia el segundo de inicio
$env:HGL_BALL_SHOTS = "$env:HGL_PRUEBAS/ball_shots.json"; $env:HGL_OUT = "$env:HGL_PRUEBAS/resultados/ball_v2"
node scripts/run_ball.mjs i5_sr_t01                        # tiros del manifiesto (tap, startT, fps, timeScale); los de tap null se saltan
```

`HGL_OUT` también cambia dónde guarda `run_ball` (por defecto `resultados/ball`, que es la evidencia original: usa otra carpeta para no pisarla). `run_swing` guarda por clip `<id>.run<N>.json` (resultado, `debug`, texto de pantalla, tiempos), la captura completa y las fotos clave `Inicio/Tope/Impacto.jpg` (solo corrida 1). Salta lo que ya existe (reanudable). `HGL_PRIO=id1,id2` los corre primero. `run_ball` sube el clip a la pestaña Video, fija inicio, 60 fps, toca la bola en la posición marcada a mano (`tap`) y guarda `resultados/ball/<id>.json` y capturas.

Cada clip tarda **≈100 s** de reloj con el equipo cargado (≈40 s solo). Para 90 clips usa 2–3 fragmentos en paralelo.

## 3. Límites aprendidos (respétalos o los resultados mienten)

- **Máximo 2–3 Chrome en paralelo.** Con 4 el GPU aborta (`gl_texture_buffer.cc … Aborted()`).
- El `seek` de 8 s de la app da falsos **"No se pudo leer el video"** si el equipo está saturado. Esos resultados **no son fallos de la app**: sepáralos (`resultados/fallos_harness/`) y repite el clip con menos carga. Es la falla 7 conocida (esperas fijas).
- El modelo de postura **no es determinista bit a bit.** No exijas métricas idénticas entre corridas; compara nota, vista, mano y tiempos de eventos.
- Un clip que no termina (`timeout`) o con `harnessError` no cuenta como resultado de la app.
- Verifica siempre que el clip realmente cargó (`videoLoad.ok`) antes de culpar al análisis.

## 4. Métricas y la regla de "área lista"

```powershell
node scripts/analyze_swing.mjs swing_fix fix     # lee resultados/swing_fix/*.run1.json → metricas_fix.json, resumen_fix.csv
```

Calcula pose presente, vista, mano, eventos vs referencia manual (±100 ms), impacto vs índice (±0,5 s, referencia **débil**), encuadre y controles. Cada proporción sale con **intervalo de Wilson 95 %**.

**Un área está "lista" solo si el resultado es ≥ 85 % *y* el límite inferior de Wilson ≥ 75 %, con muestra suficiente** (con n=7 ni 7/7 alcanza; con n=30 al 85 % el margen es ±13 puntos). Si no se cumple, el estado es "no declarable", y lo que no se pudo medir se escribe "no medido" y por qué. No muevas umbrales ni la referencia para que una métrica pase.

## 5. Determinismo y controles

- **Determinismo:** corre todo dos veces (`run_swing.mjs 1` y `2`) y `node scripts/determinismo.mjs swing_fix`. Esperable: misma nota/vista/mano, eventos iguales casi siempre, métricas con diferencias de hasta ~2° (hombros) y ~6° (muñeca).
- **Controles** (esperados: **rechazo**): sin persona (debe dar `low_visibility`), persona sin swing (`no_swing`), cámara lenta 2× y 4× de un frontal y un trasero: `node scripts/make_controls.mjs <clip.mp4> 2 "$env:HGL_PRUEBAS/controles/lento2x_f01.mp4"` (ffmpeg `setpts`; no es slow-mo real de 240 fps). Cualquier `.mp4` en `controles/` entra solo en `run_swing.mjs all` con el prefijo `ctl_`.

## 5b. Ball tracker
`run_ball.mjs` corre los 4 tiros frontales por defecto, o los de un **manifiesto** (`HGL_BALL_SHOTS=<json>`, p. ej. `$HGL_PRUEBAS/ball_shots.json`, fuera del repo: `id`, `file`, `tap {x,y}` marcado a mano o `null` si falta, `startT`, `fps` 30/60, `timeScale`, `impactGT`, `nota`), con el toque marcado a mano y `HGL_STARTT` (6,8 y 7,9 s). Guarda en `HGL_OUT` (usa `resultados/ball_v2` para no pisar `resultados/ball`). `timeScale` solo se guarda: el tracker aún no lo usa (F5.2). Compara `__hglBall.res.points` (t, x, y) con el impacto (7,95–8,01 s) y mira la captura `*_resultado.png`: la línea debe salir de la bola, no subir por el cuerpo. Sin referencia de vuelo solo se miden falsos positivos (puntos antes del impacto o sobre el cuerpo); posición, continuidad y ángulo son "no medido".

## 6. Reproducir en el navegador los clips que cambian

Tras un cambio, no basta el laboratorio offline: obtén con `homegolflab-swing-events-lab` la lista de clips que difieren, corre **solo esos** con `run_swing.mjs` contra la copia nueva y compara con la corrida anterior. Anota qué clips se repitieron y con qué versión.

## Qué no hace este harness

No mide putts/chips (esa pestaña solo acepta cámara), ni la cara del palo, ni posiciones de bola sin referencia de vuelo. Los 90 clips son de un solo golfista zurdo con un teléfono: ningún resultado generaliza a diestros ni a otros equipos.
