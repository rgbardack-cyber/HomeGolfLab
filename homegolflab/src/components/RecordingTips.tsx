import { useEffect, useState } from 'react';
import { Info, Video } from 'lucide-react';
import { markTipsShown, RECORDING_TIPS, tipsPending, type TipsArea } from '@/lib/recordingTips';
import { Button } from '@/components/ui';

/**
 * Popup corto con los consejos de grabación de una sección. Sale la primera vez que se abre la sección desde que se abrió la app
 * (ver lib/recordingTips.ts). Se cierra con «Entendido», con Esc o tocando fuera.
 */
export default function RecordingTips({ area }: { area: TipsArea }) {
  // El inicializador no escribe nada: así es seguro con StrictMode. Se marca como visto solo al cerrar.
  const [open, setOpen] = useState(() => tipsPending(area));
  const close = () => { markTipsShown(area); setOpen(false); };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { markTipsShown(area); setOpen(false); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, area]);

  if (!open) return null;
  const t = RECORDING_TIPS[area];
  return (
    <div className="fixed inset-0 z-[60] bg-black/50 flex items-end sm:items-center justify-center p-4" onClick={close}>
      <div role="dialog" aria-modal="true" aria-label={t.title} onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-2xl bg-card p-5 space-y-3 shadow-xl">
        <div className="flex items-center gap-2">
          <Video className="w-5 h-5 text-primary shrink-0" />
          <h2 className="font-heading text-lg font-semibold">{t.title}</h2>
        </div>
        <ul className="text-sm space-y-1 list-disc pl-5">{t.items.map((i) => <li key={i}>{i}</li>)}</ul>
        <p className="text-xs text-muted-foreground flex gap-1.5"><Info className="w-4 h-4 shrink-0" />{t.note}</p>
        <Button full autoFocus onClick={close}>Entendido</Button>
      </div>
    </div>
  );
}
