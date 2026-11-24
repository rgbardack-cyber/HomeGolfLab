# Plan: de web app a app instalable en teléfonos reales

23 nov 2026. Resultado de ejecutar `prompt-plan-nativo-xcode-android.md` **sin Ryan y sin crear cuentas**. Es un plan, no implementación: no se creó ninguna carpeta `android/` ni `ios/`, y no se tocó nada nativo (D7). Lo que no se pudo verificar dice «NO VERIFICADO». Costos y reglas de tiendas: `monetizacion-verificacion.md`.

## Estado de partida (medido hoy, 23 nov 2026)
- `typecheck` correcto, **519 de 519 pruebas**, `build` correcto. No hay `java`, `adb`, Android SDK ni Xcode en esta máquina (F11, registro del 20 nov).
- `capacitor.config.ts`: `appId: com.homegolflab.app`, `appName: HomeGolfLab`, `webDir: dist`, `androidScheme: https`. Capacitor 8; plugins `@capacitor/filesystem` y `@capacitor-community/admob`.
- **Nada se ha medido en un teléfono.** Sin medir: fps procesados (objetivo ≥ 15 [PROPUESTA]), memoria, calor, WebCodecs y MediaRecorder dentro de WKWebView y del WebView de Android, sonido de golpe real.

## Mi opinión sobre la recomendación vigente (arrancar trámites ya, sin cobrar ni anuncios reales)
La comparto, con un ajuste: **la cuenta de Google Play de persona nueva exige pruebas antes de publicar** (la página lo dice pero no da los números: NO VERIFICADO), así que conviene empezar ese trámite primero porque es el que más tarda. Apple y AdMob se pueden hacer en paralelo. Nada de cobro hasta tener los clips y las pruebas en teléfonos.

## Orden recomendado
| Fase | Qué | Quién | Hecho cuando |
|---|---|---|---|
| 0 | Revisar y fusionar las ramas de esta semana (Ryan las sube con Git GUI) | Ryan | Las ramas están en GitHub y Pages sin banderas |
| 1 | **Cuentas** (ver lista abajo) | Ryan | Cuentas creadas, pagos hechos por Ryan |
| 2 | Agregar Capacitor Android (`npx cap add android`) y compilar APK de prueba en Windows | Claude, con Android Studio instalado por Ryan | Un APK instala y abre en un teléfono Android |
| 3 | **Prueba interna** de Google Play con 1–3 teléfonos | Ryan + Claude | La app se instala desde Play y abre la cámara |
| 4 | iOS con **Codemagic** (Mac en la nube): `npx cap add ios`, firma, TestFlight | Claude prepara; Ryan conecta cuentas | Un iPhone instala la app desde TestFlight |
| 5 | **Pruebas en dispositivos reales (F11)**: matriz abajo | Ryan graba, Claude registra | Tabla con números o «no medido» |
| 6 | Privacidad, etiquetas, ficha de tienda (con el abogado) | Ryan + abogado | Política publicada; etiquetas enviadas |
| 7 | UMP, ATT y anuncios reales (solo si pasó la fase 5) | Claude | Pruebas con identificadores de prueba |
| 8 | Pase de 119,99 USD (compra no consumible) con `lifetime_early_adopter` (bloque F) | Claude + Ryan | Solo tras `recomendacion-monetizacion.md` |

**Camino mínimo «app en un teléfono real esta semana»:** instalar Android Studio en Windows, `npx cap add android`, `npm run build && npx cap sync android`, abrir en Android Studio y correr en un teléfono Android con la depuración USB activa. No necesita cuenta de Google Play ni de Apple. **No medido:** que esto funcione con esta app (es lo que hay que probar primero).

## 1. Preparación del proyecto nativo
- Carpetas: `npx cap add android` y `npx cap add ios` desde `homegolflab/`. Sincronizar con `npm run build && npx cap sync`.
- Nombre, icono y splash: usar `brand-kit/` (revisar con Ryan; sin tocarlo aquí). El `appId` ya está elegido: `com.homegolflab.app`; cambiarlo después de publicar no es posible, **confirmar con Ryan antes de crear las cuentas**.
- Permisos con texto en español: cámara y micrófono (`NSCameraUsageDescription`, `NSMicrophoneUsageDescription` en iOS; permisos de Android), y solo **agregar** a la galería en iOS (D8). Textos sin mencionar el análisis con IA (R8).
- Orientación: vertical. Esquema de la webview: `https` en Android (ya está); en iOS, el esquema por defecto de Capacitor.
- Dentro de WKWebView y del WebView de Android hay que probar: cámara en vivo, `MediaRecorder`, **WebCodecs** (exportación), IndexedDB y el sistema de archivos de Capacitor (probado solo con uno falso). **Versiones mínimas: NO VERIFICADO** (no se leyó la compatibilidad real). Plan B de exportación solo si falla en un dispositivo (D7).

