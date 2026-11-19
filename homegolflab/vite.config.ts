import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { fileURLToPath } from 'node:url';
import { realpathSync } from 'node:fs';

// node_modules is a folder link that lives outside iCloud, so allow Vite to serve from its real path.
const nodeModulesReal = realpathSync(fileURLToPath(new URL('./node_modules', import.meta.url)));

// "npm run dev:phone" sirve por HTTPS (certificado local) porque los teléfonos solo dan acceso a la cámara en HTTPS.
export default defineConfig(({ mode }) => ({
  // En GitHub Pages la app vive en /HomeGolfLab/: el workflow pasa VITE_BASE=/HomeGolfLab/. Por defecto '/', como siempre (desarrollo, teléfono y Capacitor).
  // "npm run build:static" (modo static): rutas relativas y router con # para soltar la carpeta dist-static en cualquier hosting estático.
  base: process.env.VITE_BASE ?? (mode === 'static' ? './' : '/'),
  build: { outDir: mode === 'static' ? 'dist-static' : 'dist' },
  plugins: [react(), tailwindcss(), ...(mode === 'phone' ? [basicSsl()] : [])],
  // Cada servidor usa su propia caché: compartirla hace que se pisen al reiniciar.
  cacheDir: mode === 'phone' ? 'node_modules/.vite-phone' : 'node_modules/.vite',
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  // /api va al servidor local (npm run server), que guarda la clave de la IA.
  server: { fs: { allow: ['.', nodeModulesReal] }, proxy: { '/api': 'http://localhost:8787' } },
  test: { environment: 'node' },
}));
