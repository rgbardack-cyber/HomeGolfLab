// Localiza manchas amarillo-blancas (bolas de práctica) en cuadros PNG y dibuja un montaje numerado para elegir el toque.
import { createRequire } from 'node:module'
import fs from 'node:fs'
import { ROOT, TOOLS, CHROME, VIDEOS, needTools } from './_cfg.mjs'
const require = createRequire(needTools() + '/package.json')
const puppeteer = require('puppeteer-core')
const files = fs.readdirSync(`${ROOT}/ball/frames`).filter((f) => f.endsWith('.png'))
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] })
const page = await browser.newPage()
const res = {}
for (const f of files) {
  const b64 = fs.readFileSync(`${ROOT}/ball/frames/${f}`).toString('base64')
  const out = await page.evaluate(async (b64) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode()
    const W = img.width, H = img.height
    const c = document.createElement('canvas'); c.width = W; c.height = H
    const ctx = c.getContext('2d', { willReadFrequently: true }); ctx.drawImage(img, 0, 0)
    const d = ctx.getImageData(0, 0, W, H).data
    const mask = new Uint8Array(W * H)
    for (let i = 0; i < W * H; i++) { const r = d[i * 4], g = d[i * 4 + 1], bl = d[i * 4 + 2]; if (r > 170 && g > 160 && bl < 140 && r - bl > 60 && g - bl > 50) mask[i] = 1 }
    const seen = new Uint8Array(W * H), blobs = []
    for (let s = 0; s < W * H; s++) {
      if (!mask[s] || seen[s]) continue
      const st = [s]; seen[s] = 1; let a = 0, sx = 0, sy = 0, x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1
      while (st.length) { const i = st.pop(); const x = i % W, y = (i - x) / W; a++; sx += x; sy += y; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y
        for (const n of [i - 1, i + 1, i - W, i + W]) if (n >= 0 && n < W * H && mask[n] && !seen[n]) { seen[n] = 1; st.push(n) } }
      if (a >= 25) blobs.push({ area: a, x: sx / a / W, y: sy / a / H, w: x1 - x0 + 1, h: y1 - y0 + 1 })
    }
    blobs.sort((p, q) => q.area - p.area)
    const top = blobs.slice(0, 6)
    ctx.lineWidth = 4; ctx.font = '40px Arial'
    top.forEach((b, k) => { ctx.strokeStyle = '#f0f'; ctx.strokeRect(b.x * W - 40, b.y * H - 40, 80, 80); ctx.fillStyle = '#f0f'; ctx.fillText(String(k), b.x * W + 44, b.y * H - 30) })
    return { W, H, blobs: top, png: c.toDataURL('image/jpeg', 0.7) }
  }, b64)
  res[f] = { W: out.W, H: out.H, blobs: out.blobs }
  fs.writeFileSync(`${ROOT}/ball/frames/${f.replace('.png', '_blobs.jpg')}`, Buffer.from(out.png.split(',')[1], 'base64'))
  console.log(f, out.blobs.map((b, k) => `${k}:(${b.x.toFixed(3)},${b.y.toFixed(3)}) a=${b.area}`).join(' '))
}
fs.writeFileSync(`${ROOT}/ball/blobs.json`, JSON.stringify(res, null, 1))
await browser.close()
