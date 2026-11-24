import { useEffect, useState } from 'react';
import { Camera, CheckCircle2, Circle, FlaskConical, Loader2, Pause, Play, ScanLine, Settings2, ShieldAlert, Video, XCircle } from 'lucide-react';
import { useStore, todayISO, useUnit } from '@/store';
import { fmtDist, inputValue, parseToMeters, UNIT_SHORT } from '@/lib/units';
import { buildPlan, GEAR_LABEL, planNote, zones, type Floor, type Gear, type PlanDrill, type Space } from '@/lib/homelab';
import { fileToImages, scanInfo, scanSpace, scanToSpace, ScanError, type ScanInfo, type ScanResult } from '@/lib/scan';
import { Button, Card, Notice, PageHeader } from '@/components/ui';
import { HOMELAB_NOTICE_ITEMS, HOMELAB_QUICK_ITEMS, noticeAccepted, quickNoticeVisible } from '@/lib/homelabNotice';
import { fmtDate, t, td, useT } from '@/i18n';

const DEFAULT: Space = { lengthM: 4, widthM: 3, ceilingM: 2.5, floor: 'alfombra', gear: ['putter'] };
const FLOORS: Floor[] = ['alfombra', 'cesped', 'duro'];

export default function HomeLab() {
  useT();
  const { mode, space, plan, scan, sessions, homelabNotice, setSpace, setPlan, addSession, setMode, acceptHomelabNotice } = useStore();
  const unit = useUnit();
  const [editing, setEditing] = useState(!space);
  const [showNotice, setShowNotice] = useState(false);
  const [quickDismissed, setQuickDismissed] = useState(false); // el recordatorio corto ya se cerró en esta vuelta de «analizar un espacio»
  const accepted = noticeAccepted(homelabNotice);
  const today = todayISO();

  // Plan del día: se genera una vez por fecha y se conserva el avance.
  useEffect(() => {
    if (!space || editing || !accepted) return;
    if (!plan || plan.date !== today) {
      const lastSwing = sessions.find((s) => s.type === 'swing' && s.swing);
      const focus = lastSwing?.swing?.feedback.filter((f) => f.severity !== 'good').map((f) => f.key) ?? [];
      setPlan(buildPlan(space, today, focus, unit));
    }
  }, [space, plan, today, editing, accepted, sessions, setPlan]);

  const header = (
    <PageHeader
      icon={<FlaskConical className="w-5 h-5" />}
      title="HomeLAB"
      subtitle={t('hl.subtitle')}
      right={space && !editing ? <button onClick={() => { setQuickDismissed(false); setEditing(true); }} aria-label={t('hl.editSpace')} className="w-10 h-10 rounded-xl hover:bg-muted flex items-center justify-center"><Settings2 className="w-5 h-5" /></button> : undefined}
    />
  );

  if (mode === 'cancha') {
    return (
      <div className="space-y-5">
        {header}
        <Card className="text-center space-y-3">
          <p className="text-sm text-muted-foreground">{t('hl.cancha.note')}</p>
          <Button onClick={() => setMode('casa')}>{t('hl.cancha.switch')}</Button>
        </Card>
      </div>
    );
  }

  // R13: sin aceptar el aviso de seguridad no hay medidas, plan ni sesión. Después queda accesible desde el plan.
  if (!accepted || showNotice) {
    return (
      <div className="space-y-5">
        {header}
        <SafetyNotice acceptedAt={accepted ? homelabNotice!.acceptedAt : null} onAccept={() => { acceptHomelabNotice(); setQuickDismissed(true); setShowNotice(false); }} onClose={() => setShowNotice(false)} />
      </div>
    );
  }

  if (editing || !space) {
    return (
      <div className="space-y-5">
        {header}
        <ScanFlow current={space} onSave={(s, info) => { setSpace(s, info); setEditing(false); setQuickDismissed(false); }} onCancel={space ? () => { setEditing(false); setQuickDismissed(false); } : undefined} />
        {quickNoticeVisible({ analyzingSpace: true, accepted, quickDismissed, fullOpen: showNotice }) && <QuickNotice onClose={() => setQuickDismissed(true)} onFull={() => { setQuickDismissed(true); setShowNotice(true); }} />}
      </div>
    );
  }

  const zs = zones(space, unit);
  const doneToday = sessions.some((s) => s.type === 'homelab' && s.date === today);
  const drills = plan?.drills ?? [];
  const completed = drills.filter((d) => d.done).length;
  const allDone = drills.length > 0 && completed === drills.length;

  const toggle = (id: string) => {
    const p = useStore.getState().plan; // estado actual, no el de este render
    if (!p) return;
    setPlan({ ...p, drills: p.drills.map((d) => (d.id === id ? { ...d, done: !d.done } : d)) });
  };
  const finish = () => {
    if (!plan) return;
    addSession({ type: 'homelab', mode: 'casa', minutes: plan.minutes, planTheme: plan.theme });
  };

  return (
    <div className="space-y-5">
      {header}
      <div className="grid sm:grid-cols-3 gap-2">
        {zs.map((z) => (
          <div key={z.type} className={`rounded-xl border p-3 ${z.ok ? 'border-primary/30 bg-primary/5' : 'border-border bg-muted/60'}`}>
            <p className="text-sm font-semibold flex items-center gap-1">
              {z.ok ? <CheckCircle2 className="w-4 h-4 text-primary" /> : <XCircle className="w-4 h-4 text-muted-foreground" />} {z.label}
            </p>
            <p className="text-[11px] text-muted-foreground mt-1 leading-snug">{z.note}</p>
          </div>
        ))}
      </div>

      {scan && (scan.setup.length > 0 || scan.safety.length > 0) && (
        <Card className="space-y-3">
          <div className="flex items-center gap-2">
            <ScanLine className="w-5 h-5 text-primary" />
            <h2 className="font-heading text-lg font-semibold">{t('hl.howSetup')}</h2>
          </div>
          {scan.summary && <p className="text-sm text-muted-foreground">{scan.summary}</p>}
          <ol className="space-y-2">
            {scan.setup.map((s, i) => (
              <li key={i} className="flex gap-2 text-sm">
                <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>{s}
              </li>
            ))}
          </ol>
          {scan.safety.length > 0 && (
            <div className="rounded-xl bg-destructive/10 text-destructive px-3 py-2.5 text-sm space-y-1">
              {scan.safety.map((s, i) => <p key={i} className="flex gap-2"><ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />{s}</p>)}
            </div>
          )}
          <p className="text-xs text-muted-foreground">{t('hl.scanMeasures', { l: fmtDist(space.lengthM, unit), w: fmtDist(space.widthM, unit), c: fmtDist(space.ceilingM, unit) })}</p>
        </Card>
      )}

      {plan && (
        <>
          <Card className="bg-gradient-to-br from-primary/10 to-accent/10">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{t('hl.todaySession', { n: plan.minutes })}</p>
            <h2 className="font-heading text-2xl font-bold">{plan.themeKey ? t(`theme.${plan.themeKey}`) : plan.theme}</h2>
            <p className="text-sm text-muted-foreground mt-1">{planNote(space, unit)}</p>
            <div className="h-2 bg-card rounded-full mt-4 overflow-hidden"><div className="h-full bg-primary transition-all" style={{ width: `${(completed / Math.max(1, drills.length)) * 100}%` }} /></div>
            <p className="text-xs text-muted-foreground mt-1">{t('hl.drillsDone', { done: completed, total: drills.length })}</p>
          </Card>

          <div className="space-y-2">
            {drills.map((d, i) => <DrillCard key={d.id} n={i + 1} d={d} onToggle={() => toggle(d.id)} />)}
          </div>

          <button onClick={() => setShowNotice(true)} className="text-xs text-muted-foreground underline">{t('hl.seeNotice')}</button>
          {doneToday ? (
            <Notice tone="ok">{t('hl.sessionDone')}</Notice>
          ) : (
            <Button full onClick={finish} disabled={!allDone}>{allDone ? t('hl.complete') : t('hl.markAll')}</Button>
          )}
        </>
      )}
    </div>
  );
}

