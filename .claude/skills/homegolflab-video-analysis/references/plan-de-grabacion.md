# Plan de grabación y etiquetado de videos

Leer cuando haya que preparar una salida al driving range o ordenar videos ya grabados. Primero se diagnostica (Paso 2 de `SKILL.md`); este plan sale de lo que el código aún no ha probado con material real.

## 1. Antes de salir

Rellenar con Ryan, a partir del diagnóstico:

- Qué preguntas hay que responder (máximo 3 por salida). Ejemplos: "¿el lector de palo acierta con luz de sol directa?", "¿cuántos cuadros con bola hay a 60 fps en un hierro 7?", "¿se mantiene la detección de vista de frente vs DTL con mi ropa?".
- Qué palos llevar (mínimo 3 distintos: un hierro corto, uno largo, madera o híbrido) para que el reconocimiento no se pruebe con uno solo.
- Qué cámara y ajustes se usarán, y que sean **los mismos** en todas las tomas de una sesión.

## 2. Equipo y ajustes

- Trípode o apoyo firme. Dos posiciones: **frente** (cámara hacia el jugador, a la altura de la cadera, cuerpo completo con aire arriba y pies visibles) y **DTL** (detrás, alineada con la línea de tiro, misma altura).
- Archivo original, sin edición ni recompresión, en la resolución más alta estable que no baje los fps.
- Grabar en **velocidad normal**. Si el teléfono tiene 60 fps o más, grabar el mismo swing también así y marcarlo.
- Vertical y horizontal: elegir una por sesión; si se prueban las dos, son sesiones separadas.
- Un papel o marcador en la primera toma de cada serie con el número del palo, para el reconocimiento del palo (ver el esquema de tomas).

## 3. Esquema de tomas (por palo)

Para cada palo de la sesión:

1. **Toma de palo**: 2–3 s mostrando el número o etiqueta a la cámara, a unos 30–50 cm, sin tapar con la mano. Variar un poco el ángulo en 2 tomas.
2. **Tiros**: 3–5 swings seguidos, con el palo asociado hasta el siguiente cambio. Dejar 1–2 s de quietud al inicio de cada swing (ayuda al "inicio" quieto).
3. **Cambio de palo**: decirlo en voz alta ("ahora hierro 9") y repetir la toma de palo.

Repetir el bloque en las dos posiciones (frente y DTL), en tomas separadas.

Incluir al menos una toma de **fallo deliberado** de reconocimiento (número tapado o con reflejo) para comprobar que la app pide confirmar en vez de inventar el palo.

## 4. Ficha por video (CSV o tabla)

Una fila por archivo. Los campos de "verdad" los anota Ryan al grabar o al revisar; lo que mida la app no se rellena a mano.

| Campo | Ejemplo | Para qué sirve |
|---|---|---|
| `archivo` | `2026-11-20_s1_dtl_h7_03.mp4` | Identificar |
| `sesion` | `s1` | Agrupar condiciones |
| `fecha` | `2026-11-20` | |
| `angulo` | `frente` / `dtl` | Vista correcta |
| `palo` | `Hierro 7` (nombre exacto de `CLUBS`) | Verdad de referencia del palo |
| `tipo` | `palo` / `swing` / `bola` / `fallo` | Qué prueba |
| `resultado_esperado` | `bola recta, corta`, `fallo: número tapado` | Qué debería concluir la app |
| `cuadro_impacto_aprox` | `4.52 s` (opcional) | Verdad para el impacto |
| `bola_final` | `izquierda ~10 m del objetivo` / `no se vio` | Verdad de la trayectoria |
| `fps` / `resolucion` / `orientacion` | `60 / 1080p / vertical` | Condiciones |
| `luz` | `sol directo` / `nublado` / `contraluz` | Condiciones |
| `fondo` | `pasto`, `red`, `cielo` | Condiciones |
| `distancia_camara_m` | `3.5` | Condiciones |
| `camara_firme` | `si` / `no` | Condiciones |
| `notas` | | Lo que pasó |

Palos: escribir en la ficha el nombre exacto de `CLUBS` en `src/lib/tracking.ts` ("Hierro 7", "PW", "Driver"…), para comparar sin traducir y no discutir si "7" es hierro o madera. Si se usan abreviaturas en nombres de archivo (`H7`), la ficha guarda el nombre completo.

## 5. Carpetas y nombres

Los videos **no** van dentro del repo ni de iCloud sincronizado si pesan mucho (el repo ya se mantiene aparte de `node_modules` por eso). Sugerencia: una carpeta fuera del repo, p. ej. `C:\Users\Ryan\dev\hgl-videos\`, y solo la ficha (CSV) en el repo si Ryan lo quiere.

```
hgl-videos/
  2026-11-20_s1/
    frente/   2026-11-20_s1_frente_h7_01.mp4 ...
    dtl/      2026-11-20_s1_dtl_h7_01.mp4 ...
    palo/     2026-11-20_s1_palo_h7_01.mp4 ...
    fichas.csv
```

Nombre: `fecha_sesion_angulo-o-tipo_palo_nn.mp4`. Un archivo = una cosa.

## 6. Conjuntos de prueba

- Dejar **una sesión completa como conjunto de comparación fijo** y no cambiar umbrales mirando solo esa. Una segunda sesión, en otras condiciones de luz o fondo, comprueba que no se sobreajustó.
- Las tomas de fallo deliberado también forman parte del conjunto: miden si la app dice "no sé" cuando debe.
- Dejar escrito qué NO cubre el conjunto (otro jugador, otro teléfono, otra cancha). Un resultado con los videos de Ryan es un resultado de Ryan.

## 7. Después de grabar

1. Rellenar la ficha el mismo día, con la memoria fresca.
2. Correr el análisis sobre cada video y guardar la salida junto a la ficha (palo propuesto + confianza, vista detectada, puntos de bola con su origen detectado/estimado).
3. Comparar contra la verdad de la ficha y reportar aciertos y fallos con números, y los fallos con causa probable (luz, fondo, fps, compresión, método).
4. Lo que no se pudo resolver se vuelve la pregunta de la siguiente salida.
