import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Crown, Download, Loader2, Share2, X } from 'lucide-react';
import { adsAvailable, nativeAds, rewardedAds, type AdOutcome } from '@/lib/ads';
import { obtainExportPass, type NoticeChoice, type RunnerDeps } from '@/lib/exportGateRunner';
import { analysisKey } from '@/lib/exportGate';
import { todayISO, useStore } from '@/store';
import { useFlags } from '@/lib/flags';
import { PlaceholderAd } from '@/components/AdGate';
import { debugExport, type DebugBag } from '@/lib/debugHook';
import { ExportError, exportCapabilities, runExport, type ExportResult } from '@/lib/export/encode';
import { exportFileName, flightLegend, OUT_H, OUT_W, renderExportFrame, type ExportOptions, type ExportSource, type Template } from '@/lib/export/render';
import { buildTimeline, chooseFps, fitsLimit, flightSegments, swingSegments, type Segment } from '@/lib/export/timeline';
import { getMediaStore } from '@/lib/media/store';
import { DEFAULT_GUIDES, guideLabel, type GuideSet } from '@/lib/swingReview';
import { swingExportSource } from '@/lib/export/sources';
import type { SwingResult } from '@/lib/swing';
import { seekVideo } from '@/lib/videoSeek';
import { Button, Card, Notice, Segmented } from '@/components/ui';
import { fmtNumber, t } from '@/i18n';

interface Props {
  r: SwingResult;
  mediaId: string;
  poseTrackId?: string;
  manual?: Partial<Record<'address' | 'top' | 'impact' | 'finish', number>>;
  /** Premium: sin marca de agua (D10). */
  premium: boolean;
  onClose: () => void;
  /** Compuerta de descarga (F9) propia; por defecto se usa la compuerta de la app (anuncio, Premium o exportación gratis del día). */
  beforeExport?: () => Promise<boolean>;
}

const chip = (on: boolean) => `h-9 px-3 rounded-full text-xs font-semibold border transition ${on ? 'bg-primary text-primary-foreground border-primary' : 'bg-card border-border text-foreground'}`;
const fmtMB = (b: number) => (b / 1e6).toFixed(1).replace('.', ',');
const stamp = () => { const d = new Date(); return { y: d.getFullYear(), mo: d.getMonth() + 1, d: d.getDate(), h: d.getHours(), mi: d.getMinutes() }; };

/**
 * Hoja de exportación (F8.6): elige plantilla y opciones, muestra una vista previa con el MISMO compositor que la exportación,
 * estima el tamaño, exporta (cancelable, con progreso) y entrega el MP4 (descarga o compartir). Dibuja todo en canvas: nada
 * se captura del DOM.
 */
