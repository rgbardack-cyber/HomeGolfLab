# Verificación de monetización: AdMob y reglas de las tiendas

Fecha de consulta: **23 nov 2026**. Solo se afirma lo que se leyó en la página citada. Lo demás va como **NO VERIFICADO**. Ninguna página mostró fecha de revisión (el pie de las de Google dice ©2026). No es asesoría legal ni fiscal.

## 1. AdMob

### Anuncios con recompensa — leído: https://support.google.com/admob/answer/7313578
- El usuario debe elegir de forma afirmativa e inequívoca ver el anuncio (por ejemplo, tocar un botón de «sí») antes de que se muestre.
- El anuncio no puede obligar a interactuar: se puede saltar o cerrar. Decir «no» o saltarlo no debe impedir ni interferir con el uso normal de la app.
- El texto no puede inducir la elección; solo describe la recompensa. La recompensa prometida se entrega al completar la acción.
- Prohibido recompensar con dinero directo (efectivo, cripto, tarjetas de regalo). Las recompensas que no son dinero valen si solo se canjean dentro de la app y no se transfieren.
- **Sobre desbloquear una exportación con un anuncio:** la página leída no trae una regla específica sobre desbloquear funciones. **NO VERIFICADO** si otra página (por ejemplo, las políticas de Google Play sobre monetización y anuncios) dice algo.
- **Qué significa para HomeGolf LAB (`exportGate`, `ads.ts`):** el flujo actual (el usuario pulsa para ver un anuncio y recibe un pase de exportación) es de tipo «con recompensa elegida». Hay que comprobar que nunca se muestre sin que el usuario lo pida y que, si el anuncio falla o lo rechaza, la app siga funcionando (la decisión D5 ya prevé 1 exportación gratis al día).

### Menores — leído: https://developers.google.com/admob/android/targeting, https://support.google.com/admob/answer/6223431, https://support.google.com/googleplay/android-developer/answer/9893335
- `tag for child-directed treatment` (TFCD) y `tag for users under the age of consent` (TFUA) desactivan anuncios personalizados y remarketing y evitan enviar el identificador de publicidad. **Ambas etiquetas figuran como deprecadas y sustituidas por `setAgeRestrictedTreatment()`** (valores CHILD, TEEN, UNSPECIFIED), según la página de Android; la de iOS no se abrió.
- La política de Families de Google Play se aplica «si uno de los públicos objetivo de tu app son los niños». Si la app incluye niños como público y muestra anuncios, solo puede usar SDK autocertificados por Families, sin anuncios por intereses ni remarketing; los anuncios con recompensa deben poder cerrarse a los 5 segundos.
- **Caso de HomeGolf LAB (no dirigida a niños, pero la podría usar un menor):** las páginas leídas **no fijan una obligación específica**; el criterio es el público objetivo que se declara. NO VERIFICADO el detalle de la política de Google Play sobre público mixto.
- **Decisión pendiente (Ryan y abogado):** declarar el público objetivo como «13 años o más» y no «niños» (ver `docs/legal/preguntas-abogado.md`, preguntas 12 y 23).

### Consentimiento: UMP — leído: https://support.google.com/admob/answer/7666519, https://support.google.com/admob/answer/10107561, https://developers.google.com/admob/ump/android/quick-start, https://developers.google.com/admob/android/privacy
- La política de consentimiento de usuarios de la UE de Google exige a los editores hacer ciertas divulgaciones a usuarios del Espacio Económico Europeo, el Reino Unido y Suiza y obtener consentimiento para cookies o almacenamiento local y para datos personales usados en personalización de anuncios, donde la ley lo exija. Se puede usar el CMP de Google, uno de terceros o un diálogo propio; **para productos con recompensa en Google Play, la página dice que hay que crear tu propio diálogo de consentimiento** (sin más detalle).
- UMP: en cada inicio se llama a `requestConsentInfoUpdate()`, se muestra el formulario con `loadAndShowConsentFormIfRequired()` y solo se piden anuncios si `canRequestAds()` es verdadero. Hay un punto de entrada de «opciones de privacidad» (`showPrivacyOptionsForm()`).
- **NO VERIFICADO:** cuándo es obligatorio según la ley en cada país (la página de AdMob no lo afirma); leyes de estados de EE. UU. en UMP; una guía para Capacitor (el plugin `@capacitor-community/admob` está en el proyecto, pero su soporte de UMP no se leyó).