function QuickNotice({ onClose, onFull }: { onClose: () => void; onFull: () => void }) {
  useT();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[60] bg-black/50 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={t('notice.quick.title')} onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-2xl bg-card p-5 space-y-3 shadow-xl">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 text-destructive shrink-0" />
          <h2 className="font-heading text-lg font-semibold">{t('notice.quick.title')}</h2>
        </div>
        <ul className="text-sm space-y-1 list-disc pl-5">{HOMELAB_QUICK_ITEMS.map((_, i) => <li key={i}>{t(`notice.quick.item.${i}`)}</li>)}</ul>
        <Button full autoFocus onClick={onClose}>{t('tips.gotIt')}</Button>
        <button onClick={onFull} className="block mx-auto text-xs text-muted-foreground underline">{t('hl.seeFull')}</button>
      </div>
    </div>
  );
}

function SafetyNotice({ acceptedAt, onAccept, onClose }: { acceptedAt: string | null; onAccept: () => void; onClose: () => void }) {
  useT();
  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-2">
        <ShieldAlert className="w-5 h-5 text-destructive" />
        <h2 className="font-heading text-lg font-semibold">{t('notice.title')}</h2>
      </div>
      <ul className="space-y-2 text-sm list-disc pl-5">{HOMELAB_NOTICE_ITEMS.map((_, i) => <li key={i}>{t(`notice.item.${i}`)}</li>)}</ul>
      {acceptedAt ? (
        <>
          <p className="text-xs text-muted-foreground">{t('hl.acceptedOn', { date: fmtDate(new Date(acceptedAt), { year: 'numeric', month: 'numeric', day: 'numeric' }) })}</p>
          <Button full variant="outline" onClick={onClose}>{t('hl.close')}</Button>
        </>
      ) : (
        <Button full onClick={onAccept}>{t('hl.accept')}</Button>
      )}
    </Card>
  );
}