export default function ExportSheet({ r, mediaId, poseTrackId, manual, premium, onClose, beforeExport }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const prevRef = useRef<HTMLCanvasElement>(null);
  const dbg = useRef<DebugBag | null>(null);
  const abort = useRef<AbortController | null>(null);

  const [blob, setBlob] = useState<Blob | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [source, setSource] = useState<ExportSource | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [template] = useState<Template>('swing');
  const [guides, setGuides] = useState<GuideSet>(DEFAULT_GUIDES[r.view ?? 'frente']);
  const [skeleton, setSkeleton] = useState(true);
  const [audio, setAudio] = useState<'impact' | 'silence'>('impact');
  const [pos, setPos] = useState(0);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<(ExportResult & { url: string; name: string }) | null>(null);
  const [caps, setCaps] = useState<{ video: boolean; audio: boolean } | null>(null);
  const [logo, setLogo] = useState<HTMLImageElement | null>(null);
  const [logoFailed, setLogoFailed] = useState(false);
  const alive = useRef(true);
  const lastUrl = useRef<string | null>(null);
  const [gateUi, setGateUi] = useState<{ kind: 'notice'; resolve: (c: NoticeChoice) => void } | { kind: 'ad'; resolve: (o: AdOutcome) => void } | null>(null);
  const [gateMsg, setGateMsg] = useState<string | null>(null);
  const [needPremium, setNeedPremium] = useState(false);
  const flags = useFlags();
  const freeUsedToday = useStore((s) => s.freeExportDate === todayISO());

  const options: ExportOptions = useMemo(() => ({ template, guides, skeleton, watermark: !premium }), [template, guides, skeleton, premium]);

  // Carga del video, la pista y el logo.
  useEffect(() => {
    let dead = false, made: string | null = null;
    (async () => {
      try {
        const st = await getMediaStore();
        const { ref, blob: b } = await st.getMedia(mediaId);
        const track = poseTrackId ? await st.loadPoseTrack(poseTrackId) : null;
        const src = swingExportSource(mediaId, ref, track, r, manual);
        if (!src) { if (!dead) setError(t('ex2.missingPhases')); return; }
        if (dead) return;
        made = URL.createObjectURL(b);
        setBlob(b); setUrl(made); setSource(src);
      } catch { if (!dead) setError(t('ex2.readFail')); }
    })();
    const img = new Image();
    img.onload = () => { if (!dead) setLogo(img); };
    img.onerror = () => { if (!dead) setLogoFailed(true); };
    img.src = `${import.meta.env.BASE_URL}logo-blanco.png`;
    return () => { dead = true; if (made) URL.revokeObjectURL(made); };
  }, [mediaId, poseTrackId, r, manual]);

  const { segments, fps, timeline } = useMemo(() => {
    if (!source?.times) return { segments: [] as Segment[], fps: 30 as 30 | 60, timeline: null };
    let segs: Segment[];
    try {
          segs = template === 'flight' ? flightSegments({ source: source.id, startMs: source.times.address, impactMs: source.times.impact, traceEndMs: source.times.impact + 2000, sourceEndMs: source.durationMs }) : swingSegments(source.times, [source.id], { sourceEndMs: source.durationMs });
    } catch { return { segments: [] as Segment[], fps: 30 as 30 | 60, timeline: null }; }
    return { segments: segs, fps: chooseFps(60, segs), timeline: buildTimeline(segs) };
  }, [source, template]);
  const legend = useMemo(() => (template === 'flight' ? flightLegend() : []), [template]);

  useEffect(() => { void exportCapabilities(fps).then(setCaps); }, [fps]);

  // Vista previa: el mismo compositor, a 1/4 de escala, sobre un cuadro del video.
  const drawPreview = useCallback(async (exportMs: number) => {
    const v = videoRef.current, c = prevRef.current;
    if (!v || !c || !source || !timeline || v.readyState < 1) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    await renderExportFrame(ctx, c.width, c.height, timeline, [source], options, Math.min(exportMs, timeline.totalMs - 1), async (_i, srcMs) => {
      try { await seekVideo(v, srcMs / 1000, 8000); } catch { return null; }
      return v;
    }, { watermark: options.watermark, logo, legend });
  }, [source, timeline, options, logo, legend]);
  useEffect(() => { void drawPreview(pos); }, [drawPreview, pos]);

  const total = timeline?.totalMs ?? 0;
  const estBytes = ((10_000_000 + (audio === 'impact' ? 160_000 : 0)) / 8) * (total / 1000);

  // Precarga del anuncio al abrir la hoja (solo gratis y en la app nativa; caduca a la hora y se vuelve a pedir).
  useEffect(() => { if (!premium && nativeAds()) void rewardedAds().preload(); }, [premium]);

  /** Dependencias de la compuerta (F9): el almacenamiento del pase, el anuncio y el aviso previo. */
  const gateDeps = useCallback((): RunnerDeps => ({
    getCtx: () => { const s = useStore.getState(); return { now: Date.now(), premium: s.profile.premium, consent: s.adsConsent, passes: s.exportPasses, freeExportDate: s.freeExportDate, today: todayISO() }; },
    apply: (e) => {
      const s = useStore.getState();
      if (e.grant) s.grantExportPass(e.grant.rewardEventId?.startsWith('placeholder-') ? { ...e.grant, via: 'placeholder' } : e.grant, Date.now());
      if (e.useFreeDaily) s.markFreeExport(todayISO());
      if (e.usePassId) s.touchExportPass(e.usePassId);
    },
    setConsent: (c) => useStore.getState().setAdsConsent(c),
    askNotice: () => new Promise<NoticeChoice>((resolve) => setGateUi({ kind: 'notice', resolve })),
    playAd: async () => {
      if (nativeAds()) return rewardedAds().show();
      if (!adsAvailable()) return { kind: 'load_failed' } as AdOutcome;
      return new Promise<AdOutcome>((resolve) => setGateUi({ kind: 'ad', resolve }));   // anuncio de PRUEBA con cuenta atrás (9.4)
    },
    wait: (ms) => new Promise((r) => setTimeout(r, ms)),
    adsAvailable,
    onState: (st) => setGateMsg(st.message ?? null),
  }), []);

  const start = async () => {
    if (!source || !blob || !timeline || busy) return;
    if (!fitsLimit(timeline)) { setError(t('ex2.tooLong')); return; }
    if (!premium && !logo) { setError(logoFailed ? t('ex2.logoFail') : t('ex2.logoLoading')); return; }
    setNeedPremium(false); setGateMsg(null);
    setBusy(true);                                  // bloquea el doble toque desde el primer instante, también durante el aviso y el anuncio
    try {
      if (beforeExport) { if (!(await beforeExport())) { setBusy(false); return; } }
      else if (flags.exportGate) {
        // `flags.exportGate` apagada = pruebas internas sin compuerta; encender `export` en producción exige encender también `exportGate`.
        const g = await obtainExportPass(analysisKey(mediaId), gateDeps());
        setGateUi(null);
        if (!alive.current) return;                  // la hoja se cerró mientras esperaba
        if (!g.ok) { setBusy(false); setNeedPremium(!!g.wantsPremium); return; }
      }
    } catch {
      setGateUi(null);
      if (alive.current) { setBusy(false); setError(t('ex2.prepFail')); }
      return;
    }
    if (!alive.current) return;
    setError(null); setProgress(0); setResult(null);
    abort.current = new AbortController();
    try {
      const res = await runExport({
        timeline, sources: [source], blobs: [blob], options, fps, audio, impactMs: source.times?.impact, logo, legend,
        footer: new Date().toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' }),
      }, { onProgress: setProgress, signal: abort.current.signal });
      const name = exportFileName(template, stamp());
      const u = URL.createObjectURL(res.blob);
      setResult({ ...res, url: u, name });
      if (import.meta.env.DEV) dbg.current = debugExport({ done: true, name, bytes: res.blob.size, durationMs: res.durationMs, frames: res.frames, fps: res.fps, audio: res.audio, audioNote: res.audioNote, url: u, segments, totalMs: timeline.totalMs });
    } catch (e) {
      if (e instanceof ExportError && e.code === 'cancelled') setError(t('ex2.cancelled'));
      else setError(e instanceof ExportError && e.code === 'no_video_encoder' ? t('ex2.noEncoder') : t('ex2.exportFail'));
      if (import.meta.env.DEV) debugExport({ done: true, error: String(e) });
    } finally { setBusy(false); }
  };

  // Al cerrar la hoja se cancela todo, también lo que aún espera al aviso o al anuncio (revisión F8), y se libera el archivo.
  useEffect(() => { alive.current = true; return () => { alive.current = false; abort.current?.abort(); if (lastUrl.current) URL.revokeObjectURL(lastUrl.current); }; }, []);
  useEffect(() => { if (result) lastUrl.current = result.url; return () => { if (result) URL.revokeObjectURL(result.url); }; }, [result]);

  const share = async () => {
    if (!result) return;
    const file = new File([result.blob], result.name, { type: 'video/mp4' });
    try { if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: 'HomeGolfLab' }); } catch { /* cancelado */ }
  };
  const canShare = typeof navigator !== 'undefined' && typeof navigator.canShare === 'function' && typeof File !== 'undefined';

  return (
    <div data-export-sheet>
    <Card className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="font-semibold">{t('ex.002')}</p>
        <button aria-label={t('ex.016')} onClick={onClose} className="p-1"><X className="w-5 h-5" /></button>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      {source && !timeline && !error && <Notice tone="error">{t('ex.003')}</Notice>}
      {useStore.getState().adsConsent === 'declined' && gateMsg && <button className="text-xs underline" onClick={() => { useStore.getState().setAdsConsent('unknown'); setGateMsg(null); }}>{t('ex.004')}</button>}
      {url && <video ref={videoRef} src={url} muted playsInline preload="auto" style={{ position: 'fixed', left: -9999, top: 0, width: 160, height: 90 }} onLoadedMetadata={() => void drawPreview(pos)} />}

      {timeline && (
        <>
          <canvas ref={prevRef} width={OUT_W / 4} height={OUT_H / 4} className="mx-auto rounded-xl bg-black" style={{ maxHeight: '55vh', width: 'auto' }} aria-label={t('ex.017')} />
          <input type="range" aria-label={t('ex.018')} className="w-full accent-[hsl(var(--primary))]" min={0} max={Math.max(0, Math.floor(total) - 1)} step={33} value={Math.min(pos, total)} disabled={busy} onChange={(e) => setPos(+e.target.value)} />
          <div className="flex flex-wrap gap-2">
            {(['head', 'torso', 'leadArm', 'hips'] as const).map((k) => <button key={k} className={chip(guides[k])} aria-pressed={guides[k]} disabled={busy} onClick={() => setGuides((g) => ({ ...g, [k]: !g[k] }))}>{guideLabel(k)}</button>)}
            <button className={chip(skeleton)} aria-pressed={skeleton} disabled={busy} onClick={() => setSkeleton((s) => !s)}>{t('ex.005')}</button>
          </div>
          <Segmented<'impact' | 'silence'> value={audio} onChange={(a) => !busy && setAudio(a)} options={[{ value: 'impact', label: t('ex2.audioImpact') }, { value: 'silence', label: t('ex2.audioNone') }]} />
          <p className="text-xs text-muted-foreground">{t('ex2.info', { s: fmtNumber(total / 1000, 1), fps, mb: fmtMB(estBytes) })} {premium ? '' : t('ex2.watermark')}</p>
          {caps && !caps.video && <Notice tone="error">{t('ex2.noH264')}</Notice>}
          {caps && caps.video && !caps.audio && audio === 'impact' && <Notice>{t('ex.006')}</Notice>}
          {gateUi?.kind === 'notice' && (
            <div className="rounded-xl border border-border p-3 space-y-2 text-sm" data-export-notice>
              <p className="font-medium">{t('ex.007')}</p>
              <p className="text-muted-foreground">{t('ex.008')}</p>
              <Button full onClick={() => { const r = gateUi.resolve; setGateUi(null); r('watch'); }}>{t('ex.009')}</Button>
              <div className="flex gap-2">
                <Button variant="outline" full disabled={freeUsedToday} onClick={() => { const r = gateUi.resolve; setGateUi(null); r('decline'); }}>{freeUsedToday ? t('ex2.freeUsed') : t('ex2.noAds')}</Button>
                <Button variant="outline" onClick={() => { const r = gateUi.resolve; setGateUi(null); r('premium'); }} aria-label={t('ex.019')}><Crown className="w-5 h-5" /></Button>
              </div>
              <p className="text-[11px] text-muted-foreground">{t('ex.010')}</p>
              <button className="text-xs underline" onClick={() => { const r = gateUi.resolve; setGateUi(null); r('cancel'); }}>{t('ex.011')}</button>
            </div>
          )}
          {gateUi?.kind === 'ad' && <PlaceholderAd n={1} total={1} onDone={() => { const r = gateUi.resolve; setGateUi(null); r({ kind: 'rewarded', rewardEventId: `placeholder-${Date.now()}` }); }} />}
          {gateMsg && <Notice>{gateMsg}</Notice>}
          {needPremium && <Notice>{t('ex.012')} <Link to="/perfil" className="underline font-medium">{t('ex.013')}</Link></Notice>}
          <div className="flex gap-2">
            <Button full onClick={() => void start()} disabled={busy || !caps?.video || (!premium && !logo && !logoFailed)}>{busy ? <><Loader2 className="w-5 h-5 animate-spin" /> {progress === 0 && !result ? 'Un momento…' : `Exportando… ${Math.round(progress * 100)}%`}</> : 'Exportar MP4'}</Button>
            {busy && <Button variant="outline" onClick={() => abort.current?.abort()}>{t('ex.014')}</Button>}
          </div>
        </>
      )}

      {result && (
        <div className="space-y-2">
          <Notice tone="ok">Listo: {result.name} · {fmtMB(result.blob.size)} MB · {(result.durationMs / 1000).toFixed(1).replace('.', ',')} s.</Notice>
          {result.audioNote && <Notice>{result.audioNote} {t('ex2.silentVideo')}</Notice>}
          <div className="flex gap-2">
            <a href={result.url} download={result.name} className="flex-1"><Button full><Download className="w-5 h-5" /> {t('ex.015')}</Button></a>
            {canShare && <Button variant="outline" onClick={() => void share()} aria-label={t('ex.020')}><Share2 className="w-5 h-5" /></Button>}
          </div>
        </div>
      )}
    </Card>
    </div>
  );
}
