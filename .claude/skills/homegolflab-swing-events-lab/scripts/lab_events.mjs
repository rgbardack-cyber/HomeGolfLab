// Laboratorio offline: reproduce findSwingWindow/analyzeSwing en Node con los cuadros crudos guardados.
// Uso: node lab_events.mjs [ruta a swing.ts] [ids]
import fs from 'node:fs'
import { ROOT } from './_cfg.mjs'
const swingPath = process.argv[2]
const sel = process.argv[3]
const S = await import('file:///' + swingPath.replace(/\\/g, '/'))
const dir = `${ROOT}/resultados/${process.env.HGL_DIR || "swing_fix"}`
const toFrames = (a) => (a || []).map((f) => ({ t: f.t, lm: f.lm.map(([x, y, v]) => ({ x, y, z: 0, v })) }))
const rows = []
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.run1.json'))) {
  const id = f.replace('.run1.json', '')
  if (sel && !sel.split(',').includes(id)) continue
  const r = JSON.parse(fs.readFileSync(`${dir}/${f}`, 'utf8'))
  const d = r.debug; if (!d) continue
  const aspect = d.aspect
  const coarse = toFrames(d.coarseFrames || d.frames)
  const win = S.findSwingWindow(coarse, { aspect })
  const res = S.analyzeSwing(toFrames(d.analysisFrames || d.frames), { aspect, sampled: d.sampled?.n })
  rows.push({ id, appWin: d.window, labWin: win, appRes: typeof d.result === 'string' ? d.result : d.result?.times, labRes: typeof res === 'string' ? res : res.times })
}
for (const x of rows) console.log(x.id, 'win app', JSON.stringify(x.appWin), 'lab', JSON.stringify(x.labWin), '| res app', JSON.stringify(x.appRes), 'lab', JSON.stringify(x.labRes))
