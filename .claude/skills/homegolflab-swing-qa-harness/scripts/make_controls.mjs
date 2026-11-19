// Genera un control de cámara lenta con ffmpeg (setpts): el video dura <factor> veces más y los fps se conservan.
// Uso: node make_controls.mjs <clip.mp4> <factor> <salida.mp4>      (HGL_TOOLS = carpeta con ffmpeg-static)
// Ejemplo: node make_controls.mjs i7_sr_f01.mp4 2 "$HGL_PRUEBAS/controles/lento2x_f01.mp4"
// Los controles "sin persona" y "persona sin swing" se recortan a mano de un original (p. ej. con -ss/-t), no se generan aquí.
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import { needTools } from './_cfg.mjs'
const require = createRequire(needTools() + '/package.json')
const ff = require('ffmpeg-static')
const [src, factor, out] = process.argv.slice(2)
if (!src || !factor || !out) { console.error('Uso: node make_controls.mjs <clip> <factor> <salida>'); process.exit(2) }
const p = spawnSync(ff, ['-v', 'error', '-y', '-i', src, '-an', '-vf', `setpts=${factor}*PTS`, '-r', '60', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', out], { encoding: 'utf8' })
console.log(p.status === 0 ? 'ok ' + out : p.stderr)
process.exit(p.status ?? 1)
