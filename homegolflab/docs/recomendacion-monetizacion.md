# Recomendación de monetización (una página)

23 nov 2026. Para Ryan. Los números salen de `monetizacion-verificacion.md` (tiendas), `spec-cuota-coach.md` (costo del coach) y las fichas verificadas de mercado. Lo que no se midió dice «no medido». No es asesoría financiera ni fiscal. (Se hizo el análisis de `founder-pricing` y `founder-cfo` a mano; los skills no se invocaron.)

## Recomendación
1. **No cobrar ni activar anuncios reales todavía.** Primero: los 55 clips (validación), las pruebas en teléfonos reales y la revisión del abogado. Hoy el ball tracking y varias funciones están en «experimental» y no hay ni un dato medido en un teléfono. Vender un pase de por vida sobre eso es pedir reembolsos.
2. **Medir si la gente pagaría antes de construir los pagos:** lista de espera con el precio a la vista (ver abajo).
3. **Si la medición sale bien, el pase Early Adopter a 100 USD es viable:** el costo del coach de por vida es bajo comparado con lo que queda después de la comisión.
4. **Anuncios con recompensa: solo después de UMP/ATT** y de decidir el público objetivo (ver `monetizacion-verificacion.md`).

## Números
| Concepto | Cifra | Fuente / estado |
|---|---|---|
| Comparables de autoanálisis por video (año) | Sportsbox 109,99 · V1 119,99 · Onform 149,99 USD | fichas `03-ronda2-verificada.md` (páginas oficiales; Sportsbox por un rastreador independiente) |
| Pase Early Adopter | 100 USD una vez, máximo 1.000 | decisión R8 |
| Lo que recibe Ryan por pase | **70 a 85 USD** (Apple 85 con el programa de pequeñas empresas; Google 70–80) | `monetizacion-verificacion.md`; la tabla de Google y la tasa estándar de Apple hay que confirmarlas |
| Ingreso si se venden los 1.000 | **70.000 a 85.000 USD** antes de impuestos | cálculo |
| Costo de IA por análisis | ≈ 0,09 USD | **estimado, no medido** (`spec-cuota-coach.md`) |
| Costo de IA por usuario, 20.000 tokens al mes | peor caso 0,40 USD al mes (4,80 al año); típico ≈ 0,24 al mes | estimado, precio de `claude-opus-5-5` (4 USD entrada, 20 USD salida por millón; el skill lo da al 3 nov 2026) |
| Costo de IA de por vida | 10 años: **29 a 48 USD**; 5 años: 14 a 24 USD | cálculo |
| **Margen por pase tras 10 años de coach** | **22 a 56 USD** (70−48 el peor; 85−29 el mejor) | cálculo, sin impuestos, soporte ni servidor |
| Costo del servidor, soporte y reembolsos | no medido | falta |
| Ingreso por anuncios | no medido; no hay dato | no se inventa |

**Qué dice esto:** a 100 USD el pase sigue dando margen incluso con el peor caso de uso del coach, pero **el margen depende de que 20.000 tokens sean solo 2 o 3 análisis al mes** (estimado). Si el coach se hace más generoso (más tokens), el margen baja rápido: a 100.000 tokens al mes el peor caso sería ≈ 2 USD al mes y 240 USD en 10 años, más que el pase. **La cuota no debe subir sin recalcular.** Un pase de por vida a 100 USD es menos de un año de cualquiera de los tres comparables; eso lo hace atractivo, pero la app todavía no está validada como ellos (Onform publica una validación del fabricante; nosotros no).

**La escasez de 1.000 debe ser real:** el servidor la cuenta y la hace cumplir (`EARLY_ADOPTER_CAP`). No poner contadores falsos («quedan 12») ni cambiar el tope sin avisar.

## Cómo medir antes de construir pagos [PROPUESTA; los umbrales se fijan antes de medir]
1. Página simple (la de Pages, sin banderas) con: qué es el pase, **100 USD una vez, máximo 1.000**, «todavía no está a la venta», y un correo para avisarte cuando abra. Sin pago.
2. Cuando alguien deja su correo, un segundo paso: «¿Lo comprarías a 100 USD? Sí / No / Más barato». Eso mide intención, que **sobreestima** la compra real.
3. Mide: visitas, correos, y respuestas «sí a 100 USD».
4. **Umbrales fijados hoy:** seguir si hay al menos **200 «sí a 100 USD» en 8 semanas**; repensar el precio si hay menos de 50. Entre 50 y 200: probar 79 USD. Los números de 200 y 50 son una propuesta (0,2 y 0,05 del cupo de 1.000), no salen de un dato.
5. La preventa con cobro real requiere cuentas de las tiendas y la revisión del abogado; no se hace antes.

## Qué necesita Ryan
Decidir si acepta el orden (validar → medir interés → cobrar), confirmar la tabla de comisiones de Google y la tasa estándar de Apple en sus páginas vivas, y llevar al abogado el contrato del pase («de por vida», qué pasa si cierra).
