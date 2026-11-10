# 📱 HomeGolf LAB — Guía de instalación con Capacitor

## Requisitos previos
- Node.js 18+ instalado
- Xcode 14+ (para iOS) — desde la Mac App Store
- Android Studio (para Android) — opcional
- Cuenta de desarrollador Apple ($99/año) para publicar

---

## 1. Instalar dependencias del proyecto

Abre la terminal en la carpeta del proyecto y ejecuta:

```bash
npm install
npm install @capacitor/core @capacitor/cli @capacitor/ios @capacitor/android
npm install @capacitor/splash-screen @capacitor/status-bar @capacitor/camera @capacitor/keyboard
```

---

## 2. Hacer el build de la app web

```bash
npm run build
```

Esto genera la carpeta `dist/` que Capacitor usa como base.

---

## 3. Agregar las plataformas nativas

```bash
npx cap add ios
npx cap add android
```

---

## 4. Sincronizar el proyecto

Cada vez que hagas cambios en el código, ejecuta:

```bash
npm run build && npx cap sync
```

---

## 5. Abrir en Xcode (iOS)

```bash
npx cap open ios
```

En Xcode:
1. Selecciona tu equipo de desarrollo en **Signing & Capabilities**
2. Conecta tu iPhone por USB
3. Presiona ▶ para instalar en tu teléfono

---

## 6. Abrir en Android Studio

```bash
npx cap open android
```

---

## 7. Permisos necesarios (ya configurados en capacitor.config.json)
- **Cámara** — para Swing Analysis y Ball Tracking
- **Galería/Fotos** — para subir videos desde el carrete

### iOS — agregar al Info.plist de Xcode:
```xml
<key>NSCameraUsageDescription</key>
<string>HomeGolf LAB usa la cámara para analizar tu swing y rastrear la pelota.</string>
<key>NSPhotoLibraryUsageDescription</key>
<string>HomeGolf LAB necesita acceso a tus fotos para subir videos de práctica.</string>
<key>NSMicrophoneUsageDescription</key>
<string>HomeGolf LAB usa el micrófono durante la grabación de video.</string>
```

### Android — en AndroidManifest.xml (se agrega automáticamente con @capacitor/camera):
```xml
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" />
<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" />
```

---

## 8. Íconos y Splash Screen

Necesitas crear los siguientes archivos en `resources/`:
- `icon.png` — 1024x1024px (ícono de la app)
- `splash.png` — 2732x2732px (pantalla de carga)

Luego instala el generador automático:
```bash
npm install @capacitor/assets --save-dev
npx capacitor-assets generate
```

---

## 9. TestFlight (pruebas internas en iPhone sin publicar)

Para probar con tu equipo antes de publicar:
1. En Xcode → Product → Archive
2. Sube el archivo a App Store Connect
3. Activa TestFlight y agrega emails de beta testers
4. Los testers reciben una invitación por email y pueden instalar la app sin pagar nada

---

## 10. Flujo de trabajo diario

```bash
# Después de cada cambio en el código:
npm run build
npx cap sync

# Para abrir en el simulador o dispositivo:
npx cap open ios
```

---

## Bundle ID
El App Bundle ID es: **com.homegolflab.app**
(Debes registrarlo en developer.apple.com bajo Identifiers)

---

## Notas importantes
- La URL del backend (base44) funciona igual desde la app nativa — no necesitas cambiar nada en el código.
- Los videos y fotos se suben al mismo backend que la versión web.
- Para suscripciones nativas (Apple Pay in-app), más adelante agrega `@capacitor/purchases` (RevenueCat).