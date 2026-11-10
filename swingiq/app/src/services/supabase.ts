/**
 * Supabase Client — React Native
 * --------------------------------
 * Single shared instance used across the entire app.
 *
 * SETUP
 * -----
 * 1. Create a free project at https://supabase.com
 * 2. Go to Project Settings → API
 * 3. Copy "Project URL" and "anon public" key into .env:
 *
 *      EXPO_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
 *      EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
 *
 * WHY AsyncStorage AS THE SESSION STORE?
 * ----------------------------------------
 * Supabase needs somewhere to persist the user's JWT between app restarts.
 * On React Native, AsyncStorage is the right choice — it survives kills and
 * reinstalls. We wrap it with the Supabase storage adapter below.
 */

import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import 'react-native-url-polyfill/auto'; // Required for Supabase on RN

const SUPABASE_URL      = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    'Missing Supabase env vars.\n' +
    'Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to your .env file.\n' +
    'Get them from: Supabase Dashboard → Project Settings → API'
  );
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    // Persist session tokens in AsyncStorage so the user stays logged in
    storage:          AsyncStorage,
    autoRefreshToken: true,
    persistSession:   true,
    detectSessionInUrl: false, // Not needed in a native app
  },
});

// ── Convenience type exports ──────────────────────────────────────────────────

export type SupabaseProfile = {
  id:              string;
  display_name:    string;
  skill_level:     'beginner' | 'intermediate' | 'advanced';
  handicap:        number | null;
  avatar_color:    string;
  total_sessions:  number;
  best_score:      number | null;
  practice_streak: number;
  last_active_at:  string | null;
  created_at:      string;
};

export type SupabaseSession = {
  id:                   string;
  user_id:              string;
  club_used:            string;
  overall_score:        number;
  summary:              string;
  next_session_focus:   string[];
  feedback:             any[];
  club_path_degrees:    number;
  face_angle_degrees:   number;
  spine_angle_address:  number;
  spine_angle_impact:   number;
  hip_turn_degrees:     number;
  shoulder_turn_degrees:number;
  tempo_ratio:          number;
  weight_transfer_pct:  number;
  swing_plane_deviation:number;
  processing_time_sec:  number;
  recorded_at:          string;
};
