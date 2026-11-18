// Monta el video pitch de HomeGolfLab (16:9, 1080p) a partir de:
//  - voz en off por escena y música (ElevenLabs), 2 fotos generadas
//  - capturas reales y logos del brand-kit
// Uso: node build.js <ffmpeg.exe> <ffprobe.exe> [stills|scenes|final|all]
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const [FFMPEG, FFPROBE, STEP = 'all'] = process.argv.slice(2);
const ROOT = __dirname;
const A = path.join(ROOT, 'assets');
const OUT = path.join(ROOT, 'build');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const DOWNLOADS = 'C:\\Users\\Ryan\\Downloads';
const BRAND = 'C:\\Users\\Ryan\\iCloudDrive\\Desktop\\HomeGolfLab_\\Repo\\brand-kit';
fs.mkdirSync(A, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });

// ---------- guion ----------
const SCENES = [
  { key: 's1', voice: 'La mayoría de l_2026-11-15T17_27_38', sub: 'C',
    text: 'La mayoría de los golfistas amateur llega a la cancha una vez por semana, o menos. El resto del tiempo practica en casa, sin guía y sin saber si lo que hace sirve. Un coach o un simulador cuestan demasiado para el día a día.' },
  { key: 's2', voice: 'HomeGolfLab con', sub: 'C',
    text: 'HomeGolfLab convierte tu teléfono en un laboratorio de práctica. En casa y en la cancha.' },
  { key: 's3', voice: 'Graba tu swing', sub: 'L',
    text: 'Graba tu swing y la app analiza tu postura, tu giro y tu tempo. Te dice qué corregir y con qué ejercicio.' },
  { key: 's4', voice: 'Con HomeLAB tom', sub: 'R',
    text: 'Con HomeLAB tomas una foto de tu espacio y la app arma tu sesión del día. Sin medir nada y sin hacer cálculos.' },
  { key: 's5', voice: 'El ball trackin', sub: 'L',
    text: 'El ball tracking mide la dirección y la velocidad de tus putts con la cámara, y en la cancha registra tus tiros para mostrarte tu dispersión por palo.' },
  { key: 's6', voice: 'Las medallas y', sub: 'R',
    text: 'Las medallas y los niveles te mantienen practicando.' },
  { key: 's7', voice: 'La app es grati', sub: 'C',
    text: 'La app es gratis, con anuncios en el tracking. Premium desbloquea el análisis de swing en vivo y quita los anuncios. Ganamos con ambos tipos de usuario.' },
  { key: 's8', voice: 'Ya tenemos un p', sub: 'C',
    text: 'Ya tenemos un prototipo funcionando y vamos por las tiendas de iOS y Android. HomeGolfLab. Practica en casa. Mejora en la cancha.' },
];
const LEAD = 0.45, TAIL = 0.55, XF = 0.4, END_HOLD = 2.6, FPS = 30;

