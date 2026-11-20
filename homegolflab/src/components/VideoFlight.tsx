import { useCallback, useEffect, useRef, useState } from 'react';
import { Crosshair, Loader2, RefreshCw, Upload } from 'lucide-react';
import { debugBall, type DebugBag } from '@/lib/debugHook';
import { analysisSize, BallTracker, flightStatCards, framesIdentical, summarizeFlight, toGray, type FlightSummary, type Gray, type TrackResult } from '@/lib/ballflight';
import type { P2 } from '@/lib/tracking';
import { seekVideo } from '@/lib/videoSeek';
import { useFlags } from '@/lib/flags';
import { buildFlightTrack, type FlightTrack } from '@/lib/flightTrack';
import { makeClock } from '@/lib/media/clock';
import FlightPlayer from '@/components/FlightPlayer';
import { persistFlight } from '@/lib/media/persistFlight';
import { getMediaStore } from '@/lib/media/store';
import { useStore } from '@/store';
import { Button, Card, Notice, Segmented, Stat } from '@/components/ui';

/**
 * Modo "Video" del ball tracking: se sube un video ya grabado, se toca la bola y se sigue SOLO el
 * comienzo de su vuelo, cuadro por cuadro. No mide distancia, velocidad ni dirección reales
 * (un video de teléfono no alcanza) y no guarda nada en el historial de tiros.
 */

const READ_ERROR = 'No se pudo leer el video. Graba en MP4/H.264 o pon la cámara en "Más compatible".';
const WAIT_MS = 8000;       // espera máxima de metadatos y de cada salto de cuadro
const MAX_SCAN_S = 15;      // tramo máximo que se recorre desde el cuadro de inicio
const ANALYSIS_W = 640;     // ancho de la imagen de análisis
const DISPLAY_W = 960;      // ancho máximo del cuadro que se muestra

const GREEN = '#6dcf8e', GOLD = '#e8c04a';

type Fps = '30' | '60';

interface Meta { w: number; h: number; dur: number }
interface Outcome { res: TrackResult; summary: FlightSummary; track?: FlightTrack; w?: number; h?: number }

/** Salta a `sec` y espera 'seeked' (espera más si el equipo está cargado; falla si el video se cuelga o da error). */
const seekTo = (v: HTMLVideoElement, sec: number) => seekVideo(v, sec, WAIT_MS);

const fmtS = (s: number) => s.toFixed(1).replace('.', ',');