function DrillCard({ n, d, onToggle }: { n: number; d: PlanDrill; onToggle: () => void }) {
  useT();
  const total = d.minutes * 60;
  const [left, setLeft] = useState(total);
  const [running, setRunning] = useState(false);
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setLeft((l) => { if (l <= 1) { setRunning(false); return 0; } return l - 1; }), 1000);
    return () => clearInterval(timer);
  }, [running]);
  const mm = String(Math.floor(left / 60)).padStart(2, '0'), ss = String(left % 60).padStart(2, '0');
  return (
    <Card className={`!p-4 space-y-2 ${d.done ? 'opacity-70' : ''}`}>
      <div className="flex items-start gap-3">
        <button onClick={onToggle} aria-label={d.done ? t('hl.uncheck') : t('hl.check')} className="mt-0.5 shrink-0">
          {d.done ? <CheckCircle2 className="w-6 h-6 text-primary" /> : <Circle className="w-6 h-6 text-muted-foreground" />}
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{n}. {t(`drill.kind.${d.kind}`)} · {t('home.minutes', { n: d.minutes })}</p>
          <h3 className={`font-semibold ${d.done ? 'line-through' : ''}`}>{td(`drill.${d.id}.name`)}</h3>
          <p className="text-sm text-muted-foreground mt-1">{td(`drill.${d.id}.desc`)}</p>
          <p className="text-sm mt-2"><span className="font-semibold">{t('hl.goal')}</span> {td(`drill.${d.id}.target`)}</p>
          <p className="text-sm text-primary"><span className="font-semibold">{t('hl.cue')}</span> {td(`drill.${d.id}.cue`)}</p>
        </div>
      </div>
      {!d.done && (
        <div className="flex items-center gap-2 pl-9">
          <button onClick={() => { if (left === 0) setLeft(total); setRunning((r) => !r); }} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-muted text-sm font-medium">
            {running ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />} {mm}:{ss}
          </button>
          {left === 0 && <span className="text-xs text-primary font-medium">{t('hl.timeUp')}</span>}
        </div>
      )}
    </Card>
  );
}

