import { useEffect, useState } from 'react';
import { CheckCircle2, Circle, FlaskConical, Pause, Play, Settings2, XCircle } from 'lucide-react';
import { useStore, todayISO } from '@/store';
import { buildPlan, GEAR_LABEL, zones, type Floor, type Gear, type PlanDrill, type Space } from '@/lib/homelab';
import { Button, Card, Notice, PageHeader } from '@/components/ui';

const DEFAULT: Space = { lengthM: 4, widthM: 3, ceilingM: 2.5, floor: 'alfombra', gear: ['putter'] };
const FLOORS: { value: Floor; label: string }[] = [{ value: 'alfombra', label: 'Alfombra' }, { value: 'cesped', label: 'Césped' }, { value: 'duro', label: 'Piso duro' }];

export default function HomeLab() {
  const { mode, space, plan, sessions, setSpace, setPlan, addSession, setMode } = useStore();
  const [editing, setEditing] = useState(!space);
  const today = todayISO();

  // Plan del día: se genera una vez por fecha y se conserva el avance.
  useEffect(() => {
    if (!space || editing) return;
    if (!plan || plan.date !== today) {
      const lastSwing = sessions.find((s) => s.type === 'swing' && s.swing);
      const focus = lastSwing?.swing?.feedback.filter((f) => f.severity !== 'good').map((f) => f.key) ?? [];
      setPlan(buildPlan(space, today, focus));
    }
  }, [space, plan, today, editing, sessions, setPlan]);

  const header = (
    <PageHeader
      icon={<FlaskConical className="w-5 h-5" />}
      title="HomeLAB"
      subtitle="Tu laboratorio de práctica en casa"
      right={space && !editing ? <button onClick={() => setEditing(true)} aria-label="Editar espacio" className="w-10 h-10 rounded-xl hover:bg-muted flex items-center justify-center"><Settings2 className="w-5 h-5" /></button> : undefined}
    />
  );

  if (mode === 'cancha') {
    return (
      <div className="space-y-5">
        {header}
        <Card className="text-center space-y-3">
          <p className="text-sm text-muted-foreground">HomeLAB arma tu práctica con el espacio y el equipo que tienes en casa. Estás en modo Cancha.</p>
          <Button onClick={() => setMode('casa')}>Cambiar a Casa</Button>
        </Card>
      </div>
    );
  }

  if (editing || !space) {
    return <div className="space-y-5">{header}<SpaceForm initial={space ?? DEFAULT} onSave={(s) => { setSpace(s); setEditing(false); }} onCancel={space ? () => setEditing(false) : undefined} /></div>;
  }

  const zs = zones(space);
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

      {plan && (
        <>
          <Card className="bg-gradient-to-br from-primary/10 to-accent/10">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Sesión de hoy · {plan.minutes} min</p>
            <h2 className="font-heading text-2xl font-bold">{plan.theme}</h2>
            <p className="text-sm text-muted-foreground mt-1">{plan.note}</p>
            <div className="h-2 bg-card rounded-full mt-4 overflow-hidden"><div className="h-full bg-primary transition-all" style={{ width: `${(completed / Math.max(1, drills.length)) * 100}%` }} /></div>
            <p className="text-xs text-muted-foreground mt-1">{completed} de {drills.length} ejercicios</p>
          </Card>

          <div className="space-y-2">
            {drills.map((d, i) => <DrillCard key={d.id} n={i + 1} d={d} onToggle={() => toggle(d.id)} />)}
          </div>

          {doneToday ? (
            <Notice tone="ok">¡Sesión de hoy completada! Mañana tendrás un plan nuevo.</Notice>
          ) : (
            <Button full onClick={finish} disabled={!allDone}>{allDone ? 'Completar sesión' : 'Marca todos los ejercicios para completar'}</Button>
          )}
        </>
      )}
    </div>
  );
}

