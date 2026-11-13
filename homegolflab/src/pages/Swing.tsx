import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Activity, ArrowLeft, Camera, CheckCircle2, Loader2, RefreshCw, Square, Upload, Video, AlertTriangle, Wrench } from 'lucide-react';
import { FREE, swingUploadsToday, useStore } from '@/store';
import { analyzeSwing, SWING_ERROR_TEXT, type Frame, type SwingResult, LM } from '@/lib/swing';
import { detect, drawSkeleton, loadPose } from '@/lib/pose';
import { Button, Card, Notice, PageHeader, PremiumGate, ScoreRing, Segmented, Stat } from '@/components/ui';

type Tab = 'video' | 'live';

export default function Swing() {
  const premium = useStore((s) => s.profile.premium);
  const mode = useStore((s) => s.mode);
  const [tab, setTab] = useState<Tab>('video');
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
      <PageHeader icon={<Activity className="w-5 h-5" />} title="Análisis de swing" subtitle={mode === 'casa' ? 'En casa: de frente a la cámara, cuerpo entero' : 'En cancha: apoya el teléfono a unos 3 m, de frente'} />
      <Segmented<Tab>
        value={tab}
        onChange={setTab}
        options={[
          { value: 'video', label: <><Upload className="w-4 h-4" /> Subir video</> },
          { value: 'live', label: <><Video className="w-4 h-4" /> En vivo</>, locked: !premium },
        ]}
      />
      {tab === 'video' ? <UploadAnalyzer /> : premium ? <LiveAnalyzer /> : (
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
  const m = r.metrics;
  const tone = (ok: boolean, mid = false) => (ok ? 'good' : mid ? 'warn' : 'bad') as 'good' | 'warn' | 'bad';
  return (
    <div className="space-y-4">
      <Card className="flex items-center gap-4">
        <ScoreRing score={r.score} />
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Nota del swing</p>
          <p className="text-sm mt-1">{r.summary}</p>
        </div>
      </Card>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <Stat label="Tempo" value={`${m.tempoRatio}:1`} tone={tone(m.tempoRatio >= 2.6 && m.tempoRatio <= 3.4, m.tempoRatio >= 2 && m.tempoRatio <= 4.2)} />
        <Stat label="Giro de hombros" value={m.shoulderTurnDeg} unit="°" tone={tone(m.shoulderTurnDeg >= 75, m.shoulderTurnDeg >= 55)} />
        <Stat label="Giro de caderas" value={m.hipTurnDeg} unit="°" tone={tone(m.hipTurnDeg <= 60, true)} />
        <Stat label="Cambio de postura" value={Math.abs(m.spineChangeDeg)} unit="°" tone={tone(Math.abs(m.spineChangeDeg) <= 6, Math.abs(m.spineChangeDeg) <= 12)} />
        <Stat label="Mov. de cabeza" value={m.headSwayPct} unit="%" tone={tone(m.headSwayPct <= 25, m.headSwayPct <= 45)} />
        <Stat label="Avance de cadera" value={m.hipShiftPct} unit="%" tone={tone(m.hipShiftPct >= 8, m.hipShiftPct >= -5)} />
      </div>
      <p className="text-xs text-muted-foreground px-1">
        Subida {m.backswingSec}s · bajada {m.downswingSec}s · {m.framesUsed} cuadros. Medidas estimadas a partir de tu postura con una sola cámara; no miden el palo ni la bola.
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

function UploadAnalyzer() {
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
      const r = analyzeSwing(frames, { lefty: profile.lefty });
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
            <span className="text-xs text-muted-foreground">Un solo swing, de frente y de cuerpo entero · máx. {MAX_SECONDS} s</span>
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

function LiveAnalyzer() {
  const { profile, addSession } = useStore();
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

        if (phase === 'ready') {
          setStatus('Listo. Haz tu swing cuando quieras');
          if (handsHigh) { phase = 'top'; tTop = now; }
        } else if (phase === 'top') {
          if (handsLow) { phase = 'settle'; tImp = now; }
          else if (now - tTop > 2500) phase = 'rearm';
        } else if (phase === 'settle') {
          if (now - tImp > 600) {
            const seg = buf.filter((b) => b.t >= tTop - 2500 && b.t <= tImp + 500);
            const r = analyzeSwing(seg, { lefty: profile.lefty });
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
            <p className="text-sm opacity-80">Apoya el teléfono a unos 3 metros, de frente, y entra de cuerpo entero.</p>
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
                  <span className="block opacity-70">Tempo {last.metrics.tempoRatio}:1 · hombros {last.metrics.shoulderTurnDeg}°</span>
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
