import { useState } from 'react';
import { motion } from 'framer-motion';
import { LogOut, Activity, Trophy, Calendar, TrendingUp, Edit2, Check, Crown } from 'lucide-react';
import AvatarUpload from '@/components/shared/AvatarUpload';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useLang } from '@/lib/i18n.jsx';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import { useSubscription, PLANS } from '@/lib/useSubscription';
import { Link } from 'react-router-dom';
import { useBadges } from '@/hooks/useBadges';
import LevelBanner from '@/components/gamification/LevelBanner';
import BadgesSection from '@/components/gamification/BadgesSection';
import BadgeUnlockToast from '@/components/gamification/BadgeUnlockToast';

export default function Profile() {
  const { t } = useLang();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({});

  const { data: user, refetch: refetchUser } = useQuery({
    queryKey: ['me'],
    queryFn: () => base44.auth.me(),
    onSuccess: (u) => {
      if (!editing) setForm({ nickname: u.nickname || '', handicap: u.handicap || '', home_course: u.home_course || '' });
    },
  });

  const { data: sessions = [] } = useQuery({
    queryKey: ['all-sessions'],
    queryFn: () => base44.entities.PracticeSession.list('-created_date', 30),
  });

  const { sub, isPremium, isTrialActive, trialDaysLeft, activatePlan } = useSubscription(user?.email);
  const [selectedPlan, setSelectedPlan] = useState('annual');
  const [subLoading, setSubLoading] = useState(false);

  const handleSubscribe = async () => {
    setSubLoading(true);
    const platform = /iPhone|iPad|iPod/.test(navigator.userAgent) ? 'ios'
      : /Android/.test(navigator.userAgent) ? 'android' : 'web';
    await activatePlan.mutateAsync({ plan: selectedPlan, platform, productId: PLANS[selectedPlan].productId, transactionId: `demo_${Date.now()}` });
    setSubLoading(false);
  };

  const { data: entries = [] } = useQuery({
    queryKey: ['my-challenge-entries'],
    queryFn: async () => {
      if (!user?.email) return [];
      return base44.entities.ChallengeEntry.filter({ user_email: user.email });
    },
    enabled: !!user?.email,
  });

  const { earnedBadges, newlyUnlocked, clearNewlyUnlocked, totalXp, levelInfo } = useBadges(user?.email, sessions, entries);

  const saveProfile = async () => {
    setSaving(true);
    await base44.auth.updateMe({
      nickname: form.nickname,
      handicap: form.handicap,
      home_course: form.home_course,
    });
    await refetchUser();
    setSaving(false);
    setEditing(false);
  };

  const chartData = sessions
    .filter(s => s.score)
    .reverse()
    .map(s => ({
      date: s.date ? format(new Date(s.date), 'd MMM', { locale: es }) : '',
      score: s.score,
    }));

  const stats = {
    total: sessions.length,
    avgScore: sessions.filter(s => s.score).length > 0
      ? (sessions.filter(s => s.score).reduce((a, s) => a + s.score, 0) / sessions.filter(s => s.score).length).toFixed(1)
      : '—',
  };

  return (
    <div className="space-y-6 pb-24 lg:pb-8">
      <BadgeUnlockToast newBadgeIds={newlyUnlocked} onDone={clearNewlyUnlocked} />

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        {/* Profile Header */}
        <div className="bg-card rounded-2xl border border-border p-6 space-y-4">
          <div className="flex items-center gap-4">
            <AvatarUpload
              avatarUrl={user?.avatar_url}
              name={user?.full_name || user?.email}
              onUploaded={() => refetchUser()}
              size="lg"
            />
            <div className="flex-1 min-w-0">
              <h1 className="font-heading text-xl font-bold truncate">{user?.full_name || user?.nickname || 'Golfista'}</h1>
              <p className="text-sm text-muted-foreground truncate">{user?.email}</p>
              {user?.handicap && <p className="text-xs text-primary font-medium mt-0.5">HCP: {user.handicap}</p>}
              {user?.home_course && <p className="text-xs text-muted-foreground">⛳ {user.home_course}</p>}
              {/* Level badge inline */}
              <div className={`inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${levelInfo.bg} ${levelInfo.color}`}>
                {t('levelLabel')} {levelInfo.level} · {levelInfo.label}
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => { setEditing(!editing); setForm({ nickname: user?.nickname || '', handicap: user?.handicap || '', home_course: user?.home_course || '' }); }}>
              <Edit2 className="w-4 h-4" />
            </Button>
          </div>

          {/* Edit form */}
          {editing && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="border-t border-border pt-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">{t('nickname')}</Label>
                  <Input value={form.nickname} onChange={e => setForm(p => ({ ...p, nickname: e.target.value }))} className="mt-1 h-9" placeholder="Tu apodo" />
                </div>
                <div>
                  <Label className="text-xs">{t('handicap')}</Label>
                  <Input type="number" value={form.handicap} onChange={e => setForm(p => ({ ...p, handicap: e.target.value }))} className="mt-1 h-9" placeholder="18.4" />
                </div>
              </div>
              <div>
                <Label className="text-xs">{t('homeCourse')}</Label>
                <Input value={form.home_course} onChange={e => setForm(p => ({ ...p, home_course: e.target.value }))} className="mt-1 h-9" placeholder="Club de Golf..." />
              </div>
              <Button size="sm" onClick={saveProfile} disabled={saving} className="gap-2">
                {saving ? t('saving') : <><Check className="w-4 h-4" /> {t('save')}</>}
              </Button>
            </motion.div>
          )}
        </div>
      </motion.div>

      {/* Language */}
      <div className="bg-card rounded-2xl border border-border p-4 flex items-center justify-between">
        <div>
          <p className="font-medium text-sm">{t('language')}</p>
          <p className="text-xs text-muted-foreground">{t('appLanguage')}</p>
        </div>
        <LanguageSwitcher />
      </div>

      {/* Subscription Card */}
      <div className={`rounded-2xl border p-5 space-y-4 ${isPremium && !isTrialActive ? 'bg-primary/5 border-primary/30' : isTrialActive ? 'bg-accent/10 border-accent/40' : 'bg-destructive/5 border-destructive/20'}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isPremium && !isTrialActive ? 'bg-primary/20' : isTrialActive ? 'bg-accent/20' : 'bg-muted'}`}>
              <Crown className={`w-5 h-5 ${isPremium && !isTrialActive ? 'text-primary' : isTrialActive ? 'text-accent' : 'text-muted-foreground'}`} />
            </div>
            <div>
              <p className="font-heading font-semibold text-sm">
                {isTrialActive ? t('freeTrial') : isPremium ? `✅ ${PLANS[sub?.plan]?.label || 'Premium'}` : t('freeMode')}
              </p>
              <p className="text-xs text-muted-foreground">
                {isTrialActive ? `${trialDaysLeft} ${t('daysLeft')}`
                  : isPremium && sub?.subscription_end_date ? `${format(parseISO(sub.subscription_end_date), 'd MMM yyyy', { locale: es })}`
                  : t('securePayment')}
              </p>
            </div>
          </div>
          {isPremium && !isTrialActive && (
            <Link to="/subscription">
              <Button variant="outline" size="sm" className="text-xs">{t('manageSub')}</Button>
            </Link>
          )}
        </div>

        {/* Plan selector for non-premium */}
        {!isPremium || isTrialActive ? (
          <div className="space-y-3">
            <p className="text-sm font-medium">{t('choosePlan')}</p>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(PLANS).map(([key, plan]) => (
                <button
                  key={key}
                  onClick={() => setSelectedPlan(key)}
                  className={`text-left p-3 rounded-xl border-2 transition-all ${selectedPlan === key ? 'border-primary bg-primary/10' : 'border-border bg-card'}`}
                >
                  <p className="font-semibold text-xs">{plan.label}</p>
                  <p className="font-bold text-sm mt-0.5">${plan.price.toFixed(2)}</p>
                  {plan.discount > 0 && (
                    <p className="text-[10px] text-primary font-medium">{Math.round(plan.discount * 100)}% OFF</p>
                  )}
                </button>
              ))}
            </div>
            <Button onClick={handleSubscribe} disabled={subLoading || activatePlan.isPending} className="w-full font-semibold">
              {subLoading || activatePlan.isPending ? t('processing') : `${t('subscribeTo')} — $${PLANS[selectedPlan].price.toFixed(2)}`}
            </Button>
            <p className="text-[10px] text-muted-foreground text-center">{t('securePayment')}</p>
          </div>
        ) : null}
      </div>

      {/* Level Banner */}
      <LevelBanner xp={totalXp} />

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-card rounded-xl border border-border p-4 text-center">
          <Activity className="w-5 h-5 text-primary mx-auto mb-2" />
          <p className="text-2xl font-heading font-bold">{stats.total}</p>
          <p className="text-xs text-muted-foreground">{t('sessions')}</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-4 text-center">
          <TrendingUp className="w-5 h-5 text-accent mx-auto mb-2" />
          <p className="text-2xl font-heading font-bold">{stats.avgScore}</p>
          <p className="text-xs text-muted-foreground">{t('average')}</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-4 text-center">
          <Trophy className="w-5 h-5 text-chart-4 mx-auto mb-2" />
          <p className="text-2xl font-heading font-bold">{entries.length}</p>
          <p className="text-xs text-muted-foreground">{t('challenges')}</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-4 text-center">
          <Calendar className="w-5 h-5 text-chart-1 mx-auto mb-2" />
          <p className="text-2xl font-heading font-bold">{sessions.filter(s => s.type !== 'home_practice').length}</p>
          <p className="text-xs text-muted-foreground">{t('analysis')}</p>
        </div>
      </div>

      {/* Progress Chart */}
      {chartData.length > 1 && (
        <div className="bg-card rounded-2xl border border-border p-5">
          <h3 className="font-heading font-semibold mb-4">{t('progressChart')}</h3>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 10]} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Line type="monotone" dataKey="score" stroke="hsl(152, 45%, 28%)" strokeWidth={2} dot={{ fill: 'hsl(152, 45%, 28%)' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Badges */}
      <BadgesSection earnedBadges={earnedBadges} />

      {/* Session History */}
      {sessions.length > 0 && (
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          <div className="p-5 border-b border-border">
            <h3 className="font-heading font-semibold">{t('sessionHistory')}</h3>
          </div>
          <div className="divide-y divide-border">
            {sessions.slice(0, 10).map(session => (
              <div key={session.id} className="flex items-center gap-4 px-5 py-3">
                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                  {session.type === 'swing_analysis' && <Activity className="w-4 h-4 text-primary" />}
                  {session.type === 'home_practice' && <Calendar className="w-4 h-4 text-accent" />}
                  {session.type === 'ball_tracking' && <TrendingUp className="w-4 h-4 text-chart-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm capitalize">{
                    session.type === 'swing_analysis' ? t('swingAnalysis')
                    : session.type === 'home_practice' ? t('homePractice')
                    : session.type === 'ball_tracking' ? t('ballTracking')
                    : session.type?.replace(/_/g, ' ')
                  }</p>
                  <p className="text-xs text-muted-foreground">
                    {session.date && format(new Date(session.date), 'd MMM yyyy', { locale: es })}
                  </p>
                </div>
                {session.score && <span className="font-heading font-bold text-primary">{session.score}/10</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Logout */}
      <Button variant="outline" className="w-full text-destructive border-destructive/30 hover:bg-destructive/5" onClick={() => base44.auth.logout()}>
        <LogOut className="w-4 h-4 mr-2" /> {t('logout')}
      </Button>
    </div>
  );
}