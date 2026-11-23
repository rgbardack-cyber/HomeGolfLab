import { useEffect } from 'react';
import { NavLink, Route, Routes, Link, Navigate } from 'react-router-dom';
import { Activity, Award, FlaskConical, Home as HomeIcon, Target, User, House, Flag } from 'lucide-react';
import { useStore, type Mode } from '@/store';
import { BADGES } from '@/lib/badges';
import { anyMediaFlag, getFlags } from '@/lib/flags';
import { runCleanup } from '@/lib/media/cleanup';
import { getMediaStore } from '@/lib/media/store';
import Home from '@/pages/Home';
import Swing from '@/pages/Swing';
import HomeLab from '@/pages/HomeLab';
import Tracking from '@/pages/Tracking';
import Logros from '@/pages/Logros';
import Perfil from '@/pages/Perfil';
import Comparar from '@/pages/Comparar';

const NAV = [
  { to: '/swing', label: 'Swing', icon: Activity },
  { to: '/homelab', label: 'HomeLAB', icon: FlaskConical },
  { to: '/', label: 'Inicio', icon: HomeIcon },
  { to: '/tracking', label: 'Tracking', icon: Target },
  { to: '/logros', label: 'Logros', icon: Award },
];

function ModeSwitch() {
  const mode = useStore((s) => s.mode);
  const setMode = useStore((s) => s.setMode);
  const opt = (m: Mode, label: string, Icon: typeof House) => (
    <button
      onClick={() => setMode(m)}
      aria-pressed={mode === m}
      className={`flex items-center gap-1 px-2.5 h-8 rounded-full text-[11px] font-semibold transition ${mode === m ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
    >
      <Icon className="w-3.5 h-3.5" /> {label}
    </button>
  );
  return <div className="flex bg-muted rounded-full p-0.5">{opt('casa', 'Casa', House)}{opt('cancha', 'Cancha', Flag)}</div>;
}

function UnlockToast() {
  const id = useStore((s) => s.unlockQueue[0]);
  const shift = useStore((s) => s.shiftUnlock);
  const badge = BADGES.find((b) => b.id === id);
  useEffect(() => {
    if (!id) return;
    const t = setTimeout(shift, 3500);
    return () => clearTimeout(t);
  }, [id, shift]);
  if (!badge) return null;
  return (
    <button onClick={shift} className="fixed left-4 right-4 z-50 mx-auto max-w-md bg-card border-2 border-accent rounded-2xl p-4 flex items-center gap-3 shadow-xl text-left" style={{ top: 'calc(env(safe-area-inset-top) + 72px)' }}>
      <span className="text-4xl">{badge.emoji}</span>
      <span className="min-w-0">
        <span className="block text-[11px] font-bold text-accent uppercase tracking-wide">¡Nueva medalla!</span>
        <span className="block font-heading font-bold">{badge.label}</span>
        <span className="block text-xs text-muted-foreground">{badge.description} · +{badge.xp} XP</span>
      </span>
    </button>
  );
}

export default function App() {
  const name = useStore((s) => s.profile.name);
  // Al arrancar: borra exportaciones y grabaciones temporales de más de 24 h y respeta el tope de espacio (F2.3).
  // Solo si hay funciones de video encendidas: si no, la app ni abre el almacén de medios.
  useEffect(() => {
    if (!anyMediaFlag(getFlags())) return;
    void getMediaStore().then((st) => runCleanup(st, useStore.getState().sessions)).catch(() => undefined);
  }, []);
  return (
    <div className="min-h-full flex flex-col">
      <header className="sticky top-0 z-40 bg-card/95 backdrop-blur border-b border-border" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center gap-3">
          <Link to="/" className="flex items-center gap-2 min-w-0">
            <span className="w-8 h-8 rounded-lg bg-primary text-primary-foreground font-heading font-bold flex items-center justify-center">H</span>
            <span className="font-heading font-bold text-base min-[400px]:text-lg whitespace-nowrap">HomeGolfLab</span>
          </Link>
          <div className="ml-auto flex items-center gap-1.5">
            <ModeSwitch />
            <Link to="/perfil" aria-label="Perfil" className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-sm font-semibold">
              {name ? name[0].toUpperCase() : <User className="w-4 h-4" />}
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-2xl mx-auto px-4 pt-5 pb-28">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/swing" element={<Swing />} />
          <Route path="/homelab" element={<HomeLab />} />
          <Route path="/tracking" element={<Tracking />} />
          <Route path="/logros" element={<Logros />} />
          <Route path="/perfil" element={<Perfil />} />
          <Route path="/comparar" element={<Comparar />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      <nav className="fixed bottom-0 inset-x-0 z-40 bg-card border-t border-border" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="max-w-2xl mx-auto grid grid-cols-5">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end className={({ isActive }) => `h-16 flex flex-col items-center justify-center gap-1 text-[11px] font-medium ${isActive ? 'text-primary' : 'text-muted-foreground'}`}>
              <Icon className="w-5 h-5" />
              {label}
            </NavLink>
          ))}
        </div>
      </nav>
      <UnlockToast />
    </div>
  );
}
