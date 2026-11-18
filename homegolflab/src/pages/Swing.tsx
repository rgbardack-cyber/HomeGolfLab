import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Activity, ArrowLeft, Camera, CheckCircle2, Loader2, RefreshCw, Square, Upload, Video, AlertTriangle, Wrench, Sparkles } from 'lucide-react';
import { FREE, swingUploadsToday, useStore } from '@/store';
import { analyzeSwing, findSwingWindow, framingCheck, hipLine, viewOfFrame, SPINE_SIDE, SWING_ERROR_TEXT, TEMPO, VIEW_LABEL, type Frame, type SwingResult, type SwingView, type Tone, LM } from '@/lib/swing';
import { askCoach, coachPayload, CoachError, POSITION_LABEL, type CoachImage, type CoachResult, type Position } from '@/lib/coach';
import { bodyMask, findShaft, pointsDown, readClub, targetSide, toGray, SHAFT_MIN_CONFIDENCE, type Shaft } from '@/lib/club';
import { detect, drawSkeleton, loadPose } from '@/lib/pose';
import { CLUBS } from '@/lib/tracking';
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
          subtitle={`${new Date(saved.at).toLocaleDateString('es', { day: 'numeric', month: 'long' })} · ${saved.mode === 'casa' ? 'Casa' : 'Cancha'}${saved.live ? ' · en vivo' : ''}${saved.club ? ` · palo: ${saved.club}` : ''}`}
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
            : view === 'frente' ? 'De frente: tempo, giros, postura, cabeza, y si las caderas giran o se desplazan.'
            : 'Desde atrás, sobre la línea de tiro: inclinación, rodillas, cabeza y extensión temprana (caderas hacia la bola).'}
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

/** Un cuadro del video en una posición clave, con el esqueleto y el palo dibujados encima. */
export interface Shot {
  label: string;
  /** Foto con el esqueleto y las marcas dibujados, para mostrar. */
  url: string;
  /** La misma foto sin marcas y en mayor resolución, para el coach con IA (base64 JPEG, sin el prefijo data:). */
  clean?: string;
  position?: Position;
}

const POS_OF: Record<string, Position> = { Inicio: 'inicio', Tope: 'tope', Impacto: 'impacto' };

/** Coach con IA (Premium): lee las tres fotos y comenta lo que las reglas no miden. Se pide a mano porque cuesta por uso. */
function AiCoachCard({ r, shots }: { r: SwingResult; shots: Shot[] }) {
  const premium = useStore((s) => s.profile.premium);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [coach, setCoach] = useState<CoachResult | null>(null);
  const images: CoachImage[] = shots.flatMap((sh) => (sh.clean && sh.position ? [{ position: sh.position, media_type: 'image/jpeg' as const, data: sh.clean }] : []));
  if (!images.length) return null;

  const ask = async () => {
    setBusy(true); setError(null);
    try { setCoach(await askCoach(coachPayload(r, images))); }
    catch (e) {
      setError(e instanceof CoachError && e.code === 'not_configured' ? 'El coach con IA todavía no está disponible en esta versión.' : e instanceof Error ? e.message : 'El análisis con IA falló.');
    } finally { setBusy(false); }
  };

  if (!premium) {
    return (
      <PremiumGate title="Coach con IA">
        Premium añade un coach que mira las fotos de tu swing y comenta lo que las medidas no ven: el agarre, la posición del palo, los brazos y la alineación.
      </PremiumGate>
    );
  }
  return (
    <Card className="!p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-accent" />
        <h3 className="font-semibold text-sm">Coach con IA</h3>
        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-accent/15 text-[hsl(38_70%_32%)]">Premium</span>
      </div>
      {!coach && (
        <>
          <p className="text-sm text-muted-foreground">Un coach con IA mira estas tres fotos y las medidas, y comenta lo que las reglas no miden.</p>
          <Button full onClick={ask} disabled={busy}>
            {busy ? <><Loader2 className="w-5 h-5 animate-spin" /> Analizando las fotos…</> : <><Sparkles className="w-5 h-5" /> Pedir análisis con IA</>}
          </Button>
          <p className="text-xs text-muted-foreground">Se envían las tres fotos de tu swing a nuestro servidor para analizarlas con IA. No se guardan.</p>
        </>
      )}
      {error && <Notice tone="error">{error}</Notice>}
      {coach && !coach.usable && <Notice>{coach.summary || 'Las fotos no muestran un swing completo. Graba de cuerpo entero.'}</Notice>}
      {coach?.usable && (
        <div className="space-y-3">
          <p className="text-sm">{coach.summary}</p>
          {coach.strengths.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Lo que haces bien</p>
              <ul className="text-sm space-y-1 list-disc pl-4">{coach.strengths.map((t) => <li key={t}>{t}</li>)}</ul>
            </div>
          )}
          {coach.priorities.map((pr) => (
            <div key={pr.title} className="space-y-1">
              <p className="text-sm font-semibold">{pr.title}</p>
              {pr.why && <p className="text-sm text-muted-foreground">{pr.why}</p>}
              {pr.drill && <p className="text-sm bg-muted rounded-lg px-3 py-2"><span className="font-semibold">Ejercicio: </span>{pr.drill}</p>}
            </div>
          ))}
          {coach.observations.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Foto por foto</p>
              <ul className="text-sm space-y-1">{coach.observations.map((o) => <li key={o.position + o.note}><span className="font-semibold">{POSITION_LABEL[o.position]}: </span>{o.note}</li>)}</ul>
            </div>
          )}
          {coach.disagreements.length > 0 && (
            <Notice>{coach.disagreements.map((d) => <span key={d} className="block">{d}</span>)}</Notice>
          )}
          <p className="text-xs text-muted-foreground">
            Confianza {coach.confidence}. {coach.limits} Es una opinión de IA sobre tres fotos fijas: no mide velocidad, trayectoria ni la cara del palo, y puede equivocarse.
          </p>
        </div>
      )}
    </Card>
  );
}

