import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Activity, ArrowLeft, Camera, CheckCircle2, Loader2, RefreshCw, Square, Upload, Video, AlertTriangle, Wrench } from 'lucide-react';
import { FREE, swingUploadsToday, useStore } from '@/store';
import { analyzeSwing, viewOfFrame, SWING_ERROR_TEXT, VIEW_LABEL, type Frame, type SwingResult, type SwingView, LM } from '@/lib/swing';
import { detect, drawSkeleton, loadPose } from '@/lib/pose';
import { Button, Card, Notice, PageHeader, PremiumGate, ScoreRing, Segmented, Stat } from '@/components/ui';

type Tab = 'video' | 'live';
type ViewChoice = SwingView | 'auto';

export default function Swing() {
  const premium = useStore((s) => s.profile.premium);
  const mode = useStore((s) => s.mode);
  const [tab, setTab] = useState<Tab>('video');
  const [view, setView] = useState<ViewChoice>('auto');
  // /swing?ver=<id> abre el resultado de un swing ya guardado (desde "Sesiones recientes").
  const [params, setParams] = useSearchParams();
  const verId = params.get('ver');
  const saved = useStore((s) => (verId ? s.sessions.find((x) => x.id === verId) : undefined));
  if (saved?.swing) {
    return (
      <div className="space-y-5">
        <PageHeader
          icon={<Activity className="w-5 h-5" />}
          title="Análisis de swing"
          subtitle={`${new Date(saved.at).toLocaleDateString('es', { day: 'numeric', month: 'long' })} · ${saved.mode === 'casa' ? 'Casa' : 'Cancha'}${saved.live ? ' · en vivo' : ''}`}
        />
        <SwingResultView r={saved.swing} />
        <Button full variant="outline" onClick={() => setParams({})}><ArrowLeft className="w-5 h-5" /> Analizar otro swing</Button>
      </div>
    );
  }
  return (
    <div className="space-y-5">
      <PageHeader icon={<Activity className="w-5 h-5" />} title="Análisis de swing" subtitle={mode === 'casa' ? 'En casa: de frente o desde atrás, cuerpo entero' : 'En cancha: apoya el teléfono a unos 3 m, de frente o desde atrás'} />
      <Segmented<Tab>
        value={tab}
        onChange={setTab}
        options={[
          { value: 'video', label: <><Upload className="w-4 h-4" /> Subir video</> },
          { value: 'live', label: <><Video className="w-4 h-4" /> En vivo</>, locked: !premium },
        ]}
      />
      <div className="space-y-1.5">
        <p className="text-xs uppercase tracking-wide text-muted-foreground px-1">Vista de la cámara</p>
        <Segmented<ViewChoice>
          value={view}
          onChange={setView}
          options={[
            { value: 'auto', label: 'Automática' },
            { value: 'frente', label: VIEW_LABEL.frente },
            { value: 'atras', label: VIEW_LABEL.atras },
          ]}
        />
        <p className="text-xs text-muted-foreground px-1">
          {view === 'auto' ? 'La app reconoce sola si te grabas de frente o desde atrás, sobre la línea de tiro.'
            : view === 'frente' ? 'De frente: tempo, giros, postura, cabeza y traslado de peso.'
            : 'Desde atrás, sobre la línea de tiro: inclinación, rodillas, caderas y cabeza.'}
        </p>
      </div>
      {tab === 'video' ? <UploadAnalyzer view={view} /> : premium ? <LiveAnalyzer view={view} /> : (
        <PremiumGate title="Análisis en vivo">
          Coloca el teléfono de frente, activa la cámara y recibe la nota y la corrección de cada swing al instante, sin tocar la pantalla. Disponible en Premium.
        </PremiumGate>
      )}
    </div>
  );
}

/* ───────────────────────── Resultado ───────────────────────── */

