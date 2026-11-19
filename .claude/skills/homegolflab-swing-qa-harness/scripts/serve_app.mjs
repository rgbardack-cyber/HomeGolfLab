// Sirve una copia de la app con Vite en un puerto propio (el harness usa HGL_URL=http://127.0.0.1:<puerto>).
// Uso: node serve_app.mjs <carpeta_de_la_copia> <puerto>      (déjalo corriendo en segundo plano)
// Por qué un puerto por copia: así se pueden comparar "antes" y "después" sin reiniciar nada.
import { spawn } from 'node:child_process'
const [dir, port = '5199'] = process.argv.slice(2)
if (!dir) { console.error('Uso: node serve_app.mjs <carpeta> <puerto>'); process.exit(2) }
const bin = process.platform === 'win32' ? 'npx.cmd' : 'npx'
const p = spawn(bin, ['vite', '--host', '127.0.0.1', '--port', port, '--strictPort'], { cwd: dir, stdio: 'inherit', shell: process.platform === 'win32' })
p.on('exit', (c) => process.exit(c ?? 0))
