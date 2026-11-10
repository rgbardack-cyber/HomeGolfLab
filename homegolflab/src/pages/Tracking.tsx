import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Camera, Clock, Crosshair, Loader2, PencilLine, Plus, Save, Square, Target, Trash2 } from 'lucide-react';
import { useStore } from '@/store';
import { fmtClock, isLocked, remainingSec } from '@/lib/ads';
import AdGate from '@/components/AdGate';
import { analyzeShot, CLUBS, detectMovingBright, dispersion, type P2, type Shot, type TrackPoint } from '@/lib/tracking';
import { Button, Card, Notice, PageHeader, Segmented, Stat } from '@/components/ui';

type Tab = 'camera' | 'manual';

export default function Tracking() {
  const mode = useStore((s) => s.mode);
  const addSession = useStore((s) => s.addSession);
  const [tab, setTab] = useState<Tab>(mode === 'cancha' ? 'manual' : 'camera');
  const [shots, setShots] = useState<Shot[]>([]);
  const [saved, setSaved] = useState(false);

  const add = (s: Omit<Shot, 'id' | 'at'>) => { setSaved(false); setShots((p) => [...p, { ...s, id: crypto.randomUUID(), at: new Date().toISOString() }]); };
  const d = dispersion(shots);

  // Gratis: 15 minutos de uso y luego 2 anuncios para abrir otros 15. Premium: sin límite ni anuncios.
  const premium = useStore((s) => s.profile.premium);
  const usedSec = useStore((s) => s.trackingUsedSec);
  const addTrackingTime = useStore((s) => s.addTrackingTime);
  const unlockTracking = useStore((s) => s.unlockTracking);
  const locked = isLocked(usedSec, premium);
  useEffect(() => {
    if (premium || locked) return;
    const t = setInterval(() => { if (document.visibilityState === 'visible') addTrackingTime(1); }, 1000);
    return () => clearInterval(t);
  }, [premium, locked, addTrackingTime]);

  const save = () => {
    let best = 0, run = 0;
    for (const s of shots) { run = s.source === 'camera' && s.onLine ? run + 1 : 0; best = Math.max(best, run); }
    addSession({ type: 'tracking', shots: shots.length, onLineStreak: best, consistency: d?.consistency ?? 0, shotList: shots });
    setShots([]); setSaved(true);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        icon={<Target className="w-5 h-5" />}
        title="Ball tracking"
        subtitle={mode === 'casa' ? 'Mide tus putts y registra tus tiros' : 'Registra tus tiros y tu dispersión'}
        right={<div className="text-right"><p className="font-heading text-2xl font-bold text-primary leading-none">{shots.length}</p><p className="text-[11px] text-muted-foreground">tiros</p></div>}
      />
      {!premium && !locked && (
        <div className="flex items-center gap-2 text-xs bg-muted rounded-xl px-3 py-2">
          <Clock className="w-4 h-4 text-primary shrink-0" />
          <span className="flex-1">Tiempo gratis: <span className="font-bold tabular-nums">{fmtClock(remainingSec(usedSec))}</span>. Después, 2 anuncios para seguir.</span>
          <Link to="/perfil" className="font-semibold text-primary shrink-0">Sin anuncios</Link>
        </div>
      )}

      {locked ? (
        <AdGate onUnlocked={unlockTracking} />
      ) : (
        <>
          <Segmented<Tab>
            value={tab}
            onChange={setTab}
            options={[
              { value: 'camera', label: <><Camera className="w-4 h-4" /> Cámara (putt)</> },
              { value: 'manual', label: <><PencilLine className="w-4 h-4" /> Registro manual</> },
            ]}
          />
          {tab === 'camera' ? <CameraTracker onShot={add} /> : <ManualEntry onShot={add} />}
        </>
      )}
      {saved && <Notice tone="ok">Sesión guardada.</Notice>}

      {shots.length > 0 && (
        <>
          {d && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Stat label="Distancia media" value={d.avgCarryM} unit="m" />
              <Stat label="Desvío medio" value={`${d.avgLateralM > 0 ? '+' : ''}${d.avgLateralM}`} unit="m" />
              <Stat label="Dispersión lateral" value={`±${d.lateralStdM}`} unit="m" />
              <Stat label="Consistencia" value={shots.length < 2 ? '—' : d.consistency} unit={shots.length < 2 ? '' : '%'} tone={d.consistency >= 80 ? 'good' : d.consistency >= 60 ? 'warn' : undefined} />
            </div>
          )}
          {shots.length >= 2 && <DispersionMap shots={shots} />}
          <Card className="!p-0 divide-y divide-border">
            {[...shots].reverse().map((s, i) => (
              <div key={s.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                <span className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-xs font-bold">{shots.length - i}</span>
                <span className="flex-1 min-w-0">
                  <span className="font-medium">{s.club}</span>
                  <span className="text-muted-foreground"> · {s.carryM} m · {fmtLat(s.lateralM)}</span>
                  {s.source === 'camera' && <span className="block text-xs text-muted-foreground">{s.directionDeg}° · {s.speedMps} m/s · {s.onLine ? 'en línea ✓' : 'fuera de línea'}</span>}
                </span>
                <button aria-label="Borrar tiro" onClick={() => setShots((p) => p.filter((x) => x.id !== s.id))} className="p-2 text-muted-foreground hover:text-destructive"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
          </Card>
          <Button full onClick={save}><Save className="w-5 h-5" /> Guardar sesión ({shots.length} tiros)</Button>
        </>
      )}
    </div>
  );
}

const fmtLat = (m: number) => (Math.abs(m) < 0.005 ? 'centro' : `${Math.abs(m) < 1 ? Math.round(Math.abs(m) * 100) + ' cm' : Math.abs(m).toFixed(1) + ' m'} ${m > 0 ? 'der.' : 'izq.'}`);

/* ───────────────────────── Mapa de dispersión ───────────────────────── */

function DispersionMap({ shots }: { shots: Shot[] }) {
  const W = 320, H = 220, pad = 24;
  const maxLat = Math.max(0.1, ...shots.map((s) => Math.abs(s.lateralM))) * 1.25;
  const maxCar = Math.max(0.5, ...shots.map((s) => s.carryM)) * 1.1;
  const x = (m: number) => W / 2 + (m / maxLat) * (W / 2 - pad);
  const y = (m: number) => H - pad - (m / maxCar) * (H - 2 * pad);
  return (
    <Card className="!p-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground px-2 pb-1">Mapa de dispersión</p>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-xl bg-primary/10" role="img" aria-label="Mapa de dispersión de tiros">
        <line x1={W / 2} y1={pad / 2} x2={W / 2} y2={H - pad / 2} stroke="var(--color-primary)" strokeDasharray="4 4" strokeWidth="1" />
        <circle cx={W / 2} cy={H - pad} r="4" fill="var(--color-foreground)" />
        {shots.map((s) => <circle key={s.id} cx={x(s.lateralM)} cy={y(s.carryM)} r="6" fill={s.source === 'camera' ? 'var(--color-accent)' : 'var(--color-primary)'} stroke="#fff" strokeWidth="1.5" />)}
        <text x={pad / 2} y={H - 6} fontSize="10" fill="var(--color-muted-foreground)">← izq. {maxLat.toFixed(1)} m</text>
        <text x={W - pad / 2} y={H - 6} fontSize="10" textAnchor="end" fill="var(--color-muted-foreground)">der. {maxLat.toFixed(1)} m →</text>
      </svg>
    </Card>
  );
}

/* ───────────────────────── Registro manual ───────────────────────── */

function ManualEntry({ onShot }: { onShot: (s: Omit<Shot, 'id' | 'at'>) => void }) {
  const [club, setClub] = useState('Hierro 7');
  const [carry, setCarry] = useState('');
  const [lat, setLat] = useState('0');
  const [side, setSide] = useState<1 | -1>(1);
  const c = parseFloat(carry), l = parseFloat(lat) || 0;
  const input = 'mt-1 w-full h-11 rounded-xl border border-border bg-card px-3';
  return (
    <Card className="space-y-4">
      <p className="text-sm text-muted-foreground">Anota cada tiro: palo, distancia y cuánto se desvió del objetivo. Ideal para el range o el campo.</p>
      <div className="grid grid-cols-2 gap-3">
        <label className="block col-span-2"><span className="text-xs text-muted-foreground">Palo</span>
          <select value={club} onChange={(e) => setClub(e.target.value)} className={input}>{CLUBS.map((x) => <option key={x}>{x}</option>)}</select>
        </label>
        <label className="block"><span className="text-xs text-muted-foreground">Distancia (m)</span>
          <input type="number" inputMode="decimal" min="0" value={carry} onChange={(e) => setCarry(e.target.value)} placeholder="135" className={input} />
        </label>
        <label className="block"><span className="text-xs text-muted-foreground">Desvío lateral (m)</span>
          <input type="number" inputMode="decimal" min="0" value={lat} onChange={(e) => setLat(e.target.value)} className={input} />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => setSide(-1)} className={`h-11 rounded-xl border text-sm font-medium ${side === -1 ? 'border-primary bg-primary/10 text-primary' : 'border-border'}`}>← Izquierda</button>
        <button onClick={() => setSide(1)} className={`h-11 rounded-xl border text-sm font-medium ${side === 1 ? 'border-primary bg-primary/10 text-primary' : 'border-border'}`}>Derecha →</button>
      </div>
      <Button full disabled={!(c > 0)} onClick={() => { onShot({ source: 'manual', club, carryM: c, lateralM: Math.abs(l) * side }); setCarry(''); setLat('0'); }}>
        <Plus className="w-5 h-5" /> Agregar tiro
      </Button>
    </Card>
  );
}

/* ───────────────────────── Cámara: putt ───────────────────────── */

type Step = 'off' | 'ball' | 'target' | 'ready' | 'armed' | 'tracking';
const PW = 240; // ancho de la imagen de análisis

function CameraTracker({ onShot }: { onShot: (s: Omit<Shot, 'id' | 'at'>) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef(0);
  const stepRef = useRef<Step>('off');
  const [step, setStepState] = useState<Step>('off');
  const [aspect, setAspect] = useState(16 / 9);
  const [ball, setBall] = useState<P2 | null>(null);
  const [target, setTarget] = useState<P2 | null>(null);
  const [dist, setDist] = useState('2');
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [trail, setTrail] = useState<P2[]>([]);
  const geo = useRef<{ ball: P2 | null; target: P2 | null; dist: number }>({ ball: null, target: null, dist: 2 });

  const setStep = (s: Step) => { stepRef.current = s; setStepState(s); };
  useEffect(() => { geo.current = { ball, target, dist: parseFloat(dist) || 0 }; }, [ball, target, dist]);

  const stop = () => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setStep('off');
  };
  useEffect(() => stop, []);

  const start = async () => {
    setError(null); setLoading(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 60 } }, audio: false });
      streamRef.current = stream;
      const v = videoRef.current!;
      v.srcObject = stream;
      await v.play();
      setAspect(v.videoWidth / v.videoHeight || 16 / 9);
      setBall(null); setTarget(null); setTrail([]); setMsg(null);
      setStep('ball');
      loop();
    } catch (e) {
      setError(e instanceof DOMException && e.name === 'NotAllowedError' ? 'Necesito permiso para usar la cámara.' : 'No se pudo abrir la cámara. ' + (e instanceof Error ? e.message : ''));
    } finally { setLoading(false); }
  };

  const loop = () => {
    const v = videoRef.current!;
    const c = document.createElement('canvas');
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    let prev: Uint8ClampedArray | null = null;
    let pts: TrackPoint[] = [];
    let tLast = 0, tFirst = 0;

    const tick = () => {
      rafRef.current = requestAnimationFrame(tick);
      const st = stepRef.current;
      if (v.readyState < 2 || (st !== 'armed' && st !== 'tracking')) { prev = null; return; }
      const ar = v.videoWidth / v.videoHeight;
      const w = PW, h = Math.round(PW / ar);
      if (c.width !== w) { c.width = w; c.height = h; }
      ctx.drawImage(v, 0, 0, w, h);
      const cur = ctx.getImageData(0, 0, w, h).data;
      const now = performance.now();
      const { ball: b, target: g, dist: dm } = geo.current;
      if (prev && b && g) {
        const ux = (g.x - b.x) * ar, uy = g.y - b.y;
        const det = detectMovingBright(prev, cur, w, h, {
          accept: (x, y) => {
            const dx = (x - b.x) * ar, dy = y - b.y;
            return Math.hypot(dx, dy) > 0.07 && dx * ux + dy * uy > 0; // fuera de la zona de la bola y hacia el objetivo
          },
        });
        if (det) {
          if (st === 'armed') { pts = []; tFirst = now; setStep('tracking'); }
          pts.push({ x: det.x, y: det.y, t: now }); tLast = now;
          setTrail(pts.map((p) => ({ x: p.x, y: p.y })));
        }
        if (stepRef.current === 'tracking' && (now - tLast > 450 || now - tFirst > 3500)) {
          const r = analyzeShot({ points: pts, start: b, target: g, distanceM: dm, aspect: ar });
          if (r) {
            onShot({ source: 'camera', club: 'Putter', carryM: dm, lateralM: r.missCm / 100, speedMps: r.speedMps, directionDeg: r.directionDeg, onLine: r.onLine, quality: r.quality });
            setMsg(`${r.onLine ? 'En línea ✓' : 'Fuera de línea'} · ${Math.abs(r.directionDeg)}° ${r.directionDeg > 0 ? 'a la derecha' : r.directionDeg < 0 ? 'a la izquierda' : ''} · ${r.speedMps} m/s`);
          } else setMsg('No pude seguir la bola. Revisa la luz y que la bola contraste con el piso.');
          pts = [];
          setStep('ready');
        }
      }
      prev = cur;
    };
    tick();
  };

  const tap = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const p = { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
    if (step === 'ball') { setBall(p); setStep('target'); }
    else if (step === 'target') { setTarget(p); setStep('ready'); }
  };

  const hint: Record<Step, string> = {
    off: '', ball: '1. Toca la bola en la imagen', target: '2. Toca el objetivo (hoyo o marca)',
    ready: 'Coloca la bola en su marca y pulsa “Armar”', armed: 'Armado: haz tu putt', tracking: 'Siguiendo la bola…',
  };

  return (
    <div className="space-y-3">
      <div className="relative bg-black rounded-2xl overflow-hidden touch-none" style={{ aspectRatio: step === 'off' ? '16 / 9' : String(aspect) }} onPointerDown={tap}>
        <video ref={videoRef} muted playsInline className="absolute inset-0 w-full h-full" />
        {step === 'off' ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white text-center p-6">
            <Camera className="w-10 h-10 opacity-80" />
            <p className="text-sm opacity-80">Fija el teléfono (trípode o apoyado) viendo la bola y el objetivo desde arriba o en diagonal.</p>
            <Button variant="gold" onClick={start} disabled={loading}>{loading ? <><Loader2 className="w-5 h-5 animate-spin" /> Abriendo…</> : <><Camera className="w-5 h-5" /> Abrir cámara</>}</Button>
          </div>
        ) : (
          <>
            <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
              {ball && target && <line x1={ball.x * 100} y1={ball.y * 100} x2={target.x * 100} y2={target.y * 100} stroke="#e8c04a" strokeWidth="0.5" strokeDasharray="2 1.5" vectorEffect="non-scaling-stroke" />}
              {trail.length > 1 && <polyline points={trail.map((p) => `${p.x * 100},${p.y * 100}`).join(' ')} fill="none" stroke="#6dcf8e" strokeWidth="2" vectorEffect="non-scaling-stroke" />}
            </svg>
            {ball && <Marker p={ball} label="Bola" />}
            {target && <Marker p={target} label="Objetivo" gold />}
            <div className="absolute top-3 left-3 right-3 bg-black/60 text-white text-sm font-medium rounded-xl px-3 py-2 text-center">{hint[step]}</div>
          </>
        )}
      </div>

      {error && <Notice tone="error">{error}</Notice>}
      {msg && step !== 'off' && <Notice tone={msg.startsWith('En línea') ? 'ok' : 'info'}>{msg}</Notice>}

      {step !== 'off' && (
        <Card className="!p-4 space-y-3">
          <label className="flex items-center gap-3">
            <span className="text-sm flex-1">Distancia real de la bola al objetivo</span>
            <input type="number" inputMode="decimal" step="0.1" min="0.3" value={dist} onChange={(e) => setDist(e.target.value)} className="w-20 h-10 rounded-xl border border-border px-2 text-center" />
            <span className="text-sm text-muted-foreground">m</span>
          </label>
          <div className="flex gap-2">
            <Button full variant={step === 'armed' || step === 'tracking' ? 'gold' : 'primary'} disabled={!(ball && target && parseFloat(dist) > 0) || step === 'armed' || step === 'tracking'} onClick={() => { setTrail([]); setMsg(null); setStep('armed'); }}>
              <Crosshair className="w-5 h-5" /> {step === 'armed' ? 'Esperando el putt…' : step === 'tracking' ? 'Midiendo…' : 'Armar'}
            </Button>
            <Button variant="outline" onClick={() => { setBall(null); setTarget(null); setTrail([]); setStep('ball'); }}>Marcar de nuevo</Button>
            <Button variant="outline" onClick={stop} aria-label="Cerrar cámara"><Square className="w-4 h-4" /></Button>
          </div>
        </Card>
      )}
      <p className="text-xs text-muted-foreground px-1">
        Mide dirección y velocidad de salida en putts y chips rodados. Funciona mejor con bola blanca sobre una superficie más oscura y el teléfono quieto. La escala usa la distancia que indicas, así que es una aproximación. Un swing completo no se puede medir con la cámara del teléfono: usa el registro manual.
      </p>
    </div>
  );
}

function Marker({ p, label, gold }: { p: P2; label: string; gold?: boolean }) {
  return (
    <div className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none flex flex-col items-center" style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}>
      <span className={`w-6 h-6 rounded-full border-2 ${gold ? 'border-[#e8c04a]' : 'border-white'}`} />
      <span className="mt-0.5 text-[10px] font-semibold text-white bg-black/60 rounded px-1">{label}</span>
    </div>
  );
}
