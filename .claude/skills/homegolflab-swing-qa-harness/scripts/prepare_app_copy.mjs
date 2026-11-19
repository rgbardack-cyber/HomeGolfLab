// Crea una COPIA de la app (sin tocar src/ del repo) lista para el harness: src + configuración, node_modules enlazado,
// caché de Vite propia, y el gancho window.__hglDebug aplicado con patch_app.mjs.
// Uso: node prepare_app_copy.mjs <carpeta_destino> <nombre_cache>
//   HGL_REPO = carpeta homegolflab/ del repo; HGL_PRUEBAS obligatoria (para _cfg).
// Ejemplo: node prepare_app_copy.mjs "$HGL_PRUEBAS/harness/app_nuevo" vite-cache-nuevo
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { REPO } from './_cfg.mjs'

const [dest, cacheName = 'vite-cache-copia'] = process.argv.slice(2)
if (!dest || !REPO) { console.error('Uso: HGL_REPO=<homegolflab> node prepare_app_copy.mjs <destino> [cache]'); process.exit(2) }
const skip = new Set(['node_modules', 'dist', 'dist-static', '.vite-cache', 'HomeGolfLab-estatico.zip'])
fs.mkdirSync(dest, { recursive: true })
for (const name of fs.readdirSync(REPO)) {
  if (skip.has(name)) continue
  fs.cpSync(path.join(REPO, name), path.join(dest, name), { recursive: true, force: true })
}
const nm = path.join(dest, 'node_modules')
if (!fs.existsSync(nm)) fs.symlinkSync(path.join(REPO, 'node_modules'), nm, 'junction') // en Windows 'junction' no pide permisos
// Caché propia: dos servidores que comparten caché se pisan al reiniciar.
const vc = path.join(dest, 'vite.config.ts')
let v = fs.readFileSync(vc, 'utf8')
v = v.replace(/cacheDir: '[^']*'/, `cacheDir: '../${cacheName}'`)
fs.writeFileSync(vc, v)
const r = spawnSync(process.execPath, [path.join(path.dirname(fileURLToPath(import.meta.url)), 'patch_app.mjs'), dest], { stdio: 'inherit' })
process.exit(r.status ?? 1)