## 2. Cuentas y trámites (los hace Ryan; ningún dato de pago pasa por Claude)
| Cuenta | Qué pide | Costo | Plazo |
|---|---|---|---|
| **Google Play Console** | Cuenta de Google, identidad, verificar un teléfono Android, pruebas previas a publicar | 25 USD una vez (leído) | NO VERIFICADO; empezar primero |
| **Apple Developer Program** | Apple ID con verificación en dos pasos, identidad; si es persona, nombre legal | Monto anual **NO VERIFICADO** | NO VERIFICADO |
| **AdMob** | Cuenta de Google, datos de pago, app registrada, identificadores de anuncio | Sin costo conocido | NO VERIFICADO |
| **Codemagic** | Cuenta (GitHub), conectar el repo, integración con Apple App Store Connect (clave de API) | Gratis: 500 minutos de Mac M2 al mes; luego 0,095 USD por minuto (M2) o 0,114 (M4) [https://codemagic.io/pricing/, leído hoy] | Inmediato |
| **Datos** que Ryan debe tener a mano | Nombre legal o de la empresa, domicilio, teléfono, correo de soporte, URL de la política de privacidad, tarjeta, datos de impuestos | — | — |
Aceptar términos, pagar y pasar verificaciones de identidad **lo hace Ryan**.

## 3. iOS desde Windows
| Opción | Costo | Pasos | Comentario |
|---|---|---|---|
| **Codemagic** (recomendada) | 500 minutos de Mac M2 gratis al mes; luego 0,095 USD/min | `codemagic.yaml` (preparado, ver abajo), integración con App Store Connect, firma automática | Un build de iOS de Capacitor suele tomar varios minutos: **no medido** |
| Runners macOS de GitHub Actions | NO VERIFICADO | Escribir el flujo con `xcodebuild` | Más trabajo manual de firma |
| Xcode Cloud | Exige Xcode en una Mac para configurarlo | — | Descartada: requiere Mac |
| Mac prestada | Gratis | Ryan consigue una Mac | Solo para depurar si algo falla en la nube |
Certificados, perfiles y firma: con la integración de Codemagic con App Store Connect (clave de API) se firma sin Mac [NO VERIFICADO paso a paso; se lee en la documentación de Codemagic al hacerlo].

## 4. Distribución cerrada
- **Android:** prueba interna de Google Play; los probadores se invitan por correo en la consola.
- **iOS:** TestFlight (el primer build de cada versión pasa por una revisión corta de Apple [NO VERIFICADO el plazo]); probadores internos por correo.
- **CI:** hoy solo hay `pages.yml`. Con Codemagic se genera el build de iOS; Android se puede generar en Codemagic o en GitHub Actions. No se creó ningún flujo de GitHub Actions nuevo.

## 5. Pruebas en dispositivos reales (F11)
Matriz mínima: 1 Android de gama media, 1 iPhone reciente, 1 iPhone viejo. **Medir** (y anotar «no medido» si no se puede):
| Qué | Cómo | Umbral |
|---|---|---|
| Cuadros procesados por segundo del modo en vivo | contador de la app (`FpsMonitor`) | ≥ 15 [PROPUESTA, fijado antes] |
| Memoria y calor | 15 min de grabación; temperatura anotada a mano | sin cierre de la app |
| Tamaño de la grabación a 15 min | tamaño de archivo | solo se registra |
| Latencia de exportación | cronómetro con el mismo clip en cada teléfono | solo se registra |
| WebCodecs / MediaRecorder disponibles | consulta en la app | si falla, se decide el plan B (D7) |
| Zurdos, micrófono y bola real | 3 swings de un zurdo; golpes con bola; sonido real | «Con bola» confirmado o no |
Los umbrales no se mueven para que algo pase. Si un teléfono falla, se registra.

## 6. Ingresos y qué NO se activa
Ver `recomendacion-monetizacion.md`. **No se activan** anuncios reales, pagos ni el pase hasta pasar la fase 5 y la revisión del abogado. `ENTITLEMENTS_ENABLED` queda apagado y necesita identidad firmada y verificación de recibos antes (ver `spec-cuota-coach.md`).

## 7. Marca y afirmaciones
Si cambia una función, una medida, un límite gratis, un precio o el estado de publicación, hay que actualizar `marketing/BRAND.md` en el mismo cambio. Ese archivo ya no está en el repo público (vive en el respaldo privado y en el disco de Ryan): **no se editó hoy** porque no hubo cambios públicos.

## 8. Riesgos
| Riesgo | Mitigación |
|---|---|
| WebCodecs o MediaRecorder fallan en WKWebView | Probar en la fase 5; plan B solo entonces (D7) |
| La cuenta de Play nueva retrasa la publicación | Empezar primero; la prueba interna igual sirve |
| Rechazo de Apple por privacidad (5.1.1) | Política, retiro de consentimiento y etiquetas listos antes |
| Anuncios con recompensa mal presentados | Cumplir `monetizacion-verificacion.md` §1 |
| Costos de Codemagic | Los 500 minutos gratis bastan para empezar; medir cuánto dura cada build |

## Lo que necesita Ryan (en orden)
1. Subir las ramas con Git GUI. 2. Confirmar el `appId` y el nombre. 3. Crear las cuentas (empezar con Google Play). 4. Instalar Android Studio. 5. Conectar Codemagic con GitHub. 6. Tener a mano 3 teléfonos.
`codemagic.yaml` (preparado, **no probado** y sin conectar a ninguna cuenta) está en `homegolflab/codemagic.yaml`.
