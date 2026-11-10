import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { computeStats, newBadges, type SessionLite } from '@/lib/badges';
import type { Plan, Space } from '@/lib/homelab';
import type { SwingResult } from '@/lib/swing';
import type { Shot } from '@/lib/tracking';
import type { ScanInfo } from '@/lib/scan';

export type Mode = 'casa' | 'cancha';

export interface Session extends SessionLite {
  id: string;
  at: string;                 // ISO completo
  swing?: SwingResult;
  shotList?: Shot[];
  planTheme?: string;
  minutes?: number;
}

export interface Profile { name: string; handicap: string; lefty: boolean; premium: boolean }

interface State {
  mode: Mode;
  profile: Profile;
  sessions: Session[];
  earned: Record<string, string>;   // id de medalla → fecha
  unlockQueue: string[];            // medallas recién ganadas, pendientes de mostrar
  space: Space | null;
  plan: Plan | null;
  scan: ScanInfo | null;            // lo que la IA vio en el último escaneo del espacio
  trackingUsedSec: number;          // segundos de ball tracking usados desde el último desbloqueo

  setMode: (m: Mode) => void;
  setProfile: (p: Partial<Profile>) => void;
  addSession: (s: Omit<Session, 'id' | 'at' | 'date' | 'mode'> & { mode?: Mode }) => Session;
  shiftUnlock: () => void;
  setSpace: (s: Space, scan?: ScanInfo | null) => void;
  addTrackingTime: (sec: number) => void;
  unlockTracking: () => void;
  setPlan: (p: Plan | null) => void;
  reset: () => void;
}

export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const initial = {
  mode: 'casa' as Mode,
  profile: { name: '', handicap: '', lefty: false, premium: false },
  sessions: [] as Session[],
  earned: {} as Record<string, string>,
  unlockQueue: [] as string[],
  space: null as Space | null,
  plan: null as Plan | null,
  scan: null as ScanInfo | null,
  trackingUsedSec: 0,
};

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      ...initial,
      setMode: (mode) => set({ mode }),
      setProfile: (p) => set({ profile: { ...get().profile, ...p } }),
      addSession: (s) => {
        const session: Session = { ...s, id: crypto.randomUUID(), at: new Date().toISOString(), date: todayISO(), mode: s.mode ?? get().mode };
        const sessions = [session, ...get().sessions];
        // Las medallas se evalúan una sola vez, al guardar la sesión, y cada id se guarda una sola vez.
        const fresh = newBadges(computeStats(sessions, todayISO()), Object.keys(get().earned));
        const earned = { ...get().earned };
        fresh.forEach((id) => { earned[id] = session.date; });
        set({ sessions, earned, unlockQueue: [...get().unlockQueue, ...fresh] });
        return session;
      },
      shiftUnlock: () => set({ unlockQueue: get().unlockQueue.slice(1) }),
      setSpace: (space, scan = null) => set({ space, scan, plan: null }),
      addTrackingTime: (sec) => set({ trackingUsedSec: get().trackingUsedSec + sec }),
      unlockTracking: () => set({ trackingUsedSec: 0 }),
      setPlan: (plan) => set({ plan }),
      reset: () => set({ ...initial }),
    }),
    { name: 'homegolflab-v1' },
  ),
);

/** Límites de la versión gratuita. */
export const FREE = { swingUploadsPerDay: 1 };

export function swingUploadsToday(sessions: Session[]) {
  const t = todayISO();
  return sessions.filter((s) => s.type === 'swing' && !s.live && s.date === t).length;
}
