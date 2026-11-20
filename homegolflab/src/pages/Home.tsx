import { Link } from 'react-router-dom';
import { Activity, ArrowRight, FlaskConical, Flame, Target, Trophy } from 'lucide-react';
import { useStore, todayISO, type Session } from '@/store';
import { computeStats, levelFor, totalXp } from '@/lib/badges';
import { Card } from '@/components/ui';

const TYPE_LABEL = { swing: 'Análisis de swing', homelab: 'HomeLAB', tracking: 'Ball tracking' } as const;
const TYPE_ICON = { swing: Activity, homelab: FlaskConical, tracking: Target } as const;

function sessionValue(s: Session) {
  if (s.type === 'swing' && s.score != null) return `${s.score}/100`;
  if (s.type === 'tracking') return s.flightOnly ? 'Seguimiento de un tiro (video)' : `${s.shots ?? 0} tiros`;
  if (s.type === 'homelab') return `${s.minutes ?? 0} min`;
  return '';
}

export default function Home() {
  const { mode, sessions, earned, profile } = useStore();
  const stats = computeStats(sessions, todayISO());
  const level = levelFor(totalXp(Object.keys(earned)));
  const fecha = new Date().toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' });

  const tools = [
    { to: '/swing', icon: Activity, title: 'Análisis de swing', text: mode === 'casa' ? 'Sube un video o analízalo en vivo frente a la cámara.' : 'Graba tu swing en el range y recibe correcciones.', show: true },
    { to: '/homelab', icon: FlaskConical, title: 'HomeLAB', text: 'Tu espacio y tu equipo convertidos en una sesión diaria.', show: mode === 'casa' },
    { to: '/tracking', icon: Target, title: 'Ball tracking', text: mode === 'casa' ? 'Mide dirección y velocidad de tus putts con la cámara.' : 'Registra tus tiros y revisa tu dispersión por palo.', show: true },
  ].filter((t) => t.show);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl p-6 text-primary-foreground bg-gradient-to-br from-primary to-[hsl(152_35%_40%)]">
        <p className="text-sm opacity-80 first-letter:uppercase">{fecha}</p>
        <h1 className="font-heading text-3xl font-bold mt-1">{profile.name ? `Hola, ${profile.name}` : 'HomeGolfLab'}</h1>
        <p className="opacity-90 mt-1">{mode === 'casa' ? 'Práctica en casa: tu laboratorio de golf.' : 'Práctica en cancha: lleva el laboratorio al range.'}</p>
        <div className="grid grid-cols-3 gap-2 mt-5">
          <div className="bg-white/15 rounded-xl p-3">
            <p className="text-[11px] opacity-80 flex items-center gap-1"><Flame className="w-3 h-3" /> Racha</p>
            <p className="text-xl font-bold">{stats.streak} <span className="text-xs font-normal">días</span></p>
          </div>
          <div className="bg-white/15 rounded-xl p-3">
            <p className="text-[11px] opacity-80">Sesiones</p>
            <p className="text-xl font-bold">{stats.total}</p>
          </div>
          <Link to="/logros" className="bg-white/15 rounded-xl p-3">
            <p className="text-[11px] opacity-80 flex items-center gap-1"><Trophy className="w-3 h-3" /> Nivel {level.level}</p>
            <p className="text-sm font-bold leading-7 truncate">{level.label}</p>
          </Link>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-heading text-xl font-bold">{mode === 'casa' ? 'Herramientas para casa' : 'Herramientas para la cancha'}</h2>
        {tools.map(({ to, icon: Icon, title, text }) => (
          <Link key={to} to={to} className="flex items-center gap-4 bg-card border border-border rounded-2xl p-4 hover:shadow-md transition">
            <span className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0"><Icon className="w-6 h-6" /></span>
            <span className="min-w-0 flex-1">
              <span className="block font-heading font-semibold text-lg">{title}</span>
              <span className="block text-sm text-muted-foreground">{text}</span>
            </span>
            <ArrowRight className="w-5 h-5 text-muted-foreground shrink-0" />
          </Link>
        ))}
        {mode === 'cancha' && <p className="text-xs text-muted-foreground px-1">HomeLAB es solo para casa. Cambia a “Casa” arriba para verlo.</p>}
      </section>

      <section className="space-y-3">
        <h2 className="font-heading text-xl font-bold">Sesiones recientes</h2>
        {sessions.length === 0 ? (
          <Card className="text-center text-sm text-muted-foreground">Aún no tienes sesiones. Empieza con cualquiera de las herramientas.</Card>
        ) : (
          sessions.slice(0, 6).map((s) => {
            const Icon = TYPE_ICON[s.type];
            const row = 'flex items-center gap-3 bg-card border border-border rounded-2xl p-4';
            const body = (
              <>
                <span className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center shrink-0"><Icon className="w-5 h-5 text-primary" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-sm">{TYPE_LABEL[s.type]}{s.live ? ' · en vivo' : ''}</span>
                  <span className="block text-xs text-muted-foreground">{new Date(s.at).toLocaleDateString('es', { day: 'numeric', month: 'short' })} · {s.mode === 'casa' ? 'Casa' : 'Cancha'}</span>
                </span>
                <span className="font-heading font-bold text-primary">{sessionValue(s)}</span>
              </>
            );
            // Un swing guardado se puede volver a abrir para ver su análisis.
            return s.swing
              ? <Link key={s.id} to={`/swing?ver=${s.id}`} className={`${row} hover:shadow-md transition`}>{body}</Link>
              : <div key={s.id} className={row}>{body}</div>;
          })
        )}
      </section>
    </div>
  );
}
