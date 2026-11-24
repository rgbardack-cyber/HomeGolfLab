import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Activity, ArrowLeft, Camera, CheckCircle2, Loader2, RefreshCw, Square, Upload, Video, AlertTriangle, Wrench, Sparkles } from 'lucide-react';
import { FREE, swingUploadsToday, useStore } from '@/store';
import { uploadQuota } from '@/lib/quota';
import { drainLiveSwings } from '@/lib/liveSession';
import { LiveSwingDetector } from '@/lib/live/detector';
import { LiveRecorder, clipWindow } from '@/lib/live/recorder';
import { cutClip } from '@/lib/live/cutClip';
import { BALL_SOUND_LABEL, classifyClipSound, type BallSound } from '@/lib/live/ballSound';
import { cameraProblem, FpsMonitor, queryCameraPermission, type CameraPermission } from '@/lib/live/camera';
import { debugSwing, type DebugBag } from '@/lib/debugHook';
import { useFlags } from '@/lib/flags';
import VideoReview from '@/components/VideoReview';
import { persistReview } from '@/lib/media/persistReview';
import { findFinish, phaseConfidence } from '@/lib/phases';
import { swingWindows, type SwingWindow } from '@/lib/swingWindows';
import { framesToPoseTrack } from '@/lib/media/poseTrack';
import { getMediaStore } from '@/lib/media/store';
import { makeClock } from '@/lib/media/clock';
import { analyzeSwing, findSwingWindow, framingCheck, hipLine, viewOfFrame, SPINE_SIDE, swingErrorText, TEMPO, viewLabel, type Frame, type SwingResult, type SwingView, type Tone, LM } from '@/lib/swing';
import { askCoach, coachPayload, CoachError, POSITION_LABEL, type CoachImage, type CoachResult, type Position } from '@/lib/coach';
import { bodyMask, findShaft, pointsDown, readClub, targetSide, toGray, SHAFT_MIN_CONFIDENCE, type Shaft } from '@/lib/club';
import { createLiveDetector, detectResilient, drawSkeleton, loadPose, PoseFailure } from '@/lib/pose';
import { seekVideo } from '@/lib/videoSeek';
import { CLUBS } from '@/lib/tracking';
import { Button, Card, Notice, PageHeader, PremiumGate, ScoreRing, Segmented, Stat } from '@/components/ui';
import RecordingTips from '@/components/RecordingTips';
import { fmtDate, t } from '@/i18n';
import { clubLabel } from '@/lib/tracking';

