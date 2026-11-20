import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { computeStats, newBadges, type SessionLite } from '@/lib/badges';
import type { Plan, Space } from '@/lib/homelab';
import type { SwingResult } from '@/lib/swing';
import type { Shot } from '@/lib/tracking';
import type { ScanInfo } from '@/lib/scan';
import { migrateStore, STORE_VERSION } from '@/lib/storeMigrate';
import type { ShotShape } from '@/lib/shotShape';
import { asUnit, DEFAULT_UNIT, type DistUnit } from '@/lib/units';

export type Mode = 'casa' | 'cancha';

export interface Session extends SessionLite {
  id: string;
  at: string;                 // ISO completo
  swing?: SwingResult;
  shotList?: Shot[];
  planTheme?: string;
  minutes?: number;
  club?: string;              // palo confirmado a mano por el usuario para este swing (la app no lee el número)
  // Datos pesados guardados FUERA de localStorage (lib/media/store.ts); aquí solo van los ids.
  mediaId?: string;           // video fuente de la revisión
  poseTrackId?: string;       // pista de postura de la pasada fina
  flightTrackId?: string;     // seguimiento de bola v2
  /** «Etiqueta tuya» (F6.1): lo que el usuario dice que fue el tiro. Nunca se presenta como detectado. */
  shapeManual?: ShotShape;
  /** Fases ajustadas a mano en la revisión (ms de medio del archivo fuente); mandan sobre las automáticas. */
  reviewMarks?: Partial<Record<'address' | 'top' | 'impact', number>>;
}

/** Pase de exportación (plan 4.8, F9; D3: vale para un análisis durante 24 h). Lo emite `lib/exportGate.ts`. */
export interface ExportPass {
  id: string; analysisId: string; specHash: string;
  grantedAt: number; expiresAt: number;
  via: 'premium' | 'reward' | 'placeholder' | 'free_daily';
  rewardEventId?: string; uses: number; consumed: boolean;
}

/** `unit`: unidad de distancia al MOSTRAR (D2: yardas por defecto). Lo guardado va siempre en metros. */
export interface Profile { name: string; handicap: string; lefty: boolean; premium: boolean; unit?: DistUnit }

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
  currentClub: string | null;       // palo confirmado a mano; se asigna a los swings siguientes hasta que el usuario lo cambie
  exportPasses: ExportPass[];       // pases de exportación vigentes (F9); sobreviven al cierre de la app
  freeExportDate: string | null;    // día (AAAA-MM-DD) de la última exportación gratis diaria sin anuncio (D5)
  adsConsent: 'granted' | 'declined' | 'unknown'; // el usuario acepta o rechaza ver anuncios (D5)

  setMode: (m: Mode) => void;
  setCurrentClub: (c: string | null) => void;
  setProfile: (p: Partial<Profile>) => void;
  addSession: (s: Omit<Session, 'id' | 'at' | 'date' | 'mode'> & { mode?: Mode }) => Session;
  shiftUnlock: () => void;
  /** Quita la sesión del historial. Quien llama borra sus medios (`deleteSessionMedia`); las medallas ya ganadas se conservan. */
  removeSession: (id: string) => Session | undefined;
  /** Enlaza a una sesión los datos pesados guardados fuera de localStorage (ids). */
  attachMedia: (sessionId: string, ids: Pick<Session, 'mediaId' | 'poseTrackId' | 'flightTrackId'>) => void;
  /** F6.1: guarda o quita (null) la etiqueta de forma del tiro de una sesión. */
  setShapeManual: (sessionId: string, shape: ShotShape | null) => void;
  setReviewMarks: (sessionId: string, marks: NonNullable<Session['reviewMarks']>) => void;
  /** Cambia el swing analizado de una sesión (el usuario eligió otro del mismo video): NO cuenta como otro análisis. */
  replaceSessionSwing: (sessionId: string, swing: SwingResult) => void;
  /** Olvida los ids de video/pose/vuelo de todas las sesiones (tras borrar los videos guardados). */
  clearMediaRefs: () => void;
  setSpace: (s: Space, scan?: ScanInfo | null) => void;
  addTrackingTime: (sec: number) => void;
  unlockTracking: () => void;
  setPlan: (p: Plan | null) => void;
  /** F9: guarda un pase nuevo (y quita los vencidos). */
  grantExportPass: (p: ExportPass, now: number) => void;
  /** F9: cuenta un uso de un pase existente. */
  touchExportPass: (id: string) => void;
  markFreeExport: (day: string) => void;
  setAdsConsent: (c: 'granted' | 'declined' | 'unknown') => void;
  reset: () => void;
}