/** Silueta guía: cómo colocarse ante la cámara en cada vista. */
function Silhouette({ view, color = 'rgba(255,255,255,.8)', className = '' }: { view: SwingView; color?: string; className?: string }) {
  return (
    <svg viewBox="0 0 300 400" className={className} fill="none" stroke={color} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <g strokeWidth={9}>
        {view === 'atras' ? (
          <>
            <circle cx={172} cy={98} r={20} />
            <path d="M165 124 L128 215" />
            <path d="M165 128 L186 205" />
            <path d="M128 215 L150 290 L134 366 L162 370" />
          </>
        ) : (
          <>
            <circle cx={150} cy={92} r={20} />
            <path d="M112 128 L188 128 L174 215 L126 215 Z" />
            <path d="M112 128 L142 204 M188 128 L158 204" />
            <path d="M130 215 L112 366 L98 372 M170 215 L188 366 L202 372" />
          </>
        )}
      </g>
      <path d={view === 'atras' ? 'M186 205 L246 368' : 'M150 206 L156 368'} strokeWidth={4} />
      <path d="M50 376 L250 376" strokeWidth={3} strokeDasharray="4 10" />
    </svg>
  );
}

const TONE_COLOR: Record<Tone, string> = { good: 'var(--color-primary)', warn: 'var(--color-accent)', bad: 'var(--color-destructive)' };
const TONE_TEXT: Record<Tone, string> = { good: 'text-primary', warn: 'text-accent', bad: 'text-destructive' };
/** Colores de la línea de caderas sobre las fotos (fuera del tema: van encima del video). */
const TONE_SHOT: Record<Tone, string> = { good: '#6dcf8e', warn: '#e8c04a', bad: '#ff5a4f' };

