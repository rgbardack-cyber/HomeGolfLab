# Especificación: planes y cuota mensual del coach (bloque F)

Fecha: 23 nov 2026. Estado: **implementado en el servidor, apagado** (`ENTITLEMENTS_ENABLED` sin definir). Nada nuevo se ve en la app pública (R8).

## Qué hace
1. **Planes** (`src/lib/plans.ts`): `free`, `premium`, `lifetime_early_adopter`.
2. **Pase Early Adopter:** el contador vive en el servidor (`server/entitlements.ts`). Tope **1.000** (`EARLY_ADOPTER_CAP`); reclamarlo dos veces no gasta dos; después del 1.000 responde «agotado».
3. **Cuota mensual de tokens por usuario y por mes UTC.** Defecto: `lifetime_early_adopter` 20.000, `premium` 20.000 [PROPUESTA: R12, el costo máximo por usuario, no está definido], `free` 0. Se cambia con `COACH_TOKENS_EARLY_ADOPTER`, `COACH_TOKENS_PREMIUM` y `COACH_TOKENS_FREE`.
4. **Se cuenta con lo que reporta la API** (`response.usage`: entrada + salida + caché). Se niega ANTES de gastar si ya no queda cuota; se registra DESPUÉS. La última petición puede pasarse del límite (no se sabe cuánto costará antes).
5. **Al agotarse:** el servidor responde 429 con `code: "quota_exhausted"` y el mensaje «Ya usaste todos los análisis de este mes. Se reinician el primer día del mes que viene.»; la app lo muestra como aviso informativo, no como error. El mensaje no dice «tokens».
6. **Estado:** `POST /api/entitlements/status` (encabezado `x-hgl-user`) devuelve plan, límite, uso, resto, reinicio, `analysesLeftEstimate` y pases que quedan.
7. **Solo desarrollo:** `POST /api/entitlements/dev-claim` (con `ENTITLEMENTS_DEV_CLAIM=1`) entrega el pase sin recibo.

## Cuántos análisis son 20.000 tokens — **estimado, no medido**
No hay clave de la API en este entorno, así que no se pudo usar el conteo de tokens de la API. Estimación con el texto real del coach (`server/index.ts`, modelo `claude-opus-5-5`):

| Parte de una petición | Cálculo | Tokens (aprox.) |
|---|---|---|
| Instrucciones del coach (`COACH_SYSTEM`, 2.094 caracteres) | ~3 caracteres por token en español | 700 |
| Esquema de la respuesta (`CoachSchema`, 1.176 caracteres) | ~3,5 caracteres por token | 350 |
| Medidas y notas que manda la app | ~600 caracteres | 200 |
| Tres fotos de hasta 1.024 px por lado | ~ancho × alto ÷ 750 por foto (≈ 790) | 2.400 |
| Margen de formato | | 100 |
| **Entrada** | | **≈ 3.800** (3.200–4.300) |
| Respuesta estructurada (≈ 2.500–4.000 caracteres) | | 800–1.300 |
| Razonamiento (`thinking` adaptativo, esfuerzo medio; se factura aunque no se vea) | **no medido**, supuesto | 1.000–5.000 |
| **Total por análisis** | | **≈ 5.800 a 9.800**, central 7.500 |

**20.000 tokens ≈ 2 a 3 análisis al mes** (20.000 ÷ 9.800 = 2,0; 20.000 ÷ 5.800 = 3,4). Es poco. Para decir «N análisis» al usuario hay que **medir con una clave real**: llamar a `messages.count_tokens` con una petición típica y leer `usage` de 10 análisis reales. La constante `TOKENS_PER_ANALYSIS_ESTIMATE = 7500` en `plans.ts` está rotulada como estimada.

**Costo para Ryan** (precio de `claude-opus-5-5` según el skill `claude-api`, 3 nov 2026: 4 USD entrada y 20 USD salida por millón de tokens; **verificar antes de decidir**): una petición de ≈ 3.800 de entrada y ≈ 3.500 de salida cuesta ≈ 0,015 + 0,07 = **≈ 0,09 USD**. Peor caso de la cuota mensual (20.000 todos de salida): 0,40 USD al mes, ≈ 4,80 USD al año, ≈ 48 USD en 10 años; caso típico (20.000 tokens con la mitad de entrada) ≈ 0,24 USD al mes. Sirve de base para `docs/recomendacion-monetizacion.md`.

## Pruebas (`server/entitlements.test.ts`, 12)
Consumo con `usage` (incluida la caché), límite alcanzado, reinicio al cambiar el mes UTC, configuración desde el entorno con valores inválidos, tope de 1.000 pases (1.000 entregados y el siguiente rechazado), reclamar dos veces, Premium que no pisa el pase, persistencia en archivo, archivo dañado e identificadores inválidos. Además se levantó el servidor real con `node server/index.ts` (puerto 8799, ya cerrado): estado de un usuario gratis (0), reclamo de desarrollo (pase 1 de 1.000, 20.000 de cuota, `analysesLeftEstimate: 2`), 404 sin usuario.
**No medido:** la ruta del coach con una clave real (no hay clave); el cambio de mes en vivo; concurrencia (un solo proceso).

## Riesgos y lo que falta antes de encenderlo
- **Sin identidad real:** el usuario llega en `x-hgl-user`, que el cliente controla; se puede inventar un usuario nuevo para saltarse la cuota. Falta identidad firmada (cuentas o recibo de la tienda).
- **Sin recibo:** el pase solo se debe entregar tras verificar la compra en App Store / Google Play. Hoy no hay compras.
- **El cliente todavía no manda `x-hgl-user`** ni muestra el estado de la cuota (no se agregó interfaz, por R8).
- **Peticiones simultáneas:** la cuota se revisa antes de llamar a la API y se registra después, así que varias peticiones a la vez del mismo usuario pueden pasar todas la revisión y pasarse del límite. Mitigación pendiente: reservar tokens estimados antes de llamar. Con cuota de 20.000 el exceso máximo es de unas pocas peticiones.
- **`dev-claim`** entrega pases sin recibo: `ENTITLEMENTS_DEV_CLAIM` nunca debe estar encendido en producción.
- Un solo proceso y un archivo JSON: sirve para empezar, no para varios servidores.
- La interfaz actual del coach ya existía y nombra la IA en Swing (previo a este bloque); sobre eso decide Ryan (R8).
