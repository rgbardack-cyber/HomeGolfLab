import { useState } from 'react';
import { Award, Lock } from 'lucide-react';
import { useStore, todayISO } from '@/store';
import { BADGES, computeStats, levelFor, totalXp, type BadgeKind } from '@/lib/badges';
import { Card, PageHeader, Segmented } from '@/components/ui';
import { fmtDate, t, td, useT } from '@/i18n';

type Filter = 'todas' | BadgeKind;

export default function Logros() {
  useT();
  const { earned, sessions } = useStore();
  const [filter, setFilter] = useState<Filter>('todas');
  const ids = Object.keys(earned);
  const level = levelFor(totalXp(ids));
  const stats = computeStats(sessions, todayISO());
  const list = BADGES.filter((b) => filter === 'todas' || b.kind === filter);

  return (
    <div className="space-y-5">
      <PageHeader icon={<Award className="w-5 h-5" />} title={t('logros.title')} subtitle={t('logros.subtitle', { n: ids.length, total: BADGES.length })} />

      <Card className="bg-gradient-to-br from-primary to-[hsl(152_35%_40%)] text-primary-foreground border-0">
        <p className="text-xs opacity-80 uppercase tracking-wide">{t('logros.level', { n: level.level })}</p>
        <h2 className="font-heading text-2xl font-bold">{td(`level.${level.level}`)}</h2>
        <div className="h-2 bg-white/25 rounded-full mt-3 overflow-hidden"><div className="h-full bg-accent" style={{ width: `${level.progress}%` }} /></div>
        <p className="text-xs opacity-90 mt-1.5">{level.next ? t('logros.toNext', { xp: level.xp, need: level.next.minXp - level.xp, next: td(`level.${level.next.level}`) }) : t('logros.maxLevel', { xp: level.xp })}</p>
        <div className="grid grid-cols-3 gap-2 mt-4 text-center">
          <div className="bg-white/15 rounded-xl py-2"><p className="text-lg font-bold">{stats.streak}</p><p className="text-[11px] opacity-80">{t('logros.currentStreak')}</p></div>
          <div className="bg-white/15 rounded-xl py-2"><p className="text-lg font-bold">{stats.bestStreak}</p><p className="text-[11px] opacity-80">{t('logros.bestStreak')}</p></div>
          <div className="bg-white/15 rounded-xl py-2"><p className="text-lg font-bold">{stats.bestScore || '—'}</p><p className="text-[11px] opacity-80">{t('logros.bestSwing')}</p></div>
        </div>
      </Card>

      <Segmented<Filter> value={filter} onChange={setFilter} options={[{ value: 'todas', label: t('logros.filterAll') }, { value: 'cumplimiento', label: t('logros.filterCompliance') }, { value: 'merito', label: t('logros.filterMerit') }]} />

      <div className="grid grid-cols-2 gap-3">
        {list.map((b) => {
          const date = earned[b.id];
          return (
            <div key={b.id} className={`rounded-2xl border p-4 ${date ? 'bg-card border-accent/50' : 'bg-muted/60 border-border'}`}>
              <div className="flex items-start justify-between">
                <span className={`text-3xl ${date ? '' : 'grayscale opacity-40'}`}>{b.emoji}</span>
                {date ? <span className="text-[11px] font-bold text-accent">+{b.xp} XP</span> : <Lock className="w-4 h-4 text-muted-foreground" />}
              </div>
              <p className={`font-semibold text-sm mt-2 ${date ? '' : 'text-muted-foreground'}`}>{td(`badge.${b.id}.label`)}</p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{td(`badge.${b.id}.desc`)}</p>
              {date && <p className="text-[11px] text-primary mt-1.5">{t('logros.earnedOn', { date: fmtDate(new Date(date + 'T12:00:00'), { day: 'numeric', month: 'short' }) })}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
