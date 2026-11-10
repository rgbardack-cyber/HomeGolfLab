/**
 * SwingIQ — Tracking API Service (Mobile)
 * -----------------------------------------
 * Calls the ball tracking endpoints on the FastAPI backend.
 * Reads the Supabase Bearer token for authenticated requests.
 */

import { supabase } from './supabase';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TrackPoint {
  x:            number;  // normalised 0–1
  y:            number;
  frame_idx:    number;
  timestamp_ms: number;
}

export interface LaunchMetrics {
  shot_type:         'putt' | 'chip' | 'full_swing';
  launch_angle_deg:  number;
  direction_deg:     number;
  ball_speed_mph:    number;
  carry_distance_yd: number;
  max_height_rel:    number;
  apex_frame:        number;
  total_frames:      number;
  confidence:        number;
}

export interface TrackingResult {
  shot_id:             string;
  metrics:             LaunchMetrics;
  track_points:        TrackPoint[];
  frame_width:         number;
  frame_height:        number;
  processing_time_sec: number;
}

export interface ShotRecord {
  shot_id:       string;
  shot_type:     string;
  lateral_yd:    number;
  carry_yd:      number;
  speed_mph:     number;
  angle_deg:     number;
  direction_deg: number;
  recorded_at:   string;
}

export interface DispersionData {
  stats: {
    count:            number;
    avg_carry_yd:     number;
    avg_speed_mph:    number;
    lateral_std_yd:   number;
    carry_std_yd:     number;
    max_carry_yd:     number;
    min_carry_yd:     number;
    consistency_pct:  number;
  };
  landing_points: Array<{
    lateral_yd: number;
    carry_yd:   number;
    shot_type:  string;
  }>;
}

// ── Auth header ───────────────────────────────────────────────────────────────

async function authHeader(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Not authenticated');
  return { Authorization: `Bearer ${session.access_token}` };
}

async function handleRes<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.detail ?? `Server error ${res.status}`);
  }
  return res.json();
}

// ── analyseShot ───────────────────────────────────────────────────────────────
/**
 * Sends a video clip to the tracking backend.
 * Returns launch metrics and a track path for overlay rendering.
 */
export async function analyseShot(videoUri: string): Promise<TrackingResult> {
  const headers = await authHeader();
  const form    = new FormData();

  form.append('video', {
    uri:  videoUri,
    name: 'shot.mp4',
    type: 'video/mp4',
  } as any);

  const res = await fetch(`${BASE_URL}/api/v1/track/analyse`, {
    method:  'POST',
    headers,
    body:    form,
  });

  return handleRes<TrackingResult>(res);
}

// ── getShots ──────────────────────────────────────────────────────────────────
export async function getShots(shotType?: string, limit = 100): Promise<ShotRecord[]> {
  const headers = await authHeader();
  const params  = new URLSearchParams({ limit: String(limit) });
  if (shotType) params.set('shot_type', shotType);

  const res = await fetch(`${BASE_URL}/api/v1/track/shots?${params}`, { headers });
  const data = await handleRes<{ shots: ShotRecord[] }>(res);
  return data.shots;
}

// ── getDispersion ─────────────────────────────────────────────────────────────
export async function getDispersion(shotType?: string): Promise<DispersionData> {
  const headers = await authHeader();
  const params  = new URLSearchParams();
  if (shotType) params.set('shot_type', shotType);

  const res = await fetch(`${BASE_URL}/api/v1/track/dispersion?${params}`, { headers });
  return handleRes<DispersionData>(res);
}
