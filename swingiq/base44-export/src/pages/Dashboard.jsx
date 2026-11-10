import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Activity, MapPin, Camera, Trophy, ArrowRight } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { format } from 'date-fns';
import { es, enUS, fr, pt, de, it, ja, zhCN } from 'date-fns/locale';
import { useLang } from '@/lib/i18n.jsx';

const DATE_LOCALES = { es, en: enUS, fr, pt, de, it, ja, zh: zhCN };

export default function Dashboard() {
  const { t, lang } = useLang();
  const dateLocale = DATE_LOCALES[lang] || enUS;

  const { data: sessions = [] } = useQuery({
    queryKey: ['sessions-recent'],
    queryFn: () => base44.entities.PracticeSession.list('-created_date', 5),
  });

  const features = [
    {
      path: '/swing-analysis',
      icon: Activity,
      title: t('featureSwingTitle'),
      description: t('featureSwingDesc'),
      gradient: 'from-primary/20 to-primary/5',
    },
    {
      path: '/home-practice',
      icon: MapPin,
      title: t('featureHomeTitle'),
      description: t('featureHomeDesc'),
      gradient: 'from-accent/20 to-accent/5',
    },
    {
      path: '/ball-tracking',
      icon: Camera,
      title: t('featureTrackingTitle'),
      description: t('featureTrackingDesc'),
      gradient: 'from-chart-4/20 to-chart-4/5',
    },
    {
      path: '/challenges',
      icon: Trophy,
      title: t('featureChallengesTitle'),
      description: t('featureChallengesDesc'),
      gradient: 'from-accent/30 to-accent/5',
    },
  ];

  const today = format(new Date(), 'EEEE, d MMMM', { locale: dateLocale });

  const sessionTypeLabel = (type) => {
    if (type === 'swing_analysis') return t('featureSwingTitle');
    if (type === 'home_practice') return t('featureHomeTitle');
    if (type === 'ball_tracking') return t('featureTrackingTitle');
    return type?.replace(/_/g, ' ');
  };

  return (
    <div className="space-y-8 pb-24 lg:pb-8">
      {/* Hero Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary to-primary/80 p-6 md:p-10 text-primary-foreground"
      >
        <div className="relative z-10">
          <p className="text-primary-foreground/70 text-sm font-medium capitalize">{today}</p>
          <h1 className="font-heading text-3xl md:text-4xl font-bold mt-2">HomeGolf LAB</h1>
          <p className="mt-3 text-primary-foreground/80 max-w-md">{t('dashboardSubtitle')}</p>
          <Link
            to="/swing-analysis"
            className="inline-flex items-center gap-2 mt-5 px-5 py-2.5 bg-white/20 hover:bg-white/30 rounded-xl font-medium text-sm transition-all backdrop-blur-sm"
          >
            {t('startAnalysis')} <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
        <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-gradient-to-l from-accent/20 to-transparent" />
        <div className="absolute -right-10 -bottom-10 w-40 h-40 rounded-full bg-white/10 blur-2xl" />
      </motion.div>

      {/* Feature Cards */}
      <div>
        <h2 className="font-heading text-xl font-semibold mb-4">{t('aiTools')}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {features.map((f, idx) => (
            <motion.div
              key={f.path}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.1 }}
            >
              <Link
                to={f.path}
                className={`block p-5 rounded-2xl bg-gradient-to-br ${f.gradient} border border-border hover:shadow-lg transition-all group`}
              >
                <div className="flex items-start justify-between">
                  <div className="w-12 h-12 rounded-xl bg-card flex items-center justify-center shadow-sm">
                    <f.icon className="w-6 h-6 text-primary" />
                  </div>
                  <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors group-hover:translate-x-1 transform duration-200" />
                </div>
                <h3 className="font-heading font-semibold text-lg mt-4">{f.title}</h3>
                <p className="text-sm text-muted-foreground mt-1">{f.description}</p>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Recent Sessions */}
      {sessions.length > 0 && (
        <div>
          <h2 className="font-heading text-xl font-semibold mb-4">{t('recentSessions')}</h2>
          <div className="space-y-3">
            {sessions.map(session => (
              <div key={session.id} className="flex items-center gap-4 p-4 bg-card rounded-xl border border-border">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  {session.type === 'swing_analysis' && <Activity className="w-5 h-5 text-primary" />}
                  {session.type === 'home_practice' && <MapPin className="w-5 h-5 text-primary" />}
                  {session.type === 'ball_tracking' && <Camera className="w-5 h-5 text-primary" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{sessionTypeLabel(session.type)}</p>
                  <p className="text-xs text-muted-foreground">
                    {session.date && format(new Date(session.date), 'd MMM yyyy', { locale: dateLocale })}
                  </p>
                </div>
                {session.score && (
                  <div className="text-right">
                    <p className="font-heading font-bold text-primary">{session.score}/10</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}