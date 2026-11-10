import { Outlet, Link, useLocation } from 'react-router-dom';
import { Home, Activity, Camera, MapPin, Trophy, User, Menu, X, Users, Crown, ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLang } from '@/lib/i18n.jsx';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useSubscription } from '@/lib/useSubscription';

// Bottom bar: Swing | Home Practice | Home | Tracking | Challenges
const useNavItems = (t) => [
  { path: '/swing-analysis', icon: Activity, label: t('swing') },
  { path: '/home-practice', icon: MapPin, label: t('homePractice') },
  { path: '/', icon: Home, label: t('home') },
  { path: '/ball-tracking', icon: Camera, label: t('tracking') },
  { path: '/challenges', icon: Trophy, label: t('challenges') },
];

// Nav items including friends — for sidebar only
const useSidebarNavItems = (t) => [
  { path: '/', icon: Home, label: t('home') },
  { path: '/swing-analysis', icon: Activity, label: t('swing') },
  { path: '/home-practice', icon: MapPin, label: t('homePractice') },
  { path: '/ball-tracking', icon: Camera, label: t('tracking') },
  { path: '/challenges', icon: Trophy, label: t('challenges') },
  { path: '/friends', icon: Users, label: t('friends') },
  { path: '/profile', icon: User, label: t('profile') },
];

export default function AppLayout() {
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const { t } = useLang();
  const navItems = useNavItems(t);
  const sidebarNavItems = useSidebarNavItems(t);
  const { data: user } = useQuery({ queryKey: ['me'], queryFn: () => base44.auth.me() });
  const { isPremium, isTrialActive, trialDaysLeft } = useSubscription(user?.email);

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex flex-col fixed left-0 top-0 bottom-0 w-64 bg-sidebar border-r border-sidebar-border z-40">
        <div className="p-6">
          <Link to="/" className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sidebar-primary flex items-center justify-center">
              <span className="text-sidebar-primary-foreground font-heading font-bold text-lg">H</span>
            </div>
            <div>
              <h1 className="font-heading text-xl font-bold text-sidebar-foreground">HomeGolf LAB</h1>
              <p className="text-xs text-sidebar-foreground/60">Tu coach personal</p>
            </div>
          </Link>
        </div>

        <nav className="flex-1 px-3 space-y-1">
          {sidebarNavItems.map(item => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 ${
                  isActive
                    ? 'bg-sidebar-accent text-sidebar-primary'
                    : 'text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50'
                }`}
              >
                <item.icon className="w-5 h-5" />
                <span className="font-medium text-sm">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 mx-3 mb-4 space-y-3">
          {isTrialActive ? (
            <Link to="/subscription" className="block rounded-xl bg-accent/20 border border-accent/40 p-3 hover:bg-accent/30 transition-colors">
              <p className="text-xs text-sidebar-foreground/60 font-medium">🎁 Prueba gratuita</p>
              <p className="text-sm text-sidebar-foreground mt-0.5">{trialDaysLeft} día{trialDaysLeft !== 1 ? 's' : ''} restantes</p>
            </Link>
          ) : !isPremium ? (
            <Link to="/subscription" className="block rounded-xl bg-destructive/20 border border-destructive/30 p-3 hover:bg-destructive/30 transition-colors">
              <p className="text-xs font-medium text-destructive">⚠️ Modo gratuito</p>
              <p className="text-sm text-sidebar-foreground mt-0.5 flex items-center gap-1"><Crown className="w-3.5 h-3.5 text-accent" /> Mejorar a Premium</p>
            </Link>
          ) : (
            <div className="rounded-xl bg-sidebar-accent/50 p-3">
              <p className="text-xs text-sidebar-foreground/60 font-medium">{t('dailyPractice')}</p>
              <p className="text-sm text-sidebar-foreground mt-1">{t('dontForget')}</p>
            </div>
          )}
          <LanguageSwitcher className="w-full bg-sidebar-accent/30 border-sidebar-border text-sidebar-foreground" />
        </div>
      </aside>

      {/* Mobile Header */}
      <header className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-card/95 backdrop-blur-md border-b border-border z-40 flex items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <span className="text-primary-foreground font-heading font-bold">H</span>
          </div>
          <span className="font-heading text-lg font-bold">HomeGolf LAB</span>
        </Link>
        <div className="flex items-center gap-1">
          {/* User menu with Friends */}
          <div className="relative">
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-muted transition-colors"
            >
              <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                {user?.full_name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || '?'}
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
            <AnimatePresence>
              {userMenuOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -8, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.95 }}
                  className="absolute right-0 top-full mt-1 w-48 bg-card border border-border rounded-xl shadow-lg overflow-hidden z-50"
                >
                  <Link to="/friends" onClick={() => setUserMenuOpen(false)}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-muted transition-colors text-sm font-medium">
                    <Users className="w-4 h-4 text-primary" /> {t('friends')}
                  </Link>
                  <Link to="/profile" onClick={() => setUserMenuOpen(false)}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-muted transition-colors text-sm font-medium">
                    <User className="w-4 h-4 text-muted-foreground" /> {t('profile')}
                  </Link>
                  <div className="border-t border-border">
                    <button onClick={() => base44.auth.logout()}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-muted transition-colors text-sm w-full text-destructive">
                      <X className="w-4 h-4" /> Salir
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="p-2">
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </header>
      {/* Backdrop for user menu */}
      {userMenuOpen && <div className="fixed inset-0 z-40 lg:hidden" onClick={() => setUserMenuOpen(false)} />}

      {/* Mobile Menu Overlay */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="lg:hidden fixed inset-0 bg-black/50 z-40 pt-16"
            onClick={() => setMobileMenuOpen(false)}
          >
            <motion.nav
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -20, opacity: 0 }}
              className="bg-card border-b border-border p-4 space-y-1"
              onClick={e => e.stopPropagation()}
            >
              {sidebarNavItems.map(item => {
                const isActive = location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                      isActive
                        ? 'bg-primary/10 text-primary'
                        : 'text-foreground/70 hover:bg-muted'
                    }`}
                  >
                    <item.icon className="w-5 h-5" />
                    <span className="font-medium">{item.label}</span>
                  </Link>
                );
              })}
            </motion.nav>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="lg:ml-64 pt-16 lg:pt-0 min-h-screen">
        <div className="p-4 md:p-8 max-w-6xl mx-auto">
          <Outlet />
        </div>
      </main>

      {/* Mobile Bottom Nav */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-card/95 backdrop-blur-md border-t border-border z-40">
        <div className="flex justify-around py-2">
          {navItems.slice(0, 6).map(item => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex flex-col items-center gap-1 px-3 py-1 rounded-lg transition-all ${
                  isActive ? 'text-primary' : 'text-muted-foreground'
                }`}
              >
                <item.icon className={`w-5 h-5 ${isActive ? 'stroke-[2.5]' : ''}`} />
                <span className="text-[10px] font-medium">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}