function SpaceForm({ initial, onSave, onCancel }: { initial: Space; onSave: (s: Space) => void; onCancel?: () => void }) {
  useT();
  const [s, setS] = useState<Space>(initial);
  const unit = useUnit();
  // Se escribe en la unidad elegida (D2) y se guarda en metros.
  const [txt, setTxt] = useState<Record<string, string>>(() => ({ lengthM: inputValue(initial.lengthM, unit), widthM: inputValue(initial.widthM, unit), ceilingM: inputValue(initial.ceilingM, unit) }));
  const num = (k: 'lengthM' | 'widthM' | 'ceilingM', label: string) => (
    <label className="block">
      <span className="text-xs text-muted-foreground">{label} ({UNIT_SHORT[unit]})</span>
      <input type="number" inputMode="decimal" step="0.1" min="0.5" value={txt[k]} onChange={(e) => { setTxt({ ...txt, [k]: e.target.value }); setS({ ...s, [k]: parseToMeters(e.target.value, unit) ?? 0 }); }} className="mt-1 w-full h-11 rounded-xl border border-border bg-card px-3" />
    </label>
  );
  const toggleGear = (g: Gear) => setS({ ...s, gear: s.gear.includes(g) ? s.gear.filter((x) => x !== g) : [...s.gear, g] });
  const valid = s.lengthM > 0 && s.widthM > 0 && s.ceilingM > 0;
  return (
    <Card className="space-y-5">
      <div>
        <h2 className="font-heading text-lg font-semibold">{t('hl.form.title')}</h2>
        <p className="text-sm text-muted-foreground">{t('hl.form.lead')}</p>
      </div>
      <div className="grid grid-cols-3 gap-3">{num('lengthM', t('hl.form.length'))}{num('widthM', t('hl.form.width'))}{num('ceilingM', t('hl.form.ceiling'))}</div>
      <div>
        <p className="text-xs text-muted-foreground mb-1.5">{t('hl.form.floor')}</p>
        <div className="grid grid-cols-3 gap-2">
          {FLOORS.map((f) => (
            <button key={f} onClick={() => setS({ ...s, floor: f })} className={`h-11 rounded-xl border text-sm font-medium ${s.floor === f ? 'border-primary bg-primary/10 text-primary' : 'border-border'}`}>{t(`floor.${f}`)}</button>
          ))}
        </div>
      </div>
      <div>
        <p className="text-xs text-muted-foreground mb-1.5">{t('hl.form.gear')}</p>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(GEAR_LABEL) as Gear[]).map((g) => (
            <button key={g} onClick={() => toggleGear(g)} aria-pressed={s.gear.includes(g)} className={`h-10 px-3 rounded-full border text-sm ${s.gear.includes(g) ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card'}`}>{td(`gear.${g}`)}</button>
          ))}
        </div>
      </div>
      <div className="flex gap-2">
        {onCancel && <Button variant="outline" onClick={onCancel}>{t('perfil.cancel')}</Button>}
        <Button full disabled={!valid} onClick={() => onSave(s)}>{t('hl.form.save')}</Button>
      </div>
    </Card>
  );
}

/* ───────────────────────── Escaneo con foto o video ───────────────────────── */

