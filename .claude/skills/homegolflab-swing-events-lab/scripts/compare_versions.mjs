// Anti-regresión: compara dos versiones de swing.ts sobre los cuadros gruesos guardados (96 conjuntos).
// Uso: node compare_versions.mjs <swing_anterior.ts> <swing_nuevo.ts> [--list] [--flujo]
//   --flujo: emula la app real (pasada fina y, si no da swing, la gruesa). Sin él, solo la pasada gruesa (como el laboratorio de siempre).
// Variables: HGL_PRUEBAS (obligatoria), HGL_DIR (subcarpeta de resultados; por defecto swing_fix).
// Cada conjunto es <clip>.run1.json con debug.coarseFrames. Imprime métricas por versión y los clips cuyo resultado cambia.
import fs from 'node:fs'
import { ROOT } from './_cfg.mjs'
const [oldP, newP] = process.argv.slice(2)
if (!oldP || !newP) { console.error('Uso: node compare_versions.mjs <anterior.ts> <nuevo.ts> [--list]'); process.exit(2) }
const imp = (p) => import('file:///' + p.split('\\').join('/'))
const [A, B] = [await imp(oldP), await imp(newP)]
const dir = `${ROOT}/resultados/${process.env.HGL_DIR || 'swing_fix'}`
const gtAll = JSON.parse(fs.readFileSync(`${ROOT}/ground_truth/gt_swing.json`, 'utf8')).clips
const inv = JSON.parse(fs.readFileSync(`${ROOT}/resultados/inventario.json`, 'utf8')).filter((r) => r.kind === 'clip')
const toFrames = (a) => (a || []).map((f) => ({ t: f.t, lm: f.lm.map(([x, y, v]) => ({ x, y, z: 0, v })) }))

const FLUJO = process.argv.includes('--flujo') // emula la app: pasada fina y, si no da swing, la gruesa (Swing.tsx)
function evalOne(S, d, csvImp, g) {
  let coarse = toFrames(d.coarseFrames || d.frames)
  const win = S.findSwingWindow(coarse, { aspect: d.aspect })
  let res = S.analyzeSwing(coarse, { aspect: d.aspect, sampled: d.sampled?.coarse?.n ?? d.sampled?.n })
  if (FLUJO && d.frames && d.coarseFrames) {
    const fine = toFrames(d.frames)
    res = S.analyzeSwing(fine, { aspect: d.aspect, sampled: d.sampled?.n })
    coarse = fine
    if (typeof res === 'string') {
      const cf = toFrames(d.coarseFrames)
      const c = S.analyzeSwing(cf, { aspect: d.aspect, sampled: d.sampled?.coarse?.n })
      if (typeof c !== 'string') { res = c; coarse = cf }
    }
  }
  const o = { win: win ? [win.from / 1000, win.to / 1000] : null, err: null, ev: null, tempo: null, plausible: false, in05: false, gtOk: null, framing: null }
  if (typeof res === 'string') { o.err = res; return o }
  const a = res.times.address / 1000, tp = res.times.top / 1000, im = res.times.impact / 1000
  o.ev = [a, tp, im]; o.tempo = res.metrics.tempoRatio; o.view = res.view; o.lefty = res.lefty
  o.in05 = Math.abs(im - csvImp) <= 0.5
  o.plausible = Math.abs(im - csvImp) <= 0.6 && a < tp && tp < im && tp - a >= 0.3 && tp - a <= 1.6 && im - tp <= 0.7
  if (g) o.gtOk = [Math.abs(a - g.start) <= 0.1 + 1e-9, Math.abs(tp - g.top) <= 0.1 + 1e-9, Math.abs(im - g.impact) <= 0.1 + 1e-9]
  const fr = coarse.find((f) => f.t === res.times.address)
  if (fr && S.framingCheck) { const c = S.framingCheck(fr.lm); o.framing = c.ok ? 'ok' : c.hint }
  return o
}
const tally = () => ({ n: 0, no_swing: 0, otros_err: 0, plausibles: 0, impacto_pm05: 0, bajada_lt015: 0, gt: { n: 0, inicio: 0, tope: 0, impacto: 0 }, framing_pies: 0 })
const T = { A: tally(), B: tally() }
const diffs = []
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.run1.json')).sort()) {
  const id = f.replace('.run1.json', '')
  const d = JSON.parse(fs.readFileSync(`${dir}/${f}`, 'utf8')).debug
  if (!d || !(d.coarseFrames || d.frames)) continue
  const row = inv.find((x) => x.archivo === id + '.mp4')
  const csvImp = row ? +row.impacto_en_clip_s : 8
  const g = gtAll[id]
  const oa = evalOne(A, d, csvImp, g), ob = evalOne(B, d, csvImp, g)
  for (const [k, o] of [['A', oa], ['B', ob]]) {
    const t = T[k]; t.n++
    if (o.err === 'no_swing') t.no_swing++; else if (o.err) t.otros_err++
    if (o.plausible) t.plausibles++
    if (o.in05) t.impacto_pm05++
    if (o.ev && o.ev[2] - o.ev[1] < 0.15) t.bajada_lt015++
    if (o.framing && /pies/i.test(o.framing)) t.framing_pies++
    if (g && o.ev) { t.gt.n++; t.gt.inicio += o.gtOk[0]; t.gt.tope += o.gtOk[1]; t.gt.impacto += o.gtOk[2] }
  }
  const sig = (o) => JSON.stringify([o.err, o.ev && o.ev.map((x) => +x.toFixed(2)), o.view, o.lefty])
  if (sig(oa) !== sig(ob)) diffs.push({ id, csvImp, ant: { err: oa.err, ev: oa.ev, plausible: oa.plausible, in05: oa.in05, tempo: oa.tempo }, nuevo: { err: ob.err, ev: ob.ev, plausible: ob.plausible, in05: ob.in05, tempo: ob.tempo } })
}
console.log('ANTERIOR', JSON.stringify(T.A))
console.log('NUEVO   ', JSON.stringify(T.B))
const peor = diffs.filter((x) => (x.ant.plausible && !x.nuevo.plausible) || (x.ant.err == null && x.nuevo.err === 'no_swing') || (x.ant.in05 && !x.nuevo.in05))
const mejor = diffs.filter((x) => (!x.ant.plausible && x.nuevo.plausible) || (x.ant.err && !x.nuevo.err) || (!x.ant.in05 && x.nuevo.in05))
console.log(`clips que cambian: ${diffs.length} · empeoran (plausible→no, resultado→no_swing o sale de ±0,5 s): ${peor.length} · mejoran: ${mejor.length}`)
if (process.argv.includes('--list') || peor.length) {
  const fmt = (x) => `${x.id.padEnd(14)} idx=${x.csvImp.toFixed(2)} ant=${x.ant.err || x.ant.ev.map((v) => v.toFixed(2)).join('/')}${x.ant.plausible ? ' ✓' : ''}  nuevo=${x.nuevo.err || x.nuevo.ev.map((v) => v.toFixed(2)).join('/')}${x.nuevo.plausible ? ' ✓' : ''}`
  console.log('--- EMPEORAN (reproducir en el navegador antes de aceptar) ---'); peor.forEach((x) => console.log(fmt(x)))
  console.log('--- CAMBIAN (resto) ---'); diffs.filter((x) => !peor.includes(x)).forEach((x) => console.log(fmt(x)))
}
