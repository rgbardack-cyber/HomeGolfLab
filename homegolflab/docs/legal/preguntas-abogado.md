# HomeGolf LAB: qué revisar con un abogado en Costa Rica

**BORRADOR: requiere revisión de un abogado en Costa Rica antes de publicarse.**

Para Ryan. Fecha: 23 nov 2026. Esto no es asesoría legal: es la lista de lo que hay que preguntar y dónde está cada cosa en la app.

## 1. Qué hace la app con datos (para entender qué hay que cubrir)

- **Videos de swing y de tiros.** Hoy la app **no guarda nada** en servidores (R9). Los videos se analizan en el teléfono o navegador.
- **Coach con IA.** Envía datos del análisis (métricas y hallazgos, a veces fotos o frames) a un proveedor de IA (Anthropic). Hay que decir qué sale del teléfono y a dónde va.
- **Consentimiento para guardar videos y análisis para mejorar la app** (R9). Casilla aparte, sin marcar, que no forma parte de los términos generales. Está detrás de una bandera apagada.
- **Home Lab.** Pide las medidas de un espacio y, si el usuario quiere, una foto o video del lugar (escaneo con IA). Pide aceptar un aviso de seguridad (R13).
- **Pase Early Adopter de 119,99 USD.** Compra no consumible dentro de App Store o Google Play (R8). Incluye coach con IA con límite de 20.000 tokens al mes. Todavía no se vende ni se promociona.
- **Anuncios con recompensa** (AdMob) en la app de tiendas. En la web no hay anuncios reales.
- **Ubicación, cámara y micrófono.** Permisos de la cámara para grabar; micrófono solo si el usuario lo permite (modo en vivo).

## 2. Preguntas por tema

### A. Costa Rica (Ley 8968 y PRODHAB)
1. ¿Qué parte de la Ley 8968 aplica a una app que recolecta videos y datos de salud o rendimiento físico (no médicos)?
2. ¿Hay que inscribir una base de datos en PRODHAB si se guardan videos o solo si se guardan después de que el usuario acepte?
3. ¿Qué datos se consideran sensibles en CR y cómo cambia el consentimiento?
4. ¿Qué debe decir el aviso de privacidad en español costarricense (derechos ARCO: acceso, rectificación, cancelación y oposición)?

### B. Consentimiento y guardado de videos (R9)
5. ¿El texto de la casilla alcanza para una base de consentimiento válida? (Ver `docs/legal/consentimiento-datos.md` en el repo.)
6. ¿Hace falta registrar la versión del texto y la fecha? La app ya lo guarda así.
7. ¿Cómo se revoca el consentimiento y en cuánto tiempo se borran los videos y análisis?
8. ¿Un video de otra persona (familiar, amigo) en un swing necesita su permiso?

### C. Términos de uso
9. **Limitación de responsabilidad del Home Lab (R13):** ¿qué límite es válido en CR? ¿Qué no se puede excluir aunque el usuario acepte?
10. **Licencia de uso de videos y análisis:** ¿cómo debe redactarse para que sea solo si el usuario acepta, y que no sea una cesión total de sus derechos?
11. **Pase Early Adopter de por vida:** ¿qué significa "de por vida" en un contrato? ¿Qué pasa si la app cierra o cambia? ¿Puede limitarse el coach con IA a 20.000 tokens al mes sin que sea un cambio abusivo?
12. **Edad mínima:** ¿qué edad poner? ¿Qué pasa con menores que usan la app con sus padres?
13. **Uso justo del coach con IA:** ¿qué reglas pueden ponerse (por ejemplo, prohibir uso comercial de la salida)?
14. **Pagos:** ¿cómo redactar reembolsos, cancelaciones y cobro de impuestos (IVA) cuando la tienda cobra al usuario?
15. **Aviso de seguridad del Home Lab:** ¿el aviso en pantalla alcanza para una advertencia de riesgo físico? ¿Qué tiene que decir exactamente? (Hoy dice: responsabilidad de medir, despejar, foam o red recomendados, y no hacer ejercicios que no se sientan seguros.)

### D. Leyes de otros países (solo si hay usuarios fuera de CR)
16. **GDPR (UE):** si hay usuarios en la UE, ¿qué base legal aplica al análisis de video? ¿Hace falta representante en la UE? ¿Cómo se justifican las transferencias a servidores fuera de la UE?
17. **CCPA/CPRA (California):** ¿a partir de qué volumen de usuarios o ingresos aplica? ¿Qué derechos hay que ofrecer?
18. **BIPA (Illinois):** los videos muestran caras. ¿Procesar la cara sin identificar a la persona entra en BIPA? (La app no reconoce caras, solo postura.)
19. **COPPA (EE. UU.):** si la app puede usarla un menor de 13 años, ¿qué hay que hacer? ¿Basta con una edad mínima?

