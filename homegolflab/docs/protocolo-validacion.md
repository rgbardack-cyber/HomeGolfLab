# Protocolo de validación: 55 clips (R4)

Para Ryan. Los usuarios no ven este documento. Versión 1, **23 nov 2026**, escrita **antes de ver cualquier clip**.

## Qué grabar (55 clips)

| Grupo | Clips | Detalle |
|---|---|---|
| Ball tracking | 30 | 10 con driver, 10 con hierro 7, 10 con wedge. Un tiro por clip. |
| Condiciones difíciles | 10 | 2 contraluz, 2 bola blanca contra el cielo, 2 fondo desordenado, 1 poca luz, 1 otra persona o bola en el cuadro, 1 cámara movida, 1 tiro topeado muy bajo. |
| Swing | 15 | 8 desde atrás y 7 de frente. Un swing por clip, con hierro 7. Si eres zurdo, 3 de los 15 deben ser de una persona diestra. |

Reparto sugerido (puedes cambiarlo): simulador de noche para los 30 tiros de ball tracking; driving range para las condiciones difíciles y los swings.

## Cómo grabar

- **Teléfono:** en trípode, sin tocarlo durante el tiro. Cámara trasera, lente 1x, vertical.
- **Ajustes:** 1080p a **60 fps** (no 4K, no cámara lenta, sin modo cine ni estabilización). En iPhone: Ajustes > Cámara > Formatos > **Más compatible** (H.264).
- **Enfoque y exposición:** bloquéalos (mantén el dedo sobre la pantalla hasta ver "AE/AF"). Con luz pareja y fondo liso, salvo en los 10 clips difíciles.
- **Posición:** a unos 3 m, a la altura de la cintura, la misma que recomienda la app. Ball tracking: desde atrás, sobre la línea de tiro. Swing: de frente o desde atrás, cuerpo entero.
- **Cada clip:** empieza 3 s antes y para 3 s después. En ball tracking la bola debe verse quieta desde el primer cuadro.

## Nombres de archivo y carpeta

- **Carpeta:** una en iCloud que tú elijas. Sugerencia: `HomeGolfLab_\Validacion_2026-11\`. No la muevas ni renombres cuando empiece la medición.
- **Ball tracking:** `driver-01-atras-sim.mov`, `hierro7-01-atras-range.mov`, `wedge-01-atras-sim.mov` (palo, número de tiro, ángulo, lugar: `sim`, `range` o `casa`).
- **Difíciles:** `dificil-01-contraluz-range.mov`. **Swings:** `swing-01-atras-hierro7-range.mov`.
- **Número de tiro:** el mismo que anotes en la hoja de referencias. Una sola numeración por palo.

## Referencia (lo que sabemos del tiro)

Hoja `referencias.csv` en la misma carpeta. Una fila por clip: `archivo, referencia, simulador_marca_modelo, direccion_salida_grados, angulo_elevacion_grados, carry_yardas, notas`.

- **Mejor:** el simulador o un launch monitor del range. Anota la marca y el modelo. Dirección a la derecha en positivo y a la izquierda en negativo.
- **Si no hay:** marcas medidas en el piso y varilla de alineación en la línea de tiro. Escribe "marcas" en `referencia`: es una referencia **más débil**.
- **Swings:** la referencia es una marca manual de inicio, tope e impacto. La haremos juntos con una hoja de contacto de cada clip; tú solo confirmas.

## Umbrales fijados (23 nov 2026, antes de ver clips)

Qué mide cada cosa: el ángulo que calcula la app es **en la imagen** (`launchAngleDeg`, `ballflight.ts`) y hoy ni se muestra. Por eso R5 se mide contra la marca manual en el mismo video. La comparación con el simulador solo se informa.

| Función | Pasa si | Si no, queda |
|---|---|---|
| **Posición de la bola** (30 tiros) | Al menos 85 % de los puntos a 1,5 % del cuadro o menos de la marca manual (cota inferior de Wilson de 75 % o más); falsos positivos 10 % o menos; continuidad 80 % o más. | Experimental |
| **Dirección de salida (R5)** | Con cada palo, 8 de 10 tiros con error de ±2° o menos entre el ángulo de la app y el de la marca manual. | Experimental |
| **Condiciones difíciles** | 1 o menos de 10 trazos falsos. Lo demás debe ser un trazo correcto o "no se detectó". | Experimental |
| **Vista de swing** | 14 de 15 con la vista (frente o atrás) bien leída. | Experimental |
| **Eventos de swing** | Inicio, tope e impacto, cada uno a **3 cuadros o menos** (50 ms a 60 fps) de la marca manual, en al menos 12 de 15 swings. | Experimental |

- **Solo se informa:** dirección contra el simulador (acierto izquierda/derecha y error mediano), y los resultados por vista y por palo.
- **Con tan pocos clips la evidencia es débil.** 8 de 10 deja el 49 % como cota inferior (Wilson 95 %); 10 de 10, el 72 %. 12 de 15 deja 55 %. "Pasa" significa que cumplió el umbral, no que esté demostrado.
- **No se mueve el umbral para que algo pase.** Si después de ver los clips hace falta cambiarlo, se anota como enmienda con fecha y motivo, y el veredicto se calcula con el umbral original.
- Estos criterios siguen el plan `plan-video-tracking-exportacion.md`, sección 6.3. El resto de las funciones (tipo de tiro y distancia) siguen apagadas.