function ScanFlow({ current, onSave, onCancel }: { current: Space | null; onSave: (s: Space, info: ScanInfo | null) => void; onCancel?: () => void }) {
  useT();
  const unit = useUnit();
  const [stage, setStage] = useState<'pick' | 'busy' | 'review' | 'manual'>('pick');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<ScanError | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [gear, setGear] = useState<Gear[]>([]);
  const [manualInit, setManualInit] = useState<Space>(current ?? DEFAULT);

  const run = async (file?: File) => {
    if (!file) return;
    setError(null); setStage('busy');
    try {
      const r = await scanSpace(await fileToImages(file), notes);
      setResult(r);
      setGear([...new Set([...(current?.gear ?? []), ...r.gear])]);
      setStage('review');
    } catch (e) {
      setError(e instanceof ScanError ? e : new ScanError(e instanceof Error ? e.message : t('hl.scan.fileError')));
      setStage('pick');
    }
  };

  if (stage === 'manual') {
    return <SpaceForm initial={manualInit} onSave={(s) => onSave(s, result ? scanInfo(result) : null)} onCancel={() => setStage(result ? 'review' : 'pick')} />;
  }

  if (stage === 'busy') {
    return (
      <Card className="text-center space-y-3 py-10">
        <Loader2 className="w-10 h-10 mx-auto animate-spin text-primary" />
        <p className="font-heading text-lg font-semibold">{t('hl.scan.busy')}</p>
        <p className="text-sm text-muted-foreground">{t('hl.scan.busyNote')}</p>
      </Card>
    );
  }

  if (stage === 'review' && result) {
    const sp = scanToSpace({ ...result, gear });
    const toggle = (g: Gear) => setGear((p) => (p.includes(g) ? p.filter((x) => x !== g) : [...p, g]));
    if (!result.usable) {
      return (
        <Card className="space-y-4">
          <Notice tone="error">{result.summary || t('hl.scan.unusable')}</Notice>
          <Button full onClick={() => { setResult(null); setStage('pick'); }}>{t('hl.scan.retake')}</Button>
        </Card>
      );
    }
    return (
      <Card className="space-y-5">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{t('hl.scan.saw')}</p>
          <p className="mt-1">{result.summary}</p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          {[[t('hl.form.length'), sp.lengthM], [t('hl.form.width'), sp.widthM], [t('hl.form.ceiling'), sp.ceilingM]].map(([l, v]) => (
            <div key={l} className="rounded-xl bg-muted p-3"><p className="text-[11px] uppercase text-muted-foreground">{l}</p><p className="text-xl font-bold">{inputValue(v as number, unit)}<span className="text-xs font-normal text-muted-foreground"> {UNIT_SHORT[unit]}</span></p></div>
          ))}
        </div>
        <p className={`text-xs ${result.confidence === 'baja' ? 'text-destructive' : 'text-muted-foreground'}`}>
          {t('hl.scan.confLine', { conf: t(`hl.conf.${result.confidence}`), floor: t(`floor.${sp.floor}`).toLowerCase() })}
        </p>
        {result.observations.length > 0 && (
          <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1">{result.observations.map((o, i) => <li key={i}>{o}</li>)}</ul>
        )}
        <div>
          <p className="text-sm font-medium mb-1.5">{t('hl.scan.gearQ')}</p>
          <p className="text-xs text-muted-foreground mb-2">{t('hl.scan.gearNote')}</p>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(GEAR_LABEL) as Gear[]).map((g) => (
              <button key={g} onClick={() => toggle(g)} aria-pressed={gear.includes(g)} className={`h-10 px-3 rounded-full border text-sm ${gear.includes(g) ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card'}`}>{td(`gear.${g}`)}</button>
            ))}
          </div>
        </div>
        <Button full onClick={() => onSave(sp, scanInfo(result))}>{t('hl.scan.create')}</Button>
        <div className="flex gap-2">
          <Button full variant="outline" onClick={() => { setResult(null); setStage('pick'); }}>{t('hl.scan.retake')}</Button>
          <Button full variant="outline" onClick={() => { setManualInit(sp); setStage('manual'); }}>{t('hl.scan.fix')}</Button>
        </div>
      </Card>
    );
  }

  const tile = 'flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border py-7 cursor-pointer hover:bg-muted/50 text-center';
  return (
    <Card className="space-y-4">
      <div>
        <h2 className="font-heading text-lg font-semibold">{t('hl.scan.showTitle')}</h2>
        <p className="text-sm text-muted-foreground">{t('hl.scan.showLead')}</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className={tile}>
          <span className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center"><Camera className="w-5 h-5" /></span>
          <span className="font-medium text-sm">{t('hl.scan.photo')}</span>
          <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => run(e.target.files?.[0])} />
        </label>
        <label className={tile}>
          <span className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center"><Video className="w-5 h-5" /></span>
          <span className="font-medium text-sm">{t('hl.scan.video')}</span>
          <input type="file" accept="video/*" capture="environment" className="hidden" onChange={(e) => run(e.target.files?.[0])} />
        </label>
      </div>
      <p className="text-xs text-muted-foreground">{t('hl.scan.tip')}</p>
      <input value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} placeholder={t('hl.scan.notesPh')} className="w-full h-11 rounded-xl border border-border bg-card px-3 text-sm" />
      {error && (
        <Notice tone="error">
          {error.message}
          {error.code && <>{t('hl.scan.manualMeanwhile')}</>}
        </Notice>
      )}
      <div className="flex gap-2">
        {onCancel && <Button variant="outline" onClick={onCancel}>{t('perfil.cancel')}</Button>}
        <Button full variant="ghost" className="text-sm text-muted-foreground" onClick={() => setStage('manual')}>{t('hl.scan.manual')}</Button>
      </div>
    </Card>
  );
}
