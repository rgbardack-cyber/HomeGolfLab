import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Crown, User } from 'lucide-react';
import { useStore } from '@/store';
import { Button, Card, Notice, PageHeader } from '@/components/ui';
import { anyMediaFlag, INTERNAL, useFlags } from '@/lib/flags';
import { clearAllMedia } from '@/lib/media/cleanup';
import { getMediaStore } from '@/lib/media/store';
import StorageCard from '@/components/StorageCard';
import PremiumTestSwitch from '@/components/PremiumTestSwitch';
import FlagsPanel from '@/components/FlagsPanel';
import ConsentCard from '@/components/ConsentCard';
import { asUnit, unitLabel, type DistUnit } from '@/lib/units';
import { LOCALES, setLocale, useT, type Key } from '@/i18n';

const PREMIUM: Key[] = ['perfil.prem1', 'perfil.prem2', 'perfil.prem3', 'perfil.prem4'];
const FREE_LIST: Key[] = ['perfil.free1', 'perfil.free2', 'perfil.free3', 'perfil.free4'];

export default function Perfil() {
  const { t, locale } = useT();
  const { profile, setProfile, reset, sessions } = useStore();
  const [confirm, setConfirm] = useState(false);
  const flags = useFlags();
  const [wipeError, setWipeError] = useState<string | null>(null);
  const input = 'mt-1 w-full h-11 rounded-xl border border-border bg-card px-3';

  return (
    <div className="space-y-5">
      <PageHeader icon={<User className="w-5 h-5" />} title={t('perfil.title')} subtitle={t('perfil.subtitle')} />

      <Card className="space-y-4">
        <label className="block"><span className="text-xs text-muted-foreground">{t('perfil.name')}</span>
          <input value={profile.name} onChange={(e) => setProfile({ name: e.target.value })} placeholder={t('perfil.namePlaceholder')} className={input} />
        </label>
        <label className="block"><span className="text-xs text-muted-foreground">{t('perfil.handicap')}</span>
          <input value={profile.handicap} onChange={(e) => setProfile({ handicap: e.target.value })} inputMode="decimal" placeholder="18.4" className={input} />
        </label>
        <div>
          <p className="text-xs text-muted-foreground mb-1.5">{t('perfil.playAs')}</p>
          <div className="grid grid-cols-2 gap-2">
            {[{ v: false, l: t('perfil.righty') }, { v: true, l: t('perfil.lefty') }].map((o) => (
              <button key={o.l} onClick={() => setProfile({ lefty: o.v })} className={`h-11 rounded-xl border text-sm font-medium ${profile.lefty === o.v ? 'border-primary bg-primary/10 text-primary' : 'border-border'}`}>{o.l}</button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1.5">{t('perfil.distancesIn')}</p>
          <div className="grid grid-cols-2 gap-2" role="group" aria-label={t('perfil.unitGroup')}>
            {(['yd', 'm'] as DistUnit[]).map((u) => (
              <button key={u} aria-pressed={asUnit(profile.unit) === u} onClick={() => setProfile({ unit: u })} className={`h-11 rounded-xl border text-sm font-medium capitalize ${asUnit(profile.unit) === u ? 'border-primary bg-primary/10 text-primary' : 'border-border'}`}>{unitLabel(u)}</button>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">{t('perfil.unitNote')}</p>
        </div>
      </Card>

      <Card className="space-y-2">
        <label className="block">
          <span className="text-xs text-muted-foreground">{t('lang.label')} · Language</span>
          <select value={locale} onChange={(e) => setLocale(e.target.value)} className={input} aria-label={t('lang.label')}>
            {LOCALES.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
          </select>
        </label>
        <p className="text-[11px] text-muted-foreground">{t('lang.note')}</p>
      </Card>

      <Card className={`space-y-4 ${profile.premium ? 'border-accent bg-accent/5' : ''}`}>
        <div className="flex items-center gap-3">
          <span className="w-11 h-11 rounded-xl bg-accent/20 flex items-center justify-center"><Crown className="w-5 h-5 text-accent" /></span>
          <div>
            <h2 className="font-heading text-lg font-semibold">{profile.premium ? t('perfil.premiumActive') : t('perfil.freePlan')}</h2>
            <p className="text-xs text-muted-foreground">{profile.premium ? t('perfil.haveAll') : t('perfil.pitch')}</p>
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-4 text-sm">
          <ul className="space-y-1.5"><li className="font-semibold text-muted-foreground">{t('perfil.free')}</li>{FREE_LIST.map((f) => <li key={f} className="flex gap-2"><Check className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />{t(f)}</li>)}</ul>
          <ul className="space-y-1.5"><li className="font-semibold text-primary">{t('perfil.premium')}</li>{PREMIUM.map((f) => <li key={f} className="flex gap-2"><Check className="w-4 h-4 text-primary shrink-0 mt-0.5" />{t(f)}</li>)}</ul>
        </div>
        {!profile.premium && <Link to="/premium" className="inline-flex w-full items-center justify-center h-11 px-5 rounded-xl bg-accent text-accent-foreground font-medium">{t('perfil.getPremium')}</Link>}
        {INTERNAL && <PremiumTestSwitch />}
      </Card>

      {anyMediaFlag(flags) && <StorageCard />}

      {flags.consentFlow && <ConsentCard />}

      {INTERNAL && <FlagsPanel />}

      <Card className="space-y-3">
        <h2 className="font-heading text-lg font-semibold">{t('perfil.dataTitle')}</h2>
        <p className="text-sm text-muted-foreground">{t('perfil.dataText', { n: sessions.length })}</p>
        {confirm ? (
          <div className="flex gap-2">
            <Button variant="outline" full onClick={() => setConfirm(false)}>{t('perfil.cancel')}</Button>
            <Button full className="!bg-destructive" onClick={async () => {
              // Primero los videos: si fallan, no se borra el resto (así no quedan videos huérfanos sin sesión que los muestre).
              try { await clearAllMedia(await getMediaStore()); } catch { setWipeError(t('perfil.wipeError')); return; }
              setWipeError(null); reset(); setConfirm(false);
            }}>{t('perfil.confirmWipe')}</Button>
          </div>
        ) : (
          <Button variant="outline" onClick={() => setConfirm(true)}>{t('perfil.wipe')}</Button>
        )}
        {wipeError && <Notice tone="error">{wipeError}</Notice>}
      </Card>
    </div>
  );
}
