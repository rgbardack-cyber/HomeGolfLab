import { ShieldCheck } from 'lucide-react';
import { useStore } from '@/store';
import { Button, Card, Notice } from '@/components/ui';
import { CONSENT_CHECKBOX_TEXT, CONSENT_DRAFT, CONSENT_NOTE, CONSENT_TITLE, currentConsent, deletionPending, sanitizeLog } from '@/lib/consent';

/** R9: casilla aparte, sin marcar de inicio, fuera de los términos. Solo se muestra con `flags.consentFlow`. */
export default function ConsentCard() {
  const rawLog = useStore((s) => s.consentLog);
  const userId = useStore((s) => s.consentUserId);
  const recordConsent = useStore((s) => s.recordConsent);
  const log = sanitizeLog(rawLog);
  const granted = currentConsent(log);
  const pending = deletionPending(log);
  const dateFmt = (iso: string) => new Date(iso).toLocaleString('es');

  return (
    <Card className="space-y-3">
      <h2 className="font-heading text-lg font-semibold flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-primary" />{CONSENT_TITLE}</h2>
      <p className="text-[11px] font-semibold text-destructive">{CONSENT_DRAFT}</p>
      <label className="flex gap-3 items-start text-sm">
        <input
          type="checkbox"
          className="mt-1 w-5 h-5 shrink-0"
          checked={granted}
          onChange={(e) => recordConsent(e.target.checked ? 'granted' : 'withdrawn')}
        />
        <span>{CONSENT_CHECKBOX_TEXT}</span>
      </label>
      <p className="text-xs text-muted-foreground">{CONSENT_NOTE}</p>
      {!granted && log.length > 0 && !pending && (
        <Button variant="outline" onClick={() => recordConsent('deletion_requested')}>Pedir que se borre lo guardado</Button>
      )}
      {pending && <Notice tone="ok">Pediste el borrado. Hoy no hay nada guardado fuera de tu dispositivo; queda anotado.</Notice>}
      {log.length > 0 && (
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer">Tu registro ({log.length})</summary>
          <p className="mt-1">Usuario anónimo en este dispositivo: {userId}</p>
          <ul className="mt-1 space-y-0.5">
            {log.map((e) => <li key={e.id}>{dateFmt(e.at)} · {e.action === 'granted' ? 'aceptaste' : e.action === 'withdrawn' ? 'retiraste' : 'pediste el borrado'} · texto v{e.version}</li>)}
          </ul>
        </details>
      )}
    </Card>
  );
}
