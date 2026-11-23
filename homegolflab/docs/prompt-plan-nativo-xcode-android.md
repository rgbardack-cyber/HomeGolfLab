# Prompt para una sesión de Opus: plan de código para Xcode, Android Studio y dispositivos reales

Copia todo lo de abajo en una sesión nueva de Opus, abierta en `C:\Users\Ryan\iCloudDrive\Desktop\HomeGolfLab_\Repo`.

---

Eres el ingeniero a cargo de llevar HomeGolfLab de web app a app instalable en teléfonos reales. Responde y escribe la interfaz en español. Dueño: Ryan (no es ingeniero; explica en simple y deja comandos listos para copiar).

## Tu entregable
Un PLAN de código y de trámites (no implementes todavía, salvo lo que tu plan marque como paso 0 seguro). Guárdalo en `homegolflab/docs/plan-nativo-dispositivos.md`, con fases, pasos verificables, criterios de "hecho", riesgos y qué hace Ryan a mano vs. qué haces tú. Antes de escribir, lee `homegolflab/CLAUDE.md`, `homegolflab/docs/plan-video-tracking-exportacion.md` (sección F11) y `homegolflab/docs/registro-implementacion.md`.

## Objetivo del negocio
Poder instalar la app en teléfonos reales YA (distribución cerrada: TestFlight en iOS y prueba interna en Google Play), para validar lo que falta, y prepararse para publicar y generar ingresos. Ryan duda entre publicar ya o seguir como web app; la recomendación vigente es: arrancar ahora los trámites de tiendas (tardan semanas) y la distribución cerrada, mantener el link web como canal de demostración, y NO cobrar ni poner anuncios reales hasta validar lo básico en dispositivos. Cuestiona esa recomendación si encuentras una razón.

## Contexto técnico
- Repo `C:\Users\Ryan\iCloudDrive\Desktop\HomeGolfLab_\Repo`; la app está en `homegolflab/`: React 19 + Vite 8 + TypeScript + Tailwind + Capacitor, zustand (persist), vitest (453 pruebas pasan), mediabunny para exportar.
- Rama de trabajo `feat/video-review-export` (PR abierto hacia `feat/mvp-driving-range`). `main` está protegida: solo el dueño la cambia; todo lo demás va por PR.
- Versión de prueba publicada: https://rgbardack-cyber.github.io/HomeGolfLab/ (GitHub Pages, repo público `rgbardack-cyber/HomeGolfLab`), con banderas `VITE_FLAG_*` encendidas (video review, comparar, vuelo v2, exportar, compuerta de exportación, grabación en vivo). Siguen APAGADAS: flightEstimate, shotShapeAuto, distanceEstimate.
- `swingiq/` y `marketing/` ya NO están en el repo público; viven en el repo privado `rgbardack-cyber/HomeGolfLab-backup` y en el disco local (ignorados).
- Ryan trabaja en **Windows**. Xcode solo corre en macOS: el plan debe resolver iOS con Mac en la nube (Codemagic, runners macOS de GitHub Actions o Xcode Cloud) o una Mac prestada, y comparar costo/tiempo. Android Studio sí corre en Windows.
- Incidencia conocida: iCloud vacía el índice de git; antes de `git add` usar `git reset -q --mixed HEAD`, añadir rutas explícitas y comprobar que `git diff --cached --name-status | grep -c "^D"` da 0. Vite en iCloud dispara recargas: usar servidor sin HMR si hace falta.

## Lo que YA funciona (verificado en código/pruebas/navegador de escritorio)
- Análisis de swing sobre video subido; comparación de dos videos (gratis, un solo ángulo); seguimiento de bola sobre video subido con trayectoria (detectado vs. estimado, vuelo v2); exportación de video con trazo, voz/marca de agua y recorte (WebCodecs + mediabunny); compuerta de exportación con anuncio con recompensa; unidades (yardas por defecto, guardado en metros).
- Cámara en vivo (F10): `LiveSwingDetector` (histéresis, bajada real 0,15–0,6 s, separación 3 s, bloqueo de identidad), permisos y errores en español, monitor de fps (aviso bajo 12 fps procesados), grabación en vivo con recorte ±2 s por swing y descarte de la grabación, clasificación "Con bola / Sin sonido de golpe" por micrófono opcional.

