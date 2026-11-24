import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
import { debugReview, type DebugBag } from '@/lib/debugHook';
import { frameOf, makeClock, type Clock } from '@/lib/media/clock';
import type { PoseTrack } from '@/lib/media/poseTrack';
import { getMediaStore, MEDIA_ERROR_TEXT, MediaStoreError, type MediaRef } from '@/lib/media/store';
import { buildDrawList, paint } from '@/lib/overlay/draw';
import { makeViewport } from '@/lib/overlay/viewport';
import {
  estimateFps, needsReview, nudgeMark, PHASE_KEYS, phaseLabel, phaseMarks, seekTimeForFrame, seekTimeForMark, speedLabel, SPEEDS, stepFrame, validOrder,
  type FrameSample, type PhaseKey, type PhaseMark, type Speed,
} from '@/lib/reviewPlayer';
import { DEFAULT_GUIDES, guideLabel, guidesAllowed, guidesAt, headUsesNose, hiddenGuides, reviewModelAt, type GuideSet } from '@/lib/swingReview';
import type { SwingResult } from '@/lib/swing';
import { Button, Notice, Segmented } from '@/components/ui';
import ExportSheet from '@/components/ExportSheet';
import { useFlags } from '@/lib/flags';
import { useStore } from '@/store';
import { fmtNumber, t } from '@/i18n';

interface Props {
  r: SwingResult;
  mediaId: string;
  poseTrackId?: string;
  /** Ajustes manuales de fase guardados antes (MediaMs); se avisa de los nuevos con `onManual`. */
  manual?: Partial<Record<PhaseKey, number>>;
  onManual?: (m: Partial<Record<PhaseKey, number>>) => void;
}

const chip = (on: boolean) => `h-9 px-3 rounded-full text-xs font-semibold border transition ${on ? 'bg-primary text-primary-foreground border-primary' : 'bg-card border-border text-foreground'}`;

/**
 * Revisión del swing (plan 3.1 / F3.3): el video REAL (sin recompresión ni recorte, color original) con un lienzo del mismo
 * tamaño encima que dibuja el esqueleto y las guías con el mismo compositor que usará la exportación. El dibujo se sincroniza
 * con el cuadro PRESENTADO (`requestVideoFrameCallback`); sin esa función se usa `seeked`/`timeupdate`.
 */
