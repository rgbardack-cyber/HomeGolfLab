import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, Loader2, Share2, X } from 'lucide-react';
import { debugExport, type DebugBag } from '@/lib/debugHook';
import { ExportError, exportCapabilities, runExport, type ExportResult } from '@/lib/export/encode';
import { exportFileName, flightLegend, OUT_H, OUT_W, renderExportFrame, type ExportOptions, type ExportSource, type Template } from '@/lib/export/render';
import { buildTimeline, chooseFps, fitsLimit, flightSegments, swingSegments, type Segment } from '@/lib/export/timeline';
import { getMediaStore } from '@/lib/media/store';
import { DEFAULT_GUIDES, GUIDE_LABEL, type GuideSet } from '@/lib/swingReview';
import { swingExportSource } from '@/lib/export/sources';
import type { SwingResult } from '@/lib/swing';
import { seekVideo } from '@/lib/videoSeek';
import { Button, Card, Notice, Segmented } from '@/components/ui';

interface Props {
  r: SwingResult;
  mediaId: string;
  poseTrackId?: string;
  manual?: Partial<Record<'address' | 'top' | 'impact' | 'finish', number>>;
  /** Premium: sin marca de agua (D10). */
  premium: boolean;
  onClose: () => void;
  /** Compuerta de descarga (F9): debe resolver true para empezar a exportar. Sin ella, se exporta directo. */
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
        if (!src) { if (!dead) setError('Faltan fases del swing (inicio, tope e impacto en orden) para exportar.'); return; }
        if (dead) return;
        made = URL.createObjectURL(b);
        setBlob(b); setUrl(made); setSource(src);
      } catch { if (!dead) setError('No se pudo leer el video guardado.'); }
    })();
    const img = new Image();
    img.onload = () => { if (!dead) setLogo(img); };
    img.src = `${import.meta.env.BASE_URL}logo-blanco.png`;
    return () => { dead = true; if (made) URL.revokeObjectURL(made); };
  }, [mediaId, poseTrackId, r, manual]);

  const { segments, fps, timeline } = useMemo(() => {
    if (!source?.times) return { segments: [] as Segment[], fps: 30 as 30 | 60, timeline: null };
    const segs = template === 'flight' ? flightSegments({ source: source.id, startMs: source.times.address, impactMs: source.times.impact, traceEndMs: source.times.impact + 2000 }) : swingSegments(source.times, [source.id]);
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

  const start = async () => {
    if (!source || !blob || !timeline || busy) return;
    if (!fitsLimit(timeline)) { setError('La exportación pasaría de 60 segundos.'); return; }
    if (beforeExport && !(await beforeExport())) return;
    setBusy(true); setError(null); setProgress(0); setResult(null);
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
      if (e instanceof ExportError && e.code === 'cancelled') setError('Exportación cancelada.');
      else setError(e instanceof ExportError && e.code === 'no_video_encoder' ? 'Este dispositivo no puede crear el video desde la app todavía.' : 'No se pudo exportar el video. Prueba de nuevo.');
      if (import.meta.env.DEV) debugExport({ done: true, error: String(e) });
    } finally { setBusy(false); }
  };

  useEffect(() => () => { abort.current?.abort(); }, []);
  useEffect(() => () => { if (result) URL.revokeObjectURL(result.url); }, [result]);

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
        <p className="font-semibold">Exportar video</p>
        <button aria-label="Cerrar" onClick={onClose} className="p-1"><X className="w-5 h-5" /></button>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      {url && <video ref={videoRef} src={url} muted playsInline preload="auto" style={{ position: 'fixed', left: -9999, top: 0, width: 160, height: 90 }} onLoadedMetadata={() => void drawPreview(pos)} />}

      {timeline && (
        <>
          <canvas ref={prevRef} width={OUT_W / 4} height={OUT_H / 4} className="mx-auto rounded-xl bg-black" style={{ maxHeight: '55vh', width: 'auto' }} aria-label="Vista previa de la exportación" />
          <input type="range" aria-label="Instante de la vista previa" className="w-full accent-[hsl(var(--primary))]" min={0} max={Math.max(0, Math.floor(total) - 1)} step={33} value={Math.min(pos, total)} disabled={busy} onChange={(e) => setPos(+e.target.value)} />
          <div className="flex flex-wrap gap-2">
            {(['head', 'torso', 'leadArm', 'hips'] as const).map((k) => <button key={k} className={chip(guides[k])} aria-pressed={guides[k]} disabled={busy} onClick={() => setGuides((g) => ({ ...g, [k]: !g[k] }))}>{GUIDE_LABEL[k]}</button>)}
            <button className={chip(skeleton)} aria-pressed={skeleton} disabled={busy} onClick={() => setSkeleton((s) => !s)}>Esqueleto</button>
          </div>
          <Segmented<'impact' | 'silence'> value={audio} onChange={(a) => !busy && setAudio(a)} options={[{ value: 'impact', label: 'Sonido del golpe' }, { value: 'silence', label: 'Sin sonido' }]} />
          <p className="text-xs text-muted-foreground">Dura {(total / 1000).toFixed(1).replace('.', ',')} s a {fps} cuadros por segundo, 1080×1920. Pesará unos {fmtMB(estBytes)} MB. {premium ? '' : 'Lleva la marca de HomeGolfLab (Premium la quita).'}</p>
          {caps && !caps.video && <Notice tone="error">Este dispositivo no puede crear el video H.264 desde la app: no se podrá exportar aquí.</Notice>}
          {caps && caps.video && !caps.audio && audio === 'impact' && <Notice>Este dispositivo no puede codificar audio AAC: el video saldrá sin sonido.</Notice>}
          <div className="flex gap-2">
            <Button full onClick={() => void start()} disabled={busy || !caps?.video}>{busy ? <><Loader2 className="w-5 h-5 animate-spin" /> Exportando… {Math.round(progress * 100)}%</> : 'Exportar MP4'}</Button>
            {busy && <Button variant="outline" onClick={() => abort.current?.abort()}>Cancelar</Button>}
          </div>
        </>
      )}

      {result && (
        <div className="space-y-2">
          <Notice tone="ok">Listo: {result.name} · {fmtMB(result.blob.size)} MB · {(result.durationMs / 1000).toFixed(1).replace('.', ',')} s.</Notice>
          {result.audioNote && <Notice>{result.audioNote} El video salió sin sonido.</Notice>}
          <div className="flex gap-2">
            <a href={result.url} download={result.name} className="flex-1"><Button full><Download className="w-5 h-5" /> Descargar</Button></a>
            {canShare && <Button variant="outline" onClick={() => void share()} aria-label="Compartir"><Share2 className="w-5 h-5" /></Button>}
          </div>
        </div>
      )}
    </Card>
    </div>
  );
}
