# Bloque de idiomas (24 nov 2026)

Pedido de Ryan: un selector de idioma en los ajustes de la app con inglés, español, alemán, español de España, inglés británico, italiano, francés, japonés y otros países donde se juega mucho golf.

## Qué se hizo
- **Selector** en Perfil (`src/pages/Perfil.tsx`): lista de 12 idiomas con su nombre propio. El idioma se guarda aparte del resto de los datos (`localStorage`, clave `homegolflab-lang`): «Borrar todos mis datos» no lo cambia y no hubo que migrar el almacén principal.
- **Idiomas:** español (Latinoamérica, la fuente de verdad), español (España), English (US), English (UK), Deutsch, Français, Italiano, 日本語, 한국어 (Corea), Svenska (Suecia), Português (Portugal), Nederlands (Países Bajos). Elegí Corea, Suecia, Portugal y Países Bajos por tener mucho golf; Australia, Irlanda, Nueva Zelanda y Sudáfrica usan English (UK); Canadá francés usa Français. **Falta** (decisión de Ryan): chino, tailandés, portugués de Brasil, inglés australiano propio.
- **Primera apertura:** usa el idioma del dispositivo si la app lo tiene; si no, inglés. Sin ventana (pruebas) queda en español.
- **Respaldo:** un texto sin traducir aparece en **inglés** (no en español), salvo en español de España, que cae en español.
- **Código:** `src/i18n/` (`core.ts` puro, `index.ts` con el estado y `t()`/`td()`/`useT()`, `locales/*.ts`). Fecha y números usan `Intl` con el idioma elegido (coma o punto decimal).
- **Pruebas:** `src/i18n/i18n.test.ts` (13): elección del idioma, cadena de respaldo, que ningún idioma tenga claves inventadas, que ninguna traducción pierda un marcador `{x}` ni esté vacía, que el inglés esté completo y que **ningún texto mencione la IA (R8)**.
- **Coach y escaneo del espacio:** la app manda el idioma al servidor y el servidor pide la respuesta en ese idioma (`languageDirective`, `server/index.ts`). **No medido** con una clave real: aquí no hay clave de la API.

## Cobertura (medida con el comando de abajo)
Traducido en los 12 idiomas (154 textos por idioma, medido): barra de navegación, modo Casa/Cancha, aviso de medalla nueva, **Inicio**, **Logros** (incluye las 20 medallas y los 6 niveles), **Comparar**, **Perfil** completo, unidades y tipos de tiro.

**Todavía en español en todos los idiomas** (se ve en español aunque se elija otro idioma): **Swing** (`pages/Swing.tsx` y los mensajes de diagnóstico de `lib/swing.ts`), **Tracking**, **HomeLAB** (`pages/HomeLab.tsx`, `lib/homelab.ts`), la revisión de video, exportación, anuncios y consejos de grabación (`components/*`, `lib/recordingTips.ts`, `lib/exportGate.ts`, `lib/ads.ts`, `lib/ballChecks.ts`, `lib/distance.ts`…), y el aviso de seguridad del HomeLAB. Esto es la mayor parte del texto de la app: **el selector hoy traduce lo que está arriba, no el análisis**. Hacerlo es el siguiente bloque (ver abajo).

## Reglas que se mantuvieron
- **R8:** ninguna traducción nombra la IA o el análisis con IA (hay una prueba que lo revisa).
- **Legal:** la política de privacidad, los términos y el consentimiento **no se tradujeron**: son borradores para el abogado (`docs/legal/`). Si la app sale en EE. UU., hace falta una versión en inglés revisada por el abogado antes de publicar.
- **Los umbrales y las medidas no se tocaron:** solo cambia el texto que se muestra.

## Calidad
Todas las traducciones son un **borrador hecho por IA**, sin revisión de una persona nativa. Antes de publicar cada idioma hay que pasarlo por alguien que lo hable (sobre todo japonés, coreano y sueco) y por una revisión de los términos de golf (draw, fade, hook, slice, stinger quedan como en el golf de cada país).

## Siguiente bloque (propuesta)
1. Sacar los textos de `Swing`, `Tracking` y `HomeLab` y de los mensajes de `lib/swing.ts` a claves (español + inglés primero; después los demás idiomas). Los mensajes con cifras se escriben con marcadores `{n}` para que cada idioma ponga el número donde le toque.
2. Textos de anuncios, exportación y consejos de grabación.
3. Lista de revisión nativa por idioma antes de publicar.

## Cómo medir la cobertura
```powershell
npx vitest run src/i18n
```
La prueba «cobertura por idioma» imprime cuántas claves tiene cada idioma frente al español.
