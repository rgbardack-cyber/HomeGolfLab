import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, RefObject } from 'react';
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
import { debugReview, type DebugBag } from '@/lib/debugHook';
import { frameOf, makeClock, type Clock } from '@/lib/media/clock';
import type { PoseTrack } from '@/lib/media/poseTrack';
import { getMediaStore, MEDIA_ERROR_TEXT, MediaStoreError, type MediaRef } from '@/lib/media/store';
import { buildDrawList, paint } from '@/lib/overlay/draw';
import { makeViewport, type Rect } from '@/lib/overlay/viewport';
import { PHASE_KEYS, phaseLabel, phaseMarks, seekTimeForFrame, speedLabel, SPEEDS, type PhaseKey, type PhaseMark, type Speed } from '@/lib/reviewPlayer';
import { safeCrop, type CropResult } from '@/lib/safeCrop';
import { buildWarp, DEFAULT_GUIDES, guidesAllowed, headUsesNose, reviewModelAt, warpSuspicious, type PhaseTimes } from '@/lib/swingReview';
import type { SwingResult } from '@/lib/swing';
import { probeClock } from '@/lib/videoProbe';
import { Notice, Segmented } from '@/components/ui';
import { t } from '@/i18n';

export interface CompareSide {
  mediaId: string;
  poseTrackId?: string;
  r: SwingResult;
  manual?: Partial<Record<PhaseKey, number>>;
  club?: string;
  label: string;
}

const PANEL_ASPECT = 3 / 4;
const chip = (on: boolean) => `h-9 px-3 rounded-full text-xs font-semibold border transition ${on ? 'bg-primary text-primary-foreground border-primary' : 'bg-card border-border text-foreground'}`;
const NO_GUIDES = { head: false, torso: false, leadArm: false, hips: false };

interface Loaded { url: string; ref: MediaRef; track: PoseTrack | null }

/** Carga el video y la pista guardados de un lado (y libera la URL al salir). */
function useLoaded(side: CompareSide): { data: Loaded | null; error: string | null } {
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let dead = false, made: string | null = null;
    setData(null); setError(null);
    (async () => {
      try {
        const st = await getMediaStore();
        const { ref, blob } = await st.getMedia(side.mediaId);
        const track = side.poseTrackId ? await st.loadPoseTrack(side.poseTrackId) : null;
        if (dead) return;
        made = URL.createObjectURL(blob);
        setData({ url: made, ref, track });
      } catch (e) { if (!dead) setError(e instanceof MediaStoreError ? MEDIA_ERROR_TEXT[e.code] : MEDIA_ERROR_TEXT.unavailable); }
    })();
    return () => { dead = true; if (made) URL.revokeObjectURL(made); };
  }, [side.mediaId, side.poseTrackId]);
  return { data, error };
}

const marksOf = (s: CompareSide, c: Clock): PhaseMark[] => (s.r.times ? phaseMarks(c, s.r.times, s.manual ?? {}, s.r.phaseConf) : []);
const toTimes = (m: PhaseMark[]): PhaseTimes => Object.fromEntries(m.map((x) => [x.key, x.t]));

function cropOf(s: CompareSide, d: Loaded | null): CropResult | null {
  if (!d?.track || !s.r.times) return null;
  const t = s.r.times;
  return safeCrop(d.track, { from: d.track.fromMs ?? t.address - 900, to: d.track.toMs ?? t.impact + 700, top: t.top, panelAspect: PANEL_ASPECT, srcAspect: d.ref.w / d.ref.h });
}

/**
 * Comparación de dos swings (F4.3): dos paneles; el reloj maestro es A y B se mueve por `buildWarp` (sus fases coinciden
 * exactamente con las de A). Cada panel muestra el recorte seguro (cuerpo entero + palo en el tope) o, si no cabe, el cuadro
 * entero con bandas. Sin audio (F8.3) no se puede afirmar que sean el mismo golpe: la insignia solo distingue "mismo clip"
 * de "golpes distintos".
 */