function DrillCard({ n, d, onToggle }: { n: number; d: PlanDrill; onToggle: () => void }) {
  const total = d.minutes * 60;
  const [left, setLeft] = useState(total);
  const [running, setRunning] = useState(false);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setLeft((l) => { if (l <= 1) { setRunning(false); return 0; } return l - 1; }), 1000);
    return () => clearInterval(t);
  }, [running]);
  const mm = String(Math.floor(left / 60)).padStart(2, '0'), ss = String(left % 60).padStart(2, '0');
  return (
    <Card className={`!p-4 space-y-2 ${d.done ? 'opacity-70' : ''}`}>
      <div className="flex items-start gap-3">
        <button onClick={onToggle} aria-label={d.done ? 'Desmarcar' : 'Marcar hecho'} className="mt-0.5 shrink-0">
          {d.done ? <CheckCircle2 className="w-6 h-6 text-primary" /> : <Circle className="w-6 h-6 text-muted-foreground" />}
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{n}. {d.kind} · {d.minutes} min</p>
          <h3 className={`font-semibold ${d.done ? 'line-through' : ''}`}>{d.name}</h3>
          <p className="text-sm text-muted-foreground mt-1">{d.description}</p>
          <p className="text-sm mt-2"><span className="font-semibold">Meta:</span> {d.target}</p>
          <p className="text-sm text-primary"><span className="font-semibold">Clave:</span> {d.cue}</p>
        </div>
      </div>
      {!d.done && (
        <div className="flex items-center gap-2 pl-9">
          <button onClick={() => { if (left === 0) setLeft(total); setRunning((r) => !r); }} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-muted text-sm font-medium">
            {running ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />} {mm}:{ss}
          </button>
          {left === 0 && <span className="text-xs text-primary font-medium">¡Tiempo!</span>}
        </div>
      )}
    </Card>
  );
}

function SpaceForm({ initial, onSave, onCancel }: { initial: Space; onSave: (s: Space) => void; onCancel?: () => void }) {
  const [s, setS] = useState<Space>(initial);
  const num = (k: 'lengthM' | 'widthM' | 'ceilingM', label: string) => (
    <label className="block">
      <span className="text-xs text-muted-foreground">{label}</span>
      <input type="number" inputMode="decimal" step="0.1" min="0.5" value={s[k]} onChange={(e) => setS({ ...s, [k]: parseFloat(e.target.value) || 0 })} className="mt-1 w-full h-11 rounded-xl border border-border bg-card px-3" />
    </label>
  );
  const toggleGear = (g: Gear) => setS({ ...s, gear: s.gear.includes(g) ? s.gear.filter((x) => x !== g) : [...s.gear, g] });
  const valid = s.lengthM > 0 && s.widthM > 0 && s.ceilingM > 0;
  return (
    <Card className="space-y-5">
      <div>
        <h2 className="font-heading text-lg font-semibold">Tu espacio</h2>
        <p className="text-sm text-muted-foreground">Mide el área libre donde puedes practicar. Con esto se decide qué ejercicios son seguros y posibles.</p>
      </div>
      <div className="grid grid-cols-3 gap-3">{num('lengthM', 'Largo (m)')}{num('widthM', 'Ancho (m)')}{num('ceilingM', 'Techo (m)')}</div>
      <div>
        <p className="text-xs text-muted-foreground mb-1.5">Piso</p>
        <div className="grid grid-cols-3 gap-2">
          {FLOORS.map((f) => (
            <button key={f.value} onClick={() => setS({ ...s, floor: f.value })} className={`h-11 rounded-xl border text-sm font-medium ${s.floor === f.value ? 'border-primary bg-primary/10 text-primary' : 'border-border'}`}>{f.label}</button>
          ))}
        </div>
      </div>
      <div>
        <p className="text-xs text-muted-foreground mb-1.5">Equipo que tienes</p>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(GEAR_LABEL) as Gear[]).map((g) => (
            <button key={g} onClick={() => toggleGear(g)} aria-pressed={s.gear.includes(g)} className={`h-10 px-3 rounded-full border text-sm ${s.gear.includes(g) ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card'}`}>{GEAR_LABEL[g]}</button>
          ))}
        </div>
      </div>
      <div className="flex gap-2">
        {onCancel && <Button variant="outline" onClick={onCancel}>Cancelar</Button>}
        <Button full disabled={!valid} onClick={() => onSave(s)}>Guardar y crear mi plan</Button>
      </div>
    </Card>
  );
}
