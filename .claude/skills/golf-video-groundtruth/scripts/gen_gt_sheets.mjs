// Hojas de contacto con el tiempo grabado (cada 0,1 s) para marcar a mano inicio/tope/impacto.
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { ROOT, TOOLS, CHROME, VIDEOS, needTools } from './_cfg.mjs'
const require = createRequire(needTools() + '/package.json')
const ff = require('ffmpeg-static')
const inv = JSON.parse(fs.readFileSync(`${ROOT}/resultados/inventario.json`, 'utf8')).filter((r) => r.kind === 'clip')
const ids = process.argv[2].split(',')
const T0 = +(process.argv[3] || 6.2), STEP = +(process.argv[4] || 0.1), N = +(process.argv[5] || 24), W = +(process.argv[6] || 180), COLS = +(process.argv[7] || 8), tag = process.argv[8] || 'sheet'
for (const id of ids) {
  const r = inv.find((x) => x.archivo === id + '.mp4')
  if (!r) { console.log('no existe', id); continue }
  const dir = `${ROOT}/ground_truth/${id}`
  fs.mkdirSync(dir, { recursive: true })
  const rows = Math.ceil(N / COLS)
  const vf = `fps=${1 / STEP},scale=${W}:-1,drawtext=fontfile='C\\:/Windows/Fonts/arialbd.ttf':text='%{expr\\:${T0}+n*${STEP}}':x=4:y=4:fontsize=22:fontcolor=yellow:box=1:boxcolor=black@0.6,tile=${COLS}x${rows}`
  const out = `${dir}/${tag}.png`
  const p = spawnSync(ff, ['-v', 'error', '-y', '-ss', String(T0), '-t', String(N * STEP + 0.05), '-i', r.file, '-vf', vf, '-frames:v', '1', out], { encoding: 'utf8' })
  console.log(id, p.status === 0 ? 'ok' : p.stderr.slice(0, 200))
}