### E. Tiendas y publicidad
20. **Apple:** las etiquetas de privacidad (qué datos se declaran). ¿Qué pasa si el consentimiento de videos está apagado?
21. **Google Play:** el formulario de seguridad de datos. Mismas preguntas.
22. **AdMob:** UMP (consentimiento en la UE y Reino Unido) y ATT en iOS. ¿Qué texto hace falta en la app?
23. **Anuncios con recompensa y menores:** ¿hay que desactivar anuncios personalizados? ¿Qué es "contenido para menores" en AdMob?

### F. Entrenamiento de modelos (bloque H)
24. **Datasets con licencia "solo uso no comercial"** (por ejemplo GolfDB, si se confirma): ¿un permiso escrito de los autores basta? ¿Qué forma debe tener?
25. **Datos de usuarios para entrenar:** solo con consentimiento y cuando el almacenamiento esté aprobado (R9, R11). ¿Hay que anonimizar los videos antes de usarlos?

### G. Resultado del bloque E (23 nov 2026): lo que no se pudo verificar y choques
26. **Choque R8 vs. transparencia:** R8 pide no mencionar el análisis con IA en ningún texto público, pero la política debe decir qué datos salen del teléfono hacia el proveedor del coach. ¿Se puede publicar la app sin activar el coach hasta tener ese texto, o hay una forma de informarlo sin promocionarlo?
27. **Ley 8968 y PRODHAB:** no se pudo leer el texto ni el sitio de PRODHAB (el sitio respondió 403 a nuestro cliente). ¿Puede revisar con usted los artículos de ámbito, consentimiento, derechos ARCO, inscripción de bases de datos y menores, y decirnos qué cambia en los borradores?
28. **BIPA y COPPA:** no se leyó el texto de 740 ILCS 14 ni de 16 CFR 312. ¿Hace falta un abogado de EE. UU., o basta con no vender a Illinois y poner edad mínima?
29. **Consentimiento sin cuentas:** hoy el registro usa un id anónimo local. ¿Es suficiente prueba, o hay que pedir un correo antes de guardar videos?
30. **Responsabilidad del Home Lab:** con foam o red solo recomendados (decisión de Ryan, 23 nov), ¿el aviso en pantalla más los términos limitan la responsabilidad en Costa Rica, o hace falta algo más (por ejemplo, confirmar con un toque que se leyó)?
31. **Cuota del coach:** ¿es válido decir «de por vida» y limitar a 20.000 tokens al mes? ¿Hay que traducir los tokens a «N análisis» en los términos? (Ver `docs/spec-cuota-coach.md`.)
32. **Tienda y datos:** la etiqueta de Apple y el formulario de Google solo cuentan lo que sale del dispositivo. ¿Está de acuerdo en que hoy solo se declara lo que reciba el proveedor del coach y AdMob?

## 3. Qué ya está en el código (para que el abogado lo vea)

- `src/lib/homelabNotice.ts`: texto del aviso de seguridad del Home Lab y la versión aceptada.
- `src/store.ts`: `homelabNotice { acceptedAt, version }`.
- `src/lib/exportGate.ts` y `src/lib/ads.ts`: reglas de anuncios y exportación.
- `src/lib/consent.ts`, `src/components/ConsentCard.tsx` y `docs/spec-consentimiento.md`: casilla aparte sin marcar, registro de usuario, fecha y versión, retiro y pedido de borrado. Detrás de la bandera `consentFlow`, **apagada**. **Guardar videos sigue desactivado.**
- Borradores: `docs/legal/politica-privacidad.md`, `terminos-de-uso.md`, `consentimiento-datos.md` y `marco-legal.md` (qué ley aplica y qué texto no se pudo leer).
- Límite de tokens del coach: ver `docs/spec-cuota-coach.md` (bloque F; detrás de banderas apagadas).

## 4. Qué necesito de Ryan después

- Elegir a un abogado en Costa Rica y confirmar presupuesto.
- Decidir si el pase de 119,99 USD sale solo en tiendas (recomendado) o también en la web.
- Confirmar si hay usuarios en la UE o en EE. UU. desde el primer día.
