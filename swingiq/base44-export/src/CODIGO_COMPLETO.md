# 📦 HomeGolf LAB — Código Completo del Proyecto

## ⚙️ Estructura de carpetas a crear

```
homegolflab/
├── index.html
├── index.css
├── tailwind.config.js
├── vite.config.js          ← crear este
├── package.json            ← crear este
├── capacitor.config.json
└── src/
    ├── main.jsx
    ├── App.jsx
    ├── api/
    │   └── base44Client.js
    ├── lib/
    │   ├── app-params.js
    │   ├── AuthContext.jsx
    │   ├── i18n.jsx
    │   ├── query-client.js
    │   ├── utils.js
    │   └── PageNotFound.jsx
    ├── pages/
    │   ├── Login.jsx
    │   ├── Register.jsx
    │   ├── ForgotPassword.jsx
    │   ├── ResetPassword.jsx
    │   ├── Dashboard.jsx
    │   ├── SwingAnalysis.jsx
    │   ├── HomePractice.jsx
    │   ├── BallTracking.jsx
    │   ├── Challenges.jsx
    │   ├── ChallengeDetail.jsx
    │   ├── Profile.jsx
    │   ├── Friends.jsx
    │   └── Subscription.jsx
    └── components/
        ├── AuthLayout.jsx
        ├── GoogleIcon.jsx
        ├── LanguageSwitcher.jsx
        ├── ProtectedRoute.jsx
        ├── UserNotRegisteredError.jsx
        ├── layout/
        │   └── AppLayout.jsx
        ├── shared/
        │   ├── AnalysisResult.jsx
        │   ├── VideoUploader.jsx
        │   └── PhotoUploader.jsx
        └── challenges/
            ├── ChallengeLeaderboard.jsx
            ├── DailySubmissionForm.jsx
            └── MissionsPanel.jsx
```

---

## 📄 package.json

```json
{
  "name": "homegolflab",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@base44/sdk": "^0.8.30",
    "@capacitor/android": "^6.0.0",
    "@capacitor/camera": "^6.0.0",
    "@capacitor/core": "^6.0.0",
    "@capacitor/ios": "^6.0.0",
    "@capacitor/keyboard": "^6.0.0",
    "@capacitor/splash-screen": "^6.0.0",
    "@capacitor/status-bar": "^6.0.0",
    "@radix-ui/react-accordion": "^1.2.3",
    "@radix-ui/react-alert-dialog": "^1.1.6",
    "@radix-ui/react-avatar": "^1.1.3",
    "@radix-ui/react-checkbox": "^1.1.4",
    "@radix-ui/react-dialog": "^1.1.6",
    "@radix-ui/react-dropdown-menu": "^2.1.6",
    "@radix-ui/react-label": "^2.1.2",
    "@radix-ui/react-popover": "^1.1.6",
    "@radix-ui/react-progress": "^1.1.2",
    "@radix-ui/react-radio-group": "^1.2.3",
    "@radix-ui/react-scroll-area": "^1.2.3",
    "@radix-ui/react-select": "^2.1.6",
    "@radix-ui/react-separator": "^1.1.2",
    "@radix-ui/react-slot": "^1.1.2",
    "@radix-ui/react-switch": "^1.1.3",
    "@radix-ui/react-tabs": "^1.1.3",
    "@radix-ui/react-toast": "^1.2.2",
    "@radix-ui/react-tooltip": "^1.1.8",
    "@tanstack/react-query": "^5.84.1",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "cmdk": "^1.0.0",
    "date-fns": "^3.6.0",
    "framer-motion": "^11.16.4",
    "input-otp": "^1.4.2",
    "lucide-react": "^0.475.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-hook-form": "^7.54.2",
    "react-markdown": "^9.0.1",
    "react-router-dom": "^6.26.0",
    "recharts": "^2.15.4",
    "sonner": "^2.0.1",
    "tailwind-merge": "^3.0.2"
  },
  "devDependencies": {
    "@capacitor/cli": "^6.0.0",
    "@vitejs/plugin-react": "^4.0.0",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.49",
    "tailwindcss": "^3.4.17",
    "tailwindcss-animate": "^1.0.7",
    "vite": "^5.0.0"
  }
}
```

---

## 📄 vite.config.js

```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
```

---

## 📄 index.html (en raíz del proyecto)

```html
<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/icon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <title>HomeGolf LAB</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

---

## 📄 src/main.jsx

```jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)
```

---

## 📄 src/api/base44Client.js

⚠️ **MUY IMPORTANTE**: Reemplaza `TU_APP_ID` con el ID real de tu app de Base44.
Lo encuentras en la URL cuando estás editando tu app: `https://base44.com/apps/TU_APP_ID/...`

