# HomeLAB: umbrales de espacio y seguridad

Fecha: 23 nov 2026 · Bloque D · Decisión R13: la app no se hace responsable de una medida mal tomada, pero los umbrales deben ser conservadores.

**Cómo leer esto.** Busqué fuentes el 23 nov 2026. No existe una norma de seguridad publicada por una asociación de golf ni por un fabricante para practicar en casa. Todo lo que encontré son guías de **vendedores de simuladores y redes** (tienen interés en recomendar más espacio). Por eso la confianza máxima es **media**. Lo que no tiene fuente lo digo ("sin fuente"). Los valores están en `LIMITS` de `src/lib/homelab.ts`.

## Resumen

| Umbral | Antes | Ahora | Respaldo | Confianza |
|---|---|---|---|---|
| Techo, swing completo | 2,7 m | **2,75 m** (≈ 9 pies) | Varias guías de vendedores: 9 pies mínimo | Media |
| Espacio libre, swing completo | 3 × 3 m | 3 × 3 m (**pendiente de decidir, ver abajo**) | Mixto; mi cálculo dice que es justo | Baja |
| Largo para putting | 2 m | 2 m | Es de comodidad, no de seguridad | Media |
| Largo para chip | 3 m | 3 m | Una guía: zona de 1,8 × 2,4 m | Baja |
| Foam o red obligatorios para chip | sí | sí | Sin norma publicada; decisión de Ryan | Baja |

## 1. Techo: 2,75 m (antes 2,7 m)

