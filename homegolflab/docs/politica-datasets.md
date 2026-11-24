# Política de datasets para los modelos de visión (bloque H)

Versión 1, 23 nov 2026. Aplica a R10 y R11: el coach con IA aprende con reglas en el prompt, no con entrenamiento; **el entrenamiento solo aplica a los modelos de visión**. Este documento no es asesoría legal: las licencias van marcadas **verificada hoy**, **según las fichas** (ya verificadas por otra persona el 23 nov) o **NO VERIFICADA**.

## 1. La división 70 / 30
1. **Se separa por jugador o, si no hay identificador de jugador, por video. Nunca por cuadro.** Así un mismo swing (o un mismo jugador) no aparece en entrenamiento y en evaluación.
2. **Unidad de grupo:** `jugador_id` si existe; si no, `video_id`. Si un video tiene varios swings, todos van al mismo grupo.
3. **Semilla fija: `20261123`.** Algoritmo (determinista y reproducible): ordenar los ids de grupo alfabéticamente; mezclarlos con un generador con esa semilla (mulberry32); tomar el 70 % de arriba (`round(0,7 · n)`) como entrenamiento y el resto como evaluación.
4. **Se guarda la lista de cada grupo** en un archivo versionado por dataset (`datasets/splits/<dataset>-v1.json`: semilla, fecha, cantidad, ids de entrenamiento y de evaluación y el hash SHA-256 de la lista). Si el dataset cambia, se hace una división nueva con otra versión; **nunca se rehace la anterior para que un resultado salga mejor**.
5. **El 30 % de evaluación no se toca durante el desarrollo.** Los ajustes se hacen con una parte del 70 % apartada para validación (por ejemplo, 15 % de ese 70 %, con el mismo criterio de grupo).
6. Con pocos grupos (menos de ~30) el 30 % es ruidoso: se informa el tamaño y la cota de Wilson de cada porcentaje, igual que en `docs/protocolo-validacion.md`.
7. **Los 55 clips de validación de R4 no entran al entrenamiento**: son una evaluación aparte, fijada antes de verlos.

## 2. Datasets y licencias
| Dataset / modelo | Licencia (exacta) | Estado | Uso permitido hoy | Enlace |
|---|---|---|---|---|
| **GolfDB** (McNally et al., 2019; ~1.400 videos de YouTube) | **Código: Creative Commons Atribución-NoComercial 4.0 Internacional (CC BY-NC 4.0)**, según el README. Los videos: **el README no da licencia ni derechos; solo dice que se descargan de YouTube** | **Verificada hoy** (README) | **Solo evaluar.** No entrenar un modelo que irá en una app con anuncios y pagos. Además, los derechos de los videos son de terceros: **preguntar al abogado si ni siquiera evaluar con ellos es seguro** | https://github.com/wmcnally/golfdb · https://arxiv.org/abs/1903.06528 |
| **SwingNet** (pesos de GolfDB) | Código CC BY-NC 4.0 (README de GolfDB) | Verificada hoy | No usar en producción | mismo repo |
| **SportsPose** | «Grant of license free of charge for academic use only» | Según las fichas (03-ronda2) | **No** (uso académico). Solo con permiso escrito | ver ficha B3 |
| **CaddieSet** (CVPRW 2025; 1.757 golpes con variables de launch monitor) | **NO VERIFICADA** (el repositorio no se encontró con la dirección que se intentó) | NO VERIFICADA | **Solo evaluar**, y solo tras leer su licencia; mientras tanto, nada | https://arxiv.org/abs/2508.20491 |
| **Zhang et al. 2020** (bola de golf; 17 videos de swing y 5 de putt) | Código MIT; **datos sin licencia** (videos de torneos) | Según las fichas | **No** entrenar con los datos. Código sí (MIT) | https://arxiv.org/abs/2012.09393 |
| **Keio-R** (Torimi et al., 2026; 248 profesionales de YouTube) | **NO VERIFICADA**; sin código abierto visible | NO VERIFICADA | Nada | DOI 10.1587/transfun.2026TAP0002 |
| **OpenPose** | «Academic or non-profit organization noncommercial research use only» | Según las fichas | **No** | — |
| **Video de Wikimedia Commons** (cuatro swings de una profesional, usados para pruebas de la app, ver `CLAUDE.md`) | **No quedó registrada la licencia exacta del archivo** | NO VERIFICADA | Solo pruebas internas hasta anotar la licencia y la atribución | — |
| **Videos propios de Ryan** (los 55 clips) | Son de Ryan | — | Sí, como evaluación (R4); entrenar con ellos solo si no hay otras personas identificables o con su permiso | — |
| **Videos de usuarios** | Consentimiento aparte | — | Ver sección 3 | `docs/legal/consentimiento-datos.md` |

### Modelos de pose que ya usa la app (código y pesos, no datasets)
MediaPipe (código) **Apache-2.0** y BlazePose GHUM (modelo) «Licensed under Apache License, Version 2.0»; MoveNet **Apache-2.0**: uso comercial permitido (fichas, 03-ronda2). RTMPose y ViTPose: código Apache-2.0, **pesos por checkpoint no verificados**. Ultralytics YOLO Pose: **AGPL-3.0** (abre el código derivado o licencia de pago). TrackNetV6: **sin licencia**, no asumir permiso.

## 3. Datos de usuarios
1. **Solo entran** los videos de usuarios que dieron el consentimiento de `docs/legal/consentimiento-datos.md` (versión del texto registrada) y **solo cuando el almacenamiento esté aprobado**. Hoy no se guarda nada (`VIDEO_STORAGE_ENABLED = false`).
2. Quien retira el consentimiento sale de **futuros** entrenamientos y evaluaciones; lo que ya se entrenó no se puede «desentrenar»: **pregunta para el abogado** (¿qué hay que prometer en el texto?).
3. La lista de cada grupo (sección 1) guarda el id anónimo del usuario, no su nombre ni su cara.
4. Los videos donde sale otra persona **no entran** sin su permiso.

## 4. Lo que falta o no se pudo verificar
- Licencia de los videos de GolfDB (el README no dice nada) y de CaddieSet, Keio-R y el video de Wikimedia Commons.
- Si evaluar con videos de YouTube de terceros es aceptable para un producto comercial.
- Permiso escrito de los autores de GolfDB y de SportsPose para cualquier uso comercial: es una gestión de Ryan.
