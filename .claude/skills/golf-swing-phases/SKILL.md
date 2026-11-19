---
name: golf-swing-phases
description: Conocimiento de dominio del swing de golf para decidir reglas de detección en HomeGolfLab - fases (dirección/address, subida, tope, bajada, impacto, finalización), tiempos y tempo típicos, por qué "el punto más alto de las manos" no es el tope, swing de práctica vs. medio swing vs. waggle vs. swing real, geometría de cámara frontal vs. trasera (línea de tiro), detección de mano dominante y lado del objetivo, y por qué la cámara lenta no sirve para el tempo. Usar al tocar findEvents, topCandidates, findSwingWindow, analyzeSwing, framingCheck o detectView, al interpretar un clip raro, o cuando Ryan pregunte "¿qué es el tope?", "¿por qué sale ese tempo?", "¿qué se ve desde atrás?".
---

# Fases del swing y lo que ve (y no ve) una cámara

Sirve para que cada regla de `swing.ts` tenga una razón física, no un umbral ajustado a unos clips. Los tiempos son de un swing de driving range a velocidad normal; varían por jugador, por palo y por tipo de swing.

## Fases

| Fase | Qué pasa | Qué se ve en las manos (altura en la imagen) |
|---|---|---|
| **Dirección (address)** | Postura estática antes de arrancar. | Quietas. |
| **Subida (backswing)** | El palo sube y el cuerpo gira. ≈ **0,6–0,9 s**. | Suben despacio al principio y aceleran. |
| **Tope (top)** | El palo cambia de dirección. | Máximo local de altura de la subida; casi un instante de pausa. |
| **Bajada (downswing)** | Transición y aceleración hacia la bola. ≈ **0,25–0,35 s**. | Caen rápido: es la parte más veloz del movimiento. |
| **Impacto** | El palo pasa por la bola; dura milésimas. | Cuadro borroso; el modelo suele perder o inventar las manos. |
| **Finalización (finish)** | Desaceleración y pose final, que se **sostiene segundos**. | Manos **tan altas o más que en el tope** y casi quietas. |

**Tempo** = tiempo de subida ÷ tiempo de bajada ≈ **2–3 : 1** en un swing normal. Con una bajada de 0,3 s, ±0,1 s de error en cada tiempo mueve el cociente ±0,7: el tempo no se afina sin referencia de 120/240 fps.

## Por qué "el punto más alto" no es el tope

La finalización suele dejar las manos **más altas que el tope** y las sostiene ~7 s. Un máximo global de altura cae ahí (caso real `i7_sr_t01`: foto "Tope" mostraba la finalización, ventana en 15–18 s). El tope es el **último mínimo local de la altura de las manos cuya bajada es rápida**, no el máximo: tras él las manos recuperan la mitad de lo que subieron en < 0,9 s. Una bajada lenta (la finalización se relaja despacio) no cuenta. Un salto del seguimiento (manos 0,10 → 0,50 en un cuadro) no es una bajada: la recuperación no puede pasarse del nivel de partida (`pw_sr_f01`).

## Tipos de movimiento (y por qué los clips de práctica confunden)

- **Swing real:** subida completa, bajada rápida, impacto, finalización.
- **Swing de práctica:** misma forma sin bola; el índice del clip puede no coincidir (6/17 `ps` coinciden con el índice, 63/73 de los reales).
- **Medio swing / chip largo:** amplitud y tiempos menores; no es un swing completo, así que no debe puntuarse como tal sin avisar.
- **Waggle / ajuste:** movimientos chicos y lentos antes de arrancar; no son swings. Volver a colocarse tras el swing es un gesto más chico que el swing real: el filtro de amplitud (≥ 75 % del mayor) existe por esto.
- **Varios swings en un clip:** `i9_sr_t04` (real ≈ 6,5 s) e `i9_ps_t02` tienen dos; la app toma el último. Decidir cuál analizar es una elección de producto (avisar y dejar escoger), no un umbral.
- **Sin swing:** `pw_ps_t01` — el palo tapa la lente de 11 a 16 s; el modelo "ve" movimiento que no es un swing y la app lo acepta (tempo 1,25:1, nota 44).

## Cámara frontal vs. trasera (línea de tiro, DTL)

| | Frontal (de cara) | Trasera (detrás, sobre la línea de tiro) |
|---|---|---|
| Se ve bien | Giro de hombros/caderas, inclinación lateral, posición de manos, tempo (la subida es amplia en la imagen) | Plano del swing, postura (inclinación hacia la bola), línea de manos y palo, desplazamiento lateral |
| Se ve mal | Si el jugador se levanta o se agacha (profundidad); cara del palo | El arranque va **hacia la cámara**: la subida sale corta (1,4–1,8:1 en el mismo golfista), el tempo no se juzga. De perfil el **pie lejano queda tapado** y su visibilidad cae |
| Contraluz | Menos habitual | Frecuente: la persona sale en silueta y el modelo pierde manos |
| Cara del palo | No se ve | No se ve (varilla sí, a veces) |

Consecuencias de código: `framingCheck` en vista trasera no debe exigir ambos tobillos (usar el más visible); no se juzga tempo desde atrás; la cabeza en frontal queda a ~5–10 % del borde superior con un teléfono vertical (aviso de "poco aire" plausible).

## Mano dominante y lado del objetivo

Salen de **hacia dónde va la subida**, no del perfil: en frontal, un **zurdo** sube las manos hacia la **derecha de la imagen**; un diestro, hacia la izquierda. Desde atrás el signo se invierte respecto a la imagen. Todos los clips probados son de **un golfista zurdo**: la lógica de diestros no está verificada con datos reales.

## Cámara lenta y tempo

Un video en cámara lenta alarga subida **y** bajada por igual, pero fija los umbrales de la app (subida ≤ 3 s, bajada ≤ 1,2 s) en tiempos que ya no son físicos: una bajada de 0,3 s a 4× dura 1,2 s y pasa justo; a 2× pasa con holgura. Por eso rechazar cámara lenta es una cota física sobre la **bajada** (una bajada humana real no pasa de ≈0,5 s) y no sobre el tempo, que en cámara lenta sigue pareciendo normal. Casos: lento 2× frontal (tempo 1,93) y trasero (3,15) y 4× trasero (79:1) se aceptan hoy; 4× frontal se rechaza.

## Bajadas imposibles

Si el modelo pierde las manos en el impacto, `findEvents` coloca el impacto en el **primer cuadro de recuperación** y la bajada sale < 0,2 s (tempos 4,3–17:1; 10 clips: `i4_sr_t06 i6_sr_t01 i7_ps_t02 i7_sr_t02 i7_sr_t05 i8_sr_t04 i9_ps_f02 i9_sr_t06 w50_ps_t01 w60_sr_t04`). Una bajada humana < 0,15 s no existe a velocidad normal: es un artefacto de la medida, no un swing rápido.
