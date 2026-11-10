import { useState } from 'react';
import { Award, Lock } from 'lucide-react';
import { useStore, todayISO } from '@/store';
import { BADGES, computeStats, levelFor, totalXp, type BadgeKind } from '@/lib/badges';
import { Card, PageHeader, Segmented } from '@/components/ui';

type Filter = 'todas' | BadgeKind;

export default function Logros() {
  const { earned, sessions } = useStore();
  const [filter, setFilter] = useState<Filter>('todas');
  const ids = Object.keys(earned);
  const level = levelFor(totalXp(ids));
  const stats = computeStats(sessions, todayISO());
  const list = BADGES.filter((b) => filter === 'todas' || b.kind === filter);

  return (
    <div className="space-y-5">
      <PageHeader icon={<Award className="w-5 h-5" />} title="Logros" subtitle={`${ids.length} de ${BADGES.length} medallas`} />

      <Card className="bg-gradient-to-br from-primary to-[hsl(152_35%_40%)] text-primary-foreground border-0">
        <p className="text-xs opacity-80 uppercase tracking-wide">Nivel {level.level}</p>
        <h2 className="font-heading text-2xl font-bold">{level.label}</h2>
        <div className="h-2 bg-white/25 rounded-full mt-3 overflow-hidden"><div className="h-full bg-accent" style={{ width: `${level.progress}%` }} /></div>
        <p className="text-xs opacity-90 mt-1.5">{level.xp} XP{level.next ? ` · faltan ${level.next.minXp - level.xp} XP para ${level.next.label}` : ' · nivel máximo'}</p>
        <div className="grid grid-cols-3 gap-2 mt-4 text-center">
          <div className="bg-white/15 rounded-xl py-2"><p className="text-lg font-bold">{stats.streak}</p><p className="text-[11px] opacity-80">racha actual</p></div>
          <div className="bg-white/15 rounded-xl py-2"><p className="text-lg font-bold">{stats.bestStreak}</p><p className="text-[11px] opacity-80">mejor racha</p></div>
          <div className="bg-white/15 rounded-xl py-2"><p className="text-lg font-bold">{stats.bestScore || '—'}</p><p className="text-[11px] opacity-80">mejor swing</p></div>
        </div>
      </Card>

      <Segmented<Filter> value={filter} onChange={setFilter} options={[{ value: 'todas', label: 'Todas' }, { value: 'cumplimiento', label: 'Cumplimiento' }, { value: 'merito', label: 'Mérito' }]} />

      <div className="grid grid-cols-2 gap-3">
        {list.map((b) => {
          const date = earned[b.id];
          return (
            <div key={b.id} className={`rounded-2xl border p-4 ${date ? 'bg-card border-accent/50' : 'bg-muted/60 border-border'}`}>
              <div className="flex items-start justify-between">
                <span className={`text-3xl ${date ? '' : 'grayscale opacity-40'}`}>{b.emoji}</span>
                {date ? <span className="text-[11px] font-bold text-accent">+{b.xp} XP</span> : <Lock className="w-4 h-4 text-muted-foreground" />}
              </div>
              <p className={`font-semibold text-sm mt-2 ${date ? '' : 'text-muted-foreground'}`}>{b.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{b.description}</p>
              {date && <p className="text-[11px] text-primary mt-1.5">Ganada el {new Date(date + 'T12:00:00').toLocaleDateString('es', { day: 'numeric', month: 'short' })}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
