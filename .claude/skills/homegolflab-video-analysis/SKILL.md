---
name: homegolflab-video-analysis
description: Método para mejorar y probar las funciones de análisis de video DE LA APP HomeGolfLab (no de marketing): análisis de swing de frente y down the line (DTL), reconocimiento del palo por número o etiqueta con confirmación manual, y seguimiento de la bola con trayectoria dibujada que distingue lo detectado de lo estimado. Usar siempre que Ryan hable de grabar videos en el driving range, de mejorar pose.ts, swing.ts, club.ts o tracking.ts, de leer el número del palo, de seguir o dibujar la trayectoria de la bola, de cámara, fps o encuadre del teléfono, o de cómo etiquetar y probar videos reales, aunque no nombre la skill. No es para guiones ni videos de redes (usar homegolflab-video-playbook y homegolflab-2d-video).
---

# Análisis de video de HomeGolfLab

Esta skill es un método de trabajo, no un resumen del código. El código cambia; el método sirve cada vez. Todo lo que diga sobre el estado del código se verifica leyendo los archivos antes de apoyarse en ello.

## Principio rector

La app ya tiene una regla: **no mostrar números que no mide** (`homegolflab/CLAUDE.md`). Cada mejora de esta skill se juzga con ella. Un teléfono, un cuadro a 20 fps y un modelo de postura ligero tienen límites reales; la tarea es dejar claro qué se mide, qué se infiere y qué se adivina, y no empujar esos límites con texto en pantalla.

## Paso 1. Leer antes de proponer (siempre)

1. Leer `homegolflab/CLAUDE.md`, en especial "Honestidad de las medidas" (lo aprendido con swings reales) y "Estructura".
2. `git status` y `git log -5`: el árbol suele tener cambios sin confirmar en `swing.ts`, `Swing.tsx`, `store.ts` o `lib.test.ts`, y archivos que `CLAUDE.md` describe pero aún no están en git (el 17 nov 2026: `club.ts` y `coach.ts` sin seguimiento). No pisarlos, no asumir que están terminados, y avisar a Ryan de que ese trabajo no tiene respaldo en un commit antes de apilar cambios encima.
3. Leer los archivos de la función que se va a tocar, no solo su cabecera:

| Función | Dónde mirar |
|---|---|
| Swing frente / DTL | `src/lib/swing.ts` (`analyzeSwing`, `detectView`, `coach`, `coachDtl`, `framingCheck`), `src/lib/pose.ts`, `src/pages/Swing.tsx` |
| Palo | `src/lib/club.ts` (visión clásica, experimental), `src/store.ts` (`currentClub`, palo confirmado a mano), `CLUBS` en `src/lib/tracking.ts` |
| Bola | `src/lib/tracking.ts` (`detectMovingBright`, `analyzeShot`), `src/pages/Tracking.tsx` |
| Pruebas | `src/lib/lib.test.ts`; `.claude/skills/homegolflab-2d-video/scripts/probar-swing.mjs` (maniquí 2D) |

4. Revisar dependencias en `package.json` y `public/` antes de sugerir una nueva. Hoy existen: MediaPipe Pose Lite (WASM local), Capacitor, zustand, zod, vitest. No hay OCR ni detector de objetos; confirmarlo con `grep` antes de afirmarlo.
5. Si Ryan se refiere a decisiones o conversaciones anteriores, consultar su grafo como indica su `CLAUDE.md` global; si no está ahí, decirlo y no inventar. (El repo no tiene `graphify-out/`.)

Para entender código desconocido a fondo usar `basement-hacker`; para el recorrido diario basta leer y trazar con las herramientas normales.

## Paso 2. Diagnóstico: qué funciona y qué no

Entregar una tabla corta por función con tres columnas: **Funciona (con evidencia)**, **No probado con videos reales**, **Roto o ausente**. La evidencia es una prueba, un resultado reproducible o una medida; "se ve bien" no cuenta. Tomar como punto de partida lo que documenta `CLAUDE.md` (p. ej. el palo es experimental y no se probó con videos propios; tempo no se juzga desde atrás; el codo trasero no se muestra) y verificar que sigue vigente.

Correr la línea base antes de cambiar nada: `npm run typecheck` y `npm test` en `homegolflab/`. Anotar cuántas pruebas pasan para poder decir después qué cambió. (Línea base del 17 nov 2026: 46 pruebas, typecheck limpio.)

