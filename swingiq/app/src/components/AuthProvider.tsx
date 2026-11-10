/**
 * AuthProvider + useAuthContext
 * ------------------------------
 * Wraps the entire app with a React Context so any screen can access
 * auth state without prop-drilling.
 *
 * Usage in any screen:
 *   const { user, profile, signOut } = useAuthContext();
 *
 * Add <AuthProvider> inside the root _layout.tsx (see integration notes).
 */

import React, { createContext, useContext, ReactNode } from 'react';
import { useAuth } from '../hooks/useAuth';
import type { SupabaseProfile } from '../services/supabase';

// ── Context type ──────────────────────────────────────────────────────────────

interface AuthContextValue {
  user:       { id: string; email: string } | null;
  profile:    SupabaseProfile | null;
  loading:    boolean;
  authReady:  boolean;
  isSignedIn: boolean;

  signIn:           (email: string, password: string) => Promise<string | null>;
  signUp:           (email: string, password: string, displayName: string) => Promise<string | null>;
  signOut:          () => Promise<void>;
  resetPassword:    (email: string) => Promise<string | null>;
  updateProfile:    (updates: Partial<SupabaseProfile>) => Promise<string | null>;
  refreshProfile:   () => Promise<void>;
  syncSession:      (session: any) => Promise<void>;
  loadRemoteSessions: () => Promise<any[]>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// ── Provider component ────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();

  const value: AuthContextValue = {
    ...auth,
    isSignedIn: !!auth.user,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

// ── Consumer hook ─────────────────────────────────────────────────────────────

export function useAuthContext(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuthContext must be used inside <AuthProvider>');
  }
  return ctx;
}
