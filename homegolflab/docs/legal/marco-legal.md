BORRADOR: requiere revisión de un abogado en Costa Rica antes de publicarse.

# Marco legal por ley: qué parte aplica y por qué

Versión 1, 23 nov 2026. **No es asesoría legal.** Lo que dice cada texto está tomado de lo que se leyó ese día; lo que no se pudo abrir va marcado **NO VERIFICADO**. La columna «Aplicación» es análisis sobre el texto, no una conclusión legal.

**Qué hace la app hoy (R9):** analiza video en el teléfono o navegador y **no guarda nada en servidores**. No hay cuentas. El coach con IA (Premium) envía medidas y fotos del swing a un proveedor; no se guardan. Todo lo de guardar videos está apagado.

## Tabla resumen

| Ley | Parte que aplica | Aplicación a la app | Estado de la fuente |
|---|---|---|---|
| Costa Rica, Ley 8968 y PRODHAB | Ámbito, consentimiento, derechos ARCO, inscripción de bases de datos, menores | Es la ley del lugar del responsable. Aplicaría a cualquier dato personal que se trate, y con más fuerza si se guardan videos. | **NO VERIFICADO**: no se pudo leer el texto ni PRODHAB (ver abajo) |
| GDPR (UE) | Art. 3, 4, 7, 8, 9, 17, 27 y considerando 51 | Solo si se ofrece la app a personas en la UE (art. 3(2)). Una imagen no es dato biométrico por sí sola. | Leído en gdpr-info.eu (espejo no oficial) |
| CCPA/CPRA (California) | Umbrales y derechos | Con una app pequeña que no vende datos, probablemente no se cumple ningún umbral. | Leído en oag.ca.gov |
| BIPA (Illinois) | Definiciones y consentimiento escrito (sección 15(b)) | Importa si se procesa geometría de la cara para identificar. La app estima postura, no reconoce caras. | **NO VERIFICADO**: ilga.gov no abrió |
| COPPA (EE. UU.) | Servicios dirigidos a menores de 13 o con conocimiento real | Solo si la app está dirigida a menores de 13 o se sabe que recoge datos de ellos. | Resumen del FTC leído; el texto 16 CFR 312 **NO VERIFICADO** |
| Etiqueta de privacidad de Apple | «Collect» = enviar datos fuera del dispositivo | Lo que solo se procesa en el dispositivo no se declara; lo que va al servidor del coach, sí. | Leído en developer.apple.com |
| Formulario de seguridad de datos de Google Play | «Collect» = sacar datos del dispositivo | Igual: lo procesado solo en el dispositivo no se declara. Hay que enlazar la política de privacidad aunque no se recoja nada. | Leído en support.google.com |

## Detalle y fuentes leídas

### Costa Rica: Ley 8968 y PRODHAB — NO VERIFICADO
- Se intentó leer el texto en `pgrweb.go.cr` (redirige a `sinalevi.go.cr`, que carga el texto con JavaScript y no se pudo leer) y el sitio `prodhab.go.cr` (respondió 403 al cliente automatizado). **No se leyó ningún artículo.**
- Por eso este documento **no afirma** qué dice la ley sobre datos sensibles, consentimiento, derechos ARCO, inscripción de bases de datos ni menores. Quedan como preguntas 1 a 4 del documento para el abogado (`preguntas-abogado.md`).
- **Qué debe hacer Ryan:** abrir desde un navegador el texto de la Ley 8968 y la página de PRODHAB (registro de bases de datos) y llevarlos al abogado; o pedir al abogado que confirme.

