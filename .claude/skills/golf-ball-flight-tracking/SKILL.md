---
name: golf-ball-flight-tracking
description: Diseño y evaluación del seguimiento de la bola en video de teléfono para HomeGolfLab (BallTracker en ballflight.ts, VideoFlight.tsx, bodyMask en club.ts). Qué se puede y qué no a 60 fps, cómo evitar seguir cuerpo y palo, cómo distinguir "detectado" de "estimado", cuándo mostrar "no se detectó la bola", y cómo evaluar con una referencia de vuelo. Usar cuando Ryan hable de "seguir la bola", "trayectoria", "Ball tracker", "la línea sigue al palo/cuerpo", "ángulo de salida", o al tocar BallTracker, VideoFlight o el texto "Bola seguida".
---

# Seguimiento de bola en video de teléfono

## Lo que el video permite (y lo que no)

- **60 fps**: la bola es de **pocos píxeles** y, tras el golpe, viaja decenas de píxeles por cuadro. Contra el cielo claro casi no contrasta.
- El **contacto cae entre cuadros** (bola visible a 8,013 s, ausente a 8,030 s; la cabeza del palo es una raya borrosa). No se puede ubicar el instante exacto del golpe.
- **La cara del palo no se ve** (ni de frente ni de atrás) y **dónde pega en la bola** requiere ≥ 240 fps cerca de la bola: **la app no lo mide y no debe prometerlo.**
- No hay distancia, velocidad ni dirección reales con una sola cámara sin calibrar. Solo un ángulo "en la imagen, no real" y solo el comienzo del vuelo.

## Fallo medido (por qué se rediseña)

Con 4 tiros frontales reales (`i6_sr_f01 pw_sr_f01 i9_sr_f01 i4_sr_f01`) y 2 condiciones de inicio (6,8 s y 7,9 s): **0/8 seguimientos eran la bola**. `BallTracker` (`ballflight.ts:206`) elige la mancha cambiante más cercana a la posición predicha; el cuerpo, la cabeza y el palo generan manchas dentro del ROI desde el primer cuadro y `maxAreaFrac`=0,002 deja pasar manchas de mano o palo.
- Inicio 6,8 s: 12–33 puntos entre 6,83 y 7,70 s, **todos antes del impacto** (real 7,97–8,01 s), con la bola quieta: era el palo y los brazos de la subida (ángulos −13° a 66°).
- Inicio 7,9 s: 35–99 puntos y 1,1–2,7 s de "seguimiento" sobre cuerpo, cabeza y palo (ángulos **de −56° a +87°**, sin relación entre tiros).
- La pantalla dice "Bola seguida 2,7 s · 99 puntos" y solo en letra pequeña "Revisa que la línea siga a la bola" (`VideoFlight.tsx:~340`).

## Diseño para evitarlo

1. **Excluir cuerpo y palo.** Usar la máscara del cuerpo del pose (`bodyMask`, `club.ts:54`) y la del palo (varilla de `findShaft` si existe) y **descartar manchas dentro de ellas**, con margen para el movimiento entre cuadros.
2. **Causalidad respecto al swing.** El primer punto debe aparecer **después del impacto detectado** en el swing (`analyzeSwing`/`findEvents` sobre el mismo video, ±1 cuadro de tolerancia). Los puntos anteriores al impacto no son vuelo: la bola está quieta.
3. **Antes del impacto, la bola no se mueve.** Si se sigue algo que se mueve antes del golpe, no es la bola.
4. **Detectado ≠ estimado.** Un punto detectado es una mancha vista en ese cuadro; un tramo "unido sin ver la bola" va **punteado y dorado** y nunca cuenta como detección ni entra en el ángulo. El tracker no crea puntos `estimated` hoy: si se añaden, deben marcarse así.
5. **Si el track termina antes del impacto, o dura poco, o no hay punto posterior al impacto: mostrar "no se detectó la bola"**, no "Bola seguida". El texto "Revisa que la línea siga a la bola" no basta como único aviso.
6. **Sin ángulo si no hay evidencia.** No mostrar `launchAngleDeg` con menos de N puntos posteriores al impacto o con una trayectoria no monótona.

## Lo que se implementó y lo que no (fase B, 18 nov 2026)

- **Sí:** `BallTracker` mide la bola quieta en el primer cuadro (contraste y tamaño, solo en su punto exacto) y **no acepta detecciones hasta que la bola sale de ahí** (`released`); si en 0,3 s tras salir no aparece nada, termina; descarta manchas > 6× el área de la bola o alargadas (aspecto > 3); y confirma `released` solo si el recorrido se aleja del toque (≥ 80 % de los pasos). Sin confirmar, la pantalla dice "No se detectó la bola" y no dibuja. Todo con pruebas sintéticas que fallan sin el cambio.
- **Lección:** la primera versión (solo "la bola salió") siguió dando 66 puntos por el cuerpo en `pw_sr_f01`: tras el golpe el palo y los brazos pasan pegados al toque. El contraste de la bola debe medirse **en su punto**, no en una ventana: un palo que roza la bola (`i9_sr_f01`, subida) simulaba que la bola salía.
- **No:** excluir manchas con `bodyMask` y exigir que el primer punto sea posterior al impacto del swing; la pestaña Video no corre la postura. Es la mejora siguiente si la referencia de vuelo muestra que no basta.

## Cómo evaluar (con referencia de vuelo)

Hace falta una **referencia de vuelo**: ≥ 10 tiros con la cámara detrás de la bola y el vuelo visible, con la bola marcada a mano en cuadros a 60 fps (`ground_truth`-style). Con ella:

| Métrica | Definición | Meta |
|---|---|---|
| Cuadros bien ubicados | detección dentro de ~1,5 % del cuadro de la bola anotada | ≥ 85 % (Wilson inferior ≥ 75 %) |
| Falsos positivos | detecciones que no son la bola (incluidas las previas al impacto) | ≤ 10 % |
| Continuidad | cuadros seguidos sin hueco | ≥ 80 % |
| Ángulo | error ≤ 3° contra el ángulo anotado | ≥ 85 % |
| Huecos | tramos sin detección dibujados punteados | 100 % |

Sin referencia solo se puede medir **falsos positivos** (p. ej. "todas las detecciones caen antes del impacto"). Posición, continuidad y ángulo son **"no medido"** y así se reportan.

`scripts/find_balls.mjs` localiza manchas amarillo-blancas en cuadros PNG (`$HGL_PRUEBAS/ball/frames`) y dibuja un montaje numerado para elegir el toque (`tap`) de `run_ball.mjs` (`homegolflab-swing-qa-harness`). Las capturas y JSON de la prueba están en `resultados/ball/`.

## Alcance

Frontal con pasto: medido (falla). Trasero (bola de pocos píxeles a contraluz), cielo, poca luz, cámara movida, putts/chips en video: **no hay datos**. Con una cámara fija y buena luz se espera seguir **solo los primeros instantes**.
