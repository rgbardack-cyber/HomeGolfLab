import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Crown, Loader2, Megaphone, PlayCircle } from 'lucide-react';
import { AD_RULES, adsAvailable, nativeAds, PLACEHOLDER_SECONDS, showNativeRewarded } from '@/lib/ads';
import { Button, Card, Notice } from '@/components/ui';
import { t, useT } from '@/i18n';

/**
 * Bloqueo del ball tracking para usuarios gratuitos: tras 15 minutos de uso hay que ver
 * un anuncio con recompensa para abrir otros 15 minutos. `onUnlocked` se llama solo cuando
 * se vio completo (D1: sin prometer ninguna duración).
 */
export default function AdGate({ onUnlocked }: { onUnlocked: () => void }) {
  useT();
  const [seen, setSeen] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const total = AD_RULES.adsToUnlock;

  useEffect(() => { if (seen >= total) onUnlocked(); }, [seen, total, onUnlocked]);

  const watch = async () => {
    setError(null);
    if (!nativeAds()) {
      // Web de producción: no hay red de anuncios y el anuncio de prueba NO desbloquea nada (R3).
      if (!adsAvailable()) { setError(t('ads.onlyStores')); return; }
      setPlaying(true); return;
    }
    setLoading(true);
    try {
      if (await showNativeRewarded()) setSeen((s) => s + 1);
      else setError(t('ads.closedEarly'));
    } catch {
      setError(t('ads.unavailable'));
    } finally { setLoading(false); }
  };

  if (playing) return <PlaceholderAd n={seen + 1} total={total} onDone={() => { setPlaying(false); setSeen((s) => s + 1); }} />;

  return (
    <Card className="text-center space-y-4 border-accent/50">
      <div className="w-14 h-14 mx-auto rounded-full bg-accent/20 flex items-center justify-center"><Megaphone className="w-7 h-7 text-accent" /></div>
      <div>
        <h2 className="font-heading text-xl font-bold">{t('ads.over15')}</h2>
        <p className="text-sm text-muted-foreground mt-1">{t('ads.watchLead', { ads: total === 1 ? t('ads.one') : t('ads.many', { n: total }) })}</p>
      </div>
      <div className="flex justify-center gap-2" aria-label={t('ads.progress', { seen, total })}>
        {Array.from({ length: total }, (_, i) => <span key={i} className={`h-2 w-12 rounded-full ${i < seen ? 'bg-primary' : 'bg-muted'}`} />)}
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      <Button full onClick={watch} disabled={loading}>
        {loading ? <><Loader2 className="w-5 h-5 animate-spin" /> {t('ads.loading')}</> : <><PlayCircle className="w-5 h-5" /> {total === 1 ? t('ads.watchOne') : t('ads.watchN', { n: seen + 1, total })}</>}
      </Button>
      <Link to="/perfil" className="flex items-center justify-center gap-2 h-12 rounded-xl bg-accent text-accent-foreground font-medium">
        <Crown className="w-5 h-5" /> {t('ads.removePremium')}
      </Link>
    </Card>
  );
}

/** Espacio publicitario de prueba para el navegador: cuenta atrás que no se puede saltar. */
export function PlaceholderAd({ n, total, onDone }: { n: number; total: number; onDone: () => void }) {
  useT();
  const [left, setLeft] = useState<number>(PLACEHOLDER_SECONDS);
  useEffect(() => {
    if (left <= 0) { onDone(); return; }
    const t = setTimeout(() => setLeft((l) => l - 1), 1000);
    return () => clearTimeout(t);
  }, [left, onDone]);
  return (
    <div className="fixed inset-0 z-[60] bg-dark text-white flex flex-col items-center justify-center gap-4 p-8 text-center" role="dialog" aria-label={t('ads.dialog')}>
      <p className="text-xs uppercase tracking-widest opacity-60">{total > 1 ? t('ads.testN', { n, total }) : t('ads.test')}</p>
      <div className="w-full max-w-sm aspect-video rounded-2xl border border-white/20 bg-white/5 flex flex-col items-center justify-center gap-2">
        <Megaphone className="w-10 h-10 opacity-70" />
        <p className="font-heading text-xl font-bold">{t('ads.space')}</p>
        <p className="text-xs opacity-60 px-6">{t('ads.spaceNote')}</p>
      </div>
      <p className="text-sm opacity-80">{t('ads.contBefore')}<span className="font-bold tabular-nums">{left}</span>{t('ads.contAfter')}</p>
    </div>
  );
}