export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const initial = {
  mode: 'casa' as Mode,
  profile: { name: '', handicap: '', lefty: false, premium: false, unit: DEFAULT_UNIT } as Profile,
  sessions: [] as Session[],
  earned: {} as Record<string, string>,
  unlockQueue: [] as string[],
  space: null as Space | null,
  plan: null as Plan | null,
  scan: null as ScanInfo | null,
  trackingUsedSec: 0,
  currentClub: null as string | null,
  exportPasses: [] as ExportPass[],
  freeExportDate: null as string | null,
  adsConsent: 'unknown' as 'granted' | 'declined' | 'unknown',
};

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      ...initial,
      setMode: (mode) => set({ mode }),
      setCurrentClub: (currentClub) => set({ currentClub }),
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
      removeSession: (id) => {
        const found = get().sessions.find((x) => x.id === id);
        if (found) set({ sessions: get().sessions.filter((x) => x.id !== id) });
        return found;
      },
      replaceSessionSwing: (sessionId, swing) => set({ sessions: get().sessions.map((x) => (x.id === sessionId ? { ...x, swing, score: swing.score, tempoRatio: swing.metrics.tempoRatio, reviewMarks: undefined } : x)) }),
      setReviewMarks: (sessionId, marks) => set({ sessions: get().sessions.map((x) => (x.id === sessionId ? { ...x, reviewMarks: marks } : x)) }),
      setShapeManual: (sessionId, shape) => set({ sessions: get().sessions.map((x) => (x.id === sessionId ? { ...x, shapeManual: shape ?? undefined } : x)) }),
      attachMedia: (sessionId, ids) => set({ sessions: get().sessions.map((x) => (x.id === sessionId ? { ...x, ...ids } : x)) }),
      clearMediaRefs: () => set({
        sessions: get().sessions.map((x) => (x.mediaId || x.poseTrackId || x.flightTrackId ? { ...x, mediaId: undefined, poseTrackId: undefined, flightTrackId: undefined } : x)),
      }),
      setSpace: (space, scan = null) => set({ space, scan, plan: null }),
      addTrackingTime: (sec) => set({ trackingUsedSec: get().trackingUsedSec + sec }),
      unlockTracking: () => set({ trackingUsedSec: 0 }),
      setPlan: (plan) => set({ plan }),
      grantExportPass: (p, now) => set({ exportPasses: [...get().exportPasses.filter((x) => now < x.expiresAt && x.id !== p.id), p] }),
      touchExportPass: (id) => set({ exportPasses: get().exportPasses.map((x) => (x.id === id ? { ...x, uses: x.uses + 1 } : x)) }),
      markFreeExport: (day) => set({ freeExportDate: day }),
      setAdsConsent: (adsConsent) => set({ adsConsent }),
      reset: () => set({ ...initial }),
    }),
    // version 1 (F2.1): agrega `exportPasses` y los ids de medios. `migrate` conserva todo lo que ya había guardado.
    { name: 'homegolflab-v1', version: STORE_VERSION, migrate: (persisted, version) => migrateStore(persisted, version) as unknown as State },
  ),
);

/** Límites de la versión gratuita. */
export const FREE = { swingUploadsPerDay: 1 };

export function swingUploadsToday(sessions: Session[]) {
  const t = todayISO();
  return sessions.filter((s) => s.type === 'swing' && !s.live && s.date === t).length;
}

/** Unidad de distancia elegida (yardas si nunca se eligió o el dato es viejo o inválido). */
export const useUnit = (): DistUnit => useStore((s) => asUnit(s.profile.unit));
