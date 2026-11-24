# Registro mensual de ingresos de HomeGolf LAB LLC

24 nov 2026. Para el contador de Ryan. No es asesoría fiscal: solo un orden para no perder datos. La LLC es de un solo miembro y los pagos de Apple, Google, AdMob y Stripe (si se usa) llegan a la cuenta de Wells Fargo de la LLC.

## Reglas
1. **Una sola cuenta para la empresa.** Todo lo que cobra la LLC entra ahí; los gastos de la LLC salen de ahí. No se mezcla con la cuenta personal.
2. **Cada mes** se baja el estado de pagos de cada fuente (Apple, Google Play, AdMob) y el estado de cuenta del banco, y se guardan en una carpeta por mes (`AAAA-MM`).
3. **Se anota la fila del mes** en la tabla de abajo (o en `registro-ingresos.csv`, con las mismas columnas). Las cifras salen del estado de cada fuente, no de la app.
4. **El monto que importa** es el que la fuente dice haber pagado, no el precio de lista (la comisión ya viene descontada).
5. Las tiendas pagan con retraso (a veces un mes o más): se anotan **dos fechas**, la de la venta y la del depósito.
6. Todo en dólares. Si un pago llega en otra moneda, se anota la moneda original y el monto en dólares que registró el banco.

## Tabla (una fila por fuente y por mes)
| Mes de la venta | Fuente | Ventas brutas (USD) | Comisión y retenciones (USD) | Pagado (USD) | Fecha del depósito | Archivo de respaldo |
|---|---|---|---|---|---|---|
| (ejemplo) 2027-01 | Apple | 0,00 | 0,00 | 0,00 | — | `2027-01/apple.pdf` |

## Qué se calcula con esto
- Total recibido por mes y por año (para la declaración).
- Cuántos pases Early Adopter se han vendido (el servidor cuenta el tope de 1.000; esta tabla es el respaldo contable).
- Diferencia entre lo vendido y lo depositado, para detectar pagos que faltan.

## Para preguntarle al contador
- Si los ingresos de la LLC se declaran en el formulario personal de Ryan como negocio (lo normal para una LLC de un solo miembro; **no verificado**), y cada cuánto se pagan impuestos estimados.
- Qué hacer con los impuestos de ventas o IVA que las tiendas cobran o retienen.
- Cómo declarar cuentas bancarias fuera de EE. UU. si Ryan tiene alguna (FBAR/FATCA).
- Si cuenta como operado desde Costa Rica el negocio, y cómo tributa allá.
