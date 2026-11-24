import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Columns2 } from 'lucide-react';
import { useStore, type Session } from '@/store';
import { useFlags } from '@/lib/flags';
import CompareView, { type CompareSide } from '@/components/CompareView';
import { Card, Notice, PageHeader } from '@/components/ui';
import { fmtDate, t, useT } from '@/i18n';

const label = (s: Session) => `${fmtDate(new Date(s.at), { day: 'numeric', month: 'short' })}${s.club ? ` · ${s.club}` : ''}${s.swing?.view ? ` · ${s.swing.view === 'atras' ? t('comparar.viewBehind') : t('comparar.viewFront')}` : ''}`;

const side = (s: Session): CompareSide => ({ mediaId: s.mediaId!, poseTrackId: s.poseTrackId, r: s.swing!, manual: s.reviewMarks, club: s.club, label: label(s) });

/** Comparar dos swings guardados con video (F4, detrás de `flags.compare`). `/comparar?a=<id>&b=<id>` */
export default function Comparar() {
  useT();
  const flags = useFlags();
  const sessions = useStore((s) => s.sessions);
  const [params, setParams] = useSearchParams();
  const usable = useMemo(() => sessions.filter((s) => s.swing?.times && s.mediaId), [sessions]);
  const a = usable.find((s) => s.id === params.get('a')), b = usable.find((s) => s.id === params.get('b'));
  const set = (k: 'a' | 'b', v: string) => { const p = new URLSearchParams(params); if (v) p.set(k, v); else p.delete(k); setParams(p, { replace: true }); };

  if (!flags.compare) return <div className="space-y-4"><Notice>{t('comparar.unavailable')}</Notice><Link to="/swing" className="text-sm underline">{t('comparar.back')}</Link></div>;

  const select = (k: 'a' | 'b', value: string | null) => (
    <label className="block space-y-1">
      <span className="text-xs text-muted-foreground">{t('comparar.swing', { k: k.toUpperCase() })}{k === 'a' ? t('comparar.master') : ''}</span>
      <select className="w-full h-11 rounded-xl border border-border bg-card px-3 text-sm" value={value ?? ''} onChange={(e) => set(k, e.target.value)} aria-label={t('comparar.swing', { k: k.toUpperCase() })}>
        <option value="">{t('comparar.choose')}</option>
        {usable.map((s) => <option key={s.id} value={s.id}>{label(s)}</option>)}
      </select>
    </label>
  );

  return (
    <div className="space-y-4">
      <PageHeader icon={<Columns2 className="w-6 h-6" />} title={t('comparar.title')} subtitle={t('comparar.subtitle')} />
      {usable.length < 2 ? (
        <Notice>{t('comparar.needTwo')}</Notice>
      ) : (
        <Card className="space-y-3">
          {select('a', a?.id ?? null)}
          {select('b', b?.id ?? null)}
        </Card>
      )}
      {a && b && <CompareView key={`${a.id}:${b.id}`} a={side(a)} b={side(b)} />}
      <Link to="/swing" className="inline-flex items-center gap-1 text-sm underline"><ArrowLeft className="w-4 h-4" /> {t('comparar.back')}</Link>
    </div>
  );
}
