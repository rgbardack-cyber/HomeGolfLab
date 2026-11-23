// Ball tracking por la pestaña Video (/tracking): sube el clip, fija el segundo de inicio, toca la bola, 60 fps, "Seguir la bola".
// Uso: node run_ball.mjs [ids separados por coma]
//   Sin HGL_BALL_SHOTS usa la lista SHOTS de abajo (los 4 tiros frontales). Con HGL_BALL_SHOTS=<ruta a un JSON> lee el manifiesto:
//   [{ "id", "file" (absoluta o relativa a HGL_VIDEOS), "tap": {"x","y"} | null, "startT" (s), "fps": 30|60, "timeScale": 1, "impactGT": s, "nota" }]
//   Un tiro con tap null se salta (hay que marcarlo a mano). `timeScale` se guarda en el JSON; la app aún no lo usa (F5.2).
//   HGL_OUT: carpeta de salida (por defecto resultados/ball; usa otra, p. ej. resultados/ball_v2, para no pisar la evidencia original).
import { createRequire } from 'node:module'
import fs from 'node:fs'
import { ROOT, TOOLS, CHROME, VIDEOS, needTools } from './_cfg.mjs'
const require = createRequire(needTools() + '/package.json')
const puppeteer = require('puppeteer-core')
const BASE = process.env.HGL_URL || 'http://127.0.0.1:5199'
const OUT = process.env.HGL_OUT || `${ROOT}/resultados/ball`
fs.mkdirSync(OUT, { recursive: true })
// tap: posición de la bola (0–1) en el cuadro de inicio, marcada a mano (auto-anotada). startT: segundo de inicio (un usuario lo pondría antes del golpe).
const SHOTS = [
  { id: 'i6_sr_f01', file: `${VIDEOS}/i6/swings_reales/i6_sr_f01.mp4`, tap: { x: 0.548, y: 0.674 }, startT: 6.8, impactGT: 8.01 },
  { id: 'pw_sr_f01', file: `${VIDEOS}/pw/swings_reales/pw_sr_f01.mp4`, tap: { x: 0.394, y: 0.669 }, startT: 6.8, impactGT: 7.97 },
  { id: 'i9_sr_f01', file: `${VIDEOS}/i9/swings_reales/i9_sr_f01.mp4`, tap: { x: 0.381, y: 0.657 }, startT: 6.8, impactGT: 7.97 },
  { id: 'i4_sr_f01', file: `${VIDEOS}/i4/swings_reales/i4_sr_f01.mp4`, tap: { x: 0.727, y: 0.672 }, startT: 6.8, impactGT: 7.97 },
]
const MANIFEST = process.env.HGL_BALL_SHOTS
if (MANIFEST) {
  const list = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'))
  SHOTS.length = 0
  for (const m of list) {
    if (!m.tap) { console.log('salto', m.id, '(sin toque marcado: ' + (m.nota || 'falta marcar la bola') + ')'); continue }
    SHOTS.push({ ...m, fps: String(m.fps ?? 60), timeScale: m.timeScale ?? 1, file: /^([A-Za-z]:|\/)/.test(m.file) ? m.file : `${VIDEOS}/${m.file}` })
  }
}
const only = process.argv[2] ? new Set(process.argv[2].split(',')) : null
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--mute-audio'] })
for (const s of SHOTS) {
  if (only && !only.has(s.id)) continue
  if (process.env.HGL_STARTT) { s.startT = +process.env.HGL_STARTT; s.tag = '_t' + process.env.HGL_STARTT } else s.tag = ''
  const ctx = await browser.createBrowserContext(); const page = await ctx.newPage()
  await page.setViewport({ width: 430, height: 932, deviceScaleFactor: 1 })
  const rec = { ...s }
  try {
    await page.goto(`${BASE}/tracking`, { waitUntil: 'networkidle0', timeout: 120000 })
    // pestaña "Video"
    await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((b) => /^\s*Video\s*$/.test(b.textContent || '')); b && b.click() })
    await page.waitForSelector('input[type=file]', { timeout: 30000 })
    await (await page.$('input[type=file]')).uploadFile(s.file.replace(/\//g, '\\'))
    await page.waitForSelector('canvas[aria-label]', { timeout: 20000 })
    await new Promise((r) => setTimeout(r, 1500))
    // segundo de inicio (deslizador controlado por React)
    await page.evaluate((t) => { const el = document.querySelector('input[type=range]'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(el, String(t)); el.dispatchEvent(new Event('input', { bubbles: true })) }, s.startT)
    await new Promise((r) => setTimeout(r, 2500))
    // 60 fps
    await page.evaluate((f) => { const b = [...document.querySelectorAll('button')].find((b) => new RegExp('^\\s*' + f + ' fps\\s*$').test(b.textContent || '')); b && b.click() }, String(s.fps || 60))
    // toque
    const box = await page.evaluate(() => { const c = document.querySelector('canvas[aria-label]'); c.scrollIntoView({ block: 'center' }); const r = c.getBoundingClientRect(); return { l: r.left, t: r.top, w: r.width, h: r.height } })
    rec.canvasBox = box
    await page.mouse.click(box.l + s.tap.x * box.w, box.t + s.tap.y * box.h)
    await new Promise((r) => setTimeout(r, 500))
    await page.screenshot({ path: `${OUT}/${s.id}${s.tag}_antes.png` })
    const clicked = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((b) => /Seguir la bola/.test(b.textContent || '')); if (b && !b.disabled) { b.click(); return true } return false })
    rec.clicked = clicked
    await page.waitForFunction(() => window.__hglBall && window.__hglBall.done, { timeout: 240000, polling: 500 }).catch(() => { rec.timeout = true })
    rec.ball = await page.evaluate(() => window.__hglBall)
    rec.pageText = await page.evaluate(() => document.body.innerText.split('\n').filter((l) => /Puntos|Bola|ángulo|perdida|encontré|límite|video terminó|Solo|dejó/i.test(l)).join(' | '))
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.screenshot({ path: `${OUT}/${s.id}${s.tag}_resultado.png`, fullPage: true })
  } catch (e) { rec.harnessError = String(e).slice(0, 400) }
  fs.writeFileSync(`${OUT}/${s.id}${s.tag}.json`, JSON.stringify(rec))
  const b = rec.ball
  console.log(s.id, rec.harnessError ? 'ERR ' + rec.harnessError : b ? `detectados=${b.summary.detected} seguidos=${b.summary.followedS}s ángulo=${b.summary.launchAngleDeg} perdida=${b.summary.lostAtS} frames=${b.frames.length}` : 'sin resultado', rec.pageText || '')
  await ctx.close()
}
await browser.close()

