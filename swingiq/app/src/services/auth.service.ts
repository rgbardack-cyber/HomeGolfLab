/**
 * SwingIQ Auth Service
 * ---------------------
 * All authentication operations in one place.
 * Wraps the Supabase Auth SDK with typed helpers.
 *
 * Consumers use the useAuth() hook (auth.hook.ts) rather than
 * calling this directly — it keeps UI components clean.
 */

import { supabase, SupabaseProfile } from './supabase';

// ── Types ────────────────────────────────────────────────────────────────────

export interface AuthUser {
  id:    string;
  email: string;
}

export interface AuthError {
  message: string;
}

// ── Sign up ───────────────────────────────────────────────────────────────────

export async function signUp(
  email: string,
  password: string,
  displayName: string,
): Promise<{ user: AuthUser | null; error: AuthError | null }> {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { display_name: displayName },
      // Disable email confirmation for MVP — enable in production
      emailRedirectTo: undefined,
    },
  });

  if (error) return { user: null, error: { message: error.message } };
  if (!data.user) return { user: null, error: { message: 'Sign up failed — please try again.' } };

  return {
    user:  { id: data.user.id, email: data.user.email! },
    error: null,
  };
}

// ── Sign in ───────────────────────────────────────────────────────────────────

export async function signIn(
  email: string,
  password: string,
): Promise<{ user: AuthUser | null; error: AuthError | null }> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // Make the error message friendlier
    const msg =
      error.message.includes('Invalid login') ? 'Incorrect email or password.' :
      error.message.includes('Email not confirmed') ? 'Please check your email to confirm your account.' :
      error.message;
    return { user: null, error: { message: msg } };
  }

  return {
    user:  { id: data.user.id, email: data.user.email! },
    error: null,
  };
}

// ── Sign out ──────────────────────────────────────────────────────────────────

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}

// ── Password reset ────────────────────────────────────────────────────────────

export async function sendPasswordReset(
  email: string,
): Promise<{ error: AuthError | null }> {
  const { error } = await supabase.auth.resetPasswordForEmail(email);
  return { error: error ? { message: error.message } : null };
}

// ── Get current session (on app start) ───────────────────────────────────────

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

// ── Fetch user profile ────────────────────────────────────────────────────────

export async function fetchProfile(userId: string): Promise<SupabaseProfile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (error) { console.warn('fetchProfile error', error); return null; }
  return data as SupabaseProfile;
}

// ── Update user profile ───────────────────────────────────────────────────────

export async function updateProfile(
  userId: string,
  updates: Partial<Pick<SupabaseProfile, 'display_name' | 'skill_level' | 'handicap' | 'avatar_color'>>,
): Promise<{ error: AuthError | null }> {
  const { error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', userId);

  return { error: error ? { message: error.message } : null };
}

// ── Save swing session to Supabase ────────────────────────────────────────────

export async function saveSwingSession(
  userId: string,
  session: any, // SwingSession from the store
): Promise<{ id: string | null; error: AuthError | null }> {
  const { data, error } = await supabase
    .from('swing_sessions')
    .insert({
      user_id:               userId,
      club_used:             session.club_used,
      overall_score:         session.overall_score,
      summary:               session.summary,
      next_session_focus:    session.next_session_focus,
      feedback:              session.feedback,
      club_path_degrees:     session.metrics?.club_path_degrees,
      face_angle_degrees:    session.metrics?.face_angle_degrees,
      spine_angle_address:   session.metrics?.spine_angle_address,
      spine_angle_impact:    session.metrics?.spine_angle_impact,
      hip_turn_degrees:      session.metrics?.hip_turn_degrees,
      shoulder_turn_degrees: session.metrics?.shoulder_turn_degrees,
      tempo_ratio:           session.metrics?.tempo_ratio,
      weight_transfer_pct:   session.metrics?.weight_transfer_pct,
      swing_plane_deviation: session.metrics?.swing_plane_deviation,
      processing_time_sec:   session.processing_time_seconds,
      recorded_at:           session.recorded_at,
    })
    .select('id')
    .single();

  return {
    id:    data?.id ?? null,
    error: error ? { message: error.message } : null,
  };
}

// ── Fetch all sessions for a user ─────────────────────────────────────────────

export async function fetchUserSessions(userId: string, limit = 50) {
  const { data, error } = await supabase
    .from('swing_sessions')
    .select('*')
    .eq('user_id', userId)
    .order('recorded_at', { ascending: false })
    .limit(limit);

  return { sessions: data ?? [], error };
}
