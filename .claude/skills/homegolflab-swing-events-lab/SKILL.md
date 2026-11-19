---
name: homegolflab-swing-events-lab
description: Laboratorio offline para iterar en segundos sobre findEvents, topCandidates, findSwingWindow y analyzeSwing de swing.ts usando los cuadros crudos ya guardados (resultados/swing_fix/*.run1.json, 96 conjuntos), sin abrir el navegador, y procedimiento anti-regresión para aceptar un cambio. Usar cuando Ryan diga "arregla la detección del tope/impacto", "el app toma el swing equivocado", "clip con dos swings", "bajada imposible", "cámara lenta aceptada", "compara versión anterior y nueva", "que no empeore ningún clip", o antes de tocar cualquier regla de eventos o de rechazo en swing.ts.
---

# Laboratorio de eventos del swing (offline)

El análisis del swing es una función de los **cuadros de postura** (tiempo + 33 puntos). Esos cuadros ya están guardados de una corrida real, así que cada idea se prueba en **~0,5 s** en lugar de ~100 s por clip. El navegador solo se usa al final, para confirmar.

## Cómo funciona

`swing.ts` no importa nada, y Node (v22+) importa `.ts` directo: los scripts hacen `import('file:///…/swing.ts')` y le pasan los cuadros de `debug.coarseFrames` (10 cuadros/s) de cada `<clip>.run1.json`. Cada conjunto trae además `aspect`, `sampled` y el clip del que sale.

Variables: `HGL_PRUEBAS` (obligatoria) y `HGL_DIR` (subcarpeta de `resultados/`; por defecto `swing_fix`; en `lab_eval.mjs`, `swing`). Los 96 conjuntos son 90 clips + 6 controles.

```powershell
$env:HGL_PRUEBAS = '<carpeta pruebas>'; $env:HGL_DIR = 'swing_fix'
node scripts/lab_eval.mjs <swing.ts> --verbose            # una versión: estadísticas y una línea por clip
node scripts/compare_versions.mjs <anterior.ts> <nuevo.ts> --list            # anterior vs nueva, solo pasada gruesa
node scripts/compare_versions.mjs <anterior.ts> <nuevo.ts> --list --flujo    # emula la app: pasada fina y, si no da swing, la gruesa (más fiel)
node scripts/lab_events.mjs <swing.ts> id1,id2            # ventana y eventos de la app vs laboratorio de clips concretos
```

Guarda las variantes de `swing.ts` que pruebes como archivos (`lab/swing_v1.ts` …) para poder compararlas entre sí.

## Procedimiento anti-regresión (antes de cada cambio en swing.ts)

1. **Guarda la versión anterior** (copia del `swing.ts` vigente) y haz el cambio en el repo.
2. `compare_versions.mjs <anterior> <nuevo> --list`. Mira, por versión: `no_swing`, eventos **plausibles** (impacto a ±0,6 s del índice, inicio < tope < impacto, subida 0,3–1,6 s, bajada ≤ 0,7 s), impactos a **±0,5 s** del índice, bajadas < 0,15 s, avisos de pies, y la **referencia manual** (inicio/tope/impacto a ±100 ms en los clips de `gt_swing.json`).
3. **Reglas de aceptación:** no suben los `no_swing`, no bajan los plausibles ni los de ±0,5 s, no empeora la referencia manual. Cada fila de "EMPEORAN" se explica o el cambio se descarta; no se promedia.
4. **Lista de clips que difieren** → se reproducen en el navegador con `homegolflab-swing-qa-harness` (solo esos), contra la copia con el cambio, y se compara con la corrida previa. El laboratorio solo ve la pasada gruesa; el flujo real también usa la fina.
5. Mira clips concretos con hoja de contacto (`golf-video-groundtruth`) cuando el laboratorio diga que cambia pero no sepas cuál versión tiene razón. El índice (`impacto = 8,00 s`) es una referencia débil: un clip "peor contra el índice" puede ser el índice el equivocado.
6. **Cada cambio lleva su prueba de regresión** en `src/lib/lib.test.ts` que **falla sin el cambio**: córrela contra el `swing.ts` anterior (`npm test` con el archivo viejo puesto) y confirma que falla; luego con el nuevo, que pasa. Construye la prueba con puntos sintéticos que repitan el patrón real (hay ejemplos en las 3 pruebas de `topCandidates`).
7. Anota la línea base y la nueva en la entrega (antes/después sobre los **mismos** 96 conjuntos).

**Ojo con "plausible":** el criterio es laxo (impacto a ±0,6 s del índice). En la fase B tres clips "plausibles" tenían el impacto en el tope (≈0,3 s antes del real, confirmado en hoja de contacto) y bajada < 0,15 s. Si un cambio "baja los plausibles", mira los clips con hoja de contacto antes de declararlo regresión.

## Intentos ya hechos (no los repitas a ciegas)

| Intento | Resultado |
|---|---|
| **A. "La bajada es más rápida que la subida"** (regla original de `topCandidates`) | Descartaba el tope real: en clips traseros a 10 cuadros/s subida y bajada miden ≈ 0,3 s y las manos solo recuperan ~55–60 % en el cuadro del impacto (borroso). Sin candidatos, tomaba el punto más alto = la finalización (manos más altas y sostenidas ~7 s). Efecto: foto "Tope" en la finalización, ventana en 15–18 s, tempos 9,7–24:1. |
| **Arreglo vigente** (`topCandidates`) | Bajada = las manos recuperan la **mitad** en < 0,9 s **sin pasarse del nivel de partida**; solo cuentan candidatos con ≥ 65 % de la velocidad del mejor y ≥ 75 % de la amplitud del mayor. Resultado sobre los 96: `no_swing` 12 → 3, plausibles 43 → 70, impacto a ±0,5 s 43 → 69. |
| **B. Regresión por saltos del seguimiento (`pw_sr_f01`)** | Un salto del seguimiento (manos 0,10 → 0,50 en un cuadro) parecía "la bajada más rápida" y la ventana cayó a 11–13 s. Se resolvió con "no pasarse del nivel de partida" (prueba propia). |
| **C. Gesto posterior más chico gana por ser el último** | Se resolvió con el filtro de amplitud ≥ 75 % (prueba propia). |
| **E. Cota de bajada (fase B)** | `analyzeSwing` rechaza bajada < 0,15 s o > 0,6 s (90 clips: válidas 0,2–0,43 s; hueco entre 0,10 y 0,17 s). Sobre el flujo: `no_swing` 2 → 9, plausibles 70 → 67; las 7 que pasan a `no_swing` son 3 swings reales con el impacto mal puesto, 3 clips ya mal leídos (`i5_sr_f02`, `pw_ps_t01`, `w50_ps_t01`) y la cámara lenta 4× trasera. Una cámara lenta 2× (bajada 0,43–0,5 s) NO se separa por tiempos de un swing lento real. |
| **D. Suavizado por mediana de 3 cuadros** | **Descartado**: empeoraba el conjunto (plausibles 58 frente a 67–70). No volver a probarlo. |

Casos abiertos con evidencia: `i6_sr_f01` (swing real a 8,0 s; la app marca 12,2–15,2 s: un cuadro atípico a 14,3 s —manos 0,049 y 0,1 s después 0,25— parece una bajada de 2,0/s y gana a la real de 0,71/s); `i9_sr_t04`/`i9_ps_t02` (dos swings, `findEvents` toma el último); `pw_ps_t01` (sin swing); 10 clips con bajada < 0,2 s.

## Trampas

- Cambiar un umbral hasta que un clip pase es sobreajuste: el cambio debe tener una razón física (ver `golf-swing-phases`) y no empeorar el resto.
- El laboratorio corre `analyzeSwing` sin `lefty`/`view` (los infiere), igual que la pasada gruesa de la app.
- Si cambia el formato de los cuadros guardados (`debug.coarseFrames`), el laboratorio no sirve hasta regenerar los 96 conjuntos con el harness.
