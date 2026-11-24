BORRADOR: requiere revisión de un abogado en Costa Rica antes de publicarse.

# Consentimiento para guardar videos y análisis (R9)

Versión del texto: **1** (`CONSENT_VERSION` en `src/lib/consent.ts`). Si el texto cambia, se sube la versión y se vuelve a preguntar.

## Texto exacto de la casilla
Título: **Ayúdanos a mejorar la app (opcional)**

> ☐ Acepto que HomeGolf LAB guarde mis videos de swing y de tiros, y los análisis que hace de ellos, para mejorar la app. Puedo retirar este permiso cuando quieras desde Perfil y pedir que borren lo guardado. Si no lo acepto, la app funciona igual.

Nota debajo: «Todavía no se guarda ningún video: tu decisión queda registrada en este dispositivo para cuando exista el almacenamiento.»

## Reglas
1. **Casilla aparte**, sin marcar de inicio, fuera de los términos de uso y de la política de privacidad. Aceptar los términos no la marca.
2. **La app funciona igual** si no se marca.
3. **Registro de cada decisión:** usuario (id anónimo local, porque no hay cuentas), fecha y hora, acción (aceptó, retiró, pidió borrado) y versión del texto. Solo se agrega; nunca se edita.
4. **Retirar** es tan fácil como aceptar: desmarcar la casilla. Después aparece «Pedir que se borre lo guardado».
5. **Guardar o subir videos sigue desactivado** (`VIDEO_STORAGE_ENABLED = false`). Activarlo exige texto aprobado por un abogado, una decisión de almacenamiento y revisar la etiqueta de privacidad de Apple y el formulario de Google Play.
6. El texto no menciona el análisis con IA (R8).

## Qué falta para que sea válido (preguntas para el abogado)
- ¿El texto basta como consentimiento informado en Costa Rica? Qué debe decir sobre finalidad, plazo y a quién se comparte. (Ley 8968: **NO VERIFICADO**.)
- ¿El registro con un id anónimo local alcanza para demostrar el consentimiento si no hay cuentas ni servidor?
- ¿Hace falta consentimiento aparte para usar los videos en entrenar modelos (bloque H)?
- ¿Qué hacer con videos donde sale otra persona?
