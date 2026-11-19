---
name: golf-video-groundtruth
description: Protocolo para marcar a mano la referencia (inicio, tope, impacto) de clips de swing de HomeGolfLab con hojas de contacto con el tiempo grabado, y para decidir si un clip falla por la app o por un índice equivocado. Usar cuando Ryan diga "verifica este clip", "marca la referencia", "¿el índice está bien?", "hoja de contacto", "ground truth", "¿cuántos clips tenemos anotados?", o antes de afirmar que la app se equivocó en un clip (incluidos los de práctica con varios swings).
---

# Referencia manual (ground truth) de swings

Una métrica solo vale lo que vale su referencia. Esta skill fija cómo se marca, qué resolución tiene de verdad y cómo se etiqueta.

## Hojas de contacto con el tiempo grabado

`scripts/gen_gt_sheets.mjs` saca cuadros con ffmpeg y **graba el tiempo** (`drawtext`) en cada uno, para leer el instante sin adivinar.

```powershell
$env:HGL_PRUEBAS='<carpeta pruebas>'; $env:HGL_TOOLS='<carpeta con ffmpeg-static>'
# ids  inicio  paso  n  ancho  columnas  etiqueta
node scripts/gen_gt_sheets.mjs i9_ps_t02 6.2 0.1 24 180 8 sheet        # hoja general: cada 0,1 s, 24 cuadros
node scripts/gen_gt_sheets.mjs i9_ps_t02 7.6 0.0167 24 260 8 impacto60  # cerca del impacto: 60 fps (paso 1/60 s)
```

Salida: `ground_truth/<clip>/<etiqueta>.png`. Requiere `resultados/inventario.json` (de `homegolflab-swing-qa-harness`). Primero la hoja de 0,1 s alrededor del índice (±2 s o más si hay varios swings), luego la de 60 fps solo alrededor del impacto.

## Definición operativa (usar siempre la misma)

| Evento | Definición |
|---|---|
| **Inicio** | **Último cuadro con las manos quietas** antes de subir (no el primero en que suben: al arrancar, las manos van hacia atrás casi sin subir). |
| **Tope** | Cuadro con las manos **más altas de la subida** (no de la finalización). |
| **Impacto** | Cuadro en que **el palo pasa por la bola**. A 60 fps el contacto cae *entre* cuadros: se marca el cuadro más cercano. |

## Resolución real

La referencia es **±0,1 s** (un cuadro de la hoja general; ±0,017 s solo cerca del impacto a 60 fps). Con una subida de 0,65 s y una bajada de 0,3 s eso da **±0,7 en el cociente de tempo**: el tempo **no es concluyente** con esta referencia. Para afinarlo hace falta video de 120/240 fps. No ajustes umbrales hasta que "pase" una métrica que la referencia no puede resolver.

## Formato: `ground_truth/gt_swing.json`

```json
{
  "_nota": "AUTO-ANOTADA, NO VERIFICADA por Ryan. …",
  "clips": {
    "i7_sr_f01": { "vista": "frontal", "start": 6.40, "top": 7.00, "impact": 7.45,
                   "sheet": "i7_sr_f01/sheet.png", "nota": "el índice marca 8,0 s; visualmente ≈7,45 s" }
  }
}
```

Tiempos en segundos dentro del clip. `analyze_swing.mjs` y `compare_versions.mjs` leen este archivo; un clip nuevo se agrega aquí con su hoja.

## Etiquetado obligatorio

- Todo lo que marca Claude queda como **"auto-anotada, no verificada"** (en `_nota` y en cualquier reporte), hasta que **Ryan** lo revise. No presentes una referencia auto-anotada como verdad.
- Cada clip nuevo: guarda la hoja, anota qué se vio (varios swings, contraluz, palo sobre la lente) y deja el cuadro con 1 decimal como máximo si no se midió a 60 fps.
- Con n pequeño no se declara nada: la regla de "área lista" (≥ 85 % y Wilson 95 % inferior ≥ 75 %) pide muestra suficiente. Hoy hay **7 clips** anotados; la meta es ≥ 30.

## Por qué `indice_clips.csv` no es referencia firme

El índice marca el impacto de cada clip en **8,00 s por construcción** (el clip se recortó 8 s antes del impacto estimado), pero la realidad varía **±0,25 s** y hasta **0,55 s**. Sirve como referencia **débil** (±0,5 s) para detectar errores gruesos, nunca para medir exactitud.

**Casos con índice erróneo confirmados visualmente:** `i7_sr_f01` (real ≈ **7,45 s**, índice 8,0) e `i9_sr_t04` (real ≈ **6,5 s**, con **dos swings** en el clip).
**Otros verificados visualmente:** `i9_ps_t02` (dos swings; la app toma el último) y `pw_ps_t01` (**no hay swing**: el palo tapa la lente de 11 a 16 s).

## Clips ya anotados (auto-anotados)

`pw_sr_f01` (6,95/7,65/7,95), `i9_sr_f01` (7,00/7,65/7,95), `i9_sr_f02` (7,05/7,65/7,95), `i7_sr_f01` (6,40/7,00/7,45), `i4_sr_f01` (7,00/7,65/7,97), `i7_sr_t01` (7,05/7,65/7,97; contraluz, finalización sostenida ~7 s), `pw_sr_t01` (7,05/7,60/7,97; contraluz). Existen hojas de contacto para más clips en `ground_truth/` (`i4_sr_f01…i9_sr_f02`, `i9_ps_t02`), pero solo estos 7 tienen tiempos marcados.

**Hallazgo (fase B):** en `i4_sr_t01`, `i6_ps_t01` y otros clips de 20 s hay **dos swings reales o más** (p. ej. a 8 s y a 15,7 s en `i4_sr_t01`): el índice marca el primero y la app analiza el último, que también es un swing válido. Quedar "fuera del índice" **no** es un error de la app en esos clips. Mira la hoja del clip completo (`node scripts/gen_gt_sheets.mjs <id> 0 0.5 40 150 10 completo`) antes de contarlo como fallo.

## Los 21 clips fuera de ±0,5 s del índice: pendientes de verificar

`i4_sr_t01 i5_ps_f01 i5_ps_t01 i5_sr_f02 i6_ps_f01 i6_ps_f02 i6_ps_t01 i6_sr_f01 i6_sr_t05 i7_ps_t02 i7_sr_f01 i7_sr_t06 i8_sr_t01 i9_ps_f01 i9_ps_f02 i9_ps_t02 i9_sr_t04 pw_ps_t01 w50_ps_t01 w50_sr_t05 w60_sr_t05`. Solo 4 están verificados (arriba). **Genera su hoja y mira antes de decir que es un error de la app**: puede ser el índice o un gesto posterior.

## Protocolo para un clip dudoso

1. Hoja general de 0,1 s (ventana de al menos 6 s alrededor del índice y de lo que marcó la app).
2. Cuenta swings reales, gestos (waggle, guardar el palo, volver a colocarse) y si el palo tapa la lente o la persona sale del encuadre.
3. Marca inicio/tope/impacto (definiciones de arriba) y, cerca del impacto, una hoja a 60 fps.
4. Compara con lo que dice la app: ¿error de la app, índice erróneo, o clip sin swing? Anótalo en `gt_swing.json` con `nota` y etiqueta "auto-anotada".