export default function CompareView({ a, b }: { a: CompareSide; b: CompareSide }) {
  const A = useLoaded(a), B = useLoaded(b);
  const vA = useRef<HTMLVideoElement>(null), vB = useRef<HTMLVideoElement>(null);
  const cA = useRef<HTMLCanvasElement>(null), cB = useRef<HTMLCanvasElement>(null);
  const wA = useRef<HTMLDivElement>(null), wB = useRef<HTMLDivElement>(null);
  const tA = useRef(0), tB = useRef(0);
  const lastUi = useRef(0);
  const dbg = useRef<DebugBag | null>(null);
  const [clockA, setClockA] = useState<Clock>(() => makeClock({ fpsNominal: 30, fpsSource: 'estimated' }));
  const [clockB, setClockB] = useState<Clock>(() => makeClock({ fpsNominal: 30, fpsSource: 'estimated' }));
  const [ready, setReady] = useState({ a: false, b: false });
  const [speed, setSpeed] = useState<Speed>(1);
  const [playing, setPlaying] = useState(false);
  const [active, setActive] = useState<PhaseKey | null>(null);
  const [uiT, setUiT] = useState(0);
  const [skeleton, setSkeleton] = useState(true);
  const [probing, setProbing] = useState(false);

  useEffect(() => { if (A.data) setClockA(A.data.ref.clock); }, [A.data]);
  useEffect(() => { if (B.data) setClockB(B.data.ref.clock); }, [B.data]);

  const marksA = useMemo(() => marksOf(a, clockA), [a, clockA]);
  const marksB = useMemo(() => marksOf(b, clockB), [b, clockB]);
  const warp = useMemo(() => buildWarp(toTimes(marksA), toTimes(marksB)), [marksA, marksB]);
  const sameClip = a.mediaId === b.mediaId;
  const cropA = useMemo(() => cropOf(a, A.data), [a, A.data]);
  const cropB = useMemo(() => cropOf(b, B.data), [b, B.data]);

  const drawPanel = useCallback((s: CompareSide, d: Loaded | null, crop: CropResult | null, cv: HTMLCanvasElement | null, w: HTMLDivElement | null, tMs: number) => {
    if (!cv || !w || !d || !s.r.times) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1), cw = Math.round(w.clientWidth * dpr), ch = Math.round(w.clientHeight * dpr);
    if (cv.width !== cw || cv.height !== ch) { cv.width = cw; cv.height = ch; }
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, cw, ch);
    if (!d.track) return;
    const on = guidesAllowed(s.r.view, s.r.viewMismatch, 'auto') ? DEFAULT_GUIDES[s.r.view ?? 'frente'] : NO_GUIDES;
    const model = reviewModelAt({ track: d.track, lefty: s.r.lefty ?? false, view: s.r.view ?? 'frente', times: s.r.times }, tMs, on, { skeleton }, { useNose: headUsesNose(d.track) });
    const rect: Rect | undefined = crop && !crop.letterbox ? crop.rect : undefined;
    paint(ctx, buildDrawList(model, tMs, makeViewport(d.ref.w, d.ref.h, { x: 0, y: 0, w: cw, h: ch }, rect)));
  }, [skeleton]);
  const redraw = useCallback(() => {
    drawPanel(a, A.data, cropA, cA.current, wA.current, tA.current);
    drawPanel(b, B.data, cropB, cB.current, wB.current, tB.current);
  }, [a, b, A.data, B.data, cropA, cropB, drawPanel]);

  /* Mide los fps reales de cada clip al cargar, uno tras otro, y bloquea los controles mientras tanto. */
  useEffect(() => {
    if (!A.data || !B.data || !ready.a || !ready.b || !vA.current || !vB.current) return;
    let dead = false;
    setProbing(true);
    (async () => {
      const ca = await probeClock(vA.current!, A.data!.ref.clock);
      const cb = await probeClock(vB.current!, B.data!.ref.clock);
      if (dead) return;
      setClockA(ca); setClockB(cb);
      setProbing(false);
      const ma = marksOf(a, ca).find((m) => m.key === 'address'), mb = marksOf(b, cb).find((m) => m.key === 'address');
      if (ma && vA.current) vA.current.currentTime = seekTimeForFrame(ca, ma.frame) / 1000;
      if (mb && vB.current) vB.current.currentTime = seekTimeForFrame(cb, mb.frame) / 1000;
    })();
    return () => { dead = true; setProbing(false); };
  }, [A.data, B.data, ready.a, ready.b]); // eslint-disable-line react-hooks/exhaustive-deps

  const seekBoth = (tAms: number) => {
    tA.current = tAms;                       // el siguiente paso parte de aquí aunque el cuadro aún no se haya presentado
    if (vA.current) vA.current.currentTime = tAms / 1000;
    if (vB.current && warp) vB.current.currentTime = seekTimeForFrame(clockB, frameOf(clockB, warp.toB(tAms))) / 1000;
  };

  /* El cuadro presentado de A manda: se dibuja A y B se mantiene en su instante mapeado. */
  useEffect(() => {
    const v = vA.current, vb = vB.current;
    if (!v || !vb || !A.data || !B.data) return;
    let stop = false, id = 0, idB = 0;
    if (import.meta.env.DEV) dbg.current = debugReview({ compare: true });
    const times = toTimes(marksA);
    const onA = (tMs: number) => {
      tA.current = tMs;
      drawPanel(a, A.data, cropA, cA.current, wA.current, tMs);
      if (warp && !v.paused) {
        // En reproducción B sigue el ritmo de su tramo y se corrige si se aleja más de 40 ms.
        // Fuera del rango de fases comunes la pendiente es 1 (contrato 4.5); dentro, la del tramo.
        const first = times[warp.keys[0]] as number, lastK = times[warp.keys[warp.keys.length - 1]] as number;
        let rate = 1;
        if (tMs >= first && tMs < lastK) { let i = 0; while (i < warp.keys.length - 2 && (times[warp.keys[i + 1]] as number) <= tMs) i++; rate = warp.rates[i] ?? 1; }
        vb.playbackRate = Math.min(16, Math.max(0.0625, v.playbackRate * rate));
        const target = warp.toB(tMs), durB = B.data!.ref.durationMs;
        if (target < 0 || target >= durB - 40) {
          // B no tiene video en este instante (empieza después o termina antes): se queda quieto en su borde, no se reinicia.
          if (!vb.paused) vb.pause();
          vb.currentTime = Math.min(Math.max(0, target), Math.max(0, durB - 40)) / 1000;
        } else {
          if (Math.abs(vb.currentTime * 1000 - target) > 40) vb.currentTime = target / 1000;
          if (vb.paused) void vb.play().catch(() => undefined);
        }
      }
      const now = performance.now();
      if (now - lastUi.current > 90) { lastUi.current = now; setUiT(tMs); }
    };
    const cb = (_n: number, m: VideoFrameCallbackMetadata) => { if (stop) return; onA(m.mediaTime * 1000); id = v.requestVideoFrameCallback(cb); };
    const cbB = (_n: number, m: VideoFrameCallbackMetadata) => {
      if (stop) return;
      tB.current = m.mediaTime * 1000;
      drawPanel(b, B.data, cropB, cB.current, wB.current, tB.current);
      if (dbg.current) Object.assign(dbg.current, { frameA: frameOf(clockA, tA.current), frameB: frameOf(clockB, tB.current), tA: tA.current, tB: tB.current, clockA, clockB });
      idB = vb.requestVideoFrameCallback(cbB);
    };
    id = v.requestVideoFrameCallback(cb);
    idB = vb.requestVideoFrameCallback(cbB);
    return () => { stop = true; v.cancelVideoFrameCallback(id); vb.cancelVideoFrameCallback(idB); };
  }, [A.data, B.data, a, b, cropA, cropB, drawPanel, warp, clockA, clockB, marksA]);

  useEffect(() => { redraw(); }, [redraw]);
  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(redraw);
    if (wA.current) ro.observe(wA.current);
    if (wB.current) ro.observe(wB.current);
    return () => ro.disconnect();
  }, [redraw, A.data, B.data]);

  const pause = () => { vA.current?.pause(); vB.current?.pause(); setPlaying(false); };
  const goPhase = (k: PhaseKey) => {
    const ma = marksA.find((m) => m.key === k), mb = marksB.find((m) => m.key === k);
    if (!ma || !mb || !vA.current || !vB.current) return;
    pause(); setActive(k);
    tA.current = ma.t;
    vA.current.currentTime = seekTimeForFrame(clockA, ma.frame) / 1000;
    vB.current.currentTime = seekTimeForFrame(clockB, mb.frame) / 1000;   // la fase de B tal cual, no una conversión: alineación exacta
  };
  const step = (dir: number) => { pause(); seekBoth(seekTimeForFrame(clockA, Math.max(0, frameOf(clockA, tA.current) + dir))); };
  const togglePlay = () => {
    const v = vA.current;
    if (!v) return;
    if (v.paused) { v.playbackRate = speed; void v.play(); setPlaying(true); } else pause();
  };

  const common = PHASE_KEYS.filter((k) => marksA.some((m) => m.key === k) && marksB.some((m) => m.key === k));
  const error = A.error ?? B.error;
  if (error) return <Notice tone="error">{error}</Notice>;
  const viewDiff = a.r.view && b.r.view && a.r.view !== b.r.view;
  const clubDiff = a.club && b.club && a.club.trim().toLowerCase() !== b.club.trim().toLowerCase();
  const from = A.data?.track?.fromMs ?? 0, to = A.data?.track?.toMs ?? (A.data?.ref.durationMs ?? 1000);
  const off = !warp || probing;

  const panel = (side: CompareSide, d: Loaded | null, crop: CropResult | null, vref: RefObject<HTMLVideoElement | null>, cref: RefObject<HTMLCanvasElement | null>, wref: RefObject<HTMLDivElement | null>, key: 'a' | 'b') => {
    const rc = crop && !crop.letterbox ? crop.rect : null;
    const style: CSSProperties = rc
      ? { position: 'absolute', width: `${100 / rc.w}%`, height: `${100 / rc.h}%`, left: `${(-rc.x / rc.w) * 100}%`, top: `${(-rc.y / rc.h) * 100}%`, objectFit: 'fill', maxWidth: 'none', maxHeight: 'none' }
      : { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' };
    return (
      <div className="space-y-1" data-compare-panel={key}>
        <p className="text-xs font-medium truncate">{side.label}</p>
        <div ref={wref} className="relative w-full rounded-xl overflow-hidden bg-black" style={{ aspectRatio: `${PANEL_ASPECT}` }}>
          {d && <video ref={vref} src={d.url} muted playsInline preload="auto" style={style} onLoadedMetadata={() => setReady((r) => ({ ...r, [key]: true }))} onEnded={key === 'a' ? pause : undefined} />}
          <canvas ref={cref} className="absolute inset-0 w-full h-full pointer-events-none" />
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-3" data-compare>
      <div className="flex flex-wrap gap-2 items-center text-xs">
        <span className="px-2 py-1 rounded-full bg-muted font-medium" data-compare-badge>{sameClip ? t('cv2.sameClip') : t('cv2.differentShots')}</span>
        {warp && <span className="text-muted-foreground">{t('cv2.syncedBy', { list: warp.keys.map((k) => phaseLabel(k).toLowerCase()).join(', ') })}</span>}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {panel(a, A.data, cropA, vA, cA, wA, 'a')}
        {panel(b, B.data, cropB, vB, cB, wB, 'b')}
      </div>
      {(cropA?.letterbox || cropB?.letterbox) && <p className="text-[11px] text-muted-foreground">{t('cv.001')}</p>}
      {!warp && <Notice>{t('cv.002')}</Notice>}
      {warp && warpSuspicious(warp) && <Notice>{t('cv.003')}</Notice>}
      {viewDiff && <Notice>{t('cv.004')}</Notice>}
      {clubDiff && <Notice>Los palos son distintos ({a.club} y {b.club}).</Notice>}

      <fieldset disabled={off} className="contents">
        <input type="range" aria-label={t('cv.007')} className="w-full accent-[hsl(var(--primary))]" min={from} max={to} step={1000 / clockA.fpsNominal}
          value={Math.min(to, Math.max(from, uiT))} onChange={(e) => { pause(); setActive(null); seekBoth(seekTimeForFrame(clockA, frameOf(clockA, +e.target.value))); }} />
        <div className="flex flex-wrap gap-2 items-center">
          <button className={chip(false)} onClick={togglePlay} aria-label={playing ? t('player.pause') : t('player.play')}>{playing ? <Pause className="w-4 h-4 inline" /> : <Play className="w-4 h-4 inline" />}</button>
          <button className={chip(false)} onClick={() => step(-1)} aria-label={t('cv.008')}><ChevronLeft className="w-4 h-4 inline" /></button>
          <button className={chip(false)} onClick={() => step(1)} aria-label={t('cv.009')}><ChevronRight className="w-4 h-4 inline" /></button>
          <span className="text-xs text-muted-foreground tabular-nums">cuadro A {frameOf(clockA, uiT)}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {common.map((k) => <button key={k} className={chip(active === k)} onClick={() => goPhase(k)}>{phaseLabel(k)}</button>)}
        </div>
        <Segmented<`${Speed}`> value={`${speed}`} onChange={(v) => { setSpeed(+v as Speed); if (vA.current) vA.current.playbackRate = +v; }} options={SPEEDS.map((s) => ({ value: `${s}` as `${Speed}`, label: speedLabel(s) }))} />
        <div className="flex gap-2">
          <button className={chip(skeleton)} aria-pressed={skeleton} onClick={() => setSkeleton((s) => !s)}>{t('cv.005')}</button>
        </div>
      </fieldset>
      {probing && <p className="text-xs text-muted-foreground">{t('cv.006')}</p>}
      <p className="text-[11px] text-muted-foreground">{t('cv2.masterNote')}</p>
    </div>
  );
}
