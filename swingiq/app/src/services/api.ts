/**
 * SwingIQ API Service — Authenticated Version
 * ---------------------------------------------
 * Drop-in replacement for src/services/api.ts.
 *
 * Changes from the original:
 *   - Every request includes the Supabase Bearer token
 *   - analyzeSwing() reads the token from the Supabase session
 *   - Handles 401 responses by triggering a sign-out
 *
 * The token is read from supabase.auth.getSession() on each call
 * (Supabase auto-refreshes it in the background, so it's always current).
 */

import { supabase } from './supabase';
import type { SwingSession } from '@/store';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000';

// ── Auth header helper ────────────────────────────────────────────────────────

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error('Not authenticated. Please sign in.');
  }
  return {
    Authorization: `Bearer ${session.access_token}`,
  };
}

// ── Response handler ──────────────────────────────────────────────────────────

async function handleResponse<T>(res: Response): Promise<T> {
  if (res.status === 401) {
    // Token expired or invalid — sign out so the user is redirected to login
    await supabase.auth.signOut();
    throw { message: 'Session expired. Please sign in again.', status: 401 };
  }
  if (!res.ok) {
    let message = `Server error (${res.status})`;
    try {
      const body = await res.json();
      message = body?.detail ?? message;
    } catch {}
    throw { message, status: res.status };
  }
  return res.json() as Promise<T>;
}

// ── API calls ─────────────────────────────────────────────────────────────────

export interface AnalyzeSwingParams {
  videoUri:     string;
  playerName:   string;
  skillLevel:   string;
  clubUsed:     string;
  knownIssues?: string[];
}

export async function analyzeSwing(params: AnalyzeSwingParams): Promise<SwingSession> {
  const authHeaders = await getAuthHeaders();

  const form = new FormData();
  form.append('video', {
    uri:  params.videoUri,
    name: 'swing.mp4',
    type: 'video/mp4',
  } as any);
  form.append('player_name',  params.playerName);
  form.append('skill_level',  params.skillLevel);
  form.append('club_used',    params.clubUsed);
  if (params.knownIssues?.length) {
    form.append('known_issues', params.knownIssues.join(','));
  }

  const res = await fetch(`${BASE_URL}/api/v1/analyze`, {
    method:  'POST',
    headers: authHeaders,   // No Content-Type — fetch sets multipart boundary
    body:    form,
  });

  const data = await handleResponse<SwingSession>(res);
  return { ...data, recorded_at: new Date().toISOString() };
}

export async function listSessions(limit = 20) {
  const authHeaders = await getAuthHeaders();
  const res = await fetch(`${BASE_URL}/api/v1/sessions?limit=${limit}`, {
    headers: authHeaders,
  });
  return handleResponse<{ sessions: Partial<SwingSession>[]; total: number }>(res);
}

export async function healthCheck(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/health/`, {
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
