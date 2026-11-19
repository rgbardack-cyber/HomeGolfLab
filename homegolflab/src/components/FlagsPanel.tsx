import { FlaskConical } from 'lucide-react';
import { clearFlagOverrides, FLAG_INFO, FLAG_NAMES, setFlagOverride, useFlags } from '@/lib/flags';
import { Button, Card, Notice } from '@/components/ui';

/** Panel de pruebas internas (solo con `INTERNAL`: desarrollo o VITE_INTERNAL=1). Ver lib/flags.ts. */
export default function FlagsPanel() {
  const flags = useFlags();
  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2">
        <FlaskConical className="w-5 h-5 text-accent" />
        <h2 className="font-heading text-lg font-semibold">Funciones de prueba</h2>
      </div>
      <Notice>Solo para pruebas internas. Estas funciones están en construcción y no son parte de la app publicada.</Notice>
      <ul className="space-y-2">
        {FLAG_NAMES.map((n) => (
          <li key={n} className="flex items-start gap-3">
            <button
              role="switch" aria-checked={flags[n]} aria-label={FLAG_INFO[n].label}
              onClick={() => setFlagOverride(n, !flags[n])}
              className={`mt-0.5 w-11 h-6 rounded-full shrink-0 relative transition-colors ${flags[n] ? 'bg-primary' : 'bg-muted-foreground/30'}`}
            >
              <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${flags[n] ? 'left-[22px]' : 'left-0.5'}`} />
            </button>
            <div className="min-w-0">
              <p className="text-sm font-medium">{FLAG_INFO[n].label}</p>
              <p className="text-xs text-muted-foreground">{FLAG_INFO[n].desc}</p>
            </div>
          </li>
        ))}
      </ul>
      <Button variant="outline" onClick={clearFlagOverrides}>Restablecer todas</Button>
    </Card>
  );
}