export default function VideoReview({ r, mediaId, poseTrackId, manual: manualIn, onManual }: Props) {
  const flags = useFlags();
  const premium = useStore((s) => s.profile.premium);
  const [exporting, setExporting] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const tRef = useRef(0);                                  // instante mostrado (ms de medio)
  const lastUi = useRef(0);
  const samples = useRef<FrameSample[]>([]);
  const dbg = useRef<DebugBag | null>(null);

  const [url, setUrl] = useState<string | null>(null);
  const [ref, setRef] = useState<MediaRef | null>(null);
  const [track, setTrack] = useState<PoseTrack | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [clock, setClock] = useState<Clock>(() => makeClock({ fpsNominal: 30, fpsSource: 'estimated' }));
  const [manual, setManual] = useState<Partial<Record<PhaseKey, number>>>(manualIn ?? {});
  const [active, setActive] = useState<PhaseKey | null>(null);
  const [guides, setGuides] = useState<GuideSet>(DEFAULT_GUIDES[r.view ?? 'frente']);
  const [skeleton, setSkeleton] = useState(true);
  const [lefty, setLefty] = useState(r.lefty ?? false);
  const [speed, setSpeed] = useState<Speed>(1);
  const [playing, setPlaying] = useState(false);
  const [uiT, setUiT] = useState(0);
  const [hidden, setHidden] = useState<string[]>([]);
  const [orderError, setOrderError] = useState(false);
  /** Mientras la sonda de fps corre (≈1 s tras cargar) los controles quedan bloqueados: así nada compite con ella. */
  const [probing, setProbing] = useState(false);

  const times = r.times;
  const marks = useMemo<PhaseMark[]>(() => (times ? phaseMarks(clock, times, manual, r.phaseConf) : []), [clock, times, manual, r.phaseConf]);
  const allowed = guidesAllowed(r.view, r.viewMismatch, 'auto');
  const useNose = useMemo(() => (track ? headUsesNose(track) : false), [track]);

  /* Carga del video y de la pista guardados. */
  useEffect(() => {
    let revoked = false, made: string | null = null;
    (async () => {
      try {
        const st = await getMediaStore();
        const { ref: mr, blob } = await st.getMedia(mediaId);
        const tr = poseTrackId ? await st.loadPoseTrack(poseTrackId) : null;
        if (revoked) return;
        made = URL.createObjectURL(blob);
        setRef(mr); setTrack(tr); setUrl(made); setClock(mr.clock);
      } catch (e) { if (!revoked) setError(e instanceof MediaStoreError ? MEDIA_ERROR_TEXT[e.code] : MEDIA_ERROR_TEXT.unavailable); }
    })();
    return () => { revoked = true; if (made) URL.revokeObjectURL(made); };
  }, [mediaId, poseTrackId]);

  /** Dibuja el overlay del instante `tMs` con el compositor único. */
  const draw = useCallback((tMs: number) => {
    const c = canvasRef.current, w = wrapRef.current;
    if (!c || !w || !ref) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1), cw = Math.round(w.clientWidth * dpr), ch = Math.round(w.clientHeight * dpr);
    if (c.width !== cw || c.height !== ch) { c.width = cw; c.height = ch; }
    const ctx = c.getContext('2d');
    if (!ctx || !times || !track) return;
    ctx.clearRect(0, 0, cw, ch);
    const rc = { track, lefty, view: r.view ?? 'frente', times };
    const on: GuideSet = allowed ? guides : { head: false, torso: false, leadArm: false, hips: false };
    const model = reviewModelAt(rc, tMs, on, { skeleton: allowed && skeleton }, { useNose });
    paint(ctx, buildDrawList(model, tMs, makeViewport(ref.w, ref.h, { x: 0, y: 0, w: cw, h: ch })));
    const h = hiddenGuides(guidesAt(rc, tMs, on, { useNose })).map((k) => guideLabel(k));
    setHidden((prev) => (prev.join() === h.join() ? prev : h));
  }, [ref, track, times, lefty, guides, skeleton, allowed, useNose, r.view]);

  /* Sincroniza el dibujo con el cuadro presentado. */
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !url) return;
    let stop = false, id = 0;
    if (import.meta.env.DEV) dbg.current = debugReview({ frames: 0 });
    const onFrame = (tMs: number, meta?: VideoFrameCallbackMetadata) => {
      tRef.current = tMs;
      draw(tMs);
      if (meta) {
        samples.current.push({ mediaTime: meta.mediaTime, presentedFrames: meta.presentedFrames });
        if (samples.current.length > 40) samples.current.shift();
      }
      if (dbg.current) Object.assign(dbg.current, { mediaTime: meta?.mediaTime ?? tMs / 1000, presentedFrames: meta?.presentedFrames ?? null, currentTime: v.currentTime, frame: frameOf(clock, tMs), t: tMs, frames: ((dbg.current.frames as number) || 0) + 1 });
      const now = performance.now();
      if (now - lastUi.current > 90) { lastUi.current = now; setUiT(tMs); }
    };
    const cb = (_n: number, meta: VideoFrameCallbackMetadata) => { if (stop) return; onFrame(meta.mediaTime * 1000, meta); id = v.requestVideoFrameCallback(cb); };
    const hasRvfc = typeof v.requestVideoFrameCallback === 'function';
    const fallback = () => onFrame(v.currentTime * 1000);
    if (hasRvfc) id = v.requestVideoFrameCallback(cb);
    else { v.addEventListener('timeupdate', fallback); v.addEventListener('seeked', fallback); }
    const onSeeked = () => { samples.current = []; };
    v.addEventListener('seeked', onSeeked);
    return () => { stop = true; if (hasRvfc) v.cancelVideoFrameCallback(id); else { v.removeEventListener('timeupdate', fallback); v.removeEventListener('seeked', fallback); } v.removeEventListener('seeked', onSeeked); };
  }, [url, draw, clock]);

  /* Redibuja al cambiar guías, mano, esqueleto o tamaño sin esperar un cuadro nuevo. */
  useEffect(() => { draw(tRef.current); }, [draw]);
  useEffect(() => {
    const w = wrapRef.current;
    if (!w || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => draw(tRef.current));
    ro.observe(w);
    return () => ro.disconnect();
  }, [draw, url]);

  /* Estimación de fps mientras se reproduce (solo si el reloj sigue siendo una estimación). */
  useEffect(() => {
    if (!playing || clock.fpsSource !== 'estimated') return;
    const id = setInterval(() => {
      const f = estimateFps(samples.current);
      if (f && f !== clock.fpsNominal) setClock((c) => makeClock({ ...c, fpsNominal: f, fpsSource: 'estimated' }));
    }, 700);
    return () => clearInterval(id);
  }, [playing, clock]);

  const seek = (ms: number) => { const v = videoRef.current; if (v) v.currentTime = ms / 1000; };

  /**
   * Al cargar, si el reloj guardado es solo una estimación, se reproduce un instante en mudo a 0,5× para medir el intervalo
   * real entre cuadros con `requestVideoFrameCallback` y se vuelve al inicio. Sin evidencia suficiente se deja el valor
   * guardado (el usuario puede corregirlo con los botones 30/60).
   */
  const probeFps = async () => {
    const v = videoRef.current;
    let c = clock;
    if (v && clock.fpsSource === 'estimated' && typeof v.requestVideoFrameCallback === 'function') {
      setProbing(true);
      samples.current = [];
      v.playbackRate = 0.5;
      try { await v.play(); await new Promise((res) => setTimeout(res, 900)); } catch { /* sin reproducción automática: se deja la estimación */ }
      v.pause(); v.playbackRate = speed;
      const f = estimateFps(samples.current);
      if (f) { c = makeClock({ ...clock, fpsNominal: f, fpsSource: 'estimated' }); setClock(c); }
      samples.current = [];
      setProbing(false);
    }
    if (times) seek(seekTimeForFrame(c, frameOf(c, times.address)));
  };
  const pause = () => { videoRef.current?.pause(); setPlaying(false); };

  const goPhase = (k: PhaseKey) => { const m = marks.find((x) => x.key === k); if (!m) return; pause(); setActive(k); seek(seekTimeForMark(clock, m)); };
  const step = (dir: number) => { pause(); seek(seekTimeForFrame(clock, stepFrame(clock, tRef.current, dir, Math.round(((ref?.durationMs ?? 0) * clock.fpsNominal) / 1000)))); };
  const adjust = (dir: number) => {
    const m = marks.find((x) => x.key === active);
    if (!m) return;
    const next = nudgeMark(clock, m, dir);
    if (!validOrder(marks.map((x) => (x.key === m.key ? next : x)))) { setOrderError(true); return; }
    setOrderError(false);
    const nm = { ...manual, [m.key]: next.t };
    setManual(nm); onManual?.(nm);
    seek(seekTimeForFrame(clock, next.frame));
  };
  const togglePlay = () => { const v = videoRef.current; if (!v) return; if (v.paused) { void v.play(); setPlaying(true); } else pause(); };
  const setRate = (s: Speed) => { setSpeed(s); if (videoRef.current) videoRef.current.playbackRate = s; };

  if (error) return <Notice tone="error">{error}</Notice>;
  if (!times) return null;
  const from = track?.fromMs ?? 0, to = track?.toMs ?? (ref?.durationMs ?? 1000);

  return (
    <div className="space-y-3" data-review>
      <div ref={wrapRef} className="relative w-full mx-auto rounded-xl overflow-hidden bg-black" style={ref ? { aspectRatio: `${ref.w} / ${ref.h}`, maxHeight: '70vh' } : { minHeight: 200 }}>
        {url && <video ref={videoRef} src={url} muted playsInline preload="auto" className="absolute inset-0 w-full h-full object-contain"
          onLoadedMetadata={() => { void probeFps(); }}
          onEnded={() => setPlaying(false)} />}
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />
      </div>

      {!allowed && <Notice>{t('vr.001')}</Notice>}
      {hidden.length > 0 && <p className="text-xs text-muted-foreground">{t('vr2.hiddenGuide', { list: hidden.join(', ') })}</p>}

      <fieldset disabled={probing} className="contents">
      <input type="range" aria-label={t('vr.011')} className="w-full accent-[hsl(var(--primary))]" min={from} max={to} step={1000 / clock.fpsNominal} value={Math.min(to, Math.max(from, uiT))}
        onChange={(e) => { pause(); setActive(null); seek(seekTimeForFrame(clock, frameOf(clock, +e.target.value))); }} />

      <div className="flex flex-wrap gap-2 items-center">
        <button className={chip(false)} onClick={togglePlay} aria-label={playing ? t('player.pause') : t('player.play')}>{playing ? <Pause className="w-4 h-4 inline" /> : <Play className="w-4 h-4 inline" />}</button>
        <button className={chip(false)} onClick={() => step(-1)} aria-label={t('vr.012')}><ChevronLeft className="w-4 h-4 inline" /></button>
        <button className={chip(false)} onClick={() => step(1)} aria-label={t('vr.013')}><ChevronRight className="w-4 h-4 inline" /></button>
        <span className="text-xs text-muted-foreground tabular-nums">{t('vr2.frameLine', { n: frameOf(clock, uiT), s: fmtNumber(uiT / 1000, 2) })}</span>
      </div>

      <div className="flex flex-wrap gap-2">
        {marks.map((m) => (
          <button key={m.key} className={chip(active === m.key)} onClick={() => goPhase(m.key)}>
            {phaseLabel(m.key)}{m.source === 'manual' ? ' ✎' : ''}{needsReview(m) ? ' ⚠' : ''}
          </button>
        ))}
      </div>
      {marks.some(needsReview) && <p className="text-xs text-muted-foreground">{t('vr2.reviewPhase')}</p>}
      {active && (() => {
        const m = marks.find((x) => x.key === active)!;
        return (
          <div className="flex items-center gap-2 text-xs">
            <span className="font-medium">{t('vr2.adjust', { phase: phaseLabel(active).toLowerCase() })}</span>
            <button className={chip(false)} onClick={() => adjust(-1)} aria-label={t('vr.014')}>{t('vr2.back1')}</button>
            <button className={chip(false)} onClick={() => adjust(1)} aria-label={t('vr.015')}>{t('vr2.fwd1')}</button>
            <span className="text-muted-foreground">{m.source === 'manual' ? t('vr2.manual') : t('vr2.auto')}</span>
          </div>
        );
      })()}
      {orderError && <Notice>{t('vr.002')}</Notice>}

      <Segmented<`${Speed}`> value={`${speed}`} onChange={(v) => setRate(+v as Speed)} options={SPEEDS.map((s) => ({ value: `${s}` as `${Speed}`, label: speedLabel(s) }))} />

      <div className="flex flex-wrap gap-2">
        {(['head', 'torso', 'leadArm', 'hips'] as const).map((k) => (
          <button key={k} className={chip(guides[k])} aria-pressed={guides[k]} onClick={() => setGuides((g) => ({ ...g, [k]: !g[k] }))}>{guideLabel(k)}</button>
        ))}
        <button className={chip(skeleton)} aria-pressed={skeleton} onClick={() => setSkeleton((s) => !s)}>{t('vr.003')}</button>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>{t('vr.004')}</span>
        <button className={chip(!lefty)} onClick={() => setLefty(false)}>{t('vr.005')}</button>
        <button className={chip(lefty)} onClick={() => setLefty(true)}>{t('vr.006')}</button>
        {lefty !== (r.lefty ?? false) && <span>{t('vr2.chosenByYou')}</span>}
        <span className="ml-auto">{t('vr2.fpsLine', { fps: clock.fpsNominal, source: clock.fpsSource === 'estimated' ? t('vr2.fpsEst') : clock.fpsSource === 'user' ? t('vr2.chosenByYou') : t('vr2.fpsFile') })}</span>
      </div>
      <div className="flex gap-2 items-center text-xs">
        <span className="text-muted-foreground">{t('vr.007')}</span>
        {[30, 60].map((f) => <button key={f} className={chip(clock.fpsNominal === f && clock.fpsSource === 'user')} onClick={() => setClock(makeClock({ fpsNominal: f, fpsSource: 'user' }))}>{f}</button>)}
      </div>
      </fieldset>
      {probing && <p className="text-xs text-muted-foreground">{t('vr.008')}</p>}
      {flags.export && !exporting && <Button full variant="outline" onClick={() => setExporting(true)}>{t('vr.009')}</Button>}
      {flags.export && exporting && <ExportSheet r={r} mediaId={mediaId} poseTrackId={poseTrackId} manual={manual} premium={premium} onClose={() => setExporting(false)} />}
      <p className="text-[11px] text-muted-foreground">{t('vr.010')}</p>
    </div>
  );
}

