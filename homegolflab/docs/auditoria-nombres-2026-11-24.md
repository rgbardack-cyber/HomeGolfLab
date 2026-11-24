# Auditoría de nombres, variables y CI (bloque 1, 24 nov 2026)

Rama `release/v1` (desde `749d7ff`). Solo lectura salvo `.env.example`. Todo lo de abajo se contó con `grep` en el clon; lo que no se midió lo dice.

## 1. Nombre: variantes encontradas

Cuenta de apariciones del texto exacto (distingue mayúsculas). «Interfaz» = `src/` fuera de `i18n`; «diccionarios» = `src/i18n`.

| Variante | Interfaz | Diccionarios | `index.html` + manifest | Servidor | `capacitor` + `package.json` + `codemagic` | `docs/` | `CLAUDE.md` (2) + `.github` |
|---|---|---|---|---|---|---|---|
| `HomeGolfLab` | 7 | 12 | 3 | 3 | 2 | 21 | 8 |
| `HomeGolf LAB` | 1 | 10 | 0 | 0 | 0 | 11 | 0 |
| `HomeGolfLAB` | 0 | 0 | 0 | 0 | 0 | 4 | 0 |
| `homegolflab` (identificador) | 6 | 2 | 0 | 0 | 13 | 30 | 12 |
| `HomeGolf Lab` / `Home Golf Lab` | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

La función se escribe `HomeLAB` (112 veces en `src/`, 8 en `docs/`). En `docs/` también aparece «Home Lab» (13) y `HomeLab` (1; 4 en `src/`, son identificadores de código). El plan usa «Home Lab».

Dónde ve el usuario cada variante (a mano, de la lista del `grep`):
- **`HomeGolfLab`:** encabezado de la app (`App.tsx:80`), título de la portada cuando no hay nombre (`Home.tsx:34`), `<title>` de `index.html`, `name` y `short_name` del manifest, título del menú de compartir (`ExportSheet.tsx:194`), nombre del archivo exportado `HomeGolfLab-<plantilla>-AAAA-MM-DD-HHmm.mp4` (`export/render.ts:187`), la marca de agua en 10 idiomas (`ex2.watermark`, `video.ts`), el prompt del coach (`server/index.ts:84`), el nombre de la app nativa (`capacitor.config.ts`), el repo y la URL de Pages (`https://rgbardack-cyber.github.io/HomeGolfLab/`, 4 apariciones en documentos y flujos).
- **`HomeGolf LAB`:** **la casilla de consentimiento** (`lib/consent.ts:24` y `consent.checkbox` en 10 idiomas) y los borradores legales (`docs/legal/`, `registro-ingresos.md`: «HomeGolf LAB LLC»). Es la única variante con espacio que ve el usuario en la app.
- **`HomeGolfLAB`:** solo documentos (4).
- **No medido:** la tienda (no hay fichas creadas), las capturas y el brand kit (`brand-kit/` tiene `HomeGolfLab-Brand-File.html/.pdf`; `marketing/` no está en este clon).

### Regla propuesta (Ryan elige)

| Uso | Forma | Dónde |
|---|---|---|
| Marca visible | **HomeGolf LAB** | texto en pantalla, marca de agua, textos legales, fichas de tienda, `<title>`, `name` del manifest, `appName` |
| Función | **HomeLAB** (una palabra) | pantallas y menús; en documentos escribirla igual |
| Identificadores | **homegolflab** (minúsculas) | `package.json`, `appId`, claves de `localStorage`, archivos |
| Repositorio y URL de Pages | **HomeGolfLab** | no se cambia sin renombrar el repo en GitHub, y eso rompe la URL pública |
| Archivo exportado | `HomeGolfLab-…mp4` o `HomeGolf-LAB-…mp4` | decide Ryan; hoy `HomeGolfLab` |

Si Ryan prefiere **«HomeGolfLab» en todo lo visible**, la corrección es solo la casilla de consentimiento (11 textos) y los documentos legales. Es el cambio más chico, y es la opción que menos toca texto legal.

**Aviso:** `consent.checkbox` es el texto exacto de la casilla (R9). Cambiarlo obliga a subir `CONSENT_VERSION` (hoy 1) y a pedir el permiso de nuevo. Mientras la bandera `consentFlow` siga apagada no hay nadie afectado, pero conviene decidirlo **antes** de encenderla.

**Cambio de marca visible a «HomeGolf LAB» (si Ryan lo elige):** 7 sitios de interfaz, 10 de la marca de agua, `index.html`, manifest, `appName`, el prompt del coach y la prueba de `literals.test.ts` (su lista `ALLOWED` trae `HomeGolfLab`). No se hizo: espera la elección.

