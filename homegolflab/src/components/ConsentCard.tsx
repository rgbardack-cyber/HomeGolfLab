import { ShieldCheck } from 'lucide-react';
import { useStore } from '@/store';
import { Button, Card, Notice } from '@/components/ui';
import { currentConsent, deletionPending, sanitizeLog } from '@/lib/consent';
import { bcp47, t } from '@/i18n';

/** R9: casilla aparte, sin marcar de inicio, fuera de los términos. Solo se muestra con `flags.consentFlow`. */
export default function ConsentCard() {
  const rawLog = useStore((s) => s.consentLog);
  const userId = useStore((s) => s.consentUserId);
  const recordConsent = useStore((s) => s.recordConsent);
  const log = sanitizeLog(rawLog);
  const granted = currentConsent(log);
  const pending = deletionPending(log);
  const dateFmt = (iso: string) => new Date(iso).toLocaleString(bcp47());

  return (
    <Card className="space-y-3">
      <h2 className="font-heading text-lg font-semibold flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-primary" />{t('consent.title')}</h2>
      <p className="text-[11px] font-semibold text-destructive">{t('consent.draft')}</p>
      <label className="flex gap-3 items-start text-sm">
        <input
          type="checkbox"
          className="mt-1 w-5 h-5 shrink-0"
          checked={granted}
          onChange={(e) => recordConsent(e.target.checked ? 'granted' : 'withdrawn')}
        />
        <span>{t('consent.checkbox')}</span>
      </label>
      <p className="text-xs text-muted-foreground">{t('consent.note')}</p>
      {!granted && log.length > 0 && !pending && (
        <Button variant="outline" onClick={() => recordConsent('deletion_requested')}>{t('cc.001')}</Button>
      )}
      {pending && <Notice tone="ok">{t('cc2.pending')}</Notice>}
      {log.length > 0 && (
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer">Tu registro ({log.length})</summary>
          <p className="mt-1">{t('cc2.anon', { id: userId ?? '' })}</p>
          <ul className="mt-1 space-y-0.5">
            {log.map((e) => <li key={e.id}>{dateFmt(e.at)} · {e.action === 'granted' ? t('cc2.granted') : e.action === 'withdrawn' ? t('cc2.withdrawn') : t('cc2.deletion')} · {t('cc2.textVersion', { v: e.version })}</li>)}
          </ul>
        </details>
      )}
    </Card>
  );
}
