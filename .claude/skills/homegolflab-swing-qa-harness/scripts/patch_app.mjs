// Aplica los ganchos de depuración a la COPIA de la app (harness/app). No toca el repo.
import fs from 'node:fs'
import { ROOT } from './_cfg.mjs'
// Uso: node patch_app.mjs [carpeta de la copia]  (por defecto $HGL_PRUEBAS/harness/app)
const APP = (process.argv[2] || `${ROOT}/harness/app`).replace(/\\/g, '/') + '/src'

function patch(file, pairs) {
  let s = fs.readFileSync(file, 'utf8')
  for (const [a, b] of pairs) {
    if (!s.includes(a)) throw new Error('No encontrado en ' + file + ': ' + a.slice(0, 70))
    if (s.includes('__hglDebug') && a.includes('const sampled = await sampleVideo')) { console.log('ya parcheado', file); return }
    s = s.replace(a, b)
  }
  fs.writeFileSync(file, s)
  console.log('parcheado', file)
}

patch(`${APP}/pages/Swing.tsx`, [
  [`      const sampled = await sampleVideo(v, pose, dur, aspect, setProgress);
      let frames = sampled.frames;
      let r = analyzeSwing(frames, { lefty: profile.lefty, view, aspect, sampled: sampled.sampled });`,
   `      const dbg: any = ((window as any).__hglDebug = { done: false, t0: performance.now(), view, aspect, dur, videoW: v.videoWidth, videoH: v.videoHeight });
      const sampled = await sampleVideo(v, pose, dur, aspect, setProgress);
      let frames = sampled.frames;
      dbg.sampled = { n: sampled.sampled, got: sampled.frames.length, coarse: sampled.coarse ? { n: sampled.coarse.sampled, got: sampled.coarse.frames.length } : null };
      dbg.frames = sampled.frames; dbg.coarseFrames = sampled.coarse?.frames ?? null;
      dbg.window = findSwingWindow((sampled.coarse?.frames ?? sampled.frames), { aspect });
      let r = analyzeSwing(frames, { lefty: profile.lefty, view, aspect, sampled: sampled.sampled });
      dbg.fineResult = r; dbg.usedCoarse = false;`],
  [`        if (typeof c !== 'string') { r = c; frames = sampled.coarse.frames; }
      }
      if (typeof r === 'string') setError(SWING_ERROR_TEXT[r]);
      else {
        const start = frames.find((x) => x.t === r.times?.address);
        if (start) {
          const fr = framingCheck(start.lm);
          // Con varios swings se analiza el último (el de la bola suele ser el último): se dice, para que no parezca un error.
          const several = sampled.swings > 1 ? \`Se vieron \${sampled.swings} swings en el video; se analizó el último. \` : '';
          if (several || !fr.ok) setWarn(several + (fr.ok ? '' : \`Encuadre mejorable. \${fr.hint}. Algunas medidas pueden salir menos precisas.\`));
          // El palo es un extra: si algo falla al buscarlo, el análisis del cuerpo se muestra igual.
          try {
            const key = await captureKeyFrames(v, frames, r);
            setShots(key.shots);
            r.club = readClub(r.view ?? 'frente', key.address, key.top, targetSide(start.lm, r.lefty ?? profile.lefty)) ?? undefined;
          } catch { /* sin fotos ni palo */ }
        }`,
   `        dbg.coarseResult = c;
        if (typeof c !== 'string') { r = c; frames = sampled.coarse.frames; dbg.usedCoarse = true; }
      }
      dbg.result = r; dbg.analysisFrames = frames;
      if (typeof r === 'string') { setError(SWING_ERROR_TEXT[r]); dbg.errorText = SWING_ERROR_TEXT[r]; }
      else {
        const start = frames.find((x) => x.t === r.times?.address);
        if (start) {
          const fr = framingCheck(start.lm);
          dbg.framing = fr; dbg.framingFrame = start;
          // Con varios swings se analiza el último (el de la bola suele ser el último): se dice, para que no parezca un error.
          const several = sampled.swings > 1 ? \`Se vieron \${sampled.swings} swings en el video; se analizó el último. \` : '';
          if (several || !fr.ok) { setWarn(several + (fr.ok ? '' : \`Encuadre mejorable. \${fr.hint}. Algunas medidas pueden salir menos precisas.\`)); dbg.warnText = several + (fr.ok ? '' : \`Encuadre mejorable. \${fr.hint}.\`); dbg.swings = sampled.swings; }
          // El palo es un extra: si algo falla al buscarlo, el análisis del cuerpo se muestra igual.
          try {
            const key = await captureKeyFrames(v, frames, r);
            setShots(key.shots);
            dbg.shots = key.shots.map((s) => ({ label: s.label, url: s.url })); dbg.shaftAddress = key.address; dbg.shaftTop = key.top;
            r.club = readClub(r.view ?? 'frente', key.address, key.top, targetSide(start.lm, r.lefty ?? profile.lefty)) ?? undefined;
            dbg.club = r.club ?? null;
          } catch (e) { dbg.clubError = String(e); /* sin fotos ni palo */ }
        }`],
  [`      setError('No se pudo analizar el video. ' + (e instanceof Error ? e.message : ''));
    } finally {
      setBusy(false);
    }`,
   `      setError('No se pudo analizar el video. ' + (e instanceof Error ? e.message : ''));
      const d = (window as any).__hglDebug; if (d) d.thrown = 'No se pudo analizar el video. ' + (e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      const d = (window as any).__hglDebug; if (d) { d.done = true; d.ms = Math.round(performance.now() - d.t0); }
    }`],
])

patch(`${APP}/components/VideoFlight.tsx`, [
  [`      v.pause();
      tracker = new BallTracker(tap, { w, h });`,
   `      v.pause();
      const dbg: any = ((window as any).__hglBall = { done: false, tap, startT, fps, w, h, aspect, frames: [] as any[] });
      tracker = new BallTracker(tap, { w, h });`],
  [`        if (prev && !framesIdentical(prev, cur)) {
          tracker.feed(prev, cur, tMs);
          if (tracker.done) break;
        }
        prev = cur;`,
   `        if (prev && !framesIdentical(prev, cur)) {
          const before = tracker.points.length;
          tracker.feed(prev, cur, tMs);
          dbg.frames.push({ t: tMs, det: tracker.points.length > before, skipped: false });
          if (tracker.done) break;
        } else dbg.frames.push({ t: tMs, det: false, skipped: !!prev });
        prev = cur;`],
  [`      const res = tracker.result();
      setOut({ res, summary: summarizeFlight(res, aspect) });
      setProgress(100);`,
   `      const res = tracker.result();
      setOut({ res, summary: summarizeFlight(res, aspect) });
      setProgress(100);
      dbg.res = res; dbg.summary = summarizeFlight(res, aspect); dbg.done = true;`],
])
