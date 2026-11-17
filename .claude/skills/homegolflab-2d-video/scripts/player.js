// Runtime de escenas 2D de HomeGolfLab. Una escena es una función pura del tiempo: draw(ctx, t, W, H, ui).
//
//   <canvas id="stage"></canvas>
//   <script src="/_hgl/player.js"></script>
//   <script>
//     HGL.scene({
//       width: 1280, height: 720, fps: 30, duration: 8,
//       controls: [{ id: 'variante', label: 'Swing', options: { bueno: 'Bueno', rapido: 'Rápido' } }],   // opcional
//       draw(ctx, t, W, H, ui) { /* dibujar todo lo del instante t; ui.variante = 'bueno' */ },
//     });
//   </script>
//
// - Abierta en el navegador: se reproduce en bucle, con pausa, barra de tiempo y los controles declarados
//   (así la escena es interactiva y sirve de demo).
// - Con ?render (lo usa render.mjs): no reproduce; expone window.renderFrame(t) y window.SCENE.
// - Los controles también se leen de la URL: ?variante=rapido.
(function () {
  const q = new URLSearchParams(location.search);
  const HGL = (window.HGL = { params: Object.fromEntries(q), rendering: q.has('render') });
  HGL.ease = {
    io: (u) => u * u * (3 - 2 * u),
    in: (u) => u * u,
    out: (u) => 1 - (1 - u) * (1 - u),
    lin: (u) => u,
  };
  /** Valor animado por claves [[tiempo, valor, suavizado del tramo que llega a esta clave], ...]. */
  HGL.keys = (t, ks) => {
    if (t <= ks[0][0]) return ks[0][1];
    for (let i = 1; i < ks.length; i++) {
      if (t <= ks[i][0]) {
        const [t0, v0] = ks[i - 1], [t1, v1, e] = ks[i];
        const u = (t - t0) / Math.max(1e-9, t1 - t0);
        return v0 + (v1 - v0) * (HGL.ease[e || 'io'](u));
      }
    }
    return ks[ks.length - 1][1];
  };
  HGL.roundRect = (ctx, x, y, w, h, r) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  };
  /** Segmento grueso de extremos redondos (para extremidades). */
  HGL.limb = (ctx, a, b, w, color) => {
    ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
  };

  HGL.scene = function (def) {
    const canvas = document.getElementById('stage');
    canvas.width = def.width; canvas.height = def.height;
    const ctx = canvas.getContext('2d');
    const ui = Object.assign({}, def.defaults || {});
    for (const c of def.controls || []) ui[c.id] = q.get(c.id) || Object.keys(c.options)[0];
    HGL.ui = ui;
    const draw = (t) => { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, def.width, def.height); def.draw(ctx, t, def.width, def.height, ui); };
    window.SCENE = { width: def.width, height: def.height, fps: def.fps || 30, duration: def.duration };
    window.renderFrame = (t) => { draw(t); return true; };
    if (HGL.rendering) { document.body.style.margin = '0'; canvas.style.display = 'block'; draw(0); return; }

    // ---- modo interactivo ----
    document.body.style.cssText = 'margin:0;background:#0E1B14;color:#fff;font:15px Inter,Segoe UI,sans-serif;display:flex;flex-direction:column;align-items:center;min-height:100vh';
    canvas.style.cssText = `max-width:100vw;max-height:calc(100vh - 110px);aspect-ratio:${def.width}/${def.height};background:#000`;
    const bar = document.createElement('div');
    bar.style.cssText = 'display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:10px 14px;width:100%;box-sizing:border-box;justify-content:center';
    bar.innerHTML = '<button id="hgl-play" style="padding:6px 14px;border-radius:8px;border:0;background:#276749;color:#fff;font-weight:600;cursor:pointer">Pausa</button><input id="hgl-seek" type="range" min="0" max="1000" value="0" style="flex:1;min-width:160px;max-width:420px"><span id="hgl-time" style="min-width:90px;font-variant-numeric:tabular-nums"></span>';
    document.body.appendChild(bar);
    for (const c of def.controls || []) {
      const s = document.createElement('select');
      s.style.cssText = 'padding:6px 10px;border-radius:8px;border:0';
      for (const [k, v] of Object.entries(c.options)) s.add(new Option(v, k, false, k === ui[c.id]));
      s.onchange = () => { ui[c.id] = s.value; t0 = performance.now(); playing = true; setPlay(); };
      bar.appendChild(s);
    }
    let playing = true, t0 = performance.now(), tPaused = 0;
    const playBtn = bar.querySelector('#hgl-play'), seek = bar.querySelector('#hgl-seek'), label = bar.querySelector('#hgl-time');
    const setPlay = () => { playBtn.textContent = playing ? 'Pausa' : 'Reproducir'; };
    playBtn.onclick = () => { if (playing) tPaused = (performance.now() - t0) / 1000; else t0 = performance.now() - tPaused * 1000; playing = !playing; setPlay(); };
    seek.oninput = () => { tPaused = (seek.value / 1000) * def.duration; t0 = performance.now() - tPaused * 1000; };
    const frame = () => {
      let t = playing ? ((performance.now() - t0) / 1000) % (def.duration + 0.6) : tPaused;
      t = Math.min(t, def.duration);
      draw(t);
      if (document.activeElement !== seek) seek.value = (t / def.duration) * 1000;
      label.textContent = `${t.toFixed(1)} / ${def.duration.toFixed(1)} s`;
      requestAnimationFrame(frame);
    };
    frame();
  };
})();
