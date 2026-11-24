# Bloque de idiomas (24 nov 2026)

Pedido de Ryan: un selector de idioma con inglés, español, alemán, español de España, inglés británico, italiano, francés, japonés y otros países donde se juega mucho golf. Segunda vuelta (aprobada por Ryan vía la sesión coordinadora): traducir **todo** el texto visible antes de publicar.

## Estado: terminado (textos visibles de la app) · traducciones sin revisión nativa
- **Selector** en Perfil (`src/pages/Perfil.tsx`): 12 entradas con su nombre propio. El idioma se guarda aparte (`homegolflab-lang`): «Borrar todos mis datos» no lo cambia.
- **Primera apertura:** idioma del dispositivo si la app lo tiene; si no, inglés. Sin ventana (pruebas) queda en español.
- **Cambio de idioma:** las pantallas se vuelven a armar con los textos nuevos (`key={locale}` en `App.tsx`). Se pierde lo que hubiera a medias en esa pantalla; el cambio se hace desde Perfil, así que no se pierde nada importante.
- **Código:** `src/i18n/` (`core.ts` puro; `index.ts` con el estado, `t()`, `td()`, `useT()`; `locales/` base; `areas/` con todos los idiomas lado a lado: `shell`, `homelab`, `drills`, `tracking`, `swingfb`, `swing`, `video`, `misc`). Los diccionarios se arman la primera vez que se usan (para evitar ciclos de importación).

## Idiomas
| Idioma | Estado |
|---|---|
| Español (Latinoamérica) | fuente de verdad, completo |
| **English (US)** y **Português (Portugal)** | completos; **prioridad de calidad** (supuesto de trabajo: Ryan no confirmó cuáles le importan más) |
| Deutsch, Français, Italiano, 日本語, 한국어, Svenska, Nederlands | completos (905 de 905 textos) |
| Español (España), English (UK) | solo ajustes sobre el español y el inglés (27 y 14 textos); el resto cae en el idioma base |

Falta (decisión de Ryan): chino, tailandés, portugués de Brasil, inglés australiano propio. Un texto sin traducir cae en inglés (excepto es y es-ES, que caen en español).

## Cómo se garantiza
Pruebas en `src/i18n/` (`npx vitest run src/i18n`):
- **Completitud:** falla si un idioma completo no tiene alguna clave del español (`PENDING_AREAS` es la lista de excepciones; hoy está vacía y solo puede achicarse).
- **Sin texto directo:** falla si un archivo de `src/pages` o `src/components` trae texto visible escrito en el código (`PENDING_FILES` hoy vacía; única exclusión justificada: `FlagsPanel`, panel interno solo para desarrollo).
- **Claves usadas:** falla si el código usa `t('…')` con una clave que no existe.
- **Marcadores:** ninguna traducción pierde, cambia o inventa un `{marcador}`, ni está vacía.
- **R8:** ningún texto menciona la IA, salvo la lista `R8_PENDING` (textos que ya la nombraban en español antes de traducir; decide Ryan).

## Lo que NO cubre / límites conocidos
1. **El análisis se escribe en el idioma activo al analizar** y se guarda así: un swing guardado se sigue viendo en el idioma en que se analizó. (Cambiarlo exigiría guardar claves en vez de texto; es un cambio de datos, no se hizo.)
2. **Mensajes del servidor** (errores de validación de `server/index.ts`, p. ej. «Envía de 1 a 3 fotos…») siguen en español. El resultado del coach y del escaneo sí se pide en el idioma elegido (`languageDirective`); **no medido** con una clave real. El mensaje de cuota se traduce en el cliente.
3. **No traducido a propósito:** `FlagsPanel` (interno); evidencias técnicas de depuración (`flightTrack`, razones internas de `distance`, errores internos de `lib/media`); los nombres de las medidas que se mandan al coach (se envían en español al servidor, que responde en el idioma elegido).
4. **Textos legales = traducción de un BORRADOR, no revisada por abogado:** aviso de seguridad del HomeLAB (`notice.*`) y consentimiento de datos (`consent.*`, R9). La política de privacidad, los términos y el consentimiento largo de `docs/legal/` **no** se tradujeron. Si la app sale en EE. UU. u otros países, el abogado debe revisar cada versión.
5. **Calidad:** todo es **borrador hecho por IA**, sin revisión de una persona nativa. Revisar sobre todo japonés, coreano, sueco y neerlandés, y los términos de golf (draw, fade, hook, slice, stinger) en cada país.
6. **Pruebas visuales:** solo se miraron en el navegador alemán, japonés (móvil), inglés británico y portugués. **Ningún teléfono.**
7. **R8 pendiente:** estos textos ya nombraban la IA en español y se tradujeron fieles: `hl.scanMeasures`, `hl.scan.errNotConfigured`, `sw.008`, `sw.010`, `sw.012`, `sw.013`, `sw2.coachUnavailable`, `sw2.coachFailed`, `sw2.coachCaveat`, `coach.offline`, `coach.notConfigured`, `coach.failed`.

## Cómo medir la cobertura
```powershell
npx vitest run src/i18n --reporter=verbose
```
La prueba «cobertura por idioma» imprime cuántas claves tiene cada idioma frente al español.
