import { ROOT } from './_cfg.mjs'
// Calcula las métricas del Análisis de swing a partir de resultados/<dir>/*.run1.json
// Uso: node analyze_swing.mjs <dir resultados> <etiqueta>
import fs from 'node:fs'
const dirName = process.argv[2] || 'swing_fix'
const tag = process.argv[3] || dirName
const dir = `${ROOT}/resultados/${dirName}`
const gt = JSON.parse(fs.readFileSync(`${ROOT}/ground_truth/gt_swing.json`, 'utf8')).clips
const inv = JSON.parse(fs.readFileSync(`${ROOT}/resultados/inventario.json`, 'utf8')).filter((r) => r.kind === 'clip')

export const wilson = (k, n, z = 1.96) => {
  if (!n) return [null, null]
  const p = k / n, d = 1 + (z * z) / n, c = p + (z * z) / (2 * n), m = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))
  return [(c - m) / d, (c + m) / d]
}
const pct = (k, n) => (n ? Math.round((k / n) * 1000) / 10 : null)
const KEY = [11, 12, 23, 24, 15, 16]
const visible = (f) => KEY.reduce((s, i) => s + (f.lm[i] ? f.lm[i][2] : 0), 0) / KEY.length >= 0.5

const rows = []
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.run1.json')).sort()) {
  const id = f.replace('.run1.json', '')
  const r = JSON.parse(fs.readFileSync(`${dir}/${f}`, 'utf8'))
  const d = r.debug || {}
  const inf = inv.find((x) => x.archivo === id + '.mp4')
  const res = d.result
  const ok = res && typeof res !== 'string'
  const fine = d.frames || []
  const row = {
    id, control: id.startsWith('ctl_'), vistaReal: inf ? inf.vista : null, tipo: inf ? inf.tipo : null, palo: inf ? inf.palo : null,
    err: ok ? null : typeof res === 'string' ? res : r.harnessError ? 'harness' : d.thrown ? 'thrown:' + d.thrown.slice(0, 60) : 'sin_resultado',
    view: ok ? res.view : null, lefty: ok ? res.lefty : null,
    t: ok ? res.times : null, tempo: ok ? res.metrics.tempoRatio : null, framesUsed: ok ? res.metrics.framesUsed : null,
    window: d.window || null, usedCoarse: d.usedCoarse ?? null,
    sampledFine: d.sampled ? d.sampled.n : null, gotFine: d.sampled ? d.sampled.got : null,
    visFine: fine.length ? fine.filter(visible).length / fine.length : null,
    framing: d.framing || null, warn: d.warnText || null, club: d.club || null, shaftAddress: d.shaftAddress || null, shaftTop: d.shaftTop || null,
    appMs: r.appMs, digest: r.frameDigest, resultJson: ok ? JSON.stringify(res) : null, viewMismatch: ok ? res.viewMismatch || null : null,
    csvImpact: inf ? +inf.impacto_en_clip_s : null, gt: gt[id] || null,
  }
  rows.push(row)
}
fs.writeFileSync(`${ROOT}/resultados/resumen_${tag}.json`, JSON.stringify(rows, null, 1))
const cols = ['id', 'vistaReal', 'tipo', 'palo', 'err', 'view', 'lefty', 'tAddr', 'tTop', 'tImp', 'tempo', 'visFine', 'framingOk', 'framingHint', 'win_from', 'win_to']
const csv = [cols.join(',')].concat(rows.map((x) => [x.id, x.vistaReal, x.tipo, x.palo, x.err, x.view, x.lefty, x.t && x.t.address, x.t && x.t.top, x.t && x.t.impact, x.tempo, x.visFine && x.visFine.toFixed(3), x.framing && x.framing.ok, x.framing && x.framing.hint, x.window && x.window.from, x.window && x.window.to].map((v) => JSON.stringify(v ?? '')).join(','))).join('\n')
fs.writeFileSync(`${ROOT}/resultados/resumen_${tag}.csv`, csv)