### ATT en iOS — leído: https://developer.apple.com/app-store/user-privacy-and-data-use/
- Desde iOS 14.5 hay que pedir permiso con el marco ATT para «rastrear» o usar el identificador de publicidad (IDFA). Rastrear es vincular datos de la app con datos de otras empresas, apps o sitios para publicidad dirigida o medirla, o compartirlos con intermediarios de datos. No es rastreo el uso solo en el dispositivo, ni el fraude o la seguridad.
- Hay que incluir un texto de propósito en el aviso del sistema. No se puede condicionar la funcionalidad a que el usuario acepte (regla 5.1.2(i)). Si no da permiso, el IDFA llega en ceros.
- **NO VERIFICADO:** la clave `NSUserTrackingUsageDescription` y su texto de ejemplo; la API `requestTrackingAuthorization`; la relación exacta con AdMob (la página de AdMob no menciona ATT).
- URLs que dieron error y no se usaron: `support.google.com/admob/answer/7313306` (404), `.../3755398` (404).

## 2. Tiendas: el pase de 119,99 USD como compra no consumible

### Obligación de usar los pagos de la tienda
- **Apple** — resumen de las normas de revisión (https://developer.apple.com/app-store/review/guidelines/; **no es texto literal**, la página llegó truncada): para desbloquear funciones hay que usar la compra dentro de la app (3.1.1), con mecanismo de «restaurar compras». Para consentimiento y datos (5.1.1): enlazar la política de privacidad, explicar retención y borrado, y poder retirar el consentimiento fácilmente.
- **Google Play:** no se leyó la política de pagos (NO VERIFICADO); la comisión de abajo sí.

### Comisiones vigentes (consultadas hoy)
| Tienda | Qué dice la página leída | URL |
|---|---|---|
| Apple, Small Business Program | «Tasa reducida del 15 % en apps de pago y compras dentro de la app» para desarrolladores con hasta 1 millón de USD de ingresos netos en el año calendario anterior y en el actual (incluidas cuentas asociadas); si se pasa, vuelve la tasa estándar; se puede volver a calificar al año siguiente | https://developer.apple.com/app-store/small-business-program/ |
| Apple, tasa estándar | **NO VERIFICADO:** la página no da el porcentaje (30 % es lo conocido, pero no se leyó hoy) | — |
| Google Play, EE. UU., «otras transacciones» (incluye, según la tabla, compras que no son suscripciones; la página no dice expresamente que una compra única entre ahí) | Tabla confusa al extraer: tarifa estándar de **20 % + 5 % de costo de facturación** en instalaciones nuevas; **25 % + 5 %** en instalaciones existentes; **15 % + 5 %** (nuevas) con el programa Play Games Level Up o Apps Experience. Fechas de despliegue: 30 jun 2026 (EEE, Reino Unido y EE. UU.) y 30 sep 2026 (Australia, Japón) | https://support.google.com/googleplay/android-developer/answer/112622 |
| Google Play, «demás mercados» | 15 % del primer millón de USD al año y 30 % sobre el exceso; 15 % en suscripciones; «15 % o menos» en otras transacciones para programas elegibles | misma |
- **Verificar la tabla de Google en la página viva** antes de usar estos números: la extracción no relaciona bien filas y columnas. Para la cuenta de abajo se usan rangos.

### Qué recibe Ryan de un pase de 119,99 USD (antes de impuestos, retenciones y tipo de cambio)
| Escenario | Comisión | Ryan recibe |
|---|---|---|
| Apple, Small Business Program (15 %) | 18,00 USD | **101,99 USD** |
| Apple, tasa estándar de 30 % (**no verificada hoy**) | 36,00 USD | 83,99 USD |
| Google Play, 20 % + 5 % (instalación nueva) | 30,00 USD | **89,99 USD** |
| Google Play, 25 % + 5 % (instalación existente) | 36,00 USD | 83,99 USD |
| Google Play, 15 % + 5 % (con programa) | 24,00 USD | 95,99 USD |
Rango de trabajo: **84 a 102 USD por pase** (precio de lista 119,99; antes de impuestos y retenciones). Cálculo: 119,99 menos la comisión. **Cambio de precio del 24 nov 2026:** el pase pasó de 100 a 119,99 USD; con 15 % de comisión quedan ≈ 102 USD, cerca de los 100 que Ryan quería recibir limpios. Ojo con los impuestos: en EE. UU. el impuesto de venta se suma al pagar; donde el IVA va incluido en el precio, queda menos (**NO VERIFICADO** cómo lo aplica cada tienda). Los impuestos de Ryan (LLC de un solo miembro en Wyoming) son para su contador.

## 3. Cuentas y costos de entrada
- **Google Play Console:** cuota de registro única de **25 USD** (leída en https://support.google.com/googleplay/android-developer/answer/6112435). Las cuentas personales nuevas deben completar requisitos de prueba antes de publicar y verificar un dispositivo Android; **la cantidad de probadores y de días no se pudo leer** (la página enlaza a otro artículo).
- **Apple Developer Program:** el monto anual **NO VERIFICADO** (las páginas abiertas no lo traen).
- **AdMob:** sin costo conocido; cuenta de Google; verificación de pagos: NO VERIFICADO.
- **Codemagic** (iOS desde Windows): ver `plan-nativo-dispositivos.md`.
