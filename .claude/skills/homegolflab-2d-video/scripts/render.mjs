#!/usr/bin/env node
// Renderiza una escena HTML animada (canvas) a MP4, cuadro por cuadro y sin depender de tiempo real.
//
//   node render.mjs --scene <escena.html> --out <salida.mp4> [--query "variante=bueno"]
//                   [--fps 30] [--audio voz.mp3] [--music musica.mp3 --music-vol 0.12]
//                   [--start 0] [--end <s>] [--poster foto.png]
//
// La escena define window.SCENE = { width, height, fps, duration } y window.renderFrame(t) (ver player.js).
// Herramientas (puppeteer-core + ffmpeg-static) viven fuera del repo: HGL_VIDEO_TOOLS
// (por defecto C:/Users/Ryan/dev/hgl-video-tools). Instalación en SKILL.md.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TOOLS = process.env.HGL_VIDEO_TOOLS || 'C:/Users/Ryan/dev/hgl-video-tools';
const req = createRequire(path.join(TOOLS, 'package.json'));
const puppeteer = req('puppeteer-core');
const FFMPEG = process.env.FFMPEG || req('ffmpeg-static');

const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a.startsWith('--')) args[a.slice(2)] = process.argv[i + 1]?.startsWith('--') || process.argv[i + 1] === undefined ? true : process.argv[++i];
}
if (!args.scene || !args.out) {
  console.error('Uso: node render.mjs --scene escena.html --out video.mp4 [--query "a=b"] [--fps 30] [--audio x.mp3]');
  process.exit(1);
}

const BROWSERS = [
  process.env.HGL_BROWSER,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
].filter(Boolean);
const browser = BROWSERS.find((p) => fs.existsSync(p));
if (!browser) { console.error('No encuentro Edge ni Chrome. Define HGL_BROWSER.'); process.exit(1); }

const scenePath = path.resolve(args.scene);
const sceneDir = path.dirname(scenePath);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.json': 'application/json', '.webp': 'image/webp' };

// Servidor local: "/" = carpeta de la escena (y sus hermanas hacia arriba hasta la skill), "/_hgl/" = scripts de la skill.
const SKILL_ROOT = path.resolve(HERE, '..');
const server = http.createServer((rq, rs) => {
  const url = decodeURIComponent(rq.url.split('?')[0]);
  const base = url.startsWith('/_hgl/') ? HERE : url.startsWith('/_skill/') ? SKILL_ROOT : sceneDir;
  const rel = url.startsWith('/_hgl/') ? url.slice(6) : url.startsWith('/_skill/') ? url.slice(8) : url.slice(1) || path.basename(scenePath);
  const file = path.resolve(base, rel);
  if (!file.startsWith(base) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { rs.writeHead(404); rs.end('no encontrado'); return; }
  rs.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(rs);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const bro = await puppeteer.launch({ executablePath: browser, headless: true, args: ['--no-sandbox', '--hide-scrollbars', '--force-device-scale-factor=1'] });
try {
  const page = await bro.newPage();
  page.on('pageerror', (e) => console.error('[pagina]', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.error('[consola]', m.text()); });
  const q = new URLSearchParams(typeof args.query === 'string' ? args.query : '');
  q.set('render', '1');
  await page.goto(`http://127.0.0.1:${port}/${path.basename(scenePath)}?${q}`, { waitUntil: 'load' });
  await page.waitForFunction('window.SCENE && window.renderFrame', { timeout: 20000 });
  if (page.evaluate) await page.evaluate(() => document.fonts?.ready);
  const scene = await page.evaluate(() => window.SCENE);
  const fps = Number(args.fps || scene.fps || 30);
  const t0 = Number(args.start || 0);
  const t1 = Number(args.end || scene.duration);
  const total = Math.round((t1 - t0) * fps);
  await page.setViewport({ width: scene.width, height: scene.height, deviceScaleFactor: 1 });
  await page.evaluate(() => window.renderFrame(0));

  const out = path.resolve(args.out);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const inputs = ['-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-'];
  const filters = [];
  const maps = ['-map', '0:v'];
  let n = 1;
  const audioIdx = [];
  if (args.audio) { inputs.push('-i', path.resolve(args.audio)); audioIdx.push([n++, 1.0]); }
  if (args.music) { inputs.push('-i', path.resolve(args.music)); audioIdx.push([n++, Number(args['music-vol'] || 0.12)]); }
  let audioArgs = ['-an'];
  if (audioIdx.length) {
    const parts = audioIdx.map(([i, v]) => `[${i}:a]aresample=48000,volume=${v}[a${i}]`);
    parts.push(`${audioIdx.map(([i]) => `[a${i}]`).join('')}amix=inputs=${audioIdx.length}:normalize=0:duration=longest[a]`);
    filters.push('-filter_complex', parts.join(';'));
    maps.push('-map', '[a]');
    audioArgs = ['-c:a', 'aac', '-b:a', '192k'];
  }
  const ff = spawn(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', ...inputs, ...filters, ...maps, '-t', String(total / fps), '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p', '-r', String(fps), ...audioArgs, '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((res, rej) => { ff.on('exit', (c) => (c === 0 ? res() : rej(new Error('ffmpeg salió con ' + c)))); });
  ff.stdin.on('error', () => {});

  for (let i = 0; i < total; i++) {
    const t = t0 + i / fps;
    await page.evaluate((tt) => window.renderFrame(tt), t);
    const buf = await page.screenshot({ type: 'jpeg', quality: 94 });
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    if (i === Math.floor(total / 2) && args.poster) fs.writeFileSync(path.resolve(args.poster), await page.screenshot({ type: 'png' }));
  }
  ff.stdin.end();
  await done;
  console.log(`OK ${out}  ${scene.width}x${scene.height}  ${total} cuadros a ${fps} fps  (${(total / fps).toFixed(2)} s)`);
} finally {
  await bro.close();
  server.close();
}
