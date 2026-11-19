// Inventario de videos con ffmpeg-static (ffmpeg -i imprime metadatos en stderr)
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
const SM = VIDEOS, OUT = ROOT
import path from 'node:path'
import { ROOT, TOOLS, CHROME, VIDEOS, needTools } from './_cfg.mjs'
const require = createRequire(needTools() + '/package.json')
const ffmpeg = require('ffmpeg-static')

function probe(file) {
  const r = spawnSync(ffmpeg, ['-hide_banner', '-i', file], { encoding: 'utf8' })
  const t = r.stderr || ''
  const v = t.split('\n').find((l) => /Stream #.*Video:/.test(l)) || ''
  const codec = (v.match(/Video: (\w+)/) || [])[1] || ''
  const res = v.match(/, (\d{2,5})x(\d{2,5})/)
  const fps = (v.match(/([\d.]+) fps/) || [])[1] || ''
  const dur = t.match(/Duration: (\d+):(\d+):([\d.]+)/)
  const duration = dur ? +dur[1] * 3600 + +dur[2] * 60 + +dur[3] : ''
  const rot = (t.match(/rotate\s*:\s*(-?\d+)/) || [])[1] || (t.match(/displaymatrix: rotation of (-?[\d.]+)/) || [])[1] || '0'
  const hasAudio = /Stream #.*Audio:/.test(t)
  return { codec, w: res ? +res[1] : '', h: res ? +res[2] : '', fps, duration, rot, hasAudio }
}

const rows = []
// índice
const idx = fs.readFileSync(path.join(SM, 'indice_clips.csv'), 'utf8').trim().split(/\r?\n/).slice(1)
  .map((l) => l.split(',').map((s) => s.replace(/^"|"$/g, '')))
for (const [carpeta, archivo, orig, tipo, impacto, inicio] of idx) {
  const file = path.join(SM, carpeta, archivo).replace(/\\/g, '/')
  const exists = fs.existsSync(file)
  const p = exists ? probe(file) : {}
  const palo = carpeta.split('/')[0]
  const vista = /_f\d+/.test(archivo) ? 'frontal' : /_t\d+/.test(archivo) ? 'trasera' : '?'
  rows.push({ kind: 'clip', file, carpeta, archivo, orig, tipo, palo, vista, impacto_s: impacto, inicio_clip_s: inicio, impacto_en_clip_s: (+impacto - +inicio).toFixed(2), exists, ...p })
}
for (const f of fs.readdirSync(SM).filter((f) => /\.(mov|heic)$/i.test(f))) {
  const file = path.join(SM, f).replace(/\\/g, '/')
  const p = /mov$/i.test(f) ? probe(file) : {}
  rows.push({ kind: 'original', file, archivo: f, exists: true, ...p })
}
const cols = ['kind', 'archivo', 'carpeta', 'orig', 'tipo', 'palo', 'vista', 'impacto_s', 'inicio_clip_s', 'impacto_en_clip_s', 'codec', 'w', 'h', 'rot', 'fps', 'duration', 'hasAudio', 'exists', 'file']
const csv = [cols.join(',')].concat(rows.map((r) => cols.map((c) => JSON.stringify(r[c] ?? '')).join(','))).join('\n')
fs.writeFileSync(path.join(OUT, 'inventario.csv'), csv)
fs.writeFileSync(path.join(OUT, 'resultados', 'inventario.json'), JSON.stringify(rows, null, 1))
const cnt = (k) => rows.filter((r) => r.kind === 'clip').reduce((a, r) => ((a[r[k]] = (a[r[k]] || 0) + 1), a), {})
console.log('clips', rows.filter((r) => r.kind === 'clip').length, 'codec', cnt('codec'), 'vista', cnt('vista'), 'tipo', cnt('tipo'), 'fps', cnt('fps'))
console.log('res', cnt('w'), cnt('h'), 'rot', cnt('rot'))
for (const r of rows.filter((r) => r.kind === 'original')) console.log(r.archivo, r.codec, r.w + 'x' + r.h, r.fps, r.duration, 'rot', r.rot)