## Lo que NO está probado o está pendiente (sé honesto con esto en el plan)
- **Nada se ha medido en teléfonos reales** (F11 bloqueada: sin Xcode/Android Studio/dispositivos). No se midió el objetivo de ≥15 cuadros procesados por segundo en gama media.
- Grabación en vivo verificada con 1 golpe; "Con bola" nunca visto con sonido real; no probado con zurdos ni con varias personas.
- Ball tracking: validado solo sobre video subido; sin referencia de precisión; no consta prueba con la cámara en vivo. Faltan los clips de validación que trae Ryan (D9) para F5.1, F6 y F7.
- Paridad de capas de exportación 4,05–5,23/255 (criterio propuesto ≤4 no cumplido; no se movió el umbral).
- Anuncio con recompensa: la política de AdMob (D5) sin verificar; falta UMP/ATT; en la web de producción el anuncio de prueba desbloquea sin anuncio real.
- Modelo de ingresos sin cerrar: hay anuncios con recompensa (D1: 1 anuncio) y Premium, pero NO hay precios ni mecanismo de cobro en tiendas. El plan debe plantear opciones (p. ej. compras dentro de la app con RevenueCat o directamente) y qué decidir.

## Decisiones ya tomadas por Ryan (no las reabras sin razón)
D1 un anuncio con recompensa, sin "30 segundos". D2 yardas por defecto, guardar en metros. D3 el pase = un análisis + una configuración, 24 h, opciones cambiables sin pase nuevo. D4 comparación gratis, un solo ángulo, tres formas de uso. D5 consentimiento del usuario, UMP/ATT, 1 exportación gratis al día si rechaza o no hay anuncio; verificar política de AdMob. D6 launch monitor fuera de alcance. D7 WebCodecs primero; nada nativo hasta que falle en un dispositivo real. D8 en iOS solo "agregar a galería". D9 los clips de validación los trae Ryan. D10 marca de agua con logo pequeño en gratis, quitada en Premium.

## Qué debe cubrir el plan
1. **Preparación del proyecto nativo**: Capacitor iOS/Android (carpetas, id de la app, nombre, iconos, splash, permisos de cámara/micrófono/galería con textos en español, orientación, https/esquema de la webview), cómo se sincroniza con el build de Vite, y qué cambia para cámara en vivo, MediaRecorder, WebCodecs y exportación dentro de WKWebView y WebView de Android (versiones mínimas, compatibilidad real, plan B por D7 solo si falla en dispositivo).
2. **Cuentas y trámites** con orden y plazos: Apple Developer, Google Play, AdMob, política de privacidad, fichas de tienda, clasificación de contenido, cuestionario de privacidad de datos, UMP/ATT. Qué hace Ryan a mano (pagos, identidad, aceptar términos).
3. **iOS desde Windows**: opciones concretas con costo y pasos (certificados, perfiles, firma, TestFlight).
4. **Distribución cerrada**: TestFlight y prueba interna de Google Play; CI en GitHub Actions para generar builds; cómo invitar a testers.
5. **Plan de pruebas en dispositivos reales (F11)**: matriz de teléfonos (gama media Android, iPhone reciente y viejo), qué medir (fps procesados, memoria, calor, tamaño de grabación a 15 min, latencia de exportación), cómo registrar resultados sin mover umbrales ("no medido" cuando no se pueda medir), pruebas con zurdos, con micrófono y con bola real.
6. **Ingresos**: opciones de cobro y anuncios, requisitos de cada tienda, qué hay que decidir y cuándo. Qué NO se activa hasta pasar las pruebas.
7. **Marca y afirmaciones**: si cambia una función, medida, límite gratis, precio o estado de publicación, actualizar `marketing/BRAND.md` (está fuera del repo público: se edita en disco y se sube a mano al repo `HomeGolfLab-backup`, remote `backup`).
8. **Riesgos y orden recomendado**, con un camino mínimo "app en un teléfono real esta semana".

## Reglas de trabajo
- Commits pequeños y verificados por tarea; typecheck, test y build en verde; "no medido" cuando no se pueda medir; no mover umbrales para que algo pase.
- Pedir confirmación antes de cualquier acción externa o irreversible: pagos, crear cuentas, subir a tiendas, publicar, cambiar `main`, reescribir historial.
- No inventar cifras de precios, plazos o políticas de tiendas: verifica con las fuentes oficiales y cita la fecha de consulta.
