import { Check, Crown } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button, Card, Notice, PageHeader } from '@/components/ui';
import { EARLY_ADOPTER_CAP, EARLY_ADOPTER_PRICE_USD, PURCHASES_ENABLED } from '@/lib/plans';
import { LOCALES, useT, type Key } from '@/i18n';

const INCLUDES: Key[] = ['perfil.prem1', 'perfil.prem2', 'perfil.prem3', 'perfil.prem4'];

/** Opciones de Premium con la oferta Early Adopter. Con `PURCHASES_ENABLED` apagado no cobra nada. */
export default function Premium() {
  const { t, locale } = useT();
  const bcp47 = LOCALES.find((l) => l.code === locale)?.bcp47 ?? 'en-US';
  const price = new Intl.NumberFormat(bcp47, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(EARLY_ADOPTER_PRICE_USD);
  return (
    <div className="space-y-5">
      <PageHeader icon={<Crown className="w-5 h-5" />} title={t('prem.title')} subtitle={t('prem.sub')} />
      <Card className="space-y-4 border-accent bg-accent/5">
        <p className="text-[11px] uppercase tracking-wide font-semibold text-accent">{t('prem.ea.badge')}</p>
        <div>
          <h2 className="font-heading text-xl font-bold">{t('prem.ea.name')}</h2>
          <p className="text-sm text-muted-foreground mt-1">{t('prem.ea.desc')}</p>
        </div>
        <p className="font-heading text-2xl font-bold">{t('prem.ea.price', { price })}</p>
        <div className="space-y-1.5 text-sm">
          <p className="font-semibold">{t('prem.includes')}</p>
          <ul className="space-y-1.5">{INCLUDES.map((f) => <li key={f} className="flex gap-2"><Check className="w-4 h-4 text-primary shrink-0 mt-0.5" />{t(f)}</li>)}</ul>
        </div>
        <Button full variant="gold" disabled={!PURCHASES_ENABLED}>{t('prem.cta.soon')}</Button>
        <p className="text-[11px] text-muted-foreground">{t('prem.ea.storeNote')}</p>
      </Card>
      {!PURCHASES_ENABLED && <Notice>{t('prem.note')}</Notice>}
      <Link to="/perfil" className="block text-center text-sm text-primary underline">{t('prem.back')}</Link>
    </div>
  );
}
