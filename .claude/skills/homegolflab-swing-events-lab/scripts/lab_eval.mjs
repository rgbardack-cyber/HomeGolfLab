// Evalúa una versión de swing.ts sobre los cuadros gruesos (10/s) ya guardados de cada clip.
// Uso: node lab_eval.mjs <swing.ts> [--verbose]
import fs from 'node:fs'
import { ROOT } from './_cfg.mjs'
const swingPath = process.argv[2]
const verbose = process.argv.includes('--verbose')
const S = await import('file:///' + swingPath.replace(/\\/g, '/'))
const dir = `${ROOT}/resultados/${process.env.HGL_DIR || 'swing_fix'}`
const gt = JSON.parse(fs.readFileSync(`${ROOT}/ground_truth/gt_swing.json`, 'utf8')).clips
const inv = JSON.parse(fs.readFileSync(`${ROOT}/resultados/inventario.json`, 'utf8')).filter((r) => r.kind === 'clip')
const toFrames = (a) => (a || []).map((f) => ({ t: f.t, lm: f.lm.map(([x, y, v]) => ({ x, y, z: 0, v })) }))
const stat = { n: 0, noWin: 0, winOk: 0, winMiss: 0, errs: {}, evOk: 0, evBad: 0, gtN: 0, gtStartOk: 0, gtTopOk: 0, gtImpOk: 0, gtAll: 0 }
const lines = []
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.run1.json')).sort()) {
  const id = f.replace('.run1.json', '')
  const r = JSON.parse(fs.readFileSync(`${dir}/${f}`, 'utf8'))
  const d = r.debug; if (!d || !d.coarseFrames && !d.frames) continue
  const row = inv.find((x) => x.archivo === id + '.mp4')
  const csvImp = row ? +row.impacto_en_clip_s : 8
  const coarse = toFrames(d.coarseFrames || d.frames)
  const win = S.findSwingWindow(coarse, { aspect: d.aspect })
  const res = S.analyzeSwing(coarse, { aspect: d.aspect, sampled: d.sampled?.coarse?.n ?? d.sampled?.n })
  stat.n++
  let note = ''
  if (!win) { stat.noWin++; note = 'SIN VENTANA' }
  else if (win.from / 1000 <= csvImp + 0.5 && win.to / 1000 >= csvImp - 0.3) { stat.winOk++ } else { stat.winMiss++; note = 'VENTANA FUERA' }
  if (typeof res === 'string') { stat.errs[res] = (stat.errs[res] || 0) + 1; note += ' err=' + res }
  else {
    const t = res.times, a = t.address / 1000, tp = t.top / 1000, im = t.impact / 1000
    const ok = Math.abs(im - csvImp) <= 0.6 && a < tp && tp < im && tp - a >= 0.3 && tp - a <= 1.6 && im - tp <= 0.7
    ok ? stat.evOk++ : stat.evBad++
    if (!ok) note += ' EVENTOS?'
    const g = gt[id]
    if (g) {
      stat.gtN++
      const s = Math.abs(a - g.start) <= 0.1 + 1e-9, tt = Math.abs(tp - g.top) <= 0.1 + 1e-9, ii = Math.abs(im - g.impact) <= 0.1 + 1e-9
      stat.gtStartOk += s; stat.gtTopOk += tt; stat.gtImpOk += ii; stat.gtAll += s && tt && ii
      note += ` GT d=[${(a - g.start).toFixed(2)},${(tp - g.top).toFixed(2)},${(im - g.impact).toFixed(2)}]`
    }
    lines.push(`${id.padEnd(14)} win=${win ? (win.from / 1000).toFixed(1) + '-' + (win.to / 1000).toFixed(1) : '—'} ev=${a.toFixed(1)}/${tp.toFixed(1)}/${im.toFixed(1)} tempo=${res.metrics.tempoRatio} ${res.view} ${note}`)
    continue
  }
  lines.push(`${id.padEnd(14)} win=${win ? (win.from / 1000).toFixed(1) + '-' + (win.to / 1000).toFixed(1) : '—'} ${note}`)
}
if (verbose) console.log(lines.join('\n'))
console.log(JSON.stringify(stat))