// ---------- copiar insumos ----------
function copyAssets() {
  const dl = fs.readdirSync(DOWNLOADS);
  const find = (frag) => {
    const f = dl.find((n) => n.startsWith('ElevenLabs_') && n.includes(frag));
    if (!f) throw new Error('No encuentro en Descargas: ' + frag);
    return path.join(DOWNLOADS, f);
  };
  SCENES.forEach((s, i) => fs.copyFileSync(find(s.voice), path.join(A, `v${i + 1}.mp3`)));
  fs.copyFileSync(find('music-v2-5'), path.join(A, 'music.mp3'));
  fs.copyFileSync(find('Medium shot of'), path.join(A, 'photo_medium.png'));
  fs.copyFileSync(find('Wide shot of'), path.join(A, 'photo_wide.png'));
  for (const f of fs.readdirSync(path.join(BRAND, 'capturas'))) fs.copyFileSync(path.join(BRAND, 'capturas', f), path.join(A, f));
  for (const f of ['logo-horizontal-blanco-transparente.png', 'logo-horizontal.png', 'logo-icono.png'])
    fs.copyFileSync(path.join(BRAND, 'logos', f), path.join(A, f));
}
const dur = (f) => parseFloat(execFileSync(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString());

// ---------- capas HTML ----------
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Playfair+Display:wght@600;700&display=block');
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:1920px;height:1080px;overflow:hidden;background:transparent}
body{font-family:'Inter','Segoe UI',sans-serif;color:#0E1B14;position:relative}
.abs{position:absolute}
.chip{font-weight:700;font-size:24px;letter-spacing:.2em;text-transform:uppercase;color:#A97F14}
.chip.onphoto{color:#E8C04A}
h1{font-family:'Playfair Display',Georgia,serif;font-weight:700;font-size:84px;line-height:1.08;letter-spacing:-.01em}
h1 em{font-style:normal;color:#276749}
.pill{display:flex;align-items:center;gap:18px;background:#fff;border:2px solid #DCE5DF;border-radius:999px;padding:18px 34px 18px 20px;font-weight:600;font-size:34px;width:max-content;box-shadow:0 10px 30px rgba(14,27,20,.06)}
.dot{width:44px;height:44px;border-radius:50%;background:#276749;display:flex;align-items:center;justify-content:center;flex:none}
.dot svg{width:24px;height:24px}
.pills{display:flex;flex-direction:column;gap:20px}
.phone{position:absolute;top:50px;width:452px;height:980px;border-radius:60px;background:#0E1B14;padding:13px;box-shadow:0 40px 90px rgba(14,27,20,.28),0 8px 24px rgba(14,27,20,.18)}
.phone .scr{width:100%;height:100%;border-radius:48px;overflow:hidden;background:#F6F9F7}
.phone img{width:100%;display:block}
.card{background:#fff;border:2px solid #DCE5DF;border-radius:36px;box-shadow:0 24px 60px rgba(14,27,20,.10)}
`;
const CHECK = `<span class="dot"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span>`;
const pill = (t) => `<div class="pill">${CHECK}${t}</div>`;
const BG = `<div class="abs" style="inset:0;background:#F6F9F7"></div>
<div class="abs" style="width:900px;height:900px;border-radius:50%;left:-320px;top:-380px;background:#EAF0EC"></div>
<div class="abs" style="width:700px;height:700px;border-radius:50%;right:-260px;bottom:-330px;background:#EAF0EC"></div>`;
const phone = (img, side) => `<div class="phone" style="${side === 'right' ? 'left:1270px' : 'left:200px'}"><div class="scr"><img src="${img}"></div></div>`;
// columna de texto junto al teléfono
const colX = (side) => (side === 'right' ? 'left:130px' : 'left:800px');
const featTitle = (side, chip, h1) => `<div class="abs" style="${colX(side)};top:190px;width:1040px"><div class="chip">${chip}</div><h1 style="margin-top:26px">${h1}</h1></div>`;
const featPills = (side, items) => `<div class="abs pills" style="${colX(side)};top:560px">${items.map(pill).join('')}</div>`;

const days = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const LAYERS = {
  bg: BG,
  // --- escena 1
  s1a: `<div class="abs" style="left:0;right:0;bottom:0;height:640px;background:linear-gradient(to top,rgba(14,27,20,.92) 0%,rgba(14,27,20,.72) 42%,rgba(14,27,20,0) 100%)"></div>
    <div class="abs" style="left:120px;bottom:200px;width:1100px"><div class="chip onphoto">El problema</div>
    <h1 style="color:#fff;margin-top:22px">Practicar sin guía<br>no mejora tu juego</h1></div>`,
  s1b: `<div class="abs card" style="right:90px;top:80px;width:600px;padding:34px 38px">
    <div style="font-weight:700;font-size:22px;letter-spacing:.16em;text-transform:uppercase;color:#5E6E66">Tu semana de golf</div>
    <div style="display:flex;gap:12px;margin-top:22px">${days.map((d) => `<div style="flex:1;height:64px;border-radius:18px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:26px;${d === 'S' ? 'background:#276749;color:#fff' : 'background:#EAF0EC;color:#5E6E66'}">${d}</div>`).join('')}</div>
    <div style="margin-top:22px;font-weight:600;font-size:30px"><span style="color:#276749">1 día de cancha.</span> El resto, en casa.</div></div>`,
  s1c: `<div class="abs card" style="right:90px;top:360px;width:600px;padding:30px 38px;font-weight:600;font-size:30px;line-height:1.3">Coach o simulador:<br><span style="color:#5E6E66;font-weight:500">demasiado caros para el día a día</span></div>`,
  // --- escena 2
  s2a: `<div class="abs" style="left:0;right:0;bottom:0;height:680px;background:linear-gradient(to top,rgba(39,103,73,.96) 0%,rgba(39,103,73,.80) 45%,rgba(39,103,73,0) 100%)"></div>
    <img class="abs" src="logo-horizontal-blanco-transparente.png" style="left:60px;bottom:400px;width:640px">
    <div class="abs" style="left:120px;bottom:200px;width:1500px"><h1 style="color:#fff;font-size:80px">Tu laboratorio de golf, en tu teléfono</h1></div>`,
  // --- escenas de funciones
  s3a: featTitle('right', 'Análisis de swing', 'Graba tu swing.<br><em>Recibe qué corregir.</em>'),
  s3b: phone('02-analisis-de-swing.jpg', 'right'),
  s3c: featPills('right', ['Postura, giro y tempo', 'Qué corregir', 'Con qué ejercicio']),
  s4a: featTitle('left', 'HomeLAB', 'Una foto de tu espacio.<br><em>Un plan a tu medida.</em>'),
  s4b: phone('03-homelab-plan-del-dia.jpg', 'left'),
  s4c: featPills('left', ['Tu sesión del día, lista', 'Sin medir nada', 'Sin hacer cálculos']),
  s5a: featTitle('right', 'Ball tracking', 'Mide tus putts.<br><em>Mira tu dispersión.</em>'),
  s5b: phone('04-tracking-mapa-de-dispersion.jpg', 'right'),
  s5c: featPills('right', ['Dirección y velocidad del putt', 'En la cancha: dispersión por palo']),
  s6a: featTitle('left', 'Medallas y niveles', 'Cada sesión<br><em>cuenta.</em>'),
  s6b: phone('05-logros-medallas.jpg', 'left'),
  // --- escena 7
  s7a: `<div class="abs" style="left:0;right:0;top:90px;text-align:center"><div class="chip">Modelo de negocio</div>
    <h1 style="margin-top:22px;font-size:76px">Gratis con anuncios. <em>Premium sin límites.</em></h1></div>`,
  s7b: `<div class="abs card" style="left:270px;top:370px;width:650px;height:400px;padding:44px 48px">
    <div style="font-family:'Playfair Display',Georgia,serif;font-weight:700;font-size:64px">Gratis</div>
    <div class="pills" style="margin-top:34px;gap:22px"><div style="display:flex;gap:18px;align-items:center;font-weight:600;font-size:33px">${CHECK}Un video de swing al día</div>
    <div style="display:flex;gap:18px;align-items:center;font-weight:600;font-size:33px">${CHECK}Tracking con anuncios</div></div></div>`,
  s7c: `<div class="abs card" style="left:1000px;top:370px;width:650px;height:400px;padding:44px 48px;background:#276749;border-color:#276749;color:#fff">
    <div style="font-family:'Playfair Display',Georgia,serif;font-weight:700;font-size:64px">Premium <span style="display:inline-block;width:18px;height:18px;border-radius:50%;background:#E8C04A;vertical-align:middle;margin-left:6px"></span></div>
    <div class="pills" style="margin-top:34px;gap:22px"><div style="display:flex;gap:18px;align-items:center;font-weight:600;font-size:33px"><span class="dot" style="background:#E8C04A"><svg viewBox="0 0 24 24" fill="none" stroke="#0E1B14" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span>Análisis de swing en vivo</div>
    <div style="display:flex;gap:18px;align-items:center;font-weight:600;font-size:33px"><span class="dot" style="background:#E8C04A"><svg viewBox="0 0 24 24" fill="none" stroke="#0E1B14" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span>Sin anuncios</div></div></div>`,
  s7d: `<div class="abs" style="left:0;right:0;top:812px;text-align:center;font-weight:600;font-size:34px;color:#276749">Ganamos con ambos tipos de usuario</div>`,
  // --- escena 8
  s8bg: `<div class="abs" style="inset:0;background:linear-gradient(135deg,#276749 0%,#428A68 100%)"></div>
    <div class="abs" style="width:1000px;height:1000px;border-radius:50%;right:-380px;top:-420px;background:rgba(255,255,255,.05)"></div>
    <div class="abs" style="width:800px;height:800px;border-radius:50%;left:-300px;bottom:-400px;background:rgba(255,255,255,.05)"></div>`,
  s8a: `<img class="abs" src="logo-horizontal-blanco-transparente.png" style="left:435px;top:150px;width:1050px">`,
  s8b: `<div class="abs" style="left:0;right:0;top:650px;display:flex;justify-content:center;gap:26px">
    ${['Prototipo funcionando', 'Próximamente en iOS y Android'].map((t) => `<div style="border:2px solid rgba(255,255,255,.55);border-radius:999px;padding:16px 34px;font-weight:600;font-size:32px;color:#fff;background:rgba(255,255,255,.10)">${t}</div>`).join('')}</div>`,
  s8c: `<div class="abs" style="left:0;right:0;top:455px;text-align:center"><div style="width:90px;height:5px;border-radius:3px;background:#E8C04A;margin:0 auto 34px"></div>
    <h1 style="color:#fff;font-size:72px">Practica en casa. Mejora en la cancha.</h1></div>`,
};

// capas por escena: [nombre, segundo en que aparece]
const COMP = {
  s1: { photo: 'photo_medium.png', layers: [['s1a', 0.4], ['s1b', 1.6], ['s1c', 10.8]] },
  s2: { photo: 'photo_wide.png', layers: [['s2a', 0.35]] },
  s3: { layers: [['bg', -1], ['s3a', 0.25], ['s3b', 0.45], ['s3c', 2.6]] },
  s4: { layers: [['bg', -1], ['s4a', 0.25], ['s4b', 0.45], ['s4c', 3.2]] },
  s5: { layers: [['bg', -1], ['s5a', 0.25], ['s5b', 0.45], ['s5c', 1.8]] },
  s6: { layers: [['bg', -1], ['s6a', 0.25], ['s6b', 0.4]] },
  s7: { layers: [['bg', -1], ['s7a', 0.25], ['s7b', 0.6], ['s7c', 3.3], ['s7d', 7.4]] },
  s8: { layers: [['s8bg', -1], ['s8a', 0.3], ['s8b', 1.0], ['s8c', 5.4]] },
};

function renderStills() {
  for (const [name, inner] of Object.entries(LAYERS)) {
    const html = path.join(A, `_${name}.html`);
    fs.writeFileSync(html, `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body>${inner}</body></html>`);
    const png = path.join(OUT, `${name}.png`);
    if (fs.existsSync(png)) fs.unlinkSync(png);
    try {
      execFileSync(EDGE, ['--headless', '--disable-gpu', '--hide-scrollbars', '--default-background-color=00000000',
        '--window-size=1920,1080', '--force-device-scale-factor=1', '--virtual-time-budget=6000',
        `--user-data-dir=${path.join(OUT, '_edge')}`, `--screenshot=${png}`, 'file:///' + html.replace(/\\/g, '/')], { stdio: 'ignore', timeout: 60000 });
    } catch (e) { /* Edge a veces sale con código != 0 aunque escribió el PNG */ }
    if (!fs.existsSync(png)) throw new Error('Edge no generó ' + png);
    console.log('still', name);
  }
}

function ff(args) { execFileSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit', cwd: OUT }); }

function timeline() {
  let t = 0;
  return SCENES.map((s, i) => {
    const a = dur(path.join(A, `v${i + 1}.mp3`));
    const L = LEAD + a + TAIL + (i === SCENES.length - 1 ? END_HOLD : 0);
    const o = { ...s, i, a, L, start: t, vstart: t + LEAD };
    t += L - XF;
    return o;
  });
}

function renderScenes(tl) {
  for (const s of tl) {
    const c = COMP[s.key];
    const L = s.L.toFixed(3);
    const N = Math.ceil(s.L * FPS);
    const inputs = [];
    const f = [];
    let idx = 0, last;
    if (c.photo) {
      inputs.push('-i', path.join(A, c.photo));
      f.push(`[0:v]scale=3840:2160:flags=lanczos,zoompan=z='1+0.09*on/${N}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${N}:s=1920x1080:fps=${FPS},format=rgba[b0]`);
      last = 'b0'; idx = 1;
    }
    for (const [name, at] of c.layers) {
      inputs.push('-loop', '1', '-framerate', String(FPS), '-t', L, '-i', `${name}.png`);
      if (at < 0 && !last) { f.push(`[${idx}:v]format=rgba[b${idx}]`); last = `b${idx}`; }
      else {
        f.push(`[${idx}:v]format=rgba,fade=t=in:st=${at}:d=0.5:alpha=1[l${idx}]`);
        f.push(`[${last}][l${idx}]overlay=x=0:y='26*pow(1-min(max((t-${at})/0.7,0),1),3)':format=auto[b${idx}]`);
        last = `b${idx}`;
      }
      idx++;
    }
    f.push(`[${last}]format=yuv420p[v]`);
    ff([...inputs, '-filter_complex', f.join(';'), '-map', '[v]', '-t', L, '-r', String(FPS), '-c:v', 'libx264', '-preset', 'medium', '-crf', '14', `${s.key}.mp4`]);
    console.log('scene', s.key, L);
  }
}

// ---------- subtítulos ----------
function chunks(text) {
  const parts = text.split(/(?<=[.,])\s+/);
  const out = [];
  for (const p of parts) {
    if (out.length && (out[out.length - 1] + ' ' + p).length <= 62) out[out.length - 1] += ' ' + p;
    else out.push(p);
  }
  return out;
}
const ts = (x) => { const h = Math.floor(x / 3600), m = Math.floor((x % 3600) / 60), s = (x % 60).toFixed(2).padStart(5, '0'); return `${h}:${String(m).padStart(2, '0')}:${s}`; };
function writeAss(tl) {
  const st = (n, l, r) => `Style: ${n},Segoe UI Semibold,44,&H00FFFFFF,&H00FFFFFF,&H380E1B14,&H00000000,0,0,0,0,100,100,0,0,3,14,0,2,${l},${r},46,1`;
  let ass = `[Script Info]\nScriptType: v4.00+\nPlayResX: 1920\nPlayResY: 1080\nWrapStyle: 0\nScaledBorderAndShadow: yes\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n${st('C', 300, 300)}\n${st('L', 110, 780)}\n${st('R', 780, 110)}\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n`;
  let srt = '', n = 1;
  for (const s of tl) {
    const cs = chunks(s.text);
    const total = cs.reduce((x, c) => x + c.length, 0);
    let t = s.vstart;
    for (const c of cs) {
      const d = (s.a * c.length) / total;
      ass += `Dialogue: 0,${ts(t)},${ts(t + d - 0.04)},${s.sub},,0,0,0,,${c}\n`;
      const srtTs = (x) => ts(x).replace('.', ',').padStart(11, '0') + '0';
      srt += `${n++}\n${srtTs(t)} --> ${srtTs(t + d - 0.04)}\n${c}\n\n`;
      t += d;
    }
  }
  fs.writeFileSync(path.join(OUT, 'subs.ass'), ass, 'utf8');
  fs.writeFileSync(path.join(ROOT, 'HomeGolfLab-pitch.srt'), srt, 'utf8');
}

function renderFinal(tl) {
  writeAss(tl);
  const total = tl[tl.length - 1].start + tl[tl.length - 1].L;
  const inputs = [];
  tl.forEach((s) => inputs.push('-i', `${s.key}.mp4`));
  tl.forEach((s) => inputs.push('-i', path.join(A, `v${s.i + 1}.mp3`)));
  inputs.push('-i', path.join(A, 'music.mp3'));
  const n = tl.length, f = [];
  let last = '0:v';
  for (let i = 1; i < n; i++) {
    f.push(`[${last}][${i}:v]xfade=transition=fade:duration=${XF}:offset=${tl[i].start.toFixed(3)}[x${i}]`);
    last = `x${i}`;
  }
  f.push(`[${last}]ass=subs.ass,fade=t=in:st=0:d=0.4,fade=t=out:st=${(total - 0.6).toFixed(3)}:d=0.6,format=yuv420p[v]`);
  tl.forEach((s, i) => {
    const ms = Math.round(s.vstart * 1000);
    f.push(`[${n + i}:a]aresample=48000,aformat=channel_layouts=stereo,adelay=${ms}|${ms}[a${i}]`);
  });
  f.push(`${tl.map((_, i) => `[a${i}]`).join('')}amix=inputs=${n}:normalize=0,volume=1.25[voz]`);
  f.push(`[${2 * n}:a]aresample=48000,aformat=channel_layouts=stereo,volume=0.11,afade=t=in:st=0:d=1.2,afade=t=out:st=${(total - 2.4).toFixed(3)}:d=2.4[mus]`);
  f.push(`[voz][mus]amix=inputs=2:normalize=0:duration=longest,alimiter=limit=0.95[a]`);
  ff([...inputs, '-filter_complex', f.join(';'), '-map', '[v]', '-map', '[a]', '-t', total.toFixed(3),
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', String(FPS),
    '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', path.join(ROOT, 'HomeGolfLab-pitch.mp4')]);
  console.log('final', total.toFixed(2) + ' s');
}

if (!fs.existsSync(path.join(A, 'v1.mp3'))) copyAssets();
const tl = timeline();
tl.forEach((s) => console.log(s.key, 'inicio', s.start.toFixed(2), 'voz', s.vstart.toFixed(2), 'dur', s.L.toFixed(2)));
if (STEP === 'stills' || STEP === 'all') renderStills();
if (STEP === 'scenes' || STEP === 'all') renderScenes(tl);
if (STEP === 'final' || STEP === 'all') renderFinal(tl);