/** «1 swing» / «3 swings» en el idioma actual. */
const nSwings = (n: number): string => (n === 1 ? t('sw2.swingOne') : t('sw2.swingMany', { n }));

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
  const flags = useFlags();
  const setReviewMarks = useStore((s) => s.setReviewMarks);
  if (saved?.swing) {
    return (
      <div className="space-y-5">
        <PageHeader
          icon={<Activity className="w-5 h-5" />}
          title={t('sw.038')}
          subtitle={`${fmtDate(new Date(saved.at), { day: 'numeric', month: 'long' })} · ${saved.mode === 'casa' ? t('mode.casa') : t('mode.cancha')}${saved.live ? ` · ${t('home.liveTag')}` : ''}${saved.club ? ` · ${t('sw2.clubLabel', { club: clubLabel(saved.club) })}` : ''}`}
        />
        {flags.videoReview && saved.mediaId && (
          <VideoReview key={saved.mediaId} r={saved.swing} mediaId={saved.mediaId} poseTrackId={saved.poseTrackId} manual={saved.reviewMarks} onManual={(m) => setReviewMarks(saved.id, m)} />
        )}
        {flags.compare && saved.mediaId && <Link to={`/comparar?a=${saved.id}`} className="inline-block text-sm underline">{t('sw.001')}</Link>}
        {flags.videoReview && !saved.mediaId && (
          <Notice>{saved.live ? t('sw2.noReviewLive') : t('sw2.noReviewOld')}</Notice>
        )}
        <SwingResultView r={saved.swing} />
        <Button full variant="outline" onClick={() => setParams({})}><ArrowLeft className="w-5 h-5" /> {t('sw.002')}</Button>
      </div>
    );
  }
  return (
    <div className="space-y-5">
      <RecordingTips area="swing" />
      <PageHeader icon={<Activity className="w-5 h-5" />} title={t('sw.038')} subtitle={mode === 'casa' ? t('sw2.subCasa') : t('sw2.subCancha')} />
      <Segmented<Tab>
        value={tab}
        onChange={setTab}
        options={[
          { value: 'video', label: <><Upload className="w-4 h-4" /> {t('sw.003')}</> },
          { value: 'live', label: <><Video className="w-4 h-4" /> {t('sw.004')}</>, locked: !premium },
        ]}
      />
      <div className="space-y-1.5">
        <p className="text-xs uppercase tracking-wide text-muted-foreground px-1">{t('sw.005')}</p>
        <Segmented<ViewChoice>
          value={view}
          onChange={setView}
          options={[
            { value: 'auto', label: t('sw2.viewAuto') },
            { value: 'frente', label: viewLabel('frente') },
            { value: 'atras', label: viewLabel('atras') },
          ]}
        />
        <p className="text-xs text-muted-foreground px-1">
          {view === 'auto' ? t('sw2.hintAuto')
            : view === 'frente' ? t('sw2.hintFrente')
            : t('sw2.hintAtras')}
        </p>
      </div>
      {tab === 'video' ? <UploadAnalyzer view={view} /> : premium ? <LiveAnalyzer view={view} /> : (
        <PremiumGate title={t('sw.039')}>
          {t('sw.006')}
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
  const [quotaHit, setQuotaHit] = useState(false);
  const [coach, setCoach] = useState<CoachResult | null>(null);
  const images: CoachImage[] = shots.flatMap((sh) => (sh.clean && sh.position ? [{ position: sh.position, media_type: 'image/jpeg' as const, data: sh.clean }] : []));
  if (!images.length) return null;

  const ask = async () => {
    setBusy(true); setError(null); setQuotaHit(false);
    try { setCoach(await askCoach(coachPayload(r, images))); }
    catch (e) {
      setQuotaHit(e instanceof CoachError && e.code === 'quota_exhausted');
      setError(e instanceof CoachError && e.code === 'not_configured' ? t('sw2.coachUnavailable') : e instanceof Error ? e.message : t('sw2.coachFailed'));
    } finally { setBusy(false); }
  };

  if (!premium) {
    return (
      <PremiumGate title={t('sw.008')}>
        {t('sw.007')}
      </PremiumGate>
    );
  }
  return (
    <Card className="!p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-accent" />
        <h3 className="font-semibold text-sm">{t('sw.008')}</h3>
        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-accent/15 text-[hsl(38_70%_32%)]">{t('sw.009')}</span>
      </div>
      {!coach && (
        <>
          <p className="text-sm text-muted-foreground">{t('sw.010')}</p>
          <Button full onClick={ask} disabled={busy}>
            {busy ? <><Loader2 className="w-5 h-5 animate-spin" /> {t('sw.011')}</> : <><Sparkles className="w-5 h-5" /> {t('sw.012')}</>}
          </Button>
          <p className="text-xs text-muted-foreground">{t('sw.013')}</p>
        </>
      )}
      {error && <Notice tone={quotaHit ? 'info' : 'error'}>{error}</Notice>}
      {coach && !coach.usable && <Notice>{coach.summary || t('sw2.coachNoSwing')}</Notice>}
      {coach?.usable && (
        <div className="space-y-3">
          <p className="text-sm">{coach.summary}</p>
          {coach.strengths.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{t('sw.014')}</p>
              <ul className="text-sm space-y-1 list-disc pl-4">{coach.strengths.map((t) => <li key={t}>{t}</li>)}</ul>
            </div>
          )}
          {coach.priorities.map((pr) => (
            <div key={pr.title} className="space-y-1">
              <p className="text-sm font-semibold">{pr.title}</p>
              {pr.why && <p className="text-sm text-muted-foreground">{pr.why}</p>}
              {pr.drill && <p className="text-sm bg-muted rounded-lg px-3 py-2"><span className="font-semibold">{t('sw.015')} </span>{pr.drill}</p>}
            </div>
          ))}
          {coach.observations.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{t('sw.016')}</p>
              <ul className="text-sm space-y-1">{coach.observations.map((o) => <li key={o.position + o.note}><span className="font-semibold">{POSITION_LABEL[o.position]}: </span>{o.note}</li>)}</ul>
            </div>
          )}
          {coach.disagreements.length > 0 && (
            <Notice>{coach.disagreements.map((d) => <span key={d} className="block">{d}</span>)}</Notice>
          )}
          <p className="text-xs text-muted-foreground">
            {t('sw2.coachCaveat', { conf: t(`sw2.conf.${coach.confidence}`), limits: coach.limits })}
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
        <h3 className="font-semibold text-sm">{t('sw.017')}</h3>
        <p className="text-xs text-muted-foreground">{t('sw2.hipsWhere', { note: h.note })}</p>
      </div>
      <div className="space-y-1">
        <div className="flex justify-between text-[11px] uppercase tracking-wide text-muted-foreground pl-16 pr-14">
          <span>← {h.left}</span><span>{h.right} →</span>
        </div>
        {h.rows.map((row) => (
          <div key={row.key} className="flex items-center gap-2">
            <span className="w-14 shrink-0 text-xs font-medium">{row.label}</span>
            <div className="relative flex-1 h-6" role="img" aria-label={`${row.label}: ${Math.abs(row.pct)}% ${row.pct === 0 ? t('sw2.onLine') : row.pct > 0 ? h.right.toLowerCase() : h.left.toLowerCase()}`}>
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
        {t('sw2.hipsFoot1', { unit: h.unit })}{withShots && t('sw2.hipsFootShots')}{t('sw2.hipsFoot2')}
      </p>
    </Card>
  );
}

/** Muñecas (experimental, informativo): ángulo entre antebrazo y mano al inicio y en el tope. No entra en la nota. */
function WristCard({ m }: { m: SwingResult['metrics'] }) {
  const rows = [
    { label: t('sw2.wristLead'), a: m.leadWristAddressDeg, t: m.leadWristTopDeg },
    { label: t('sw2.wristTrail'), a: m.trailWristAddressDeg, t: m.trailWristTopDeg },
  ].filter((x) => x.a != null || x.t != null);
  if (!rows.length) return null;
  const fmt = (v: number | null | undefined) => (v == null ? '—' : `${v}°`);
  return (
    <Card className="!p-4 space-y-3">
      <div className="flex items-center gap-2">
        <h3 className="font-semibold text-sm">{t('sw.018')}</h3>
        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-accent/15 text-[hsl(38_70%_32%)]">{t('sw.019')}</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {rows.map((x) => <Stat key={x.label} label={`${x.label}: inicio → tope`} value={`${fmt(x.a)} → ${fmt(x.t)}`} />)}
        {m.wristChangeDeg != null && <Stat label={t('sw.040')} value={m.wristChangeDeg > 0 ? `+${m.wristChangeDeg}` : m.wristChangeDeg} unit="°" />}
      </div>
      <p className="text-xs text-muted-foreground">
        {t('sw2.wristFoot')}
      </p>
    </Card>
  );
}

export function SwingResultView({ r, shots }: { r: SwingResult; shots?: Shot[] }) {
  const tone = (ok: boolean, mid = false) => (ok ? 'good' : mid ? 'warn' : 'bad') as 'good' | 'warn' | 'bad';
  const tempo = (
    <Stat label={t('sw.041')} value={`${r.metrics.tempoRatio}:1`} tone={tone(r.metrics.tempoRatio >= TEMPO.fastOk && r.metrics.tempoRatio <= TEMPO.slowOk, r.metrics.tempoRatio >= TEMPO.fastBad && r.metrics.tempoRatio <= TEMPO.slowBad)} />
  );
  return (
    <div className="space-y-4">
      <Card className="flex items-center gap-4">
        <ScoreRing score={r.score} />
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{t('sw2.noteTitle', { view: viewLabel(r.view ?? 'frente').toLowerCase() })}</p>
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
          <Stat label={t('sw.042')} value={`${r.metrics.tempoRatio}:1`} />
          <Stat label={t('sw.043')} value={r.metrics.spineAddressDeg} unit="°" tone={tone(r.metrics.spineAddressDeg >= 25 && r.metrics.spineAddressDeg <= 45, r.metrics.spineAddressDeg >= 15 && r.metrics.spineAddressDeg <= 55)} />
          {r.metrics.kneeFlexDeg != null && (
            <Stat label={t('sw.044')} value={r.metrics.kneeFlexDeg} unit="°" tone={tone(r.metrics.kneeFlexDeg >= 10 && r.metrics.kneeFlexDeg <= 38, true)} />
          )}
          <Stat label={t('sw.045')} value={Math.abs(r.metrics.spineImpactChangeDeg)} unit="°" tone={tone(Math.abs(r.metrics.spineImpactChangeDeg) <= 7, Math.abs(r.metrics.spineImpactChangeDeg) <= 14)} />
          <Stat label={t('sw.046')} value={r.metrics.hipAdvancePct} unit="%" tone={tone(r.metrics.hipAdvancePct <= 6, r.metrics.hipAdvancePct <= 14)} />
          <Stat label={t('sw.047')} value={Math.abs(r.metrics.headVerticalPct)} unit="%" tone={tone(Math.abs(r.metrics.headVerticalPct) <= 18, Math.abs(r.metrics.headVerticalPct) <= 30)} />
          {r.metrics.handsAddressPct != null && (
            <Stat label={t('sw.048')} value={r.metrics.handsAddressPct} unit="%" tone={tone(r.metrics.handsAddressPct >= -5 && r.metrics.handsAddressPct <= 30, r.metrics.handsAddressPct <= 45)} />
          )}
          {r.metrics.handsTopPct != null && (
            <Stat label={t('sw.049')} value={r.metrics.handsTopPct} unit="%" tone={tone(r.metrics.handsTopPct >= 0, true)} />
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {tempo}
          <Stat label={t('sw.050')} value={r.metrics.shoulderTurnDeg} unit="°" tone={tone(r.metrics.shoulderTurnDeg >= 75, r.metrics.shoulderTurnDeg >= 55)} />
          <Stat label={t('sw.051')} value={r.metrics.hipTurnDeg} unit="°" tone={tone(r.metrics.hipTurnDeg <= 60, true)} />
          <Stat label={t('sw.052')} value={Math.abs(r.metrics.spineChangeDeg)} unit="°" tone={tone(Math.abs(r.metrics.spineChangeDeg) <= SPINE_SIDE[0], Math.abs(r.metrics.spineChangeDeg) <= SPINE_SIDE[1])} />
          <Stat label={t('sw.053')} value={r.metrics.headSwayPct} unit="%" tone={tone(r.metrics.headSwayPct <= 25, r.metrics.headSwayPct <= 45)} />
          <Stat label={t('sw.054')} value={r.metrics.hipShiftPct} unit="%" tone={tone(r.metrics.hipShiftPct >= 8, r.metrics.hipShiftPct >= -5)} />
          <Stat label={t('sw.055')} value={r.metrics.leadArmDeg} unit="°" tone={tone(r.metrics.leadArmDeg >= 140, true)} />
          {r.metrics.handsTopPct != null && (
            <Stat label={t('sw.049')} value={r.metrics.handsTopPct} unit="%" tone={tone(r.metrics.handsTopPct >= 0, true)} />
          )}
        </div>
      )}
      <p className="text-xs text-muted-foreground px-1">
        {t('sw2.metaLine', { up: r.metrics.backswingSec, down: r.metrics.downswingSec, frames: r.metrics.framesUsed })}{r.lefty != null && (r.lefty ? t('sw2.metaLefty') : t('sw2.metaRighty'))}{t('sw2.metaEst')}{r.view === 'atras' && t('sw2.metaDtl')}
      </p>

      <WristCard m={r.metrics} />

      {r.club && (
        <Card className="!p-4 space-y-3">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-sm">{t('sw.020')}</h3>
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-accent/15 text-[hsl(38_70%_32%)]">{t('sw.019')}</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {r.club.addressLeanDeg != null && <Stat label={t('sw.056')} value={r.club.addressLeanDeg} unit="°" tone={tone(r.club.addressLeanDeg >= -8, true)} />}
            {r.club.addressPlaneDeg != null && <Stat label={t('sw.057')} value={r.club.addressPlaneDeg} unit="°" tone="good" />}
            {r.club.topDeg != null && <Stat label={t('sw.058')} value={r.club.topDeg} unit="°" tone={tone(r.club.topDeg >= -12 && r.club.topDeg <= 35, true)} />}
          </div>
          {r.club.feedback.map((f) => (
            <div key={f.key} className="space-y-1">
              <p className="text-sm font-semibold">{f.title}</p>
              <p className="text-sm text-muted-foreground">{f.detail}</p>
              {f.drill && <p className="text-sm bg-muted rounded-lg px-3 py-2"><span className="font-semibold">{t('sw.015')} </span>{f.drill}</p>}
            </div>
          ))}
          <p className="text-xs text-muted-foreground">
            {t('sw2.clubFoot')}{r.club.topDeg != null && t('sw2.clubFootTop')}
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
              {f.drill && <p className="text-sm bg-muted rounded-lg px-3 py-2"><span className="font-semibold">{t('sw.015')} </span>{f.drill}</p>}
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

const videoErr = () => t('sw2.videoErr');
const WAIT_MS = 8000;

/** Mueve el video a `sec` y espera a que muestre ese cuadro. Falla con un mensaje claro si el video no responde. */
const seek = (v: HTMLVideoElement, sec: number) => seekVideo(v, sec, WAIT_MS).catch(() => { throw new Error(videoErr()); });

/** Espera a que el video tenga sus datos básicos (duración y tamaño). */
const metadata = (v: HTMLVideoElement) =>
  v.readyState >= 1 ? Promise.resolve() : new Promise<void>((res, rej) => {
    const timer = setTimeout(() => rej(new Error(videoErr())), WAIT_MS);
    v.addEventListener('loadedmetadata', () => { clearTimeout(timer); res(); }, { once: true });
    v.addEventListener('error', () => { clearTimeout(timer); rej(new Error(videoErr())); }, { once: true });
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
  let model = pose; // si el GPU falla al detectar, pasa a CPU y se sigue con ese modelo
  const grab = async (t: number) => { await seek(v, t); const r = await detectResilient(model, v, v.currentTime * 1000); model = r.pose; return r.frame; };
  const coarse: Frame[] = [];
  let coarseN = 0;
  for (let t = 0; t < dur; t += COARSE) {
    const f = await grab(t);
    coarseN++;
    if (f) coarse.push(f);
    onProgress(Math.round((t / dur) * 60));
  }
  const win = findSwingWindow(coarse, { aspect });
  if (!win) return { frames: coarse, sampled: coarseN, coarse: null as { frames: Frame[]; sampled: number } | null, swings: 0 };
  const to = Math.min(dur, win.to / 1000), from = win.from / 1000;
  const fine: Frame[] = [];
  let fineN = 0;
  for (let t = from; t <= to; t += FINE) {
    const f = await grab(t);
    fineN++;
    if (f) fine.push(f);
    onProgress(60 + Math.round(((t - from) / Math.max(0.1, to - from)) * 40));
  }
  return { frames: fine, sampled: fineN, coarse: { frames: coarse, sampled: coarseN }, swings: win.swings };
}

/**
 * Tramo EXTRA tras el análisis, solo para la revisión (F3.4): cuadros a 30/s desde `fromMs` hasta `toMs` para ver la pose
 * final. No entra en `analyzeSwing` (cambiar la ventana movería los índices de `findEvents`): inicio, tope e impacto
 * salen exactamente igual con o sin esto.
 */
async function sampleRange(v: HTMLVideoElement, pose: Awaited<ReturnType<typeof loadPose>>, fromMs: number, toMs: number): Promise<{ frames: Frame[]; sampled: number }> {
  let model = pose;
  const out: Frame[] = [];
  let n = 0;
  for (let t = fromMs; t <= toMs; t += FINE * 1000) {
    await seek(v, t / 1000);
    const r = await detectResilient(model, v, v.currentTime * 1000);
    model = r.pose;
    n++;
    if (r.frame) out.push(r.frame);
  }
  return { frames: out, sampled: n };
}
const sampleExtra = async (v: HTMLVideoElement, pose: Awaited<ReturnType<typeof loadPose>>, fromMs: number, toMs: number) => (await sampleRange(v, pose, fromMs, toMs)).frames;

/** Miniatura (JPEG pequeño) del cuadro en `ms`, para el selector de swings. */
async function thumbAt(v: HTMLVideoElement, ms: number): Promise<string | undefined> {
  try {
    await seek(v, ms / 1000);
    const k = Math.min(1, 150 / v.videoWidth), c = document.createElement('canvas');
    c.width = Math.round(v.videoWidth * k); c.height = Math.round(v.videoHeight * k);
    c.getContext('2d')!.drawImage(v, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.7);
  } catch { return undefined; }
}

/**
 * Final y confianza por fase de un resultado ya calculado (F3.4): muestrea un tramo extra tras el impacto, completa
 * `r.times.finish` y `r.phaseConf` y devuelve los cuadros para la pista de la revisión. No cambia nada del análisis.
 */
async function addReviewData(v: HTMLVideoElement, pose: Awaited<ReturnType<typeof loadPose>>, frames: Frame[], r: SwingResult, durMs: number): Promise<{ frames: Frame[]; finish: ReturnType<typeof findFinish> }> {
  if (!r.times) return { frames, finish: null };
  const lastT = frames[frames.length - 1]?.t ?? r.times.impact;
  const extra = await sampleExtra(v, pose, lastT + FINE * 1000, Math.min(durMs, r.times.impact + 2300));
  const all = [...frames, ...extra];
  const fin = findFinish(all, r.times.impact);
  r.times = { ...r.times, ...(fin ? { finish: fin.t } : {}) };
  r.phaseConf = { ...phaseConfidence(frames, r.times), ...(fin ? { finish: fin.conf } : {}) };
  return { frames: all, finish: fin };
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
      <h3 className="font-semibold text-sm">{t('sw.021')}</h3>
      <div className="grid grid-cols-2 gap-3">
        {(['frente', 'atras'] as const).map((vw) => (
          <figure key={vw} className="bg-muted rounded-xl p-2 text-center">
            <Silhouette view={vw} color="currentColor" className="w-full h-32 text-primary" />
            <figcaption className="text-xs font-medium mt-1">{viewLabel(vw)}</figcaption>
          </figure>
        ))}
      </div>
      <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-4">
        <li>{t('sw.022')}</li>
        <li>{t('sw.023')}</li>
        <li>{t('sw.024')}</li>
        <li>{t('sw.025')}</li>
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
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{t('sw.026')}</p>
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
        {value ? t('sw2.clubConfirmed', { club: clubLabel(value) }) : t('sw2.clubNone')}
      </p>
    </div>
  );
}

function UploadAnalyzer({ view }: { view: ViewChoice }) {
  const { profile, sessions, addSession, currentClub, setCurrentClub } = useStore();
  const flags = useFlags();
  const fileRef = useRef<File | null>(null);
  /** Se incrementa al elegir otro video, al limpiar y al analizar: los resultados de trabajos viejos (guardado, reanálisis) se descartan. */
  const tokenRef = useRef(0);
  /** Ids del video y la pista guardados para la revisión (F3.1) y aviso si no se pudo guardar. */
  const [saved, setSaved] = useState<{ sessionId: string; mediaId?: string; poseTrackId?: string } | null>(null);
  const [mediaNotice, setMediaNotice] = useState<string | null>(null);
  /** Swings detectados en el video (F3.5), cuál está analizado y si se está reanalizando otro. */
  const [choices, setChoices] = useState<{ w: SwingWindow; thumb?: string }[]>([]);
  const [chosen, setChosen] = useState(0);
  const [choosing, setChoosing] = useState(false);
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

  // Cuota por archivo analizado (no por clic): `savedRef` marca que este archivo ya guardó su sesión.
  const [analyzed, setAnalyzed] = useState(false);
  const savedRef = useRef(false);
  const used = swingUploadsToday(sessions);
  const quota = uploadQuota({ premium: profile.premium, used, limit: FREE.swingUploadsPerDay, analyzedThisFile: analyzed });

  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  const pick = (f?: File) => {
    if (!f) return;
    setResult(null); setError(null); setProgress(0); setShots([]); setWarn(null); setTooLong(null);
    tokenRef.current++;
    setAnalyzed(false); savedRef.current = false; setSaved(null); setMediaNotice(null); setChoices([]);
    fileRef.current = f;
    setUrl(URL.createObjectURL(f));
  };

  const analyze = async () => {
    const v = videoRef.current;
    if (!v) return;
    // Defensa extra contra dobles toques y reanálisis gratis del mismo archivo (el botón ya viene deshabilitado).
    if (!profile.premium && savedRef.current) return;
    const token = ++tokenRef.current;
    setBusy(true); setError(null); setResult(null); setShots([]); setWarn(null);
    // Gancho de QA (solo en desarrollo, ver lib/debugHook.ts): en producción `dbg` es null y nada de esto entra al paquete.
    const dbg: DebugBag | null = import.meta.env.DEV ? debugSwing({ done: false, t0: performance.now(), view }) : null;
    try {
      const pose = await loadPose();
      await metadata(v);
      v.pause();
      const dur = Math.min(v.duration || 0, MAX_SECONDS);
      if (!(dur > 0.5)) throw new Error(videoErr());
      const aspect = v.videoWidth && v.videoHeight ? v.videoWidth / v.videoHeight : 1;
      if (dbg) Object.assign(dbg, { aspect, dur, videoW: v.videoWidth, videoH: v.videoHeight });
      const sampled = await sampleVideo(v, pose, dur, aspect, setProgress);
      let frames = sampled.frames;
      if (dbg) {
        Object.assign(dbg, {
          sampled: { n: sampled.sampled, got: sampled.frames.length, coarse: sampled.coarse ? { n: sampled.coarse.sampled, got: sampled.coarse.frames.length } : null },
          frames: sampled.frames, coarseFrames: sampled.coarse?.frames ?? null,
          window: findSwingWindow(sampled.coarse?.frames ?? sampled.frames, { aspect }),
        });
      }
      let r = analyzeSwing(frames, { lefty: profile.lefty, view, aspect, sampled: sampled.sampled });
      if (dbg) Object.assign(dbg, { fineResult: r, usedCoarse: false });
      // Si la pasada fina no da un swing (el video no era lo que parecía), se prueba con la gruesa.
      if (typeof r === 'string' && sampled.coarse) {
        const c = analyzeSwing(sampled.coarse.frames, { lefty: profile.lefty, view, aspect, sampled: sampled.coarse.sampled });
        if (dbg) dbg.coarseResult = c;
        if (typeof c !== 'string') { r = c; frames = sampled.coarse.frames; if (dbg) dbg.usedCoarse = true; }
      }
      if (dbg) Object.assign(dbg, { result: r, analysisFrames: frames });
      if (typeof r === 'string') { setError(swingErrorText(r)); if (dbg) dbg.errorText = swingErrorText(r); }
      else {
        const start = frames.find((x) => x.t === r.times?.address);
        if (start) {
          const fr = framingCheck(start.lm);
          if (dbg) Object.assign(dbg, { framing: fr, framingFrame: start });
          // Con varios swings se analiza el último (el de la bola suele ser el último): se dice, para que no parezca un error.
          const several = sampled.swings > 1 ? t('sw2.severalSeen', { n: sampled.swings }) : '';
          if (several || !fr.ok) {
            setWarn(several + (fr.ok ? '' : `Encuadre mejorable. ${fr.hint}. Algunas medidas pueden salir menos precisas.`));
            if (dbg) Object.assign(dbg, { warnText: several + (fr.ok ? '' : `Encuadre mejorable. ${fr.hint}.`), swings: sampled.swings });
          }
          // El palo es un extra: si algo falla al buscarlo, el análisis del cuerpo se muestra igual.
          try {
            const key = await captureKeyFrames(v, frames, r);
            setShots(key.shots);
            if (dbg) Object.assign(dbg, { shots: key.shots.map((x) => ({ label: x.label, url: x.url })), shaftAddress: key.address, shaftTop: key.top });
            r.club = readClub(r.view ?? 'frente', key.address, key.top, targetSide(start.lm, r.lefty ?? profile.lefty)) ?? undefined;
            if (dbg) dbg.club = r.club ?? null;
          } catch (e) { if (dbg) dbg.clubError = String(e); /* sin fotos ni palo */ }
        }
        setResult(r);
        // F3.4: confianza por fase y final del swing (con un tramo extra post-impacto). No cambia la nota ni los eventos.
        let reviewFrames: Frame[] = frames;
        if (flags.videoReview && r.times) {
          try {
            const rd = await addReviewData(v, pose, frames, r, dur * 1000);
            reviewFrames = rd.frames;
            if (dbg) Object.assign(dbg, { finish: rd.finish, phaseConf: r.phaseConf });
          } catch { /* sin final ni confianza: la revisión usa las tres fases como siempre */ }
          // F3.5: si el video trae varios swings, se ofrece escoger cuál analizar (miniaturas del inicio de cada uno).
          try {
            const wins = sampled.coarse ? swingWindows(sampled.coarse.frames, { aspect }) : [];
            if (wins.length > 1) {
              const items = await Promise.all(wins.map(async (w) => ({ w, thumb: await thumbAt(v, w.from + 900) })));
              setChoices(items);
              setChosen(wins.length - 1);
              if (dbg) dbg.windows = wins;
            } else setChoices([]);
          } catch { setChoices([]); }
        }
        const sess = addSession({ type: 'swing', score: r.score, tempoRatio: r.metrics.tempoRatio, swing: r, club: currentClub ?? undefined });
        savedRef.current = true; setAnalyzed(true);
        // F3.1: con la revisión de video encendida se guarda el video y la pista de postura (sin cambiar el análisis).
        if (flags.videoReview && fileRef.current) {
          const file = fileRef.current, hz = frames === sampled.frames ? 30 : 10, durationMs = Math.round((v.duration || 0) * 1000);
          setSaved({ sessionId: sess.id });
          void getMediaStore().then((st) => persistReview(st, { file, frames: reviewFrames, hz, video: { durationMs, w: v.videoWidth, h: v.videoHeight }, sessionId: sess.id, result: r })).then((out) => {
            if (tokenRef.current !== token) return; // el usuario ya cambió de video o volvió a analizar
            if (!out.ok) { setMediaNotice(t('sw2.savedBut', { msg: out.message.charAt(0).toLowerCase() + out.message.slice(1) })); return; }
            useStore.getState().attachMedia(sess.id, out.ids);
            setSaved({ sessionId: sess.id, ...out.ids });
            if (!out.persistent) setMediaNotice(t('sw2.noPersist'));
          }).catch(() => setMediaNotice(t('sw2.videoNotSaved')));
        }
      }
    } catch (e) {
      setError(t('sw2.analyzeFail') + (e instanceof Error ? e.message : ''));
      if (dbg) dbg.thrown = t('sw2.analyzeFail') + (e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      if (dbg) Object.assign(dbg, { done: true, ms: Math.round(performance.now() - (dbg.t0 as number)) });
    }
  };

  /**
   * Analiza OTRO swing del mismo video (F3.5, #10). No consume cuota: reemplaza el análisis de la misma sesión en vez de
   * guardar otra. Si el otro swing no se puede leer, se conserva el anterior y se avisa.
   */
  const chooseSwing = async (idx: number) => {
    const v = videoRef.current, ch = choices[idx];
    if (!v || !ch || choosing || idx === chosen || !saved) return;
    setChoosing(true);
    setError(null);
    const token = tokenRef.current;
    const stale = () => tokenRef.current !== token;
    const dbg: DebugBag | null = import.meta.env.DEV ? debugSwing({ done: false, t0: performance.now(), view, chosen: idx }) : null;
    try {
      const pose = await loadPose();
      const dur = Math.min(v.duration || 0, MAX_SECONDS);
      const aspect = v.videoWidth && v.videoHeight ? v.videoWidth / v.videoHeight : 1;
      const { frames, sampled: n } = await sampleRange(v, pose, ch.w.from, Math.min(dur * 1000, ch.w.to));
      const r2 = analyzeSwing(frames, { lefty: profile.lefty, view, aspect, sampled: n });
      if (stale()) return;
      if (typeof r2 === 'string') {
        setError(t('sw2.rereadFail', { why: swingErrorText(r2) }));
        if (dbg) Object.assign(dbg, { errorText: swingErrorText(r2), result: r2, done: true });
        return;
      }
      const rd = await addReviewData(v, pose, frames, r2, dur * 1000);
      let newShots: Shot[] = [];
      try {
        const key = await captureKeyFrames(v, frames, r2);
        newShots = key.shots;
        const start = frames.find((x) => x.t === r2.times?.address);
        if (start) r2.club = readClub(r2.view ?? 'frente', key.address, key.top, targetSide(start.lm, r2.lefty ?? profile.lefty)) ?? undefined;
      } catch { newShots = []; }
      // Primero la pista (reemplazo atómico): si falla, no se cambia nada y se conserva el análisis anterior.
      if (saved.mediaId && saved.poseTrackId) {
        const st = await getMediaStore();
        await st.savePoseTrack(framesToPoseTrack(rd.frames, saved.mediaId, 30), saved.poseTrackId);
      }
      if (stale()) return;
      setShots(newShots);
      setResult(r2);
      setChosen(idx);
      useStore.getState().replaceSessionSwing(saved.sessionId, r2);
      if (saved.mediaId && saved.poseTrackId) setSaved({ ...saved }); // la revisión recarga la pista
      if (dbg) Object.assign(dbg, { result: r2, finish: rd.finish, done: true });
    } catch (e) {
      if (!stale()) setError(t('sw2.reanalyzeFail') + (e instanceof Error ? e.message : ''));
      if (dbg) Object.assign(dbg, { thrown: String(e), done: true });
    } finally {
      setChoosing(false);
    }
  };

  if (quota.showGate && !result) {
    return (
      <PremiumGate title={t('sw.059')}>
        {t('sw2.dailyLimit', { n: FREE.swingUploadsPerDay })}
      </PremiumGate>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-4">
        {url ? (
          <video
            ref={videoRef} src={url} controls={!busy} muted playsInline className="w-full rounded-xl bg-black max-h-[50vh]"
            onError={() => setError(videoErr())}
            onLoadedMetadata={(e) => { const d = e.currentTarget.duration; setTooLong(Number.isFinite(d) && d > MAX_SECONDS + 0.5 ? Math.ceil(d) : null); }}
          />
        ) : (
          <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-border rounded-xl py-10 cursor-pointer hover:bg-muted/50">
            <span className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center"><Upload className="w-5 h-5" /></span>
            <span className="font-medium">{t('sw.027')}</span>
            <span className="text-xs text-muted-foreground">{t('sw2.uploadHint', { s: MAX_SECONDS })}</span>
            <input type="file" accept="video/*" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
          </label>
        )}
        {url && !busy && <ClubPicker value={currentClub} onChange={setCurrentClub} />}
        {url && (
          <div className="flex gap-2">
            <Button full onClick={analyze} disabled={busy || choosing || !quota.canAnalyze}>
              {busy ? <><Loader2 className="w-5 h-5 animate-spin" /> {t('sw2.analyzing', { p: progress })}</> : !quota.canAnalyze && analyzed ? <><Activity className="w-5 h-5" /> {t('sw.028')}</> : <><Activity className="w-5 h-5" /> {t('sw.029')}</>}
            </Button>
            <Button variant="outline" disabled={busy || choosing} onClick={() => { tokenRef.current++; setSaved(null); setMediaNotice(null); setUrl(null); setResult(null); setError(null); setShots([]); setWarn(null); setTooLong(null); setAnalyzed(false); savedRef.current = false; setChoices([]); }} aria-label={t('sw.060')}><RefreshCw className="w-5 h-5" /></Button>
          </div>
        )}
        {!profile.premium && <p className="text-xs text-muted-foreground text-center">{t('sw2.freeLeft', { n: Math.max(0, FREE.swingUploadsPerDay - used), total: FREE.swingUploadsPerDay })}</p>}
      </Card>
      {!url && <HowToRecord />}
      {tooLong && (
        <Notice>
          {t('sw2.tooLong', { len: tooLong, max: MAX_SECONDS })}
        </Notice>
      )}
      {error && <Notice tone="error">{error}</Notice>}
      {warn && <Notice>{warn}</Notice>}
      {mediaNotice && <Notice>{mediaNotice}</Notice>}
      {result?.viewMismatch && (
        <Notice tone="error">
          {t('sw2.viewMismatch', { chosen: viewLabel(result.view ?? 'frente'), actual: viewLabel(result.viewMismatch).toLowerCase(), auto: t('sw2.viewAuto') })}
        </Notice>
      )}
      {flags.videoReview && choices.length > 1 && result && (
        <Card className="space-y-3">
          <p className="text-sm font-medium" data-swing-chooser>{t('sw2.choicesTitle', { n: choices.length })}</p>
          <p className="text-xs text-muted-foreground">{t('sw.030')}</p>
          <div className="grid grid-cols-3 gap-2">
            {choices.map((c, i) => (
              <button key={c.w.index} disabled={choosing || (!saved?.mediaId && !mediaNotice)} onClick={() => void chooseSwing(i)} aria-pressed={i === chosen}
                className={`rounded-xl overflow-hidden border-2 text-left ${i === chosen ? 'border-primary' : 'border-border'} ${choosing ? 'opacity-60' : ''}`}>
                {c.thumb ? <img src={c.thumb} alt={`Swing ${i + 1}`} className="w-full aspect-[3/4] object-cover bg-black" /> : <div className="w-full aspect-[3/4] bg-muted" />}
                <span className="block text-[11px] px-1.5 py-1">Swing {i + 1} · {((c.w.from + 900) / 1000).toFixed(1).replace('.', ',')} s{i === chosen ? ' ✓' : ''}</span>
              </button>
            ))}
          </div>
          {choosing && <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> {t('sw.031')}</p>}
        </Card>
      )}
      {result && flags.videoReview && saved?.mediaId && (
        <VideoReview key={`${saved.mediaId}:${chosen}`} r={result} mediaId={saved.mediaId} poseTrackId={saved.poseTrackId} onManual={(m) => useStore.getState().setReviewMarks(saved.sessionId, m)} />
      )}
      {result && flags.compare && saved?.mediaId && <Link to={`/comparar?a=${saved.sessionId}`} className="inline-block text-sm underline">{t('sw.001')}</Link>}
      {result && <SwingResultView r={result} shots={shots} />}
    </div>
  );
}

/* ───────────────────────── En vivo (Premium) ───────────────────────── */

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
  /** F10.5: la cámara se detuvo porque la app pasó a segundo plano; los swings se conservan y se reanuda a mano. */
  const [interrupted, setInterrupted] = useState(false);
  /** F10.6: aviso de que se bajó la resolución por rendimiento. */
  const [perfNote, setPerfNote] = useState<string | null>(null);
  const [perm, setPerm] = useState<CameraPermission>('unknown');
  const liveFlags = useFlags();
  /** F10.4: grabación de la sesión (solo con `flags.liveRecording`): cada tramo de cámara es una grabación con las marcas de sus swings. */
  const recRef = useRef<LiveRecorder | null>(null);
  const marksRef = useRef<{ from: number; to: number }[]>([]);
  const segsRef = useRef<Promise<{ blob: Blob | null; marks: { from: number; to: number }[]; w: number; h: number }>[]>([]);
  const dimsRef = useRef({ w: 0, h: 0 });
  const [clipIds, setClipIds] = useState<string[]>([]);
  const [clipSound, setClipSound] = useState<BallSound[]>([]);
  /** F10.3: el micrófono es opcional y empieza apagado. */
  const [useMic, setUseMic] = useState(false);
  useEffect(() => { void queryCameraPermission().then(setPerm); }, []);
  const [facing, setFacing] = useState<'user' | 'environment'>('user');
  const [status, setStatus] = useState(() => t('sw2.liveStatusInit'));
  const [swings, setSwings] = useState<SwingResult[]>([]);
  const swingsRef = useRef<SwingResult[]>([]);
  // Silueta guía: qué vista se ve, si el jugador está bien encuadrado y si toca mostrarla.
  const [guide, setGuide] = useState<{ view: SwingView; ok: boolean; show: boolean }>({ view: 'frente', ok: false, show: true });
  const guideRef = useRef(guide);
  const putGuide = (g: { view: SwingView; ok: boolean; show: boolean }) => {
    const c = guideRef.current;
    if (c.view !== g.view || c.ok !== g.ok || c.show !== g.show) { guideRef.current = g; setGuide(g); }
  };

  /** Cierra la grabación del tramo actual (sin esperar): su resultado queda en `segsRef` para cortar los swings al terminar. */
  const closeRecording = () => {
    const rec = recRef.current;
    if (!rec) return;
    recRef.current = null;
    const marks = marksRef.current; marksRef.current = [];
    const { w, h } = dimsRef.current;
    segsRef.current.push(rec.stop().then((blob) => { rec.discard(); return { blob, marks, w, h }; }));
  };

  const stop = () => {
    closeRecording();
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setOn(false);
  };
  useEffect(() => stop, []);

  // F10.5: al salir de la app (visibilitychange/pagehide) se detiene la cámara de forma segura y se conserva lo ya detectado.
  useEffect(() => {
    const pause = () => { if (streamRef.current) { stop(); setInterrupted(true); } };
    const onVis = () => { if (document.hidden) pause(); };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', pause);
    return () => { document.removeEventListener('visibilitychange', onVis); window.removeEventListener('pagehide', pause); };
  }, []);

  // `fresh`: sesión nueva (vacía los swings de la anterior). Al cambiar de cámara en plena sesión no se vacía.
  const start = async (face = facing, fresh = true) => {
    setError(null); setLoading(true); setInterrupted(false); setPerfNote(null);
    if (fresh) { swingsRef.current = []; setSwings([]); }
    try {
      const pose = await loadPose();
      // Con respaldo a CPU y corte tras 3 fallos seguidos (#20): el detector nunca deja la cámara congelada en silencio.
      const detector = createLiveDetector(pose);
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: face, width: { ideal: 960 }, height: { ideal: 720 }, frameRate: { ideal: 60 } }, audio: liveFlags.liveRecording && useMic });
      streamRef.current = stream;
      const v = videoRef.current!;
      v.srcObject = stream;
      await v.play();
      setOn(true);
      if (liveFlags.liveRecording && typeof MediaRecorder !== 'undefined') {
        const rec = new LiveRecorder({ create: (s, m) => new MediaRecorder(s, { mimeType: m }) as never, isSupported: (t) => MediaRecorder.isTypeSupported(t), now: () => performance.now() }, (e) => setPerfNote(e === 'warn' ? t('sw2.recWarn') : t('sw2.recStop')));
        if (rec.start(stream)) { recRef.current = rec; marksRef.current = []; dimsRef.current = { w: v.videoWidth, h: v.videoHeight }; }
      }

      // La detección de cada swing (histéresis, bajada en tiempo real, separación de 3 s, rearme y bloqueo de identidad) vive en
      // `lib/live/detector.ts`, probada con cuadros sintéticos (F10.2).
      const det = new LiveSwingDetector({ lefty: profile.lefty, view: () => viewRef.current, aspect: () => (v.videoWidth && v.videoHeight ? v.videoWidth / v.videoHeight : 1) });

      let busy = false;
      const fps = new FpsMonitor();
      const loop = () => {
        rafRef.current = requestAnimationFrame(loop);
        if (busy || v.readyState < 2) return;
        busy = true;
        const now = performance.now();
        detector(v, now)
          .then((f) => {
            if (!streamRef.current) return;
            step(f, now);
            // F10.6: si se procesan menos de 12 cuadros por segundo durante 5 s, se baja la entrada a 640×480 y se avisa.
            if (fps.record(now) === 'lower') {
              void stream.getVideoTracks()[0]?.applyConstraints({ width: { ideal: 640 }, height: { ideal: 480 } }).then(() => setPerfNote(t('sw2.lowerRes'))).catch(() => setPerfNote(t('sw2.slowPhone')));
            }
          })
          .catch((e) => {
            stop();
            setError(e instanceof PoseFailure
              ? t('sw2.poseFail')
              : t('sw2.liveInterrupted') + (e instanceof Error ? e.message : ''));
          })
          .finally(() => { busy = false; });
      };
      const step = (f: Frame | null, now: number) => {
        const c = canvasRef.current;
        if (!c) return;
        if (c.width !== v.videoWidth) { c.width = v.videoWidth; c.height = v.videoHeight; }
        const ctx = c.getContext('2d')!;
        ctx.clearRect(0, 0, c.width, c.height);
        if (!f) { const r = det.noPerson(); if (r.status) setStatus(r.status); if (r.guide) putGuide(r.guide); return; }
        drawSkeleton(ctx, f.lm, c.width, c.height);
        const r = det.step(f, now);
        if (r.status) setStatus(r.status);
        if (r.guide) putGuide(r.guide);
        if (r.swing) {
          const aspect = v.videoWidth && v.videoHeight ? v.videoWidth / v.videoHeight : 1;
          const res = analyzeSwing(r.swing, { lefty: profile.lefty, view: viewRef.current, aspect });
          if (typeof res !== 'string') {
            if (recRef.current) marksRef.current.push({ from: recRef.current.markAt(r.swing[0].t), to: recRef.current.markAt(r.swing[r.swing.length - 1].t) });
            swingsRef.current = [res, ...swingsRef.current];
            setSwings(swingsRef.current);
            setStatus(`Swing ${swingsRef.current.length}: ${res.score}/100`);
          } else setStatus(t('sw2.liveReadFail'));
        }
      };
      loop();
    } catch (e) {
      const cp = cameraProblem(e);
      setError(`${cp.title}. ${cp.detail}`);
      stop();
    } finally {
      setLoading(false);
    }
  };

  const finish = async () => {
    stop();
    // Idempotente: vacía la lista, así un doble toque no guarda dos veces (#18).
    const payload = drainLiveSwings(swingsRef);
    const segs = segsRef.current; segsRef.current = [];
    let liveClips: string[] = [];
    const liveSound: BallSound[] = [];
    if (payload && segs.length) {
      // F10.4: se cortan los swings (±2 s) de cada grabación, se guardan y la grabación completa se descarta.
      try {
        const store = await getMediaStore();
        for (const sg of await Promise.all(segs)) {
          if (!sg.blob) continue;
          for (const m of sg.marks) {
            const win = clipWindow(m.from, m.to, Infinity);
            const clip = win && (await cutClip(sg.blob, win.fromMs, win.toMs));
            if (!clip || !win) continue;
            const ref = await store.saveMedia(clip, { kind: 'source', mime: clip.type, durationMs: win.toMs - win.fromMs, w: sg.w, h: sg.h, rotation: 0, clock: makeClock({ fpsNominal: 30, fpsSource: 'estimated' }) });
            liveClips.push(ref.id);
            if (useMic) liveSound.push(await classifyClipSound(clip, m.to - 500 - win.fromMs));       // el impacto visual cae ≈ 0,5 s antes del último cuadro del swing
          }
        }
      } catch { liveClips = []; }
    }
    if (payload) addSession({ ...payload, ...(liveClips.length ? { liveClips } : {}), ...(liveSound.length ? { liveSound } : {}) });
    setClipIds(liveClips); setClipSound(liveSound);
  };

  const flip = () => { const n = facing === 'user' ? 'environment' : 'user'; setFacing(n); stop(); start(n, false); };
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
            <p className="text-sm opacity-80">{t('sw.032')}</p>
            {liveFlags.liveRecording && <label className="flex items-center gap-2 text-xs opacity-80"><input type="checkbox" checked={useMic} onChange={(e) => setUseMic(e.target.checked)} /> {t('sw.033')}</label>}
            <p className="text-xs opacity-60" data-camera-permission>{perm === 'denied' ? t('sw2.camBlocked') : t('sw2.camPrivacy')}</p>
            <Button variant="gold" onClick={() => start()} disabled={loading}>
              {loading ? <><Loader2 className="w-5 h-5 animate-spin" /> {t('sw.034')}</> : <><Video className="w-5 h-5" /> {t('sw.035')}</>}
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
                  <span className="block opacity-70">{last.view === 'atras' ? t('sw2.liveTempoDtl', { ratio: last.metrics.tempoRatio, deg: last.metrics.spineAddressDeg }) : t('sw2.liveTempoFace', { ratio: last.metrics.tempoRatio, deg: last.metrics.shoulderTurnDeg })}</span>
                  <span className="block font-semibold">{topIssue ? topIssue.title : t('sw2.liveSolid')}</span>
                </span>
              </div>
            )}
          </>
        )}
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      {perfNote && <Notice>{perfNote}</Notice>}
      {interrupted && (
        <Notice>{t('sw2.pausedA')}{swings.length ? t('sw2.pausedB', { count: nSwings(swings.length) }) : ''}{t('sw2.pausedC')}</Notice>
      )}
      {interrupted && (
        <div className="flex gap-2">
          <Button full onClick={() => void start(facing, false)}><Video className="w-4 h-4" /> {t('sw.036')}</Button>
          <Button full variant="outline" onClick={finish}><Square className="w-4 h-4" /> {t('sw2.finish')}{swings.length ? ` (${swings.length})` : ''}</Button>
        </div>
      )}
      {on && (
        <div className="flex gap-2">
          <Button full variant="outline" onClick={finish}><Square className="w-4 h-4" /> {t('sw2.finish')}{swings.length ? ` (${swings.length})` : ''}</Button>
          <Button variant="outline" onClick={flip} aria-label={t('sw.061')}><RefreshCw className="w-5 h-5" /></Button>
        </div>
      )}
      {clipIds.length > 0 && !on && <LiveClips ids={clipIds} sound={clipSound} />}
      {!on && !interrupted && swings.length > 0 && (
        <>
          <Notice tone="ok">{t('sw2.liveSaved', { count: nSwings(swings.length) })}</Notice>
          <SwingResultView r={swings.reduce((a, b) => (b.score > a.score ? b : a))} />
        </>
      )}
    </div>
  );
}

/** Videos recortados de los swings de una sesión en vivo (F10.4). */
function LiveClips({ ids, sound }: { ids: string[]; sound: BallSound[] }) {
  const [urls, setUrls] = useState<string[]>([]);
  useEffect(() => {
    let dead = false; const made: string[] = [];
    (async () => {
      const st = await getMediaStore();
      for (const id of ids) { try { const { blob } = await st.getMedia(id); made.push(URL.createObjectURL(blob)); } catch { /* ya no está */ } }
      if (!dead) setUrls([...made]);
    })();
    return () => { dead = true; made.forEach((u) => URL.revokeObjectURL(u)); };
  }, [ids]);
  if (!urls.length) return null;
  return (
    <div className="space-y-2" data-live-clips>
      <p className="text-sm font-medium">{t('sw.037')}</p>
      <div className="grid grid-cols-2 gap-2">{urls.map((u, i) => <div key={u}><video src={u} controls playsInline muted className="w-full rounded-xl bg-black" aria-label={`Swing ${i + 1}`} />{sound[i] && <p className="text-[11px] text-muted-foreground mt-0.5">{BALL_SOUND_LABEL[sound[i]]}</p>}</div>)}</div>
    </div>
  );
}
