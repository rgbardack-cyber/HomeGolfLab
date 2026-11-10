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
  plugins: [react(), tailwindcss(), ...(mode === 'phone' ? [basicSsl()] : [])],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: { fs: { allow: ['.', nodeModulesReal] } },
  test: { environment: 'node' },
}));
