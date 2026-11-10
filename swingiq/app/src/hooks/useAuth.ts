/**
 * useAuth Hook
 * ------------
 * Provides reactive auth state to any component.
 *
 * Usage:
 *   const { user, profile, loading, signIn, signOut } = useAuth();
 *
 * HOW IT WORKS
 * ------------
 * Supabase fires onAuthStateChange() whenever the session changes
 * (login, logout, token refresh, app resume). We subscribe to that
 * event here and update the local state accordingly.
 *
 * On mount:
 *   1. Check AsyncStorage for an existing session (instant, no network call)
 *   2. If found, restore it and fetch the profile
 *   3. Subscribe to future auth changes
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase, SupabaseProfile } from '../services/supabase';
import {
  signIn  as authSignIn,
  signUp  as authSignUp,
  signOut as authSignOut,
  sendPasswordReset,
  fetchProfile,
  updateProfile as authUpdateProfile,
  saveSwingSession,
  fetchUserSessions,
} from '../services/auth.service';

interface AuthUser {
  id:    string;
  email: string;
}

interface UseAuthReturn {
  // State
  user:       AuthUser | null;
  profile:    SupabaseProfile | null;
  loading:    boolean;  // true while restoring session on app start
  authReady:  boolean;  // true once initial session check is done

  // Actions
  signIn:  (email: string, password: string) => Promise<string | null>; // returns error msg or null
  signUp:  (email: string, password: string, displayName: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<string | null>;
  updateProfile: (updates: Partial<SupabaseProfile>) => Promise<string | null>;
  syncSession: (session: any) => Promise<void>; // save a new swing session to Supabase
  loadRemoteSessions: () => Promise<any[]>;      // fetch sessions from Supabase
  refreshProfile: () => Promise<void>;
}

export function useAuth(): UseAuthReturn {
  const [user,      setUser]      = useState<AuthUser | null>(null);
  const [profile,   setProfile]   = useState<SupabaseProfile | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [authReady, setAuthReady] = useState(false);

  // ── Subscribe to auth state changes ────────────────────────────────────────
  useEffect(() => {
    // Get current session immediately from cache (no network)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser({ id: session.user.id, email: session.user.email! });
        fetchProfile(session.user.id).then(p => {
          setProfile(p);
          setLoading(false);
          setAuthReady(true);
        });
      } else {
        setLoading(false);
        setAuthReady(true);
      }
    });

    // Listen for future changes (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (session?.user) {
          const u = { id: session.user.id, email: session.user.email! };
          setUser(u);
          const p = await fetchProfile(u.id);
          setProfile(p);
        } else {
          setUser(null);
          setProfile(null);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  // ── Sign in ────────────────────────────────────────────────────────────────
  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await authSignIn(email, password);
    return error?.message ?? null;
  }, []);

  // ── Sign up ────────────────────────────────────────────────────────────────
  const signUp = useCallback(async (email: string, password: string, displayName: string) => {
    const { error } = await authSignUp(email, password, displayName);
    return error?.message ?? null;
  }, []);

  // ── Sign out ───────────────────────────────────────────────────────────────
  const signOut = useCallback(async () => {
    await authSignOut();
    setUser(null);
    setProfile(null);
  }, []);

  // ── Password reset ─────────────────────────────────────────────────────────
  const resetPassword = useCallback(async (email: string) => {
    const { error } = await sendPasswordReset(email);
    return error?.message ?? null;
  }, []);

  // ── Update profile ─────────────────────────────────────────────────────────
  const updateProfile = useCallback(async (updates: Partial<SupabaseProfile>) => {
    if (!user) return 'Not signed in';
    const { error } = await authUpdateProfile(user.id, updates as any);
    if (!error) {
      // Optimistic local update
      setProfile(prev => prev ? { ...prev, ...updates } : prev);
    }
    return error?.message ?? null;
  }, [user]);

  // ── Refresh profile from server ────────────────────────────────────────────
  const refreshProfile = useCallback(async () => {
    if (!user) return;
    const p = await fetchProfile(user.id);
    setProfile(p);
  }, [user]);

  // ── Save a swing session to Supabase ───────────────────────────────────────
  const syncSession = useCallback(async (session: any) => {
    if (!user) return; // Not signed in — session already saved locally
    const { error } = await saveSwingSession(user.id, session);
    if (error) console.warn('syncSession error:', error);
  }, [user]);

  // ── Load remote sessions ───────────────────────────────────────────────────
  const loadRemoteSessions = useCallback(async () => {
    if (!user) return [];
    const { sessions } = await fetchUserSessions(user.id);
    return sessions;
  }, [user]);

  return {
    user, profile, loading, authReady,
    signIn, signUp, signOut, resetPassword,
    updateProfile, refreshProfile,
    syncSession, loadRemoteSessions,
  };
}