```js
import { createClient } from '@base44/sdk';

export const base44 = createClient({
  appId: 'TU_APP_ID',   // ← CAMBIA ESTO
  token: null,
  functionsVersion: null,
  serverUrl: '',
  requiresAuth: false,
  appBaseUrl: 'https://api.base44.com'
});
```

---

## 📄 src/lib/app-params.js

```js
const isNode = typeof window === 'undefined';
const windowObj = isNode ? { localStorage: new Map() } : window;
const storage = windowObj.localStorage;

const toSnakeCase = (str) => str.replace(/([A-Z])/g, '_$1').toLowerCase();

const getAppParamValue = (paramName, { defaultValue = undefined, removeFromUrl = false } = {}) => {
  if (isNode) return defaultValue;
  const storageKey = `base44_${toSnakeCase(paramName)}`;
  const urlParams = new URLSearchParams(window.location.search);
  const searchParam = urlParams.get(paramName);
  if (removeFromUrl) {
    urlParams.delete(paramName);
    const newUrl = `${window.location.pathname}${urlParams.toString() ? `?${urlParams.toString()}` : ''}${window.location.hash}`;
    window.history.replaceState({}, document.title, newUrl);
  }
  if (searchParam) { storage.setItem(storageKey, searchParam); return searchParam; }
  if (defaultValue) { storage.setItem(storageKey, defaultValue); return defaultValue; }
  const storedValue = storage.getItem(storageKey);
  if (storedValue) return storedValue;
  return null;
};

const getAppParams = () => {
  if (getAppParamValue('clear_access_token') === 'true') {
    storage.removeItem('base44_access_token');
    storage.removeItem('token');
  }
  return {
    appId: getAppParamValue('app_id', { defaultValue: import.meta.env.VITE_BASE44_APP_ID }),
    token: getAppParamValue('access_token', { removeFromUrl: true }),
    fromUrl: getAppParamValue('from_url', { defaultValue: typeof window !== 'undefined' ? window.location.href : '' }),
    functionsVersion: getAppParamValue('functions_version', { defaultValue: import.meta.env.VITE_BASE44_FUNCTIONS_VERSION }),
    appBaseUrl: getAppParamValue('app_base_url', { defaultValue: import.meta.env.VITE_BASE44_APP_BASE_URL }),
  };
};

export const appParams = { ...getAppParams() };
```

---

## 📄 .env (crear este archivo en la raíz)

```
VITE_BASE44_APP_ID=TU_APP_ID_AQUI
VITE_BASE44_APP_BASE_URL=https://api.base44.com
```

---

## ⚠️ NOTA SOBRE LOS COMPONENTES UI (shadcn/ui)

Los componentes en `src/components/ui/` (button, input, select, tabs, etc.) son de shadcn/ui.
Para instalarlos, después de hacer `npm install`, ejecuta:

```bash
npx shadcn@latest init
```

Selecciona:
- Style: Default
- Base color: Green (o el que prefieras)
- CSS variables: Yes

Luego instala los componentes que necesita la app:

```bash
npx shadcn@latest add button input label select tabs textarea toast dialog badge card progress separator scroll-area
```

---

## 🚀 Pasos completos de instalación

```bash
# 1. Crea la carpeta del proyecto
mkdir homegolflab && cd homegolflab

# 2. Copia todos los archivos de código (ver secciones abajo)

# 3. Instala dependencias
npm install

# 4. Instala componentes UI
npx shadcn@latest init
npx shadcn@latest add button input label select tabs textarea toast dialog badge card separator

# 5. Prueba en el navegador
npm run dev

# 6. Cuando todo funcione, haz el build para Capacitor
npm run build

# 7. Agrega iOS
npx cap add ios
npx cap sync

# 8. Abre en Xcode
npx cap open ios
```

---

## 🔑 Cómo encontrar tu App ID de Base44

1. Ve a base44.com y abre tu app
2. Mira la URL del navegador: `https://base44.com/apps/ESTE_ES_TU_APP_ID/editor`
3. Copia ese ID y ponlo en el `.env` y en `base44Client.js`

---

## 📝 Archivos de código

Todos los archivos de código fuente están en este mismo proyecto de Base44.
Los archivos que necesitas copiar son los que aparecen en la sección de estructura arriba.
Puedes leerlos directamente desde la interfaz de Base44 en el panel de "Files" o "Code".