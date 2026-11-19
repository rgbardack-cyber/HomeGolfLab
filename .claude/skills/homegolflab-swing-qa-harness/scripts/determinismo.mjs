// Prueba de determinismo: compara la corrida 1 con la corrida 2 de los mismos clips (resultados/<dir>/<id>.run1.json y .run2.json).
// Uso: node determinismo.mjs <dir de resultados, p. ej. swing_fix>
// Se compara nota, vista, mano, tiempos y métricas. El modelo de postura no es determinista bit a bit:
// lo esperable es misma nota/vista/mano y eventos casi idénticos; las métricas pueden variar unos grados.
import fs from 'node:fs'
import { ROOT } from './_cfg.mjs'
const dir = `${ROOT}/resultados/${process.argv[2] || 'swing_fix'}`
const out = []
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.run1.json'))) {
  const id = f.replace('.run1.json', '')
  const p2 = `${dir}/${id}.run2.json`
  if (!fs.existsSync(p2)) continue
  const a = JSON.parse(fs.readFileSync(`${dir}/${f}`, 'utf8')).debug?.result
  const b = JSON.parse(fs.readFileSync(p2, 'utf8')).debug?.result
  if (!a || !b || typeof a === 'string' || typeof b === 'string') { out.push({ id, nota: 'sin resultado en una de las corridas', a: typeof a === 'string' ? a : !!a, b: typeof b === 'string' ? b : !!b }); continue }
  const dm = {}
  for (const k of Object.keys(a.metrics || {})) if (typeof a.metrics[k] === 'number' && typeof b.metrics[k] === 'number') { const d = Math.abs(a.metrics[k] - b.metrics[k]); if (d > 0) dm[k] = +d.toFixed(2) }
  out.push({
    id, mismoScore: a.score === b.score, mismaVista: a.view === b.view, mismaMano: a.lefty === b.lefty,
    eventosIguales: JSON.stringify(a.times) === JSON.stringify(b.times), metricasIdenticas: Object.keys(dm).length === 0, difMax: dm,
  })
}
const ok = out.filter((x) => x.mismoScore !== undefined)
const c = (k) => ok.filter((x) => x[k]).length
console.log(JSON.stringify({ n: ok.length, mismoScore: c('mismoScore'), mismaVista: c('mismaVista'), mismaMano: c('mismaMano'), eventosIguales: c('eventosIguales'), metricasIdenticas: c('metricasIdenticas') }))
for (const x of out) if (!x.metricasIdenticas || x.nota) console.log(JSON.stringify(x))
