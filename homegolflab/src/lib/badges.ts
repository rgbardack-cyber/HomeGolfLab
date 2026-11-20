/** Medallas: de cumplimiento (constancia) y de mérito (resultados). */

export interface SessionLite {
  type: 'swing' | 'homelab' | 'tracking';
  mode: 'casa' | 'cancha';
  date: string;            // YYYY-MM-DD
  score?: number;          // swing: 0–100
  tempoRatio?: number;
  shots?: number;          // tracking: tiros de la sesión
  onLineStreak?: number;   // tracking: mejor racha de putts en línea
  consistency?: number;    // tracking: 0–100
  live?: boolean;
  /** Seguimiento de UN tiro desde video (F5.7): no es una sesión de dispersión, no cuenta para tiros, rachas ni medallas de tracking. */
  flightOnly?: boolean;
}

export type BadgeKind = 'cumplimiento' | 'merito';
export interface Badge { id: string; kind: BadgeKind; label: string; description: string; emoji: string; xp: number; test: (s: Stats) => boolean }

export interface Stats {
  total: number; swing: number; homelab: number; tracking: number; shots: number;
  streak: number; bestStreak: number; modes: number; bestScore: number; live: number;
  idealTempo: number; bestOnLine: number; bestConsistency: number; improved: boolean;
}

const dayNum = (d: string) => Math.round(new Date(d + 'T12:00:00').getTime() / 86400000);

export function computeStats(sessions: SessionLite[], todayISO: string): Stats {
  const days = [...new Set(sessions.map((s) => dayNum(s.date)))].sort((a, b) => a - b);
  let best = 0, run = 0;
  for (let i = 0; i < days.length; i++) { run = i && days[i] === days[i - 1] + 1 ? run + 1 : 1; best = Math.max(best, run); }
  // racha vigente: termina hoy o ayer
  let streak = 0;
  const today = dayNum(todayISO);
  const set = new Set(days);
  let d = set.has(today) ? today : today - 1;
  while (set.has(d)) { streak++; d--; }

  const swings = sessions.filter((s) => s.type === 'swing' && s.score != null).sort((a, b) => a.date.localeCompare(b.date));
  const avg = (a: SessionLite[]) => a.reduce((s, x) => s + (x.score ?? 0), 0) / a.length;
  const improved = swings.length >= 6 && avg(swings.slice(-3)) >= avg(swings.slice(0, 3)) + 5;
  const tracking = sessions.filter((s) => s.type === 'tracking' && !s.flightOnly);

  return {
    total: sessions.length,
    swing: sessions.filter((s) => s.type === 'swing').length,
    homelab: sessions.filter((s) => s.type === 'homelab').length,
    tracking: tracking.length,
    shots: tracking.reduce((s, x) => s + (x.shots ?? 0), 0),
    streak, bestStreak: best,
    modes: new Set(sessions.map((s) => s.mode)).size,
    bestScore: Math.max(0, ...swings.map((s) => s.score ?? 0)),
    live: sessions.filter((s) => s.live).length,
    idealTempo: swings.filter((s) => s.tempoRatio != null && s.tempoRatio >= 2.6 && s.tempoRatio <= 3.4).length,
    bestOnLine: Math.max(0, ...tracking.map((s) => s.onLineStreak ?? 0)),
    bestConsistency: Math.max(0, ...tracking.filter((s) => (s.shots ?? 0) >= 5).map((s) => s.consistency ?? 0)),
    improved,
  };
}