## 2. `appId`

`com.homegolflab.app` y `appName: 'HomeGolfLab'` en `capacitor.config.ts`. Que Ryan lo quiera así **no está verificado**. Después de crear la app en App Store y Google Play el identificador **ya no se puede cambiar**. **Pregunta para Ryan:** ¿confirmas `com.homegolflab.app`? Si eliges «HomeGolf LAB» como marca, `appName` pasa a `HomeGolf LAB` (el `appId` no cambia).

## 3. `.env.example` (corregido en esta rama)

Antes tenía 5 variables y decía que la clave era «para el escaneo de HomeLAB». Ahora:
- Dice que la clave la usan **el coach y el escaneo**, y que la de pruebas no va a producción.
- Agrega, sin valores y con comentario: `ANTHROPIC_AUTH_TOKEN`, `PORT`, `ENTITLEMENTS_ENABLED`, `ENTITLEMENTS_DEV_CLAIM` (marcada «nunca en producción»), `ENTITLEMENTS_FILE`, `COACH_TOKENS_FREE`, `COACH_TOKENS_PREMIUM`, `COACH_TOKENS_EARLY_ADOPTER`, `VITE_BASE`, `VITE_HASH_ROUTER`, `VITE_INTERNAL` y la lista de las 10 banderas `VITE_FLAG_*`.
- Comprobado: `git check-ignore` confirma que `.env` (raíz y `homegolflab/`) y `data/` están ignorados; `!.env.example` sí se sube.
- Variables que **aún no existen** y que el bloque 4 agregará: `TRUST_PROXY`, `DAILY_TOKEN_BUDGET`, `COACH_MODEL`, `SCAN_MODEL`. No se agregaron para no documentar algo que el servidor no lee.

## 4. Idiomas visibles: es y en (navegador, servidor de desarrollo, puerto 5199, ya cerrado)

Leí el texto de Inicio, HomeLAB, Swing y Perfil en español y en inglés. Es un servidor de **desarrollo**, así que muestra paneles internos que la web pública no trae.

Textos rotos o mezclados:
1. **`BORRADOR: REQUIERE REVISIÓN DE UN ABOGADO…`** se ve **dentro de la pantalla HomeLAB** (en inglés: «DRAFT: REQUIRES REVIEW BY A LAWYER…»). Es la primera línea del aviso de seguridad. El plan pide que la marca BORRADOR vaya «solo en el repo», no en lo que ve el usuario. Decisión de Ryan: quitarla de la pantalla (y dejarla en el documento) o dejarla hasta que el abogado revise.
2. **Perfil, aviso de idioma:** «Las traducciones son un borrador y las revisa una persona nativa antes de publicarse». **Hoy no es cierto** (no hay revisión nativa) y promete algo con fecha. Cambiarlo a «Las traducciones son un borrador» o quitarlo.
3. **Perfil muestra «Activar Premium (modo prueba)»** (ver sección 6). No es un texto roto: es el interruptor que debe desaparecer de la web pública.
4. **Perfil, «Funciones de prueba»** sale en español aunque la app esté en inglés. Es un panel interno (`INTERNAL`), excluido a propósito de la traducción y ausente del build público (0 apariciones, sección 6). No se corrige.
5. **Español, Swing:** «Gratis: 1 de 1 análisis disponibles hoy» (concordancia: «disponible»). Menor.
6. **Inglés:** el modo «Casa / Cancha» se lee «Home / Course» y la navegación «Inicio» se lee «Home»: dos «Home» distintos en la misma pantalla. Menor, confunde.
7. **Portada, Ball tracking:** «Mide dirección y velocidad de tus putts con la cámara». Debe confirmarse contra `marketing/BRAND.md` (no está en este clon) y contra «No mostrar números que la app no mide» (`CLAUDE.md` de la app). **No medido** si la velocidad del putt está validada.

**No medido:** portugués y los demás idiomas, las pantallas de Tracking y Logros, un teléfono, y el aspecto (solo leí texto, no capturas).

## 5. CI local de `pages.yml` sobre `release/v1`

Mismos pasos que el CI, dentro de `homegolflab/`, con `VITE_BASE=/HomeGolfLab/` y `VITE_API_URL` vacío:

| Paso | Resultado |
|---|---|
| `npm ci` | correcto, 0 vulnerabilidades |
| `npm run typecheck` | sin errores |
| `npm test` | **538 de 538** pruebas, 46 archivos |
| `npm run build` | correcto, aviso de chunk > 500 kB (ya existía) |

