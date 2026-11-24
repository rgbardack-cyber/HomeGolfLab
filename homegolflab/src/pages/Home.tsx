import { Link } from 'react-router-dom';
import { Activity, ArrowRight, FlaskConical, Flame, Target, Trophy } from 'lucide-react';
import { useStore, todayISO, type Session } from '@/store';
import { computeStats, levelFor, totalXp } from '@/lib/badges';
import { Card } from '@/components/ui';
import { fmtDate, t, td, useT } from '@/i18n';

const TYPE_ICON = { swing: Activity, homelab: FlaskConical, tracking: Target } as const;

function sessionValue(s: Session) {
  if (s.type === 'swing' && s.score != null) return `${s.score}/100`;
  if (s.type === 'tracking') return s.flightOnly ? `${t('home.flightOnly')}${s.shapeManual ? ` · ${t('home.yourLabel', { shape: td(`shape.${s.shapeManual}`) })}` : ''}` : t('home.shots', { n: s.shots ?? 0 });
  if (s.type === 'homelab') return t('home.minutes', { n: s.minutes ?? 0 });
  return '';
}

export default function Home() {
  useT();
  const { mode, sessions, earned, profile } = useStore();
  const stats = computeStats(sessions, todayISO());
  const level = levelFor(totalXp(Object.keys(earned)));
  const fecha = fmtDate(new Date(), { weekday: 'long', day: 'numeric', month: 'long' });

  const tools = [
    { to: '/swing', icon: Activity, title: t('home.type.swing'), text: mode === 'casa' ? t('home.swingTextCasa') : t('home.swingTextCancha'), show: true },
    { to: '/homelab', icon: FlaskConical, title: t('home.type.homelab'), text: t('home.homelabText'), show: mode === 'casa' },
    { to: '/tracking', icon: Target, title: t('home.type.tracking'), text: mode === 'casa' ? t('home.trackingTextCasa') : t('home.trackingTextCancha'), show: true },
  ].filter((t) => t.show);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl p-6 text-primary-foreground bg-gradient-to-br from-primary to-[hsl(152_35%_40%)]">
        <p className="text-sm opacity-80 first-letter:uppercase">{fecha}</p>
        <h1 className="font-heading text-3xl font-bold mt-1">{profile.name ? t('home.hello', { name: profile.name }) : 'HomeGolf LAB'}</h1>
        <p className="opacity-90 mt-1">{mode === 'casa' ? t('home.subtitleCasa') : t('home.subtitleCancha')}</p>
        <div className="grid grid-cols-3 gap-2 mt-5">
          <div className="bg-white/15 rounded-xl p-3">
            <p className="text-[11px] opacity-80 flex items-center gap-1"><Flame className="w-3 h-3" /> {t('home.streak')}</p>
            <p className="text-xl font-bold">{stats.streak} <span className="text-xs font-normal">{t('home.days')}</span></p>
          </div>
          <div className="bg-white/15 rounded-xl p-3">
            <p className="text-[11px] opacity-80">{t('home.sessions')}</p>
            <p className="text-xl font-bold">{stats.total}</p>
          </div>
          <Link to="/logros" className="bg-white/15 rounded-xl p-3">
            <p className="text-[11px] opacity-80 flex items-center gap-1"><Trophy className="w-3 h-3" /> {t('home.level', { n: level.level })}</p>
            <p className="text-sm font-bold leading-7 truncate">{td(`level.${level.level}`)}</p>
          </Link>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-heading text-xl font-bold">{mode === 'casa' ? t('home.toolsCasa') : t('home.toolsCancha')}</h2>
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
        {mode === 'cancha' && <p className="text-xs text-muted-foreground px-1">{t('home.homelabOnly')}</p>}
      </section>

      <section className="space-y-3">
        <h2 className="font-heading text-xl font-bold">{t('home.recent')}</h2>
        {sessions.length === 0 ? (
          <Card className="text-center text-sm text-muted-foreground">{t('home.noSessions')}</Card>
        ) : (
          sessions.slice(0, 6).map((s) => {
            const Icon = TYPE_ICON[s.type];
            const row = 'flex items-center gap-3 bg-card border border-border rounded-2xl p-4';
            const body = (
              <>
                <span className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center shrink-0"><Icon className="w-5 h-5 text-primary" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-sm">{t(`home.type.${s.type}` as 'home.type.swing')}{s.live ? ` · ${t('home.liveTag')}` : ''}</span>
                  <span className="block text-xs text-muted-foreground">{fmtDate(new Date(s.at), { day: 'numeric', month: 'short' })} · {s.mode === 'casa' ? t('mode.casa') : t('mode.cancha')}</span>
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