const clips = rows.filter((x) => !x.control)
const out = { etiqueta: tag, n_clips: clips.length, n_controles: rows.length - clips.length }
const line = (k, n) => ({ k, n, pct: pct(k, n), wilson95: wilson(k, n).map((v) => v == null ? null : Math.round(v * 1000) / 10) })
// Resultado: ¿la app dio un resultado?
out.con_resultado = line(clips.filter((x) => !x.err).length, clips.length)
out.errores = clips.reduce((a, x) => (x.err && (a[x.err] = (a[x.err] || 0) + 1), a), {})
// Vista: solo clips con vista conocida (f/t)
const vv = clips.filter((x) => x.vistaReal === 'frontal' || x.vistaReal === 'trasera')
out.vista = line(vv.filter((x) => x.view && ((x.vistaReal === 'frontal') === (x.view === 'frente'))).length, vv.length)
out.vista_solo_con_resultado = line(vv.filter((x) => x.view && ((x.vistaReal === 'frontal') === (x.view === 'frente'))).length, vv.filter((x) => x.view).length)
// Cobertura de pose (cuadros finos con la pose visible)
const pv = clips.filter((x) => x.visFine != null)
out.pose_ventana = { n_clips: pv.length, clips_ge90: pv.filter((x) => x.visFine >= 0.9).length, media: pv.length ? Math.round((pv.reduce((s, x) => s + x.visFine, 0) / pv.length) * 1000) / 10 : null }
// Eventos vs referencia manual (±100 ms) — AUTO-ANOTADA
const g = clips.filter((x) => x.gt)
const within = (a, b) => a != null && Math.abs(a / 1000 - b) <= 0.1 + 1e-9
out.eventos_gt = { n: g.length, inicio: line(g.filter((x) => x.t && within(x.t.address, x.gt.start)).length, g.length), tope: line(g.filter((x) => x.t && within(x.t.top, x.gt.top)).length, g.length), impacto: line(g.filter((x) => x.t && within(x.t.impact, x.gt.impact)).length, g.length) }
out.ventana_gt = line(g.filter((x) => x.window && x.window.from / 1000 <= x.gt.start && x.window.to / 1000 >= x.gt.impact).length, g.length)
// Tempo vs GT (relación subida:bajada con tiempos de la GT)
out.tempo_gt = g.filter((x) => x.tempo != null).map((x) => ({ id: x.id, app: x.tempo, gt: Math.round(((x.gt.top - x.gt.start) / (x.gt.impact - x.gt.top)) * 100) / 100 }))
// Impacto vs índice (referencia débil, ±0,5 s): el índice marca siempre 8,0 s
const ci = clips.filter((x) => x.t)
out.impacto_vs_indice_100ms = line(ci.filter((x) => within(x.t.impact, x.csvImpact)).length, ci.length)
out.impacto_vs_indice_500ms = line(ci.filter((x) => Math.abs(x.t.impact / 1000 - x.csvImpact) <= 0.5).length, ci.length)
// Mano
out.lefty = clips.reduce((a, x) => (x.lefty != null && (a[x.lefty ? 'zurdo' : 'diestro'] = (a[x.lefty ? 'zurdo' : 'diestro'] || 0) + 1), a), {})
// Encuadre
out.encuadre = { avisa: clips.filter((x) => x.framing && !x.framing.ok).length, sin_aviso: clips.filter((x) => x.framing && x.framing.ok).length, pistas: clips.reduce((a, x) => (x.framing && !x.framing.ok && (a[x.framing.hint] = (a[x.framing.hint] || 0) + 1), a), {}) }
// Palo
out.palo = { con_lectura: clips.filter((x) => x.club).length, shaft_inicio: clips.filter((x) => x.shaftAddress).length, shaft_tope: clips.filter((x) => x.shaftTop).length }
// Controles
out.controles = rows.filter((x) => x.control).map((x) => ({ id: x.id, resultado: x.err ? 'rechazado: ' + x.err : `ACEPTADO como swing (${x.view}, tempo ${x.tempo})` }))
fs.writeFileSync(`${ROOT}/resultados/metricas_${tag}.json`, JSON.stringify(out, null, 1))
console.log(JSON.stringify(out, null, 1))