## Paso 3. Swing: frente y down the line

- Dos vistas con reglas distintas. `detectView` decide por el ancho aparente del cuerpo; pasar siempre `aspect` (ancho ÷ alto). Cualquier cambio de vista exige casos de prueba de **ambas**.
- Qué se puede juzgar en cada vista lo fija `CLAUDE.md` (p. ej. el tempo no se juzga desde atrás). No añadir métricas nuevas sin un argumento geométrico de por qué esa vista las puede ver: una rotación o una profundidad no se ven en 2D desde cualquier ángulo.
- Posición del jugador, palo y bola condicionan todo: el cuerpo tapa el palo en DTL, la bola solo es visible hasta el impacto, y el palo se pierde por borrosidad en la bajada. Cuando una medida dependa de uno de ellos, decir de cuál.
- Muestreo: la subida de video recorre con `seek` a 20 cuadros por segundo (`STEP` en `Swing.tsx`). A 20 fps el cuadro del impacto se adivina; es un candidato conocido a mejorar con videos propios. Un camino de mejora (p. ej. `requestVideoFrameCallback` o WebCodecs, o muestrear más denso solo alrededor del impacto) se propone con su costo en tiempo de análisis en un teléfono real.
- Mejorar una regla = cambiarla, correr las pruebas del maniquí (`probar-swing.mjs`) y luego contrastar con video real. El maniquí valida lógica; **no** valida visión ni la calidad del modelo de postura sobre un cuerpo real.

## Paso 4. Reconocimiento del palo

Estado de partida (verificar): la app **no lee** el número. El palo se confirma a mano en `Swing.tsx` (`ClubPicker`; `currentClub` en el store se asigna a los swings siguientes hasta cambiarlo) y `club.ts` solo lee la dirección de la varilla, de forma experimental, sin entrar en la nota. Ojo: el seguimiento de bola en `Tracking.tsx` hoy guarda los tiros de cámara con `club: 'Putter'` fijo y **no** hereda `currentClub`; la asociación palo→tiros hay que cablearla ahí también.

Flujo objetivo que pidió Ryan: mostrar el número o etiqueta a la cámara antes de pegar → la app propone el palo → ese palo se asocia a los tiros siguientes hasta que cambie → si la confianza es baja, se confirma o corrige a mano.

Diseñar el flujo alrededor de la **confirmación**, no del reconocimiento:

1. **La entrada manual es la base y debe seguir funcionando sola.** El reconocimiento solo propone; nunca guarda un palo sin que el usuario pueda verlo y cambiarlo en un toque.
2. **Salida estructurada del lector**: `{ propuesta: Palo | null, confianza: 0–1, texto_leido, fuente: 'auto' | 'manual' }`. Por debajo de un umbral, mostrar la propuesta como pregunta ("¿Hierro 7?") con las 2–3 alternativas más probables; por encima, mostrarla ya seleccionada pero editable.
3. **Normalizar a la lista cerrada `CLUBS`.** Lo que se lee ("7", "7i", "P", "PW", "56°") se mapea a un palo de esa lista o se descarta. Un número suelto es ambiguo (hierro 7 o madera 7); resolverlo con el contexto de la bolsa del usuario o preguntar.
4. **Asociar a tiros**: un cambio de palo se detecta solo por un evento explícito (lectura confirmada o selección manual), nunca por inferir "se ve distinto". Un tiro hereda el palo vigente en el momento de grabarse y guarda si fue `auto` o `manual`.
5. **Reconocimiento no confiable** (poca luz, reflejos, número pequeño, borroso) debe caer de forma silenciosa y sin bloquear al manual.

Opciones de lectura a evaluar (no instalar ninguna sin comparar):

| Opción | A favor | En contra / riesgo |
|---|---|---|
| Solo manual con atajos | Ya existe, cero dependencias | No cumple "mostrar a la cámara" |
| OCR en el dispositivo (WASM como Tesseract.js, o ML Kit / Apple Vision vía plugin de Capacitor) | Respeta "todo funciona dentro de la app sin servidores" | Peso del modelo, números sueltos en superficies curvas y brillantes, plugin nativo por plataforma |
| Visión de Claude vía `server/index.ts` | Ya existe para HomeLAB; lee bien etiquetas | Rompe la decisión de no depender de servidores externos para esta función, cuesta por llamada, exige red en el range |
| Etiqueta propia (cinta de color o marcador impreso, ej. ArUco/QR) | Mucho más fiable que leer grabados | El usuario debe preparar sus palos; decisión de producto |