const SEV = {
  fix: { label: 'Corregir', cls: 'bg-destructive/10 text-destructive', Icon: AlertTriangle },
  improve: { label: 'Mejorar', cls: 'bg-accent/15 text-[hsl(38_70%_32%)]', Icon: Wrench },
  good: { label: 'Bien', cls: 'bg-primary/10 text-primary', Icon: CheckCircle2 },
} as const;

export function SwingResultView({ r }: { r: SwingResult }) {
  const tone = (ok: boolean, mid = false) => (ok ? 'good' : mid ? 'warn' : 'bad') as 'good' | 'warn' | 'bad';
  const tempo = (
    <Stat label="Tempo" value={`${r.metrics.tempoRatio}:1`} tone={tone(r.metrics.tempoRatio >= 2.6 && r.metrics.tempoRatio <= 3.4, r.metrics.tempoRatio >= 2 && r.metrics.tempoRatio <= 4.2)} />
  );
  return (
    <div className="space-y-4">
      <Card className="flex items-center gap-4">
        <ScoreRing score={r.score} />
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Nota del swing · {VIEW_LABEL[r.view ?? 'frente'].toLowerCase()}</p>
          <p className="text-sm mt-1">{r.summary}</p>
        </div>
      </Card>

      {r.view === 'atras' ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {tempo}
          <Stat label="Inclinación al inicio" value={r.metrics.spineAddressDeg} unit="°" tone={tone(r.metrics.spineAddressDeg >= 25 && r.metrics.spineAddressDeg <= 45, r.metrics.spineAddressDeg >= 15 && r.metrics.spineAddressDeg <= 55)} />
          {r.metrics.kneeFlexDeg != null && (
            <Stat label="Flexión de rodillas" value={r.metrics.kneeFlexDeg} unit="°" tone={tone(r.metrics.kneeFlexDeg >= 10 && r.metrics.kneeFlexDeg <= 30, true)} />
          )}
          <Stat label="Postura al impacto" value={Math.abs(r.metrics.spineImpactChangeDeg)} unit="°" tone={tone(Math.abs(r.metrics.spineImpactChangeDeg) <= 7, Math.abs(r.metrics.spineImpactChangeDeg) <= 14)} />
          <Stat label="Caderas hacia la bola" value={r.metrics.hipAdvancePct} unit="%" tone={tone(r.metrics.hipAdvancePct <= 6, r.metrics.hipAdvancePct <= 14)} />
          <Stat label="Cabeza: sube/baja" value={Math.abs(r.metrics.headVerticalPct)} unit="%" tone={tone(Math.abs(r.metrics.headVerticalPct) <= 10, Math.abs(r.metrics.headVerticalPct) <= 20)} />
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {tempo}
          <Stat label="Giro de hombros" value={r.metrics.shoulderTurnDeg} unit="°" tone={tone(r.metrics.shoulderTurnDeg >= 75, r.metrics.shoulderTurnDeg >= 55)} />
          <Stat label="Giro de caderas" value={r.metrics.hipTurnDeg} unit="°" tone={tone(r.metrics.hipTurnDeg <= 60, true)} />
          <Stat label="Cambio de postura" value={Math.abs(r.metrics.spineChangeDeg)} unit="°" tone={tone(Math.abs(r.metrics.spineChangeDeg) <= 6, Math.abs(r.metrics.spineChangeDeg) <= 12)} />
          <Stat label="Mov. de cabeza" value={r.metrics.headSwayPct} unit="%" tone={tone(r.metrics.headSwayPct <= 25, r.metrics.headSwayPct <= 45)} />
          <Stat label="Avance de cadera" value={r.metrics.hipShiftPct} unit="%" tone={tone(r.metrics.hipShiftPct >= 8, r.metrics.hipShiftPct >= -5)} />
        </div>
      )}
      <p className="text-xs text-muted-foreground px-1">
        Subida {r.metrics.backswingSec}s · bajada {r.metrics.downswingSec}s · {r.metrics.framesUsed} cuadros. Medidas estimadas a partir de tu postura con una sola cámara; no miden el palo ni la bola.
      </p>

      <div className="space-y-2">
        {r.feedback.map((f) => {
          const s = SEV[f.severity];
          return (
            <Card key={f.key} className="!p-4 space-y-2">
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${s.cls}`}><s.Icon className="w-3 h-3" />{s.label}</span>
                <h3 className="font-semibold text-sm">{f.title}</h3>
              </div>
              <p className="text-sm text-muted-foreground">{f.detail}</p>
              {f.drill && <p className="text-sm bg-muted rounded-lg px-3 py-2"><span className="font-semibold">Ejercicio: </span>{f.drill}</p>}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

/* ───────────────────────── Subir video ───────────────────────── */

const MAX_SECONDS = 12;
const STEP = 1 / 20;

function UploadAnalyzer({ view }: { view: ViewChoice }) {
  const { profile, sessions, addSession } = useStore();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SwingResult | null>(null);

  const used = swingUploadsToday(sessions);
  const limitReached = !profile.premium && used >= FREE.swingUploadsPerDay;

  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  const pick = (f?: File) => {
    if (!f) return;
    setResult(null); setError(null); setProgress(0);
    setUrl(URL.createObjectURL(f));
  };

  const analyze = async () => {
    const v = videoRef.current;
    if (!v) return;
    setBusy(true); setError(null); setResult(null);
    try {
      const pose = await loadPose();
      if (v.readyState < 1) await new Promise((res) => v.addEventListener('loadedmetadata', res, { once: true }));
      v.pause();
      const dur = Math.min(v.duration || 0, MAX_SECONDS);
      const frames: Frame[] = [];
      for (let t = 0; t < dur; t += STEP) {
        await new Promise<void>((res) => { v.addEventListener('seeked', () => res(), { once: true }); v.currentTime = t; });
        const f = detect(pose, v, t * 1000);
        if (f) frames.push(f);
        setProgress(Math.round((t / dur) * 100));
      }
      const r = analyzeSwing(frames, { lefty: profile.lefty, view, aspect: v.videoWidth && v.videoHeight ? v.videoWidth / v.videoHeight : 1 });
      if (typeof r === 'string') setError(SWING_ERROR_TEXT[r]);
      else {
        setResult(r);
        addSession({ type: 'swing', score: r.score, tempoRatio: r.metrics.tempoRatio, swing: r });
      }
    } catch (e) {
      setError('No se pudo analizar el video. ' + (e instanceof Error ? e.message : ''));
    } finally {
      setBusy(false);
    }
  };

  if (limitReached && !result) {
    return (
      <PremiumGate title="Ya usaste tu análisis de hoy">
        La versión gratuita incluye {FREE.swingUploadsPerDay} análisis de video por día. Con Premium son ilimitados y además tienes el análisis en vivo.
      </PremiumGate>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-4">
        {url ? (
          <video ref={videoRef} src={url} controls={!busy} muted playsInline className="w-full rounded-xl bg-black max-h-[50vh]" />
        ) : (
          <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-border rounded-xl py-10 cursor-pointer hover:bg-muted/50">
            <span className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center"><Upload className="w-5 h-5" /></span>
            <span className="font-medium">Sube o graba tu swing</span>
            <span className="text-xs text-muted-foreground">Un solo swing, de frente o desde atrás, de cuerpo entero · máx. {MAX_SECONDS} s</span>
            <input type="file" accept="video/*" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
          </label>
        )}
        {url && (
          <div className="flex gap-2">
            <Button full onClick={analyze} disabled={busy}>
              {busy ? <><Loader2 className="w-5 h-5 animate-spin" /> Analizando… {progress}%</> : <><Activity className="w-5 h-5" /> Analizar swing</>}
            </Button>
            <Button variant="outline" disabled={busy} onClick={() => { setUrl(null); setResult(null); setError(null); }} aria-label="Cambiar video"><RefreshCw className="w-5 h-5" /></Button>
          </div>
        )}
        {!profile.premium && <p className="text-xs text-muted-foreground text-center">Gratis: {Math.max(0, FREE.swingUploadsPerDay - used)} de {FREE.swingUploadsPerDay} análisis disponibles hoy.</p>}
      </Card>
      {error && <Notice tone="error">{error}</Notice>}
      {result && <SwingResultView r={result} />}
    </div>
  );
}

/* ───────────────────────── En vivo (Premium) ───────────────────────── */

type Phase = 'ready' | 'top' | 'settle' | 'rearm';

function LiveAnalyzer({ view }: { view: ViewChoice }) {
  const { profile, addSession } = useStore();
  // El bucle de la cámara vive fuera del render: lee la vista elegida desde una referencia.
  const viewRef = useRef(view);
  viewRef.current = view;
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef(0);
  const [on, setOn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [facing, setFacing] = useState<'user' | 'environment'>('user');
  const [status, setStatus] = useState('Colócate de cuerpo entero frente a la cámara');
  const [swings, setSwings] = useState<SwingResult[]>([]);
  const swingsRef = useRef<SwingResult[]>([]);

  const stop = () => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setOn(false);
  };
  useEffect(() => stop, []);

  const start = async (face = facing) => {
    setError(null); setLoading(true);
    try {
      const pose = await loadPose();
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: face, width: { ideal: 960 }, height: { ideal: 720 }, frameRate: { ideal: 60 } }, audio: false });
      streamRef.current = stream;
      const v = videoRef.current!;
      v.srcObject = stream;
      await v.play();
      setOn(true);

      const buf: Frame[] = [];
      let phase: Phase = 'ready', tTop = 0, tImp = 0, lowSince = 0;

      const loop = () => {
        rafRef.current = requestAnimationFrame(loop);
        if (v.readyState < 2) return;
        const now = performance.now();
        const f = detect(pose, v, now);
        const c = canvasRef.current!;
        if (c.width !== v.videoWidth) { c.width = v.videoWidth; c.height = v.videoHeight; }
        const ctx = c.getContext('2d')!;
        ctx.clearRect(0, 0, c.width, c.height);
        if (!f) { if (phase === 'ready') setStatus('No te veo: aléjate hasta que entres de cuerpo entero'); return; }
        drawSkeleton(ctx, f.lm, c.width, c.height);
        buf.push(f);
        while (buf.length && now - buf[0].t > 8000) buf.shift();

        const wy = (f.lm[LM.L_WRIST].y + f.lm[LM.R_WRIST].y) / 2;
        const shY = (f.lm[LM.L_SHOULDER].y + f.lm[LM.R_SHOULDER].y) / 2;
        const hipY = (f.lm[LM.L_HIP].y + f.lm[LM.R_HIP].y) / 2;
        const handsHigh = wy < shY - 0.02;
        const handsLow = wy > hipY - 0.04;

        const aspect = v.videoWidth && v.videoHeight ? v.videoWidth / v.videoHeight : 1;
        if (phase === 'ready') {
          const seen = viewRef.current === 'auto' ? viewOfFrame(f, aspect) : viewRef.current;
          setStatus(`Listo (${VIEW_LABEL[seen].toLowerCase()}). Haz tu swing cuando quieras`);
          if (handsHigh) { phase = 'top'; tTop = now; }
        } else if (phase === 'top') {
          if (handsLow) { phase = 'settle'; tImp = now; }
          else if (now - tTop > 2500) phase = 'rearm';
        } else if (phase === 'settle') {
          if (now - tImp > 600) {
            const seg = buf.filter((b) => b.t >= tTop - 2500 && b.t <= tImp + 500);
            const r = analyzeSwing(seg, { lefty: profile.lefty, view: viewRef.current, aspect });
            if (typeof r !== 'string') {
              swingsRef.current = [r, ...swingsRef.current];
              setSwings(swingsRef.current);
              setStatus(`Swing ${swingsRef.current.length}: ${r.score}/100`);
            } else setStatus('No pude leer ese swing. Repítelo de cuerpo entero');
            phase = 'rearm'; lowSince = 0;
          }
        } else if (phase === 'rearm') {
          // vuelve a armar solo cuando las manos llevan medio segundo abajo (posición de inicio)
          if (handsLow) { if (!lowSince) lowSince = now; if (now - lowSince > 500) phase = 'ready'; }
          else lowSince = 0;
        }
      };
      loop();
    } catch (e) {
      setError(e instanceof DOMException && e.name === 'NotAllowedError'
        ? 'Necesito permiso para usar la cámara. Actívalo en los ajustes del navegador o del teléfono.'
        : 'No se pudo abrir la cámara. ' + (e instanceof Error ? e.message : ''));
      stop();
    } finally {
      setLoading(false);
    }
  };

  const finish = () => {
    stop();
    const list = swingsRef.current;
    if (list.length) {
      const best = list.reduce((a, b) => (b.score > a.score ? b : a));
      addSession({ type: 'swing', live: true, score: best.score, tempoRatio: best.metrics.tempoRatio, swing: best, shots: list.length });
    }
  };

  const flip = () => { const n = facing === 'user' ? 'environment' : 'user'; setFacing(n); stop(); start(n); };
  const last = swings[0];
  const topIssue = last?.feedback.find((f) => f.severity !== 'good');

  return (
    <div className="space-y-4">
      <div className="relative bg-black rounded-2xl overflow-hidden aspect-[3/4] sm:aspect-video">
        <video ref={videoRef} muted playsInline className={`w-full h-full object-contain ${facing === 'user' ? '-scale-x-100' : ''}`} />
        <canvas ref={canvasRef} className={`absolute inset-0 w-full h-full object-contain ${facing === 'user' ? '-scale-x-100' : ''}`} />
        {!on && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white p-6 text-center">
            <Camera className="w-10 h-10 opacity-80" />
            <p className="text-sm opacity-80">Apoya el teléfono a unos 3 metros, de frente o desde atrás, y entra de cuerpo entero.</p>
            <Button variant="gold" onClick={() => start()} disabled={loading}>
              {loading ? <><Loader2 className="w-5 h-5 animate-spin" /> Preparando…</> : <><Video className="w-5 h-5" /> Iniciar análisis en vivo</>}
            </Button>
          </div>
        )}
        {on && (
          <>
            <div className="absolute top-3 left-3 right-3 bg-black/60 text-white text-sm font-medium rounded-xl px-3 py-2 text-center">{status}</div>
            {last && (
              <div className="absolute bottom-3 left-3 right-3 bg-black/70 text-white rounded-xl px-4 py-3 flex items-center gap-3">
                <span className="font-heading text-4xl font-bold">{last.score}</span>
                <span className="text-sm leading-snug">
                  <span className="block opacity-70">Tempo {last.metrics.tempoRatio}:1 · {last.view === 'atras' ? `inclinación ${last.metrics.spineAddressDeg}°` : `hombros ${last.metrics.shoulderTurnDeg}°`}</span>
                  <span className="block font-semibold">{topIssue ? topIssue.title : '¡Swing muy sólido!'}</span>
                </span>
              </div>
            )}
          </>
        )}
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      {on && (
        <div className="flex gap-2">
          <Button full variant="outline" onClick={finish}><Square className="w-4 h-4" /> Terminar sesión{swings.length ? ` (${swings.length})` : ''}</Button>
          <Button variant="outline" onClick={flip} aria-label="Cambiar cámara"><RefreshCw className="w-5 h-5" /></Button>
        </div>
      )}
      {!on && swings.length > 0 && (
        <>
          <Notice tone="ok">Sesión guardada con {swings.length} swing{swings.length > 1 ? 's' : ''}. Este fue el mejor:</Notice>
          <SwingResultView r={swings.reduce((a, b) => (b.score > a.score ? b : a))} />
        </>
      )}
    </div>
  );
}
