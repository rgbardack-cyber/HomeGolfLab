import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Crown, Loader2, Megaphone, PlayCircle } from 'lucide-react';
import { AD_RULES, nativeAds, showNativeRewarded } from '@/lib/ads';
import { Button, Card, Notice } from '@/components/ui';

/**
 * Bloqueo del ball tracking para usuarios gratuitos: tras 15 minutos de uso hay que ver
 * 2 anuncios de 30 segundos para abrir otros 15 minutos. `onUnlocked` se llama solo cuando
 * se vieron todos completos.
 */
export default function AdGate({ onUnlocked }: { onUnlocked: () => void }) {
  const [seen, setSeen] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const total = AD_RULES.adsToUnlock;

  useEffect(() => { if (seen >= total) onUnlocked(); }, [seen, total, onUnlocked]);

  const watch = async () => {
    setError(null);
    if (!nativeAds()) { setPlaying(true); return; }
    setLoading(true);
    try {
      if (await showNativeRewarded()) setSeen((s) => s + 1);
      else setError('Cerraste el anuncio antes de terminar. Tienes que verlo completo.');
    } catch {
      setError('No hay anuncios disponibles en este momento. Inténtalo de nuevo en un minuto.');
    } finally { setLoading(false); }
  };

  if (playing) return <PlaceholderAd n={seen + 1} total={total} onDone={() => { setPlaying(false); setSeen((s) => s + 1); }} />;

  return (
    <Card className="text-center space-y-4 border-accent/50">
      <div className="w-14 h-14 mx-auto rounded-full bg-accent/20 flex items-center justify-center"><Megaphone className="w-7 h-7 text-accent" /></div>
      <div>
        <h2 className="font-heading text-xl font-bold">Se acabaron tus 15 minutos</h2>
        <p className="text-sm text-muted-foreground mt-1">Mira {total} anuncios de {AD_RULES.adSeconds} segundos y sigue practicando otros 15 minutos gratis. Tus tiros de esta sesión no se pierden.</p>
      </div>
      <div className="flex justify-center gap-2" aria-label={`${seen} de ${total} anuncios vistos`}>
        {Array.from({ length: total }, (_, i) => <span key={i} className={`h-2 w-12 rounded-full ${i < seen ? 'bg-primary' : 'bg-muted'}`} />)}
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      <Button full onClick={watch} disabled={loading}>
        {loading ? <><Loader2 className="w-5 h-5 animate-spin" /> Cargando anuncio…</> : <><PlayCircle className="w-5 h-5" /> Ver anuncio {seen + 1} de {total}</>}
      </Button>
      <Link to="/perfil" className="flex items-center justify-center gap-2 h-12 rounded-xl bg-accent text-accent-foreground font-medium">
        <Crown className="w-5 h-5" /> Quitar anuncios con Premium
      </Link>
    </Card>
  );
}

/** Espacio publicitario de prueba para el navegador: cuenta atrás que no se puede saltar. */
function PlaceholderAd({ n, total, onDone }: { n: number; total: number; onDone: () => void }) {
  const [left, setLeft] = useState<number>(AD_RULES.adSeconds);
  useEffect(() => {
    if (left <= 0) { onDone(); return; }
    const t = setTimeout(() => setLeft((l) => l - 1), 1000);
    return () => clearTimeout(t);
  }, [left, onDone]);
  return (
    <div className="fixed inset-0 z-[60] bg-dark text-white flex flex-col items-center justify-center gap-4 p-8 text-center" role="dialog" aria-label="Anuncio">
      <p className="text-xs uppercase tracking-widest opacity-60">Anuncio {n} de {total}</p>
      <div className="w-full max-w-sm aspect-video rounded-2xl border border-white/20 bg-white/5 flex flex-col items-center justify-center gap-2">
        <Megaphone className="w-10 h-10 opacity-70" />
        <p className="font-heading text-xl font-bold">Espacio publicitario</p>
        <p className="text-xs opacity-60 px-6">Aquí se mostrará un anuncio real en la app de las tiendas.</p>
      </div>
      <p className="text-sm opacity-80">Podrás continuar en <span className="font-bold tabular-nums">{left}</span> s</p>
    </div>
  );
}