Antes de recomendar una nueva dependencia o servicio, explicar por qué lo existente no alcanza y su costo (tamaño, licencia, plataforma). La decisión de producto sobre servidor externo o etiquetas físicas es de Ryan: presentarla como pregunta con recomendación.

Probar con **fotos reales del número** (un par de decenas, con luz, ángulos y palos distintos) antes de grabar un video completo: es la forma más barata de saber si el lector sirve.

## Paso 5. Seguimiento de la bola y trayectoria

Estado de partida (verificar): `detectMovingBright` busca píxeles claros que aparecen entre dos cuadros; sirve para putts y chips rodados con la cámara fija y la bola contrastando con el piso. `CLAUDE.md` afirma que un swing completo no se puede medir con esto: a ~30 fps la bola sale del cuadro en 1–2 imágenes. Además, hoy el seguimiento corre **solo con la cámara en vivo** (`getUserMedia`, 1280×720, `frameRate` ideal 60): no analiza un video ya grabado, y no hay etiquetas detectado/estimado. Por eso los videos del range sirven primero para evaluar offline (con un script que recorra los cuadros) y decidir el diseño; analizar un archivo subido sería un cambio nuevo.

Evaluar en este orden y reportar cada punto con números, no con adjetivos:

1. **Tasa de detección**: en qué fracción de los cuadros esperados aparece la bola. Contar falsos positivos (zapatos, cabeza del palo, destellos, pasto, nubes, aviones).
2. **Cuadros disponibles**: cuántos cuadros con bola hay entre el impacto y que sale de la imagen, a los fps reales del video. Si son ≤3, no hay trayectoria que dibujar, solo una dirección de salida.
3. **Fuente de cada punto.** Todo punto de trayectoria lleva una etiqueta de origen: `detectado` (la bola se vio ahí), `estimado` (interpolado o extrapolado con un modelo), `ausente`. Esto es parte del dato, no del dibujo.
4. **Dibujo honesto**: tramo detectado en línea continua; tramo estimado discontinuo y con otro color; una leyenda breve que lo explique. Nunca extender una curva "bonita" más allá del último punto detectado sin marcarla como estimada, y nunca presentar una estimación como medida (distancia, altura, efecto, velocidad de bola).
5. **Qué métricas salen de qué**: las medidas (dirección de salida, velocidad inicial) solo se calculan con puntos `detectado`; los `estimado` son visuales. Una cámara de teléfono sin referencia de escala no da distancia real de vuelo ni altura.
6. **Alternativas** (si la diferencia de cuadros no basta): mayor fps de captura (60/120/240 si la cámara y el navegador lo permiten; verificar qué entrega realmente `getUserMedia` y la grabación nativa, que no es lo mismo que pedir `frameRate: ideal`), detección con contexto (región de búsqueda derivada de la posición de la bola en el cuadro del impacto), filtro de Kalman o ajuste parabólico para el tramo estimado, o un detector de objetos pequeños en el dispositivo. Cada una se justifica con una falla concreta medida del método actual.

## Paso 6. Condiciones de captura: el teléfono pone el límite

Antes de culpar al código, revisar estos siete factores. Registrarlos en la ficha de cada video (ver `references/plan-de-grabacion.md`):