export const BADGES: Badge[] = [
  // Cumplimiento
  { id: 'first_session', kind: 'cumplimiento', emoji: '🏌️', xp: 50, label: 'Primera sesión', description: 'Completaste tu primera sesión de práctica.', test: (s) => s.total >= 1 },
  { id: 'first_swing', kind: 'cumplimiento', emoji: '🎥', xp: 50, label: 'Primer swing', description: 'Analizaste tu primer swing.', test: (s) => s.swing >= 1 },
  { id: 'first_homelab', kind: 'cumplimiento', emoji: '🏠', xp: 50, label: 'HomeLAB estrenado', description: 'Completaste tu primera sesión de HomeLAB.', test: (s) => s.homelab >= 1 },
  { id: 'first_tracking', kind: 'cumplimiento', emoji: '📡', xp: 50, label: 'En la mira', description: 'Registraste tu primera sesión de ball tracking.', test: (s) => s.tracking >= 1 },
  { id: 'sessions_5', kind: 'cumplimiento', emoji: '⭐', xp: 100, label: '5 sesiones', description: 'Cinco sesiones completadas.', test: (s) => s.total >= 5 },
  { id: 'sessions_20', kind: 'cumplimiento', emoji: '🌟', xp: 200, label: '20 sesiones', description: 'Veinte sesiones completadas.', test: (s) => s.total >= 20 },
  { id: 'sessions_50', kind: 'cumplimiento', emoji: '🏆', xp: 500, label: 'Veterano', description: 'Cincuenta sesiones: la constancia es tuya.', test: (s) => s.total >= 50 },
  { id: 'streak_3', kind: 'cumplimiento', emoji: '🔥', xp: 100, label: 'Racha de 3 días', description: 'Practicaste tres días seguidos.', test: (s) => s.bestStreak >= 3 },
  { id: 'streak_7', kind: 'cumplimiento', emoji: '🗓️', xp: 250, label: 'Semana completa', description: 'Siete días seguidos de práctica.', test: (s) => s.bestStreak >= 7 },
  { id: 'streak_30', kind: 'cumplimiento', emoji: '💪', xp: 800, label: 'Mes imparable', description: 'Treinta días seguidos de práctica.', test: (s) => s.bestStreak >= 30 },
  { id: 'homelab_10', kind: 'cumplimiento', emoji: '🧪', xp: 250, label: 'Científico del HomeLAB', description: 'Diez sesiones de HomeLAB completadas.', test: (s) => s.homelab >= 10 },
  { id: 'shots_100', kind: 'cumplimiento', emoji: '🎯', xp: 300, label: '100 tiros', description: 'Cien tiros registrados en ball tracking.', test: (s) => s.shots >= 100 },
  { id: 'both_modes', kind: 'cumplimiento', emoji: '⛳', xp: 150, label: 'Casa y cancha', description: 'Practicaste en casa y también en la cancha.', test: (s) => s.modes >= 2 },
  // Mérito
  { id: 'score_80', kind: 'merito', emoji: '🥈', xp: 200, label: 'Swing sólido', description: 'Un swing con nota de 80 o más.', test: (s) => s.bestScore >= 80 },
  { id: 'score_90', kind: 'merito', emoji: '🥇', xp: 500, label: 'Swing de élite', description: 'Un swing con nota de 90 o más.', test: (s) => s.bestScore >= 90 },
  { id: 'tempo_3', kind: 'merito', emoji: '🎼', xp: 300, label: 'Metrónomo', description: 'Tres swings con tempo ideal (2.6–3.4 a 1).', test: (s) => s.idealTempo >= 3 },
  { id: 'online_5', kind: 'merito', emoji: '📏', xp: 300, label: 'Cinco en línea', description: 'Cinco putts seguidos en línea en una sesión.', test: (s) => s.bestOnLine >= 5 },
  { id: 'consistency_80', kind: 'merito', emoji: '🏹', xp: 400, label: 'Precisión', description: 'Consistencia de 80 % o más en una sesión de 5+ tiros.', test: (s) => s.bestConsistency >= 80 },
  { id: 'improved', kind: 'merito', emoji: '📈', xp: 400, label: 'En progreso', description: 'Tus últimos 3 swings promedian 5 puntos más que los 3 primeros.', test: (s) => s.improved },
  { id: 'live_1', kind: 'merito', emoji: '⚡', xp: 150, label: 'En vivo', description: 'Completaste una sesión de análisis en vivo.', test: (s) => s.live >= 1 },
];

/** Devuelve los ids de medallas que corresponden y aún no están ganadas. */
export function newBadges(stats: Stats, earned: string[]): string[] {
  const have = new Set(earned);
  return BADGES.filter((b) => !have.has(b.id) && b.test(stats)).map((b) => b.id);
}

export const LEVELS = [
  { level: 1, label: 'Principiante', minXp: 0 },
  { level: 2, label: 'Amateur', minXp: 200 },
  { level: 3, label: 'Aficionado', minXp: 600 },
  { level: 4, label: 'Semipro', minXp: 1200 },
  { level: 5, label: 'Profesional', minXp: 2500 },
  { level: 6, label: 'Tour Player', minXp: 5000 },
];

export function totalXp(earned: string[]) {
  const ids = new Set(earned); // un id cuenta una sola vez
  return BADGES.reduce((s, b) => s + (ids.has(b.id) ? b.xp : 0), 0);
}

export function levelFor(xp: number) {
  let i = 0;
  LEVELS.forEach((l, k) => { if (xp >= l.minXp) i = k; });
  const cur = LEVELS[i], next = LEVELS[i + 1] ?? null;
  return { ...cur, next, xp, progress: next ? Math.min(100, ((xp - cur.minXp) / (next.minXp - cur.minXp)) * 100) : 100 };
}
