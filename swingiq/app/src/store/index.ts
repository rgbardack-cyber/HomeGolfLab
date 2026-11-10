/**
 * SwingIQ Global Store (Zustand)
 *
 * Why Zustand?
 *   Lightweight (~1 KB), no boilerplate, works perfectly with React Native.
 *   State persists across screens without prop-drilling.
 *
 * Structure:
 *   - userProfile   : name, skill level, handicap
 *   - sessions      : list of all completed swing analyses
 *   - activeSession : the session currently on screen (results view)
 *   - ui            : loading states, onboarding flag
 */

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ── Types ────────────────────────────────────────────────────────────────────

export type SkillLevel = 'beginner' | 'intermediate' | 'advanced';

export interface UserProfile {
  name: string;
  skillLevel: SkillLevel;
  handicap: number | null;
  hasCompletedOnboarding: boolean;
}

export interface FeedbackItem {
  severity: 'fix' | 'improve' | 'good';
  category: string;
  title: string;
  detail: string;
  drill: string | null;
}

export interface SwingMetrics {
  club_path_degrees: number;
  face_angle_degrees: number;
  spine_angle_address: number;
  spine_angle_impact: number;
  hip_turn_degrees: number;
  shoulder_turn_degrees: number;
  tempo_ratio: number;
  weight_transfer_pct: number;
  swing_plane_deviation: number;
  total_frames_analyzed: number;
  frames_per_second: number;
}

export interface SwingSession {
  session_id: string;
  player_name: string;
  club_used: string;
  overall_score: number;
  metrics: SwingMetrics;
  feedback: FeedbackItem[];
  summary: string;
  next_session_focus: string[];
  processing_time_seconds: number;
  recorded_at: string; // ISO date string
}

interface AppState {
  // User
  profile: UserProfile;
  setProfile: (profile: Partial<UserProfile>) => void;
  completeOnboarding: (name: string, skillLevel: SkillLevel, handicap: number | null) => void;

  // Sessions
  sessions: SwingSession[];
  activeSession: SwingSession | null;
  addSession: (session: SwingSession) => void;
  setActiveSession: (session: SwingSession | null) => void;
  clearSessions: () => void;

  // UI
  isAnalyzing: boolean;
  setIsAnalyzing: (val: boolean) => void;
  analysisError: string | null;
  setAnalysisError: (err: string | null) => void;

  // Persistence
  loadFromStorage: () => Promise<void>;
  saveToStorage: () => Promise<void>;
}

// ── Storage helpers ───────────────────────────────────────────────────────────

const STORAGE_KEYS = {
  profile:  'swingiq:profile',
  sessions: 'swingiq:sessions',
};

// ── Store ─────────────────────────────────────────────────────────────────────

export const useStore = create<AppState>((set, get) => ({
  // ── User profile ──────────────────────────────────────────────────────────
  profile: {
    name: '',
    skillLevel: 'intermediate',
    handicap: null,
    hasCompletedOnboarding: false,
  },

  setProfile: (partial) =>
    set((state) => ({ profile: { ...state.profile, ...partial } })),

  completeOnboarding: (name, skillLevel, handicap) => {
    set((state) => ({
      profile: {
        ...state.profile,
        name,
        skillLevel,
        handicap,
        hasCompletedOnboarding: true,
      },
    }));
    get().saveToStorage();
  },

  // ── Sessions ──────────────────────────────────────────────────────────────
  sessions: [],
  activeSession: null,

  addSession: (session) => {
    set((state) => ({
      sessions: [session, ...state.sessions],
      activeSession: session,
    }));
    get().saveToStorage();
  },

  setActiveSession: (session) => set({ activeSession: session }),

  clearSessions: () => {
    set({ sessions: [], activeSession: null });
    get().saveToStorage();
  },

  // ── UI flags ──────────────────────────────────────────────────────────────
  isAnalyzing: false,
  setIsAnalyzing: (val) => set({ isAnalyzing: val }),

  analysisError: null,
  setAnalysisError: (err) => set({ analysisError: err }),

  // ── Persistence ───────────────────────────────────────────────────────────
  loadFromStorage: async () => {
    try {
      const [profileJson, sessionsJson] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.profile),
        AsyncStorage.getItem(STORAGE_KEYS.sessions),
      ]);
      if (profileJson)  set({ profile:  JSON.parse(profileJson) });
      if (sessionsJson) set({ sessions: JSON.parse(sessionsJson) });
    } catch (e) {
      console.warn('SwingIQ: failed to load from storage', e);
    }
  },

  saveToStorage: async () => {
    const { profile, sessions } = get();
    try {
      await Promise.all([
        AsyncStorage.setItem(STORAGE_KEYS.profile,  JSON.stringify(profile)),
        AsyncStorage.setItem(STORAGE_KEYS.sessions, JSON.stringify(sessions)),
      ]);
    } catch (e) {
      console.warn('SwingIQ: failed to save to storage', e);
    }
  },
}));