- **Resolución**: 1080p suele bastar para el cuerpo; la bola a 20–30 m son pocos píxeles (a 1080p y 5 m de cámara, una bola de 4,3 cm ocupa del orden de 10–15 px; baja rápido con la distancia). Estimar píxeles por bola, no suponer.
- **Cuadros por segundo**: 30 fps es el punto débil del swing y de la bola; 60 fps o más ayuda de verdad al impacto. Cámara lenta: la app la rechaza como "sin swing" porque los tiempos no cuadran; usar 60/120 fps en un archivo reproducido a velocidad real, no un video "ralentizado".
- **Orientación**: vertical u horizontal cambia `aspect`, el encuadre y cuánto cielo hay. Mantenerla fija dentro de una sesión.
- **Iluminación**: contraluz y sol bajo apagan a la bola blanca y crean siluetas; sombras de nubes crean cambios de brillo que la diferencia de cuadros lee como movimiento.
- **Fondo**: líneas (redes, rejas, bordes de alfombra) producen falsos palos; un cielo claro esconde la bola blanca; pasto brillante confunde la detección por brillo.
- **Distancia y encuadre**: cuerpo completo con aire arriba y pies visibles (`framingCheck`), cámara a la altura de la cadera, dirección y distancia fijas y anotadas.
- **Movimiento de cámara**: trípode o apoyo firme; mano alzada rompe la diferencia de cuadros y el seguimiento. Si la cámara se mueve, es un dato de la ficha, no un detalle.
- **Compresión**: el video de teléfono usa compresión agresiva que borra detalles pequeños (la bola, la varilla) y el modo de ahorro de datos o enviar por mensajería la empeora; usar el archivo original sin recomprimir.

Los videos de **Ryan** (un solo jugador, un solo teléfono) no representan a todos los usuarios. Decirlo cuando se concluya algo.

## Paso 7. Plan de grabación y organización

Preparar el plan **a partir de lo que el código no ha probado** (Paso 2), no de una lista genérica. Para cada función: qué pregunta responde el video, cuántas tomas, y qué resultado cuenta como éxito. Usar la plantilla y el esquema de nombres de `references/plan-de-grabacion.md` (ficha por video, carpetas, etiquetas de palo, ángulo y resultado esperado). Ryan graba; la skill no pide material que no se pueda grabar con un teléfono y un trípode.

## Paso 8. Probar con la evidencia disponible

Separar siempre tres niveles y declararlos al final:

1. **Verificado en código/pruebas**: pruebas unitarias, maniquí 2D, fotos fijas. Dicen "la lógica hace lo que debe con esta entrada".
2. **Verificado con material real**: fotos o videos de Ryan, o públicos (ver el caso de Wikimedia Commons de `CLAUDE.md`). Dicen "funciona en estas condiciones".
3. **Pendiente de validar en el range**: lo que solo videos nuevos pueden confirmar. Nombrarlo explícitamente, con la toma que lo resolvería.

Reglas de evidencia:

- Un cambio con comportamiento observable lleva una prueba en `lib.test.ts` (o un script de medición reproducible) que **falla sin el cambio**.
- Medir con una **verdad de referencia** anotada a mano en la ficha (palo real, cuadro del impacto, dónde terminó la bola), no con "se ve razonable".
- Mantener un conjunto de videos **fijo** para comparar versiones; cambiar umbrales mirando solo el último video genera sobreajuste a ese video.
- Para ver el cambio funcionando en la app real usar la skill `run` (hay `launch.json`; `homegolflab-phone` en `https://localhost:5443` sirve para probar la cámara desde el teléfono). Para atacar tu propio resultado antes de darlo por bueno, `verify-hard`; para revisar el diff, `code-review`.
- Antes de dar algo por terminado: `npm run typecheck`, `npm test`, `npm run build`.

## Lo que no hay que prometer

- **Unos pocos videos no entrenan un modelo.** Sirven para **evaluar y ajustar umbrales** de métodos clásicos y para detectar fallas; entrenar o afinar un detector necesita cientos o miles de ejemplos variados y etiquetados, y la app hoy no entrena nada. No escribir "con tus videos la app aprenderá".
- Un teléfono no mide la cara del palo, el plano exacto, el efecto ni la distancia real de un tiro completo. No cablear esas cifras a la interfaz aunque un método "salga con un número".
- Un resultado en un video no generaliza a otra luz, otro fondo u otro jugador sin probarlo.
- Si el reconocimiento o el seguimiento no son confiables, la salida correcta es "no pude, confírmalo tú", no un número.

## Si cambia el texto público

`homegolflab/CLAUDE.md` y `marketing/BRAND.md` dicen qué se puede afirmar. Si una mejora cambia lo que la app mide o promete, actualizar ambos en el mismo cambio.

## Entregable de una sesión con esta skill

Terminar con: (1) lo leído y la línea base de pruebas, (2) la tabla de diagnóstico, (3) los cambios o el plan, con su evidencia, (4) lo que sigue sin validar con videos reales y la toma que lo resolvería, (5) decisiones que son de Ryan.
