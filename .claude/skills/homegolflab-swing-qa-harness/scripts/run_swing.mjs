// Sube cada video por el input[type=file] de /swing (flujo real de la app, copia con __hglDebug),
// espera el resultado y guarda JSON crudo, capturas y fotos clave.
// Uso: node run_swing.mjs <run> <shard>/<nshards> [ids separados por coma | all] [--dir <carpetaVideos>]
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import { ROOT, TOOLS, CHROME, VIDEOS, needTools } from './_cfg.mjs'
const require = createRequire(needTools() + '/package.json')
const puppeteer = require('puppeteer-core')

const BASE = process.env.HGL_URL || 'http://127.0.0.1:5199'
const [run = '1', shard = '0/1', sel = 'all'] = process.argv.slice(2)
const [si, sn] = shard.split('/').map(Number)
const OUT = process.env.HGL_OUT || `${ROOT}/resultados/swing`
fs.mkdirSync(OUT, { recursive: true })

const inv = JSON.parse(fs.readFileSync(`${ROOT}/resultados/inventario.json`, 'utf8'))
let items = inv.filter((r) => r.kind === 'clip').map((r) => ({ id: r.archivo.replace(/\.mp4$/, ''), file: r.file }))
// controles generados (ver harness/make_controls.mjs)
const ctlDir = `${ROOT}/controles`
if (fs.existsSync(ctlDir)) for (const f of fs.readdirSync(ctlDir).filter((f) => /\.(mp4|mov)$/i.test(f))) items.push({ id: 'ctl_' + f.replace(/\.[^.]+$/, ''), file: `${ctlDir}/${f}` })
if (sel !== 'all') { const want = new Set(sel.split(',')); items = items.filter((i) => want.has(i.id)) }
// prioridad: ids de HGL_PRIO primero (referencias manuales, fallos conocidos y controles), el resto después
const prio = new Set((process.env.HGL_PRIO || '').split(',').filter(Boolean))
items = [...items.filter((i) => prio.has(i.id)), ...items.filter((i) => !prio.has(i.id))]
items = items.filter((_, k) => k % sn === si)
if (process.env.HGL_REVERSE) items.reverse()

const PREMIUM = JSON.stringify({ state: { mode: 'casa', profile: { name: '', handicap: '', lefty: false, premium: true }, sessions: [], earned: {}, unlockQueue: [], space: null, plan: null, scan: null, trackingUsedSec: 0, currentClub: null }, version: 0 })

const r4 = (k, v) => (typeof v === 'number' ? Math.round(v * 1e4) / 1e4 : v)
const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) } return (h >>> 0).toString(16) }

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--mute-audio', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] })

for (const it of items) {
  const outJson = `${OUT}/${it.id}.run${run}.json`
  if (fs.existsSync(outJson)) { console.log('salto', it.id); continue }
  const t0 = Date.now()
  const ctx = await browser.createBrowserContext()
  const page = await ctx.newPage()
  await page.setViewport({ width: 430, height: 932, deviceScaleFactor: 1 })
  const consoleMsgs = []
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) consoleMsgs.push(m.type() + ': ' + m.text().slice(0, 300)) })
  page.on('pageerror', (e) => consoleMsgs.push('pageerror: ' + String(e).slice(0, 300)))
  await page.evaluateOnNewDocument((p) => { try { localStorage.setItem('homegolflab-v1', p) } catch {} }, PREMIUM)
  let rec = { id: it.id, file: it.file, run: +run }
  try {
    await page.goto(`${BASE}/swing`, { waitUntil: 'networkidle0', timeout: 120000 })
    await page.waitForSelector('input[type=file]', { timeout: 30000 })
    const input = await page.$('input[type=file]')
    await input.uploadFile(it.file.replace(/\//g, '\\'))
    await page.waitForSelector('video', { timeout: 20000 })
    // ¿el video carga? (lo que haría el usuario antes de pulsar Analizar)
    rec.videoLoad = await page.evaluate(() => new Promise((res) => {
      const v = document.querySelector('video'); const t = setTimeout(() => res({ ok: false, why: 'timeout metadata 8s', rs: v.readyState }), 8000)
      const ok = () => { clearTimeout(t); res({ ok: v.videoWidth > 0, w: v.videoWidth, h: v.videoHeight, dur: v.duration }) }
      if (v.readyState >= 1) ok(); else { v.addEventListener('loadedmetadata', ok, { once: true }); v.addEventListener('error', () => { clearTimeout(t); res({ ok: false, why: 'error ' + (v.error && v.error.message) }) }, { once: true }) }
    }))
    const clicked = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((b) => /Analizar swing/.test(b.textContent || '')); if (b) { b.click(); return true } return false })
    rec.clicked = clicked
    if (clicked) {
      await page.waitForFunction(() => window.__hglDebug && window.__hglDebug.done === true, { timeout: 240000, polling: 500 }).catch(() => { rec.timeout = true })
      rec.appMs = await page.evaluate(() => (window.__hglDebug ? window.__hglDebug.ms : null))
      // texto visible (errores, avisos, nota) y datos crudos
      rec.pageText = await page.evaluate(() => document.body.innerText)
      const dump = await page.evaluate(() => {
        const d = window.__hglDebug || {}
        const enc = (o) => JSON.stringify(o, (k, v) => (typeof v === 'number' ? Math.round(v * 1e4) / 1e4 : v))
        const lite = (fs) => (fs || []).map((f) => ({ t: f.t, lm: f.lm.map((p) => [p.x, p.y, p.v]) }))
        let h = 2166136261
        const hs = (s) => { for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) } }
        hs(JSON.stringify(d.coarseFrames || [])); hs(JSON.stringify(d.frames || []))
        const out = { ...d, frames: lite(d.frames), coarseFrames: lite(d.coarseFrames), analysisFrames: undefined, framingFrame: undefined, shots: (d.shots || []).map((s) => ({ label: s.label })) }
        return { json: enc(out), shots: d.shots || [], frameDigest: (h >>> 0).toString(16) }
      })
      rec.debug = JSON.parse(dump.json)
      rec.frameDigest = dump.frameDigest
      if (run === '1') for (const s of dump.shots) fs.writeFileSync(`${OUT}/${it.id}.run1_${s.label}.jpg`, Buffer.from(s.url.split(',')[1], 'base64'))
      // solo la primera corrida guarda captura de pantalla completa
      if (run === '1') await page.screenshot({ path: `${OUT}/${it.id}.run1.png`, fullPage: true })
      rec.storage = await page.evaluate(() => { try { const s = JSON.parse(localStorage.getItem('homegolflab-v1')); return { sessions: s.state.sessions.length } } catch { return null } })
    }
  } catch (e) {
    rec.harnessError = String(e).slice(0, 500)
  }
  rec.console = consoleMsgs.slice(0, 10)
  rec.wallMs = Date.now() - t0
  fs.writeFileSync(outJson, JSON.stringify(rec))
  const d = rec.debug
  const r = d && d.result
  console.log(it.id, 'run' + run, (rec.wallMs / 1000).toFixed(1) + 's', rec.harnessError ? 'HARNESS_ERR ' + rec.harnessError : typeof r === 'string' ? 'ERR=' + r : r ? `view=${r.view} t=${r.times.address}/${r.times.top}/${r.times.impact} tempo=${r.metrics.tempoRatio} score=${r.score}` : 'sin resultado ' + (rec.timeout ? 'TIMEOUT' : ''))
  await ctx.close()
}
await browser.close()