### GDPR (Unión Europea) — leído en https://gdpr-info.eu/ (espejo no oficial; EUR-Lex no abrió)
- **Art. 3** (https://gdpr-info.eu/art-3-gdpr/): aplica a responsables fuera de la UE si el tratamiento se relaciona con ofrecer bienes o servicios a personas en la UE o con vigilar su conducta allí. **Aplicación:** si la app se publica en tiendas de países de la UE, hay que revisar el art. 3(2)(a). La vigilancia de conducta es discutible si nada sale del teléfono.
- **Art. 4(2)** (https://gdpr-info.eu/art-4-gdpr/): «tratamiento» incluye usar datos; analizar un video en el dispositivo cuenta aunque no se guarde.
- **Art. 4(11) y 7** (https://gdpr-info.eu/art-7-gdpr/): consentimiento libre, específico, informado e inequívoco; se debe poder demostrar y retirar tan fácil como darlo. **Aplicación:** la casilla de la app y el registro de cada decisión siguen este patrón.
- **Art. 8** (https://gdpr-info.eu/art-8-gdpr/): 16 años como edad de consentimiento de un niño en servicios de la sociedad de la información, con posibilidad de bajarla a 13 por ley nacional. Solo si el servicio se ofrece a niños.
- **Art. 9, art. 4(14) y considerando 51** (https://gdpr-info.eu/art-9-gdpr/, https://gdpr-info.eu/recitals/no-51/): los datos biométricos son los que permiten identificar de forma única; las fotografías no se consideran sistemáticamente datos especiales y solo son biométricas si se procesan con un medio técnico que permite la identificación única. **Aplicación:** estimar la postura sin identificar a nadie no cumple esa condición según el texto leído, pero la persona puede seguir siendo identificable por su imagen, por lo que el GDPR general puede aplicar.
- **Art. 17** (https://gdpr-info.eu/art-17-gdpr/): derecho a la supresión. Si no se guarda nada, no hay nada que suprimir; si se empieza a guardar, aplica.
- **Art. 27** (https://gdpr-info.eu/art-27-gdpr/): representante en la UE si aplica el art. 3(2); hay una excepción para tratamiento ocasional y de bajo riesgo. Es una evaluación de hechos pendiente.

### CCPA/CPRA (California) — leído en https://oag.ca.gov/privacy/ccpa
- Aplica a empresas con fines de lucro que hacen negocios en California y cumplen alguno de: ingresos brutos anuales sobre 25 millones USD; comprar, vender o compartir datos de 100.000 o más residentes u hogares; u obtener el 50 % o más de sus ingresos de vender datos personales de residentes. Los derechos (saber, eliminar, corregir, no vender ni compartir, limitar información sensible) son de los residentes de California.
- **Aplicación:** una app pequeña que no vende datos probablemente no cumple ningún umbral hoy. Se revisa si los ingresos por anuncios y el número de usuarios crecen. La página del Fiscal General no es el texto del código (no se leyó el Código Civil 1798.100 y siguientes).

### BIPA (Illinois, 740 ILCS 14) — NO VERIFICADO
- `ilga.gov` no abrió (conexión rechazada). No se leyó la definición de «biometric identifier» ni la sección 15(b). **No se afirma** si estimar la postura de una persona en un video está dentro de BIPA. Pregunta 18 del abogado. Mientras tanto, la app no reconoce ni compara caras y no lo hará sin una decisión nueva.

### COPPA (EE. UU.) — resumen del FTC leído en https://www.ftc.gov/legal-library/browse/rules/childrens-online-privacy-protection-rule-coppa
- La regla aplica a servicios en línea dirigidos a menores de 13 años y a otros que tengan conocimiento real de que recogen datos de menores de 13. El texto 16 CFR 312 (definición de información personal, consentimiento parental verificable) **NO VERIFICADO** (eCFR redirigió a otro dominio).
- **Aplicación:** la app no está dirigida a menores. Con una edad mínima y sin cuentas ni datos guardados, el riesgo es bajo, pero las compras y los anuncios agregan reglas (ver `docs/monetizacion-verificacion.md`).

### Etiqueta de privacidad de Apple — leído en https://developer.apple.com/app-store/app-privacy-details
- «Recopilar» = enviar datos fuera del dispositivo de forma que el desarrollador o sus socios puedan acceder a ellos por más tiempo del necesario para atender la petición en tiempo real. Los datos que se procesan solo en el dispositivo no se consideran recopilados ni se declaran. Hay que declarar los datos que recojan SDK de terceros (anuncios, analítica).
- **Aplicación:** hoy, probablemente solo lo que reciba AdMob y lo que reciba el servidor del coach. Si se activa guardar videos, se declaran. Las reglas de revisión (5.1.1: política de privacidad, retirar consentimiento fácil, borrado de cuenta si hay cuentas) se leyeron como resumen, **no como texto literal**.

### Formulario de seguridad de datos de Google Play — leído en https://support.google.com/googleplay/android-developer/answer/10787469
- Todos los desarrolladores deben completarlo, incluso sin recopilar datos, y enlazar la política de privacidad. «Recopilar» = enviar datos fuera del dispositivo. Lo que solo se procesa localmente no se declara. Hay que declarar los datos de SDK de terceros. Hay campos de cifrado en tránsito y de solicitud de eliminación.

## Un choque con las decisiones que hay que resolver (no se adivinó)
**R8** pide que ningún texto público mencione el análisis con IA, pero la política de privacidad debe decir **qué sale del teléfono y adónde va** si el coach con IA está activo. Los borradores resuelven esto con un bloque marcado **[SOLO SI EL COACH ESTÁ ACTIVO]** en la política. Decisión para Ryan y el abogado: o el coach no se activa hasta tener ese texto publicado, o el texto se publica sin promocionar la función. Está como pregunta 26.
