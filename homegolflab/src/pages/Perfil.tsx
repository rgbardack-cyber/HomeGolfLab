import { useState } from 'react';
import { Check, Crown, User } from 'lucide-react';
import { useStore } from '@/store';
import { Button, Card, Notice, PageHeader } from '@/components/ui';

const PREMIUM = ['Ball tracking sin anuncios ni pausas', 'Análisis de swing en vivo', 'Análisis de video ilimitados', 'Todo lo que se agregue a Premium más adelante'];
const FREE_LIST = ['1 análisis de video por día', 'HomeLAB completo', 'Ball tracking: 15 min y luego 2 anuncios para seguir', 'Medallas y niveles'];

export default function Perfil() {
  const { profile, setProfile, reset, sessions } = useStore();
  const [confirm, setConfirm] = useState(false);
  const input = 'mt-1 w-full h-11 rounded-xl border border-border bg-card px-3';

  return (
    <div className="space-y-5">
      <PageHeader icon={<User className="w-5 h-5" />} title="Perfil" subtitle="Tus datos y tu plan" />

      <Card className="space-y-4">
        <label className="block"><span className="text-xs text-muted-foreground">Nombre</span>
          <input value={profile.name} onChange={(e) => setProfile({ name: e.target.value })} placeholder="Tu nombre" className={input} />
        </label>
        <label className="block"><span className="text-xs text-muted-foreground">Handicap (opcional)</span>
          <input value={profile.handicap} onChange={(e) => setProfile({ handicap: e.target.value })} inputMode="decimal" placeholder="18.4" className={input} />
        </label>
        <div>
          <p className="text-xs text-muted-foreground mb-1.5">Juego como</p>
          <div className="grid grid-cols-2 gap-2">
            {[{ v: false, l: 'Diestro' }, { v: true, l: 'Zurdo' }].map((o) => (
              <button key={o.l} onClick={() => setProfile({ lefty: o.v })} className={`h-11 rounded-xl border text-sm font-medium ${profile.lefty === o.v ? 'border-primary bg-primary/10 text-primary' : 'border-border'}`}>{o.l}</button>
            ))}
          </div>
        </div>
      </Card>

      <Card className={`space-y-4 ${profile.premium ? 'border-accent bg-accent/5' : ''}`}>
        <div className="flex items-center gap-3">
          <span className="w-11 h-11 rounded-xl bg-accent/20 flex items-center justify-center"><Crown className="w-5 h-5 text-accent" /></span>
          <div>
            <h2 className="font-heading text-lg font-semibold">{profile.premium ? 'Premium activo' : 'Plan gratuito'}</h2>
            <p className="text-xs text-muted-foreground">{profile.premium ? 'Tienes acceso a todo.' : 'Pásate a Premium: sin anuncios y con análisis en vivo.'}</p>
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-4 text-sm">
          <ul className="space-y-1.5"><li className="font-semibold text-muted-foreground">Gratis</li>{FREE_LIST.map((f) => <li key={f} className="flex gap-2"><Check className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />{f}</li>)}</ul>
          <ul className="space-y-1.5"><li className="font-semibold text-primary">Premium</li>{PREMIUM.map((f) => <li key={f} className="flex gap-2"><Check className="w-4 h-4 text-primary shrink-0 mt-0.5" />{f}</li>)}</ul>
        </div>
        <Notice>
          Los pagos todavía no están conectados. Este interruptor es solo para probar la app: en la versión de tiendas se reemplaza por la compra dentro de App Store y Google Play.
        </Notice>
        <Button full variant={profile.premium ? 'outline' : 'gold'} onClick={() => setProfile({ premium: !profile.premium })}>
          {profile.premium ? 'Volver al plan gratuito (prueba)' : 'Activar Premium (modo prueba)'}
        </Button>
      </Card>

      <Card className="space-y-3">
        <h2 className="font-heading text-lg font-semibold">Datos</h2>
        <p className="text-sm text-muted-foreground">Tus {sessions.length} sesiones y medallas se guardan solo en este dispositivo. Todavía no hay cuentas ni copia en la nube.</p>
        {confirm ? (
          <div className="flex gap-2">
            <Button variant="outline" full onClick={() => setConfirm(false)}>Cancelar</Button>
            <Button full className="!bg-destructive" onClick={() => { reset(); setConfirm(false); }}>Sí, borrar todo</Button>
          </div>
        ) : (
          <Button variant="outline" onClick={() => setConfirm(true)}>Borrar todos mis datos</Button>
        )}
      </Card>
    </div>
  );
}
