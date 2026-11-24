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

Hoja `referencias.csv` en la misma carpeta. Una fila por clip: `archivo, referencia, simulador_marca_modelo, simulador_direccion_grados, simulador_elevacion_grados, carry_yardas, notas`. Estas columnas del simulador **solo se informan**; no deciden si la función pasa.

- **Mejor:** el simulador o un launch monitor del range. Anota la marca y el modelo. Dirección a la derecha en positivo y a la izquierda en negativo.
- **Si no hay:** marcas medidas en el piso y varilla de alineación en la línea de tiro. Escribe "marcas" en `referencia`: es una referencia **más débil**.
- **Swings:** la referencia es una marca manual de inicio, tope e impacto. La haremos juntos con una hoja de contacto de cada clip; tú solo confirmas.

## Umbrales fijados (23 nov 2026, antes de ver clips)

Qué mide cada cosa: el ángulo que calcula la app es **en la imagen** (`launchAngleDeg`, `ballflight.ts`) y hoy ni se muestra. Por eso R5 se mide como **dirección en la imagen**, contra la marca manual en el mismo video (decisión de Ryan, 23 nov 2026, opción A). La comparación con el simulador solo se informa.

| Función | Pasa si | Si no, queda |
|---|---|---|
| **Posición de la bola** (30 tiros) | Al menos 85 % de los puntos a 1,5 % del cuadro o menos de la marca manual (cota inferior de Wilson de 75 % o más); falsos positivos 10 % o menos; continuidad 80 % o más. | Experimental |
| **Dirección en la imagen (R5)** | Con cada palo, 8 de 10 tiros con error de ±2° o menos entre el ángulo en la imagen que calcula la app y el de la marca manual en el mismo video. Un tiro que la app no detecta cuenta como fallo. | Experimental |
| **Condiciones difíciles** | 1 o menos de 10 trazos falsos. Lo demás debe ser un trazo correcto o "no se detectó". | Experimental |
| **Vista de swing** | 14 de 15 con la vista (frente o atrás) bien leída. | Experimental |
| **Eventos de swing** | Inicio, tope e impacto, cada uno a **3 cuadros o menos** (50 ms a 60 fps) de la marca manual, en al menos 12 de 15 swings. | Experimental |

- **Solo se informa:** la dirección contra el simulador (acierto izquierda/derecha y error mediano; no es la misma cosa que el ángulo en la imagen, que depende de dónde esté la cámara), y los resultados por vista y por palo.
- **Con tan pocos clips la evidencia es débil.** 8 de 10 deja el 49 % como cota inferior (Wilson 95 %); 10 de 10, el 72 %. 12 de 15 deja 55 %. "Pasa" significa que cumplió el umbral, no que esté demostrado.
- **No se mueve el umbral para que algo pase.** Si después de ver los clips hace falta cambiarlo, se anota como enmienda con fecha y motivo, y el veredicto se calcula con el umbral original.
- Estos criterios siguen el plan `plan-video-tracking-exportacion.md`, sección 6.3. El resto de las funciones (tipo de tiro y distancia) siguen apagadas.

## Procedimiento de la marca manual [PROPUESTA]

Escrito el 23 nov 2026, **antes de ver clips**. Ryan debe confirmarlo antes de grabar. Sirve para la dirección en la imagen (R5) y se guarda en `marcas.csv`, en la misma carpeta que `referencias.csv`.

**Qué se marca (tiros de ball tracking).** Sobre el mismo video que analiza la app, a pantalla completa y en vertical:
1. **Punto 1:** el centro de la bola en el **último cuadro en que se ve quieta, justo antes del impacto**. Se anota el número de cuadro (`cuadro1`) y la posición `x1, y1` como fracción del cuadro, de 0 a 1 (0,0 = esquina superior izquierda).
2. **Punto 2:** el centro de la bola **4 cuadros después** de `cuadro1` (unos 67 ms a 60 fps; es el tramo corto que usa la app). Se anota `cuadro2`, `x2` y `y2`. Si la bola ya no se ve a los 4 cuadros, se usa el cuadro más lejano en que todavía se ve, entre 3 y 6 cuadros después de `cuadro1`.
3. **Si la bola no se ve** en ningún cuadro entre 3 y 6 después de `cuadro1`: el clip queda marcado `sin_marca`, no se mide y se vuelve a grabar. No se cuenta ni a favor ni en contra.

**Cómo se marca.** Con una hoja de contacto de los cuadros alrededor del impacto, ampliada y con rejilla; la persona que marca **no ve** la salida de la app para ese clip. Si hay dos personas, marcan por separado y se anota el desacuerdo: más de 1° de diferencia entre ambas marcas deja el clip en `sin_marca`.

**Cómo se calcula el ángulo.** Con la misma fórmula que la app (`launchAngleDeg` en `src/lib/ballflight.ts`): `dx = (x2 − x1) · aspecto`, `dy = y2 − y1`, ángulo = `atan2(dx, −dy)` en grados, redondeado a 0,1°. `aspecto` es ancho ÷ alto del video mostrado (1080 ÷ 1920 = 0,5625 en vertical). Mide desde la vertical de la imagen: 0° es recto hacia arriba y el signo positivo es hacia la derecha. Si los dos puntos se mueven menos de 0,02 del cuadro, la marca no vale y el clip queda `sin_marca`.

**Cómo se compara.** Error = ángulo de la app − ángulo de la marca. Pasa el tiro si |error| ≤ 2°. Si la app dice «No se detectó la bola» y hay marca, el tiro falla.

**Marcas de swing.** En `marcas.csv` también se anotan, por clip de swing, `vista` (`frente` o `atras`) y los cuadros de `inicio`, `tope` e `impacto`, con la misma regla de «última vez que las manos están quietas» para el inicio que usa `CLAUDE.md`.

**Formato de `marcas.csv`:** `archivo, aspecto, cuadro1, x1, y1, cuadro2, x2, y2, sin_marca, vista, inicio, tope, impacto`. Las celdas que no aplican van vacías.