export default function VideoFlight() {
  const flags = useFlags();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const baseRef = useRef<HTMLCanvasElement | null>(null);   // el cuadro de inicio, sin dibujos
  const runRef = useRef(0);                                  // invalida un análisis en curso
  const seekBusy = useRef(false);
  const pendingT = useRef<number | null>(null);
  const fileRef = useRef<File | null>(null);

  const [url, setUrl] = useState<string | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [startT, setStartT] = useState(0);
  const [fps, setFps] = useState<Fps>('30');
  const [tap, setTap] = useState<P2 | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [out, setOut] = useState<Outcome | null>(null);
  const [frameTick, setFrameTick] = useState(0);
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => () => { runRef.current++; }, []);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  // Si el video no entrega sus metadatos a tiempo, se avisa en vez de quedarse esperando.
  useEffect(() => {
    if (!url || meta) return;
    const timer = setTimeout(() => setError(READ_ERROR), WAIT_MS);
    return () => clearTimeout(timer);
  }, [url, meta]);

  const pick = (f?: File) => {
    if (!f) return;
    runRef.current++;
    fileRef.current = f; setSaveMsg(null);
    setUrl(URL.createObjectURL(f));
    setMeta(null); setStartT(0); setTap(null); setOut(null); setError(null); setProgress(0); setBusy(false);
    baseRef.current = null;
  };

  const reset = () => {
    runRef.current++;
    fileRef.current = null; setSaveMsg(null);
    setUrl(null); setMeta(null); setStartT(0); setTap(null); setOut(null); setError(null); setProgress(0); setBusy(false);
    baseRef.current = null;
  };

  /** Copia el cuadro actual del video al lienzo base (hasta 960 px de ancho). */
  const paintBase = (v: HTMLVideoElement) => {
    const k = Math.min(1, DISPLAY_W / v.videoWidth, 1280 / v.videoHeight);
    const b = baseRef.current ?? document.createElement('canvas');
    b.width = Math.max(1, Math.round(v.videoWidth * k)); b.height = Math.max(1, Math.round(v.videoHeight * k));
    b.getContext('2d')!.drawImage(v, 0, 0, b.width, b.height);
    baseRef.current = b;
    setFrameTick((n) => n + 1);
  };

  /** Muestra el cuadro en `t` s. Si llegan varios cambios seguidos (deslizador) solo cuenta el último. */
  const showFrame = useCallback(async (t: number) => {
    const v = videoRef.current;
    if (!v) return;
    if (seekBusy.current) { pendingT.current = t; return; }
    seekBusy.current = true;
    const take = () => { const p = pendingT.current; pendingT.current = null; return p; };
    try {
      let next: number | null = t;
      while (next !== null) {
        await seekTo(v, next);
        paintBase(v);
        next = take();
      }
    } catch {
      setError(READ_ERROR);
    } finally {
      seekBusy.current = false;
    }
  }, []);

  const onMeta = (v: HTMLVideoElement) => {
    const dur = v.duration;
    if (!v.videoWidth || !v.videoHeight || !Number.isFinite(dur) || dur <= 0) { setError(READ_ERROR); return; }
    setError(null);
    setMeta({ w: v.videoWidth, h: v.videoHeight, dur });
  };

  // Con los metadatos listos, se muestra el primer cuadro.
  useEffect(() => { if (meta) void showFrame(0); }, [meta, showFrame]);

  /** Dibuja el cuadro base, el anillo del toque y la trayectoria. */
  useEffect(() => {
    const c = canvasRef.current, b = baseRef.current;
    if (!c || !b) return;
    if (c.width !== b.width || c.height !== b.height) { c.width = b.width; c.height = b.height; }
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(b, 0, 0);
    const W = c.width, H = c.height, u = Math.max(W, H) / 320;

    if (out) {
      // Sin confirmar que la bola salió de donde se tocó, lo que se siguió no es su vuelo: no se dibuja.
      const pts = out.summary.released ? out.res.points : [];
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      const seg = (i: number, color: string, width: number, dash: number[]) => {
        ctx.setLineDash(dash.map((d) => d * u)); ctx.strokeStyle = color; ctx.lineWidth = width * u;
        ctx.beginPath(); ctx.moveTo(pts[i - 1].x * W, pts[i - 1].y * H); ctx.lineTo(pts[i].x * W, pts[i].y * H); ctx.stroke();
      };
      // Un hueco (cuadros sin ver la bola, unidos por una recta) no se dibuja como si se hubiera visto: va punteado y dorado.
      const dts = pts.slice(1).map((p, i) => p.t - pts[i].t).sort((a, b) => a - b);
      const medDt = dts.length ? dts[dts.length >> 1] : 0;
      for (let i = 1; i < pts.length; i++) {
        const solid = pts[i - 1].source === 'detected' && pts[i].source === 'detected' && (!medDt || pts[i].t - pts[i - 1].t <= medDt * 1.5);
        seg(i, 'rgba(0,0,0,0.55)', 3.2, solid ? [] : [4, 3]); // contorno oscuro para que se vea sobre cielo claro
        seg(i, solid ? GREEN : GOLD, 1.8, solid ? [] : [4, 3]);
      }
      ctx.setLineDash([]);
      for (const p of pts) {
        ctx.beginPath(); ctx.arc(p.x * W, p.y * H, 2.6 * u, 0, Math.PI * 2);
        if (p.source === 'detected') { ctx.fillStyle = GREEN; ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 0.8 * u; ctx.stroke(); }
        else { ctx.strokeStyle = GOLD; ctx.lineWidth = 1.2 * u; ctx.stroke(); }
      }
    }

    if (tap) {
      ctx.beginPath(); ctx.arc(tap.x * W, tap.y * H, 7 * u, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 3.2 * u; ctx.stroke();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.6 * u; ctx.stroke();
    }
  }, [frameTick, tap, out]);

  const onTap = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (busy) return;
    // El lienzo se muestra con su proporción real (sin recortes), así que su rectángulo en pantalla es el cuadro entero.
    const r = e.currentTarget.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const clamp = (n: number) => Math.min(1, Math.max(0, n));
    setTap({ x: clamp((e.clientX - r.left) / r.width), y: clamp((e.clientY - r.top) / r.height) });
    setOut(null); setError(null);
  };

  const follow = async () => {
    const v = videoRef.current;
    if (!v || !meta || !tap || busy) return;
    const run = ++runRef.current;
    setBusy(true); setError(null); setOut(null); setProgress(0); setSaveMsg(null);
    let tracker: BallTracker | null = null;
    let aspect = 1;
    // Gancho de QA (solo en desarrollo, ver lib/debugHook.ts).
    let dbg: DebugBag | null = null;
    const dbgFrames: { t: number; det: boolean; skipped: boolean }[] = [];
    try {
      // Si la vista previa del deslizador sigue saltando, se espera: dos saltos a la vez leerían un cuadro equivocado.
      pendingT.current = null;
      for (let k = 0; k < 60 && seekBusy.current; k++) await new Promise((r) => setTimeout(r, 50));
      const { w, h } = analysisSize(v.videoWidth, v.videoHeight, ANALYSIS_W);
      const clock = makeClock({ fpsNominal: Number(fps), fpsSource: 'user' });
      aspect = w / h;
      const cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      const ctx = cv.getContext('2d', { willReadFrequently: true });
      if (!ctx) throw new Error('canvas');

      v.pause();
      dbg = import.meta.env.DEV ? debugBall({ done: false, tap, startT, fps, w, h, aspect, frames: dbgFrames }) : null;
      tracker = new BallTracker(tap, { w, h, clock });
      const step = 1 / Number(fps);
      const tEnd = Math.min(meta.dur - step, startT + MAX_SCAN_S);
      let prev: Gray | null = null;
      let shown = 0;
      for (let i = 0; ; i++) {
        const want = startT + i * step;
        if (want > tEnd + 1e-6) break;
        if (runRef.current !== run) return; // cancelado (otro video, reinicio o salida de la pantalla)
        // Si en 6 s de video no apareció ninguna mancha, no tiene caso seguir recorriendo cientos de cuadros.
        // (Mientras se espera a que la bola salga de su sitio no se corta: el golpe puede llegar más tarde.)
        if (!tracker.waiting && tracker.firstDetectedMs === null && want - startT > 6) break;
        await seekTo(v, want);
        if (runRef.current !== run) return;
        const tMs = v.currentTime * 1000; // el tiempo real del cuadro, no el pedido
        ctx.drawImage(v, 0, 0, w, h);
        const cur = toGray(ctx.getImageData(0, 0, w, h).data, w, h);
        if (prev && !framesIdentical(prev, cur)) {
          const before = tracker.points.length;
          tracker.feed(prev, cur, tMs);
          if (dbg) dbgFrames.push({ t: tMs, det: tracker.points.length > before, skipped: false });
          if (tracker.done) break;
        } else if (dbg) dbgFrames.push({ t: tMs, det: false, skipped: !!prev });
        prev = cur;

        let p = tEnd > startT ? (want - startT) / (tEnd - startT) : 1;
        const f0 = tracker.firstDetectedMs;
        if (f0 !== null) p = Math.max(p, (tMs - f0) / tracker.maxFollowMs);
        shown = Math.max(shown, Math.min(99, Math.round(p * 100)));
        setProgress(shown);
      }
      if (runRef.current !== run) return;
      const res = tracker.result();
      // F5.6: con la bandera, se arma el seguimiento v2 (huecos, bajada en la imagen) para el reproductor.
      const track = flags.flightV2 ? buildFlightTrack(res, { sourceId: 'local', clock, tap: { x: tap.x, y: tap.y, t: startT * 1000 }, aspect, analysisH: h, clipEndMs: meta.dur * 1000, allowEstimate: flags.flightEstimate }) : undefined;
      setOut({ res, summary: summarizeFlight(res, aspect), track, w: v.videoWidth, h: v.videoHeight });
      setProgress(100);
      if (dbg) Object.assign(dbg, { res, summary: summarizeFlight(res, aspect), done: true });
    } catch {
      if (dbg) Object.assign(dbg, { done: true, error: true });
      if (runRef.current === run) {
        // Si el video dejó de responder a mitad del seguimiento, no se tira lo que ya se había visto.
        const res = tracker?.result();
        if (tracker && res && res.points.length) {
          setOut({ res, summary: summarizeFlight(res, aspect) });
          setError('El video dejó de responder: se muestra lo que se alcanzó a seguir.');
        } else setError(READ_ERROR);
      }
    } finally {
      if (runRef.current === run) setBusy(false);
    }
  };

  /** F5.7: guarda el tiro (video + seguimiento) en una sesión que NO cuenta como dispersión. Lo pide el usuario. */
  const saveFlight = async () => {
    const f = fileRef.current;
    if (!out?.track || !f || !meta || saving) return;
    setSaving(true); setSaveMsg(null);
    const run = runRef.current;
    const r = await persistFlight(await getMediaStore(), { file: f, video: { durationMs: meta.dur * 1000, w: meta.w, h: meta.h }, track: out.track });
    if (runRef.current !== run) {
      // El usuario cambió de video o volvió a seguir mientras se guardaba: no se registra la sesión y se deshace lo guardado.
      if (r.ok) { const st = await getMediaStore(); await st.deleteMedia(r.ids.mediaId).catch(() => undefined); await st.deleteRecord(r.ids.flightTrackId).catch(() => undefined); }
      setSaving(false); return;
    }
    if (r.ok) {
      useStore.getState().addSession({ type: 'tracking', flightOnly: true, mediaId: r.ids.mediaId, flightTrackId: r.ids.flightTrackId });
      setSaveMsg({ ok: true, text: r.persistent ? 'Tiro guardado en este dispositivo.' : 'Tiro guardado solo mientras la app esté abierta: este navegador no deja guardar videos.' });
    } else setSaveMsg({ ok: false, text: r.message });
    setSaving(false);
  };

  const s = out?.summary;

  return (
    <div className="space-y-3">
      <Card className="space-y-4">
        {!url ? (
          <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-border rounded-xl py-10 cursor-pointer hover:bg-muted/50 text-center px-4">
            <span className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center"><Upload className="w-5 h-5" /></span>
            <span className="font-medium">Sube el video de tu tiro</span>
            <span className="text-xs text-muted-foreground">Cámara fija, sin zoom, con la bola a la vista antes del golpe. Mejor en MP4 (H.264).</span>
            <input type="file" accept="video/*" className="hidden" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
          </label>
        ) : (
          <>
            {/* El video solo se usa para leer cuadros: queda fuera de la vista pero con tamaño, para que el navegador lo decodifique. */}
            <video
              ref={videoRef} src={url} muted playsInline preload="auto"
              style={{ position: 'fixed', left: -9999, top: 0, width: 320, height: 180 }}
              onLoadedMetadata={(e) => onMeta(e.currentTarget)}
              onError={() => setError(READ_ERROR)}
            />
            {meta ? (
              <>
                <p className="text-sm font-medium">{out ? 'Resultado' : tap ? 'Listo: pulsa “Seguir la bola”' : 'Toca la bola donde está antes del golpe'}</p>
                {out?.track && url && out.w && out.h ? (
                  <FlightPlayer url={url} track={out.track} w={out.w} h={out.h} startMs={Math.max(0, startT * 1000 - 300)} />
                ) : (
                  <div className="rounded-2xl bg-black overflow-hidden">
                    <canvas
                      ref={canvasRef} onClick={onTap} aria-label="Cuadro del video: toca la bola"
                      className="block mx-auto cursor-crosshair"
                      style={{ maxWidth: '100%', maxHeight: '65vh', width: 'auto', height: 'auto' }}
                    />
                  </div>
                )}
                {meta.dur > 1.5 && (
                  <label className="block">
                    <span className="text-xs text-muted-foreground">Empezar a buscar en el segundo {fmtS(startT)} (con la bola ya puesta)</span>
                    <input
                      type="range" min={0} max={Math.max(0, Math.floor((meta.dur - 1) * 10) / 10)} step={0.1} value={startT} disabled={busy}
                      onChange={(e) => { const t = Number(e.target.value); setStartT(t); setOut(null); void showFrame(t); }}
                      className="w-full"
                    />
                  </label>
                )}
              </>
            ) : (
              !error && <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Leyendo el video…</p>
            )}

            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">Cuadros por segundo del video</p>
              <Segmented<Fps>
                value={fps}
                onChange={(f) => { if (!busy) { setFps(f); setOut(null); } }}
                options={[{ value: '30', label: '30 fps' }, { value: '60', label: '60 fps' }]}
              />
              <p className="text-[11px] text-muted-foreground">Elige 60 solo si grabaste a 60: es más preciso pero tarda el doble.</p>
            </div>

            <div className="flex gap-2">
              <Button full onClick={follow} disabled={!meta || !tap || busy}>
                {busy ? <><Loader2 className="w-5 h-5 animate-spin" /> Siguiendo… {progress}%</> : <><Crosshair className="w-5 h-5" /> Seguir la bola</>}
              </Button>
              {busy
                ? <Button variant="outline" onClick={() => { runRef.current++; setBusy(false); setProgress(0); }}>Cancelar</Button>
                : <Button variant="outline" onClick={reset} aria-label="Cambiar video"><RefreshCw className="w-5 h-5" /></Button>}
            </div>
            {(tap || out) && !busy && (
              <Button variant="outline" full onClick={() => { setTap(null); setOut(null); setError(null); setSaveMsg(null); }}>Elegir otro punto</Button>
            )}
          </>
        )}
      </Card>

      {error && <Notice tone="error">{error}</Notice>}

      {out && s && (
        <>
          <div className="grid grid-cols-2 gap-2">
            {flightStatCards(s).map((c) => <Stat key={c.label} label={c.label} value={c.value} unit={c.unit} />)}
          </div>
          {!out.track && <Legend />}
          {out.track && out.track.observed.length > 0 && (
            <div className="space-y-2">
              <Button variant="outline" full disabled={saving || saveMsg?.ok === true} onClick={() => void saveFlight()}>{saveMsg?.ok ? 'Guardado' : saving ? 'Guardando…' : 'Guardar este tiro'}</Button>
              {saveMsg && <Notice tone={saveMsg.ok ? 'ok' : 'error'}>{saveMsg.text}</Notice>}
              <p className="text-[11px] text-muted-foreground">Guarda el video y la línea en este dispositivo. No entra en tus tiros de dispersión ni en tus medallas de tracking.</p>
            </div>
          )}
          {s.detected === 0 && !s.released && (
            <Notice tone="error">No se detectó la bola: no pude confirmar que estuviera quieta en el punto que tocaste, que saliera de ahí y que se alejara como un vuelo. Lo que se mueve antes (el palo, las manos, el cuerpo) no es su vuelo, así que no dibujo ninguna línea. Toca la bola justo antes del golpe y empieza el video unos segundos antes de pegar. Con bola blanca contra cielo claro es lo esperado.</Notice>
          )}
          {s.detected === 0 && s.released && (
            <Notice tone="error">No encontré la bola. Es lo esperado con bola blanca contra cielo claro, o si el toque quedó lejos de la bola. Toca otro punto o prueba con otro tramo del video.</Notice>
          )}
          {s.detected > 0 && s.detected < 3 && (
            <Notice>Solo {s.detected} {s.detected === 1 ? 'punto' : 'puntos'}: es muy poco para hablar de una trayectoria.</Notice>
          )}
          {s.lostAtS !== null && (
            <Notice>Bola perdida a los {fmtS(s.lostAtS)} s de seguirla (contados desde su primer punto). No se dibuja nada más allá: no adivino por dónde fue.</Notice>
          )}
          {s.endReason === 'window' && <Notice>Se siguió hasta el límite de tiempo de seguimiento desde el primer punto: no es el vuelo completo.</Notice>}
          {s.endReason === null && s.detected > 0 && s.lostAtS === null && (
            <Notice>El video terminó mientras aún se seguía algo: no es el vuelo completo.</Notice>
          )}
          {s.detected > 0 && (
            <Notice>Revisa que la línea siga a la bola. Si va por otra cosa (el palo, una mano), descarta el resultado y toca otro punto.</Notice>
          )}
        </>
      )}

      <Notice>
        Con un video de teléfono no se puede medir la distancia, la velocidad ni la dirección real de un tiro completo, así que no las muestro. Contra el cielo, una bola blanca casi no contrasta: se espera seguirla solo sus primeros instantes y puede perderse contra el cielo. Funciona mejor con la cámara fija, buena luz y un fondo que no sea el cielo claro. El análisis no se guarda en tu historial de tiros.
      </Notice>
    </div>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground px-1" aria-label="Leyenda">
      <span className="flex items-center gap-1.5">
        <svg width="28" height="10" aria-hidden><line x1="1" y1="5" x2="27" y2="5" stroke={GREEN} strokeWidth="2" /><circle cx="14" cy="5" r="2.6" fill={GREEN} /></svg>
        Detectado: una mancha en movimiento en ese cuadro (puede no ser la bola)
      </span>
      <span className="flex items-center gap-1.5">
        <svg width="28" height="10" aria-hidden><line x1="1" y1="5" x2="27" y2="5" stroke={GOLD} strokeWidth="2" strokeDasharray="4 3" /></svg>
        Tramo unido sin ver la bola (no es un punto detectado)
      </span>
      <span className="flex items-center gap-1.5">
        <svg width="14" height="14" aria-hidden><circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
        Anillo: donde tocaste
      </span>
    </div>
  );
}