/** Línea de caderas: dónde quedan en el tope y en el impacto respecto a donde empezaron. */
function HipLineCard({ r, withShots }: { r: SwingResult; withShots: boolean }) {
  const h = hipLine(r);
  if (!h) return null;
  const SPAN = 40; // el dibujo cubre ±40 %
  const pos = (pct: number) => 50 + (Math.max(-SPAN, Math.min(SPAN, pct)) / SPAN) * 46; // % del ancho de la barra
  return (
    <Card className="!p-4 space-y-3">
      <div>
        <h3 className="font-semibold text-sm">Línea de caderas</h3>
        <p className="text-xs text-muted-foreground">Dónde quedan tus caderas respecto a donde empezaron. {h.note}</p>
      </div>
      <div className="space-y-1">
        <div className="flex justify-between text-[11px] uppercase tracking-wide text-muted-foreground pl-16 pr-14">
          <span>← {h.left}</span><span>{h.right} →</span>
        </div>
        {h.rows.map((row) => (
          <div key={row.key} className="flex items-center gap-2">
            <span className="w-14 shrink-0 text-xs font-medium">{row.label}</span>
            <div className="relative flex-1 h-6" role="img" aria-label={`${row.label}: ${Math.abs(row.pct)}% ${row.pct === 0 ? 'sobre la línea' : row.pct > 0 ? h.right.toLowerCase() : h.left.toLowerCase()}`}>
              <div className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-border" />
              <div className="absolute left-1/2 inset-y-0 border-l-2 border-dashed border-foreground/40" />
              <div className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full" style={{ left: `${Math.min(50, pos(row.pct))}%`, width: `${Math.abs(pos(row.pct) - 50)}%`, background: TONE_COLOR[row.tone] }} />
              <div className="absolute top-1/2 w-3.5 h-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-card" style={{ left: `${pos(row.pct)}%`, background: TONE_COLOR[row.tone] }} />
            </div>
            <span className={`w-12 shrink-0 text-right text-sm font-bold ${TONE_TEXT[row.tone]}`}>{row.pct > 0 ? '+' : ''}{row.pct}%</span>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        La línea punteada es la posición al inicio; las cifras son {h.unit}.{withShots && ' En las fotos, la línea blanca marca ese mismo punto y el círculo, dónde están tus caderas en ese momento.'} Es una estimación desde la postura con una sola cámara.
      </p>
    </Card>
  );
}

/** Muñecas (experimental, informativo): ángulo entre antebrazo y mano al inicio y en el tope. No entra en la nota. */
function WristCard({ m }: { m: SwingResult['metrics'] }) {
  const rows = [
    { label: 'Muñeca guía', a: m.leadWristAddressDeg, t: m.leadWristTopDeg },
    { label: 'Muñeca trasera', a: m.trailWristAddressDeg, t: m.trailWristTopDeg },
  ].filter((x) => x.a != null || x.t != null);
  if (!rows.length) return null;
  const fmt = (v: number | null | undefined) => (v == null ? '—' : `${v}°`);
  return (
    <Card className="!p-4 space-y-3">
      <div className="flex items-center gap-2">
        <h3 className="font-semibold text-sm">Muñecas</h3>
        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-accent/15 text-[hsl(38_70%_32%)]">Experimental</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {rows.map((x) => <Stat key={x.label} label={`${x.label}: inicio → tope`} value={`${fmt(x.a)} → ${fmt(x.t)}`} />)}
        {m.wristChangeDeg != null && <Stat label="Cambio de la guía" value={m.wristChangeDeg > 0 ? `+${m.wristChangeDeg}` : m.wristChangeDeg} unit="°" />}
      </div>
      <p className="text-xs text-muted-foreground">
        Ángulo entre el antebrazo y la mano: 180° es la mano alineada con el antebrazo; menos, la muñeca doblada. Es una estimación con una sola cámara y la mano suele quedar tapada, así que úsala para comparar tus swings entre sí, no como medida exacta. No mide la suelta de las muñecas ni la cara del palo, y no cambia la nota.
      </p>
    </Card>
  );
}

export function SwingResultView({ r, shots }: { r: SwingResult; shots?: Shot[] }) {
  const tone = (ok: boolean, mid = false) => (ok ? 'good' : mid ? 'warn' : 'bad') as 'good' | 'warn' | 'bad';
  const tempo = (
    <Stat label="Tempo" value={`${r.metrics.tempoRatio}:1`} tone={tone(r.metrics.tempoRatio >= TEMPO.fastOk && r.metrics.tempoRatio <= TEMPO.slowOk, r.metrics.tempoRatio >= TEMPO.fastBad && r.metrics.tempoRatio <= TEMPO.slowBad)} />
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

      {shots && shots.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {shots.map((sh) => (
            <figure key={sh.label} className="space-y-1">
              <img src={sh.url} alt={sh.label} className="w-full rounded-xl bg-black" />
              <figcaption className="text-[11px] uppercase tracking-wide text-muted-foreground text-center">{sh.label}</figcaption>
            </figure>
          ))}
        </div>
      )}

      <HipLineCard r={r} withShots={!!shots?.length} />

      {r.view === 'atras' ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <Stat label="Tempo (aprox.)" value={`${r.metrics.tempoRatio}:1`} />
          <Stat label="Inclinación al inicio" value={r.metrics.spineAddressDeg} unit="°" tone={tone(r.metrics.spineAddressDeg >= 25 && r.metrics.spineAddressDeg <= 45, r.metrics.spineAddressDeg >= 15 && r.metrics.spineAddressDeg <= 55)} />
          {r.metrics.kneeFlexDeg != null && (
            <Stat label="Flexión de rodillas" value={r.metrics.kneeFlexDeg} unit="°" tone={tone(r.metrics.kneeFlexDeg >= 10 && r.metrics.kneeFlexDeg <= 38, true)} />
          )}
          <Stat label="Postura al impacto" value={Math.abs(r.metrics.spineImpactChangeDeg)} unit="°" tone={tone(Math.abs(r.metrics.spineImpactChangeDeg) <= 7, Math.abs(r.metrics.spineImpactChangeDeg) <= 14)} />
          <Stat label="Caderas hacia la bola" value={r.metrics.hipAdvancePct} unit="%" tone={tone(r.metrics.hipAdvancePct <= 6, r.metrics.hipAdvancePct <= 14)} />
          <Stat label="Cabeza: sube/baja" value={Math.abs(r.metrics.headVerticalPct)} unit="%" tone={tone(Math.abs(r.metrics.headVerticalPct) <= 18, Math.abs(r.metrics.headVerticalPct) <= 30)} />
          {r.metrics.handsAddressPct != null && (
            <Stat label="Manos al inicio" value={r.metrics.handsAddressPct} unit="%" tone={tone(r.metrics.handsAddressPct >= -5 && r.metrics.handsAddressPct <= 30, r.metrics.handsAddressPct <= 45)} />
          )}
          {r.metrics.handsTopPct != null && (
            <Stat label="Altura de manos (tope)" value={r.metrics.handsTopPct} unit="%" tone={tone(r.metrics.handsTopPct >= 0, true)} />
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {tempo}
          <Stat label="Giro de hombros" value={r.metrics.shoulderTurnDeg} unit="°" tone={tone(r.metrics.shoulderTurnDeg >= 75, r.metrics.shoulderTurnDeg >= 55)} />
          <Stat label="Giro de caderas" value={r.metrics.hipTurnDeg} unit="°" tone={tone(r.metrics.hipTurnDeg <= 60, true)} />
          <Stat label="Inclinación lateral" value={Math.abs(r.metrics.spineChangeDeg)} unit="°" tone={tone(Math.abs(r.metrics.spineChangeDeg) <= SPINE_SIDE[0], Math.abs(r.metrics.spineChangeDeg) <= SPINE_SIDE[1])} />
          <Stat label="Mov. de cabeza" value={r.metrics.headSwayPct} unit="%" tone={tone(r.metrics.headSwayPct <= 25, r.metrics.headSwayPct <= 45)} />
          <Stat label="Avance de cadera" value={r.metrics.hipShiftPct} unit="%" tone={tone(r.metrics.hipShiftPct >= 8, r.metrics.hipShiftPct >= -5)} />
          <Stat label="Brazo guía (tope)" value={r.metrics.leadArmDeg} unit="°" tone={tone(r.metrics.leadArmDeg >= 140, true)} />
          {r.metrics.handsTopPct != null && (
            <Stat label="Altura de manos (tope)" value={r.metrics.handsTopPct} unit="%" tone={tone(r.metrics.handsTopPct >= 0, true)} />
          )}
        </div>
      )}
      <p className="text-xs text-muted-foreground px-1">
        Subida {r.metrics.backswingSec}s · bajada {r.metrics.downswingSec}s · {r.metrics.framesUsed} cuadros{r.lefty != null && ` · leído como ${r.lefty ? 'zurdo' : 'diestro'}`}. Medidas estimadas a partir de tu postura con una sola cámara; manos y brazos se leen al inicio y en el tope.{r.view === 'atras' && ' Desde atrás el tempo es aproximado y no cuenta para la nota: se mide mejor de frente.'}
      </p>

      <WristCard m={r.metrics} />

      {r.club && (
        <Card className="!p-4 space-y-3">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-sm">Palo</h3>
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-accent/15 text-[hsl(38_70%_32%)]">Experimental</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {r.club.addressLeanDeg != null && <Stat label="Varilla al inicio" value={r.club.addressLeanDeg} unit="°" tone={tone(r.club.addressLeanDeg >= -8, true)} />}
            {r.club.addressPlaneDeg != null && <Stat label="Varilla con el suelo" value={r.club.addressPlaneDeg} unit="°" tone="good" />}
            {r.club.topDeg != null && <Stat label="Palo en el tope" value={r.club.topDeg} unit="°" tone={tone(r.club.topDeg >= -12 && r.club.topDeg <= 35, true)} />}
          </div>
          {r.club.feedback.map((f) => (
            <div key={f.key} className="space-y-1">
              <p className="text-sm font-semibold">{f.title}</p>
              <p className="text-sm text-muted-foreground">{f.detail}</p>
              {f.drill && <p className="text-sm bg-muted rounded-lg px-3 py-2"><span className="font-semibold">Ejercicio: </span>{f.drill}</p>}
            </div>
          ))}
          <p className="text-xs text-muted-foreground">
            La app busca la varilla en la imagen cuando el palo está casi quieto. Puede confundirla con una línea del fondo o de la ropa: compárala con la línea rosa de las fotos. No cambia la nota. {r.club.topDeg != null && 'En el tope, 0° es paralelo al suelo; negativo es que se pasa.'}
          </p>
        </Card>
      )}

      {shots && shots.some((sh) => sh.clean) && <AiCoachCard r={r} shots={shots} />}

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

// Medido en Chrome de escritorio (CPU, ~23 ms por cuadro a 20 cuadros/s): 30 s ≈ 14 s de análisis. Cada
// cuadro cede el hilo al esperar el "seeked", así que la página no se congela. En teléfonos tarda más.
const MAX_SECONDS = 30;

const VIDEO_ERR = 'No se pudo leer el video. Graba en MP4 (H.264) o pon la cámara del iPhone en "Más compatible" y vuelve a subirlo.';
const WAIT_MS = 8000;

/** Mueve el video a `sec` y espera a que muestre ese cuadro. Falla con un mensaje claro si el video no responde. */
const seek = (v: HTMLVideoElement, sec: number) =>
  new Promise<void>((res, rej) => {
    const done = () => { clearTimeout(timer); res(); };
    const timer = setTimeout(() => { v.removeEventListener('seeked', done); rej(new Error(VIDEO_ERR)); }, WAIT_MS);
    v.addEventListener('seeked', done, { once: true });
    v.currentTime = sec;
  });

/** Espera a que el video tenga sus datos básicos (duración y tamaño). */
const metadata = (v: HTMLVideoElement) =>
  v.readyState >= 1 ? Promise.resolve() : new Promise<void>((res, rej) => {
    const timer = setTimeout(() => rej(new Error(VIDEO_ERR)), WAIT_MS);
    v.addEventListener('loadedmetadata', () => { clearTimeout(timer); res(); }, { once: true });
    v.addEventListener('error', () => { clearTimeout(timer); rej(new Error(VIDEO_ERR)); }, { once: true });
  });

const COARSE = 1 / 10;
const FINE = 1 / 30;

/**
 * Muestrea el video en dos pasadas: una gruesa (10 cuadros por segundo) para ubicar el swing y otra fina
 * (30 por segundo, un cuadro de video normal) solo desde un poco antes del inicio hasta un poco después del
 * impacto. Así el tempo se mide con cuadros de 33 ms y no de 50, sin pagar 30 por segundo en todo el video, y si
 * el video trae varios swings se queda con el último. Si no se ve un swing, devuelve la pasada gruesa para que
 * el análisis diga por qué.
 */
async function sampleVideo(v: HTMLVideoElement, pose: Awaited<ReturnType<typeof loadPose>>, dur: number, aspect: number, onProgress: (pct: number) => void) {
  const grab = async (t: number) => { await seek(v, t); return detect(pose, v, v.currentTime * 1000); };
  const coarse: Frame[] = [];
  let coarseN = 0;
  for (let t = 0; t < dur; t += COARSE) {
    const f = await grab(t);
    coarseN++;
    if (f) coarse.push(f);
    onProgress(Math.round((t / dur) * 60));
  }
  const win = findSwingWindow(coarse, { aspect });
  if (!win) return { frames: coarse, sampled: coarseN, coarse: null as { frames: Frame[]; sampled: number } | null };
  const to = Math.min(dur, win.to / 1000), from = win.from / 1000;
  const fine: Frame[] = [];
  let fineN = 0;
  for (let t = from; t <= to; t += FINE) {
    const f = await grab(t);
    fineN++;
    if (f) fine.push(f);
    onProgress(60 + Math.round(((t - from) / Math.max(0.1, to - from)) * 40));
  }
  return { frames: fine, sampled: fineN, coarse: { frames: coarse, sampled: coarseN } };
}

/** El cuadro actual del video, sin marcas y a hasta 1024 px por lado: es lo que ve el coach con IA. */
async function cleanFrame(v: HTMLVideoElement): Promise<string | undefined> {
  try {
    const k = Math.min(1, 1024 / Math.max(v.videoWidth, v.videoHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(v.videoWidth * k); c.height = Math.round(v.videoHeight * k);
    c.getContext('2d')!.drawImage(v, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.82).split(',')[1];
  } catch { return undefined; }
}

/**
 * Vuelve a los tres momentos clave del video, busca el palo al inicio y en el tope (cuando está
 * casi quieto) y devuelve una foto de cada momento con el esqueleto y el palo dibujados.
 */
async function captureKeyFrames(v: HTMLVideoElement, frames: Frame[], r: SwingResult): Promise<{ shots: Shot[]; address: Shaft | null; top: Shaft | null }> {
  const out: { shots: Shot[]; address: Shaft | null; top: Shaft | null } = { shots: [], address: null, top: null };
  if (!r.times || !v.videoWidth) return out;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return out;
  // Línea de caderas: una vertical donde estaban al inicio y un círculo donde están en cada foto.
  const tStart = r.times.address;
  const start = frames.find((x) => x.t === tStart);
  const hips = hipLine(r);
  const drawHipLine = (f: Frame, key: 'address' | 'top' | 'impact', unit: number) => {
    if (!start || !hips) return;
    const cx = (fr: Frame) => ((fr.lm[LM.L_HIP].x + fr.lm[LM.R_HIP].x) / 2) * canvas.width;
    const cy = (fr: Frame) => ((fr.lm[LM.L_HIP].y + fr.lm[LM.R_HIP].y) / 2) * canvas.height;
    const x0 = cx(start), y0 = cy(start);
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = Math.max(2, canvas.width / 260);
    ctx.setLineDash([unit * 0.07, unit * 0.07]);
    ctx.beginPath(); ctx.moveTo(x0, Math.max(0, y0 - unit * 0.9)); ctx.lineTo(x0, Math.min(canvas.height, y0 + unit * 1.5)); ctx.stroke();
    ctx.setLineDash([]);
    const tone = key === 'address' ? 'good' : hips.rows.find((row) => row.key === key)?.tone ?? 'good';
    ctx.fillStyle = TONE_SHOT[tone]; ctx.strokeStyle = '#fff';
    ctx.beginPath(); ctx.arc(cx(f), cy(f), Math.max(5, canvas.width / 90), 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.restore();
  };
  for (const [key, label] of [['address', 'Inicio'], ['top', 'Tope'], ['impact', 'Impacto']] as const) {
    const t = r.times[key];
    const f = frames.find((x) => x.t === t);
    if (!f) continue;
    await seek(v, t / 1000);
    const mid = (a: number, b: number) => ({ x: (f.lm[a].x + f.lm[b].x) / 2, y: (f.lm[a].y + f.lm[b].y) / 2 });
    const sh = mid(LM.L_SHOULDER, LM.R_SHOULDER), hip = mid(LM.L_HIP, LM.R_HIP);
    const torsoPx = Math.hypot((sh.x - hip.x) * v.videoWidth, (sh.y - hip.y) * v.videoHeight);
    // Se reduce la imagen hasta que el torso mida ~130 px: acota el tiempo de búsqueda y el grosor de la varilla.
    const k = Math.min(1, 130 / Math.max(torsoPx, 1), 720 / v.videoWidth);
    canvas.width = Math.round(v.videoWidth * k); canvas.height = Math.round(v.videoHeight * k);
    ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
    let shaft: Shaft | null = null;
    if (key !== 'impact') { // en el impacto la varilla sale borrosa
      const pts = f.lm.map((p) => ({ x: p.x * canvas.width, y: p.y * canvas.height }));
      const hands = { x: (pts[LM.L_WRIST].x + pts[LM.R_WRIST].x) / 2, y: (pts[LM.L_WRIST].y + pts[LM.R_WRIST].y) / 2 };
      const unit = torsoPx * k;
      shaft = findShaft(toGray(ctx.getImageData(0, 0, canvas.width, canvas.height)), hands, unit, {
        avoid: [pts[LM.L_ELBOW], pts[LM.R_ELBOW]],
        mask: bodyMask(canvas.width, canvas.height, pts, unit),
        allow: key === 'address' ? pointsDown : undefined,
      });
      if (shaft && shaft.confidence < SHAFT_MIN_CONFIDENCE) shaft = null;
      out[key] = shaft;
      drawSkeleton(ctx, f.lm, canvas.width, canvas.height);
      if (shaft) {
        ctx.strokeStyle = '#ff4fd8'; ctx.lineWidth = Math.max(3, canvas.width / 150); ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(hands.x, hands.y); ctx.lineTo(shaft.tip.x, shaft.tip.y); ctx.stroke();
      }
    } else drawSkeleton(ctx, f.lm, canvas.width, canvas.height);
    drawHipLine(f, key, torsoPx * k);
    out.shots.push({ label, position: POS_OF[label], url: canvas.toDataURL('image/jpeg', 0.78), clean: await cleanFrame(v) });
  }
  return out;
}

/** Cómo grabarse: las dos vistas que la app sabe leer. */
function HowToRecord() {
  return (
    <Card className="!p-4 space-y-3">
      <h3 className="font-semibold text-sm">Cómo grabarte</h3>
      <div className="grid grid-cols-2 gap-3">
        {(['frente', 'atras'] as const).map((vw) => (
          <figure key={vw} className="bg-muted rounded-xl p-2 text-center">
            <Silhouette view={vw} color="currentColor" className="w-full h-32 text-primary" />
            <figcaption className="text-xs font-medium mt-1">{VIEW_LABEL[vw]}</figcaption>
          </figure>
        ))}
      </div>
      <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-4">
        <li>Teléfono fijo, a la altura de la cintura y a unos 3 metros.</li>
        <li>Cuerpo entero: que se vean los pies y quede aire sobre la cabeza para el palo.</li>
        <li>De frente: la cámara mira a tu pecho. Desde atrás: la cámara detrás de tus manos, apuntando al objetivo.</li>
        <li>Para que la app vea el palo, busca un fondo liso y buena luz.</li>
      </ul>
    </Card>
  );
}

/**
 * Palo del swing, elegido a mano. La app NO lee el número ni la etiqueta del palo: una sola grabación
 * no basta para enseñarle a reconocerlo, así que el usuario lo confirma y ese palo se asigna a los
 * swings siguientes hasta que elija otro. Sin confirmar, el swing se guarda sin palo.
 */
function ClubPicker({ value, onChange }: { value: string | null; onChange: (c: string | null) => void }) {
  return (
    <div className="space-y-2">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">Palo de este swing</p>
      <div className="flex flex-wrap gap-1.5">
        {CLUBS.filter((c) => c !== 'Putter').map((c) => (
          <button
            key={c}
            type="button"
            aria-pressed={value === c}
            onClick={() => onChange(value === c ? null : c)}
            className={`px-2.5 py-1 rounded-full text-xs border ${value === c ? 'bg-primary text-primary-foreground border-primary' : 'border-border'}`}
          >
            {c}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        {value ? `Palo confirmado: ${value}. Los siguientes swings usarán este palo hasta que cambies.` : 'Sin palo confirmado. Elígelo tú; si tocas el mismo otra vez, se quita.'}
      </p>
    </div>
  );
}

function UploadAnalyzer({ view }: { view: ViewChoice }) {
  const { profile, sessions, addSession, currentClub, setCurrentClub } = useStore();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SwingResult | null>(null);
  const [shots, setShots] = useState<Shot[]>([]);
  const [warn, setWarn] = useState<string | null>(null);
  /** Duración (s) del video cuando pasa el máximo: solo se analizan los primeros MAX_SECONDS. */
  const [tooLong, setTooLong] = useState<number | null>(null);

  const used = swingUploadsToday(sessions);
  const limitReached = !profile.premium && used >= FREE.swingUploadsPerDay;

  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  const pick = (f?: File) => {
    if (!f) return;
    setResult(null); setError(null); setProgress(0); setShots([]); setWarn(null); setTooLong(null);
    setUrl(URL.createObjectURL(f));
  };

  const analyze = async () => {
    const v = videoRef.current;
    if (!v) return;
    setBusy(true); setError(null); setResult(null); setShots([]); setWarn(null);
    try {
      const pose = await loadPose();
      await metadata(v);
      v.pause();
      const dur = Math.min(v.duration || 0, MAX_SECONDS);
      if (!(dur > 0.5)) throw new Error(VIDEO_ERR);
      const aspect = v.videoWidth && v.videoHeight ? v.videoWidth / v.videoHeight : 1;
      const sampled = await sampleVideo(v, pose, dur, aspect, setProgress);
      let frames = sampled.frames;
      let r = analyzeSwing(frames, { lefty: profile.lefty, view, aspect, sampled: sampled.sampled });
      // Si la pasada fina no da un swing (el video no era lo que parecía), se prueba con la gruesa.
      if (typeof r === 'string' && sampled.coarse) {
        const c = analyzeSwing(sampled.coarse.frames, { lefty: profile.lefty, view, aspect, sampled: sampled.coarse.sampled });
        if (typeof c !== 'string') { r = c; frames = sampled.coarse.frames; }
      }
      if (typeof r === 'string') setError(SWING_ERROR_TEXT[r]);
      else {
        const start = frames.find((x) => x.t === r.times?.address);
        if (start) {
          const fr = framingCheck(start.lm);
          if (!fr.ok) setWarn(`Encuadre mejorable. ${fr.hint}. Algunas medidas pueden salir menos precisas.`);
          // El palo es un extra: si algo falla al buscarlo, el análisis del cuerpo se muestra igual.
          try {
            const key = await captureKeyFrames(v, frames, r);
            setShots(key.shots);
            r.club = readClub(r.view ?? 'frente', key.address, key.top, targetSide(start.lm, r.lefty ?? profile.lefty)) ?? undefined;
          } catch { /* sin fotos ni palo */ }
        }
        setResult(r);
        addSession({ type: 'swing', score: r.score, tempoRatio: r.metrics.tempoRatio, swing: r, club: currentClub ?? undefined });
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
          <video
            ref={videoRef} src={url} controls={!busy} muted playsInline className="w-full rounded-xl bg-black max-h-[50vh]"
            onError={() => setError(VIDEO_ERR)}
            onLoadedMetadata={(e) => { const d = e.currentTarget.duration; setTooLong(Number.isFinite(d) && d > MAX_SECONDS + 0.5 ? Math.ceil(d) : null); }}
          />
        ) : (
          <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-border rounded-xl py-10 cursor-pointer hover:bg-muted/50">
            <span className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center"><Upload className="w-5 h-5" /></span>
            <span className="font-medium">Sube o graba tu swing</span>
            <span className="text-xs text-muted-foreground">Un solo swing, de frente o desde atrás, de cuerpo entero · máx. {MAX_SECONDS} s</span>
            <input type="file" accept="video/*" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
          </label>
        )}
        {url && !busy && <ClubPicker value={currentClub} onChange={setCurrentClub} />}
        {url && (
          <div className="flex gap-2">
            <Button full onClick={analyze} disabled={busy}>
              {busy ? <><Loader2 className="w-5 h-5 animate-spin" /> Analizando… {progress}%</> : <><Activity className="w-5 h-5" /> Analizar swing</>}
            </Button>
            <Button variant="outline" disabled={busy} onClick={() => { setUrl(null); setResult(null); setError(null); setShots([]); setWarn(null); setTooLong(null); }} aria-label="Cambiar video"><RefreshCw className="w-5 h-5" /></Button>
          </div>
        )}
        {!profile.premium && <p className="text-xs text-muted-foreground text-center">Gratis: {Math.max(0, FREE.swingUploadsPerDay - used)} de {FREE.swingUploadsPerDay} análisis disponibles hoy.</p>}
      </Card>
      {!url && <HowToRecord />}
      {tooLong && (
        <Notice>
          Tu video dura {tooLong} s y solo se analizan los primeros {MAX_SECONDS} s. Si tu swing queda después, recorta el video para que el swing esté dentro y vuelve a subirlo.
        </Notice>
      )}
      {error && <Notice tone="error">{error}</Notice>}
      {warn && <Notice>{warn}</Notice>}
      {result?.viewMismatch && (
        <Notice tone="error">
          Elegiste "{VIEW_LABEL[result.view ?? 'frente']}", pero este video parece {VIEW_LABEL[result.viewMismatch].toLowerCase()}. Las medidas pueden salir mal: cambia la vista a "Automática" y analiza de nuevo.
        </Notice>
      )}
      {result && <SwingResultView r={result} shots={shots} />}
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
  // Silueta guía: qué vista se ve, si el jugador está bien encuadrado y si toca mostrarla.
  const [guide, setGuide] = useState<{ view: SwingView; ok: boolean; show: boolean }>({ view: 'frente', ok: false, show: true });
  const guideRef = useRef(guide);
  const putGuide = (g: { view: SwingView; ok: boolean; show: boolean }) => {
    const c = guideRef.current;
    if (c.view !== g.view || c.ok !== g.ok || c.show !== g.show) { guideRef.current = g; setGuide(g); }
  };

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
        if (!f) { if (phase === 'ready') { setStatus('No te veo: aléjate hasta que entres de cuerpo entero'); putGuide({ ...guideRef.current, ok: false, show: true }); } return; }
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
          const fr = framingCheck(f.lm);
          putGuide({ view: seen, ok: fr.ok, show: true });
          setStatus(fr.ok ? `Listo (${VIEW_LABEL[seen].toLowerCase()}). Haz tu swing cuando quieras` : fr.hint);
          if (handsHigh) { phase = 'top'; tTop = now; putGuide({ ...guideRef.current, show: false }); }
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
            {guide.show && (
              <Silhouette view={guide.view} color={guide.ok ? 'rgba(109,207,142,.9)' : 'rgba(255,255,255,.7)'} className="absolute inset-0 w-full h-full pointer-events-none" />
            )}
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