- **Fuentes** (vendedores de simuladores, no normas):
  - [TruGolf](https://trugolf.com/?p=976): 9 pies de mínimo, 10 pies cómodo, 10,5 a 12 pies para jugadores altos.
  - [Trackman](https://www.trackman.com/blog/how-much-room-for-a-golf-simulator): 10 pies o más como mínimo práctico.
  - [BenQ](https://www.benq.com/en-au/golf-simulator-projector/knowledge/measure-the-space.html): menos de 8,5 pies no es aconsejable.
  - Un proveedor (no identificado en mi búsqueda) dice que con hierros y wedges basta 8,5 pies, y que el driver pide 10.
- **Conversión:** 9 pies = 2,74 m. 8,5 pies = 2,59 m. 10 pies = 3,05 m.
- **Veredicto:** 2,7 m quedaba **por debajo** del mínimo de 9 pies que citan varias guías. Se sube a 2,75 m. No cambia mucho qué hogares califican.
- **Lo que la app no sabe:** la estatura del jugador y el largo del palo. Un jugador alto con driver necesita más. La app solo ofrece hierros y wedge, y el aviso de seguridad pide un swing de prueba lento sin bola.
- **Pendiente de medir en casa:** con tu estatura y tus palos, ¿cuánto sobra o falta contra tu techo?

## 2. Espacio libre para el swing: 3 × 3 m (decisión pendiente)

- **Fuentes** (todas de vendedores, pensadas para golpear bola contra pantalla):
  - Ancho: TruGolf da 10 pies (3,05 m) de mínimo y 12 a 16 pies recomendados. Austad's da 10 mínimo y 12 recomendados. Trackman iO pide 15 pies o más.
  - Fondo: TruGolf da 12 a 15 pies (3,7 a 4,6 m) de mínimo. Austad's da 12 pies mínimo.
- **Cálculo propio (sin fuente, aproximado):** el alcance del swing es el largo del brazo más el largo del palo. Con 1,80 m de estatura, el brazo mide cerca de 0,73 m y un hierro o wedge cerca de 0,9 a 0,95 m. Eso da un radio de unos 1,7 m, o sea un círculo de unos **3,4 m**. Un cuadrado de 3 × 3 m es justo, sobre todo en el sentido del objetivo.
- **Veredicto:** el valor actual no tiene respaldo sólido. Subirlo cambia qué zonas resultan viables (muchas salas de 3 a 3,5 m perderían el swing). Por la regla del plan, **no lo cambié: es decisión de Ryan** (ver "Preguntas").
- **Pendiente de medir en casa:** con un wedge en la mano, ¿qué espacio libre necesitas de verdad en cada dirección?

## 3. Putting: 2 m de largo

- Putear no tiene riesgo de seguridad relevante, así que 2 m es un límite de **utilidad**, no de seguridad.
- Una de las guías de colchonetas de putting que encontré (no confirmé cuál) sugiere al menos 8 pies (2,4 m) para practicar putts de 4 a 8 pies, más 2 a 3 pies de espacio para pararte. Con 2 m se puede puttear, pero el entrenamiento es corto.
- **Se corrigió un error de coherencia:** la «Escalera de distancia» hace putts a 1, 2 y 3 m, pero se ofrecía con carriles de 2 m. Ahora exige 3 m de largo (`minLengthM`).
- **Pendiente de medir en casa:** el largo real de tu carril y si la bola se frena antes por la alfombra.

## 4. Chip: 3 m de largo, y foam o red obligatorios

- **Fuentes:** una [guía de un vendedor de redes](https://giraffyco.com/blogs/news/indoor-golf-chipping-practice-setup-safety-and-space-planning) da una zona mínima de 1,8 m de ancho por 2,4 m de fondo. Golf Digest ([nota sobre redes](https://www.golfdigest.com/story/why-this-indoor-outdoor-hitting-net-is-one-of-the-best-we-ve-see)) aconseja unos 6 a 7 pies de holgura por encima, detrás y delante. Las guías coinciden en que las bolas de foam son la opción segura en interiores.
- **Foam:** las fuentes discrepan en cuánto vuelan (de 25 % a 70 % de una bola normal). Sin dato fiable.
- **Sin norma:** no encontré ninguna norma que diga cuándo una red es segura con una bola real. Una sola guía sugiere bola real con red, y pide revisar las indicaciones del fabricante de la red.
- **Veredicto:** 3 m cubre la zona de 2,4 m de la guía. La regla «foam o red» es decisión de Ryan y es conservadora. **Una red sola permite bola real**: es la parte con menos respaldo. Si quieres lo más conservador, exige foam siempre, o foam y red.
- **Pendiente de medir en casa:** hasta dónde llega un chip con foam en tu sala y si la red lo frena sin rebotes peligrosos.

## 5. Ejercicios con swing: ahora exigen la zona de swing

Hallazgo: los ejercicios `tempo`, `silla`, `paso` y `espejo` eran de zona «libre»: se ofrecían aunque el techo fuera de 2,4 m o el espacio no alcanzara para un swing. Ahora son de zona `swing` y solo aparecen si esa zona es viable. Un jugador con techo bajo recibe solo putting, chip y los ejercicios de cuerpo (postura, rotaciones, estiramiento).

## 6. Feedback del análisis → ejercicio

Antes solo 6 de las 18 claves que emite el análisis llevaban a un ejercicio. Ahora una prueba lee `swing.ts` y `club.ts` y falla si aparece una clave nueva sin ejercicio.

| Clave | Qué detecta | Ejercicio |
|---|---|---|
| `setup`, `hands`, `knees`, `club-address` | Postura y manos al inicio | Postura y grip |
| `head`, `arm`, `shoulders` | Cabeza, brazo guía, giro | Subida frente al espejo |
| `top`, `depth`, `height` | Posición en el tope | Subida frente al espejo |
| `spine`, `extension`, `hipsTop`, `sway` | Postura y caderas | Cadera a la silla |
| `slide` (**nueva**) | Caderas se deslizan de más | Cadera a la silla |
| `shift` | Peso atrás en el impacto | Paso al frente |
| `tempo` | Subida apresurada o lenta | Tempo 3 a 1 |
| `spine`, `shift`, `club-top` | Equilibrio, palo pasado del tope | Medio swing controlado |
| `hips` | Caderas giran de más | **Sin ejercicio en casa** (`NO_HOME_DRILL`) |

- **Error corregido:** «caderas se deslizan de más» compartía la clave `shift` con «peso atrás» y mandaba al «Paso al frente», que empeora el deslizamiento. Ahora tiene su clave `slide`. Las sesiones guardadas antes con `shift` y ese título seguirán sugiriendo «Paso al frente» solo para el plan del día siguiente.
- **Sin ejercicio:** `hips` (la guía del análisis propone una pelota entre las rodillas). Crear ese ejercicio sería una función nueva y queda pendiente.
- El plan prioriza **una** clave: el primer feedback que tenga ejercicio disponible.

## Pendiente de medir en casa (para `protocolo-homelab.md`)

1. Tu estatura y el largo de tus palos contra el techo de tu casa.
2. El espacio libre que necesitas en cada dirección con un wedge.
3. El largo real de tu carril de putting y de chip.
4. Cuánto vuela un chip de foam en tu sala.
5. Si el aviso de seguridad se entendió y si el ejercicio sugerido corresponde al feedback.

## Preguntas para Ryan

1. **Espacio del swing:** ¿lo dejamos en 3 × 3 m, o lo subimos a 3,05 m de ancho × 3,7 m de largo (el mínimo de las guías)? Lo segundo es más seguro y deja sin swing a más salas.
2. **Chip con red:** ¿una red sola basta para bola real, o exigimos foam siempre?