**Versión de Node usada: v26.13.0** (npm 11.20.0). El CI usa **Node 22**: **no medido en Node 22.** `pages.yml` además dispara con push a `main` o a `feat/video-review-export`, no a `release/v1`; cambiarlo es el bloque 0 de la opción A, con el sí de Ryan.

## 6. Build público: búsqueda en `dist/`

Búsqueda de texto exacto en el `dist/` del build de la sección 5:

| Texto | Apariciones | Esperado |
|---|---|---|
| `Activar Premium` | **1** (en `dist/assets/index-*.js`) | 0 |
| `Funciones de prueba` | **0** | 0 |
| `__hgl` (ganchos de QA) | 0 | 0 |

**El resultado de `Activar Premium` NO es el esperado.** Causa medida: `release/v1` sale de `749d7ff`, que **no contiene `2dfc975`** (`fix/ocultar-premium-prueba-web`, que oculta el interruptor tras `INTERNAL`). `git merge-base --is-ancestor 2dfc975 release/v1` dice que no está; `562f5b0` sí está. En el navegador confirmé que Perfil muestra «Activar Premium (modo prueba)» en es y «Turn on Premium (test mode)» en en. Es decir: **hoy `release/v1` mostraría el interruptor de Premium de prueba en la web pública.**

Dos cosas que arreglar (propuesta, no hecho):
1. **Traer el arreglo de `2dfc975` a `release/v1`.** No se puede con un `cherry-pick` limpio: `Perfil.tsx` ya cambió con los idiomas (el commit original tiene los textos escritos directo). Hay que reescribirlo con `t('perfil.activate')` dentro de `{INTERNAL && …}`.
2. **La búsqueda de texto exacta no llegará a 0 aunque el botón desaparezca.** Los diccionarios (`src/i18n/`) entran enteros al paquete, y `perfil.activate` («Activar Premium (modo prueba)») es una entrada del diccionario aunque el botón no se dibuje. Opciones: sacar esa clave del diccionario público (cargarla solo con `INTERNAL`), o cambiar el criterio de «hecho» a «el botón no se dibuja», comprobándolo en el navegador con `vite preview`. **Ryan elige.** La prueba que ya protege esto es la de banderas, no la de `dist/`.

## 7. Textos de `R8_PENDING` (12 claves): cuáles se ven en la beta

Las 12 claves están en el paquete (en los 10 idiomas, 10 apariciones de cada clave): que estén en `dist/` no dice que se vean. Por lectura del código (**no medido en el navegador**):

| Clave | Texto en español | Dónde sale | ¿Se ve en la beta? |
|---|---|---|---|
| `sw.008` | «Coach con IA» | `Swing.tsx:148,157` (tarjeta del coach, y título de la puerta Premium) | **Sí:** con un análisis de swing hecho, el usuario gratis ve la puerta Premium «Coach con IA» |
| `sw.010`, `sw.012`, `sw.013` | explicación, «Pedir análisis con IA», aviso de envío de fotos | `Swing.tsx:162-166` | Solo con Premium; en la beta con el interruptor oculto, no |
| `sw2.coachUnavailable` | «El coach con IA todavía no está disponible en esta versión.» | `Swing.tsx:142` | Solo si se pidió el coach (Premium) y no hay servidor |
| `sw2.coachFailed`, `sw2.coachCaveat` | «El análisis con IA falló.», aviso de confianza | `Swing.tsx:142,197` | Solo con Premium |
| `coach.offline`, `coach.notConfigured`, `coach.failed` | errores de red/configuración/fallo | `coach.ts:131-136` | Solo si se pide el coach |
| `hl.scanMeasures` | medidas del escaneo | `HomeLab.tsx:124` | Solo tras un escaneo (requiere servidor) |
| `hl.scan.errNotConfigured` | error del escaneo sin servidor | `lib/scan.ts:96` | **Sí, en la contingencia sin servidor**, si el usuario intenta escanear |

Conclusión (lectura, no medido): el único texto de IA que se ve **sin hacer nada especial** es `sw.008` («Coach con IA») en la puerta Premium de Swing. Con el servidor apagado, `hl.scan.errNotConfigured` también. Estos son los que bloquean R8 para la beta. El bloque 8 propone la redacción.

## 8. Decisiones para Ryan que salen de este bloque

1. Nombre visible: **HomeGolf LAB**, **HomeGolfLab** o lo que prefiera (sección 1).
2. `appId` `com.homegolflab.app` (sección 2).
3. Traer el arreglo del interruptor de Premium a `release/v1` y cómo medirlo (sección 6).
4. Qué hacer con la línea BORRADOR visible en HomeLAB y con la frase «las revisa una persona nativa» (sección 4).
