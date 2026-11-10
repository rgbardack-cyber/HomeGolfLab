// Badge definitions and evaluation logic
export const BADGES = [
  // ── Primeros pasos ─────────────────────────────────────────────────────────
  {
    id: 'first_session',
    label: 'Primera sesión',
    description: 'Completaste tu primera sesión de práctica',
    emoji: '🏌️',
    color: 'from-blue-400 to-blue-600',
    category: 'inicio',
    xp: 50,
  },
  {
    id: 'first_swing',
    label: 'Primer swing',
    description: 'Realizaste tu primer análisis de swing',
    emoji: '🎯',
    color: 'from-green-400 to-green-600',
    category: 'inicio',
    xp: 50,
  },
  {
    id: 'first_tracking',
    label: 'En la mira',
    description: 'Registraste tu primer tiro con el Shot Tracker',
    emoji: '📡',
    color: 'from-purple-400 to-purple-600',
    category: 'inicio',
    xp: 50,
  },

  // ── Volumen de sesiones ─────────────────────────────────────────────────────
  {
    id: 'sessions_5',
    label: '5 sesiones',
    description: 'Completaste 5 sesiones de práctica',
    emoji: '⭐',
    color: 'from-yellow-400 to-yellow-600',
    category: 'dedicación',
    xp: 100,
  },
  {
    id: 'sessions_20',
    label: '20 sesiones',
    description: 'Completaste 20 sesiones de práctica',
    emoji: '🌟',
    color: 'from-orange-400 to-orange-600',
    category: 'dedicación',
    xp: 200,
  },
  {
    id: 'sessions_50',
    label: 'Veterano',
    description: '50 sesiones completadas — ¡eres constante!',
    emoji: '🏆',
    color: 'from-amber-400 to-amber-600',
    category: 'dedicación',
    xp: 500,
  },

  // ── Tiros perfectos (tracking) ──────────────────────────────────────────────
  {
    id: 'shots_10',
    label: '10 tiros',
    description: 'Registraste 10 tiros en el Shot Tracker',
    emoji: '🔥',
    color: 'from-red-400 to-red-600',
    category: 'tracking',
    xp: 100,
  },
  {
    id: 'shots_50',
    label: '50 tiros',
    description: 'Registraste 50 tiros en el Shot Tracker',
    emoji: '💥',
    color: 'from-red-500 to-pink-600',
    category: 'tracking',
    xp: 250,
  },
  {
    id: 'shots_100',
    label: '100 tiros',
    description: '¡100 tiros registrados! Verdadero practicante',
    emoji: '🎖️',
    color: 'from-rose-400 to-red-700',
    category: 'tracking',
    xp: 500,
  },
  {
    id: 'perfect_10',
    label: 'Tiro perfecto',
    description: 'Obtuviste puntuación 10/10 en un tiro',
    emoji: '💎',
    color: 'from-cyan-400 to-blue-600',
    category: 'calidad',
    xp: 200,
  },
  {
    id: 'five_perfect_session',
    label: '5 tiros top',
    description: '5 tiros con puntuación ≥9 en una sola sesión',
    emoji: '🌈',
    color: 'from-fuchsia-400 to-purple-600',
    category: 'calidad',
    xp: 300,
  },

  // ── Sesiones largas ─────────────────────────────────────────────────────────
  {
    id: 'session_60min',
    label: 'Maratón 1h',
    description: 'Completaste una sesión de tracking de 1 hora',
    emoji: '⏱️',
    color: 'from-teal-400 to-teal-600',
    category: 'resistencia',
    xp: 200,
  },
  {
    id: 'session_120min',
    label: 'Maratón 2h',
    description: 'Completaste una sesión de tracking de 2 horas',
    emoji: '⏰',
    color: 'from-emerald-400 to-green-700',
    category: 'resistencia',
    xp: 500,
  },

  // ── Consistencia (dispersión) ───────────────────────────────────────────────
  {
    id: 'consistency_low',
    label: 'Tiro consistente',
    description: 'Dispersión lateral ≤5m en una sesión de ≥5 tiros',
    emoji: '🎯',
    color: 'from-lime-400 to-green-600',
    category: 'consistencia',
    xp: 300,
  },
  {
    id: 'consistency_master',
    label: 'Maestro de la precisión',
    description: 'Dispersión lateral ≤3m en una sesión de ≥8 tiros',
    emoji: '🏹',
    color: 'from-green-500 to-emerald-700',
    category: 'consistencia',
    xp: 600,
  },

  // ── Mejora ──────────────────────────────────────────────────────────────────
  {
    id: 'score_improvement',
    label: 'En progreso',
    description: 'Mejoraste tu puntuación promedio un 5% vs. semana anterior',
    emoji: '📈',
    color: 'from-sky-400 to-blue-600',
    category: 'mejora',
    xp: 300,
  },
  {
    id: 'handicap_down',
    label: 'Handicap mejorado',
    description: 'Actualizaste tu handicap a un valor más bajo',
    emoji: '⛳',
    color: 'from-green-400 to-emerald-600',
    category: 'mejora',
    xp: 400,
  },

  // ── Challenges ──────────────────────────────────────────────────────────────
  {
    id: 'first_challenge',
    label: 'Competidor',
    description: 'Te registraste en tu primer challenge mensual',
    emoji: '🥊',
    color: 'from-indigo-400 to-indigo-600',
    category: 'challenges',
    xp: 150,
  },
  {
    id: 'challenge_top3',
    label: 'Podio',
    description: 'Terminaste en el top 3 de un challenge',
    emoji: '🥇',
    color: 'from-yellow-300 to-amber-500',
    category: 'challenges',
    xp: 800,
  },
];

// XP thresholds for each level
export const LEVELS = [
  { level: 1, label: 'Principiante',  minXp: 0,    color: 'text-gray-500',    bg: 'bg-gray-100' },
  { level: 2, label: 'Amateur',       minXp: 200,  color: 'text-green-600',   bg: 'bg-green-100' },
  { level: 3, label: 'Aficionado',    minXp: 600,  color: 'text-blue-600',    bg: 'bg-blue-100' },
  { level: 4, label: 'Semipro',       minXp: 1200, color: 'text-purple-600',  bg: 'bg-purple-100' },
  { level: 5, label: 'Profesional',   minXp: 2500, color: 'text-amber-600',   bg: 'bg-amber-100' },
  { level: 6, label: 'Tour Player',   minXp: 5000, color: 'text-rose-600',    bg: 'bg-rose-100' },
];

export function getLevelFromXp(xp) {
  let current = LEVELS[0];
  for (const lvl of LEVELS) {
    if (xp >= lvl.minXp) current = lvl;
  }
  const idx = LEVELS.indexOf(current);
  const next = LEVELS[idx + 1] || null;
  const progress = next
    ? ((xp - current.minXp) / (next.minXp - current.minXp)) * 100
    : 100;
  return { ...current, next, progress: Math.min(progress, 100), xp };
}

export function getTotalXp(earnedBadgeIds) {
  return earnedBadgeIds.reduce((sum, id) => {
    const b = BADGES.find(b => b.id === id);
    return sum + (b?.xp || 0);
  }, 0);
}

/**
 * Evaluates which new badges the user should earn given their stats.
 * Returns array of badge ids NOT yet in earnedBadgeIds.
 */
export function evaluateNewBadges({ sessions, earnedBadgeIds, entries = [] }) {
  const earned = new Set(earnedBadgeIds);
  const newBadges = [];

  const check = (id, condition) => {
    if (!earned.has(id) && condition) newBadges.push(id);
  };

  const totalSessions = sessions.length;
  const trackingSessions = sessions.filter(s => s.type === 'ball_tracking');
  const swingSessions = sessions.filter(s => s.type === 'swing_analysis');

  // Count total shots across all tracking sessions
  let totalShots = 0;
  let hasPerfect10 = false;
  let hasConsistencyLow = false;
  let hasConsistencyMaster = false;
  let hasLong60 = false;
  let hasLong120 = false;
  let fivePerfectInSession = false;

  for (const s of trackingSessions) {
    if (!s.ai_analysis) continue;
    let data;
    try { data = JSON.parse(s.ai_analysis); } catch { continue; }

    // Session-level shot count (stored as array in some sessions)
    if (data.shot_number) totalShots = Math.max(totalShots, data.shot_number);
    if (data.quality_score === 10) hasPerfect10 = true;

    // Long session detection via notes field: "Sesión X min"
    const notes = s.notes || '';
    const minMatch = notes.match(/Sesión (\d+) min/);
    if (minMatch) {
      const m = parseInt(minMatch[1]);
      if (m >= 60) hasLong60 = true;
      if (m >= 120) hasLong120 = true;
    }
  }

  // Aggregate shots from all sessions using shot_number
  const maxShotNums = trackingSessions.map(s => {
    try { return JSON.parse(s.ai_analysis || '{}').shot_number || 0; } catch { return 0; }
  });
  totalShots = maxShotNums.reduce((a, b) => a + b, 0);

  // Score improvement: compare last 7 days vs prior 7 days
  const now = new Date();
  const oneWeekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
  const twoWeeksAgo = new Date(now - 14 * 24 * 60 * 60 * 1000);
  const recentScored = sessions.filter(s => s.score && new Date(s.date) >= oneWeekAgo);
  const prevScored = sessions.filter(s => s.score && new Date(s.date) >= twoWeeksAgo && new Date(s.date) < oneWeekAgo);
  const recentAvg = recentScored.length ? recentScored.reduce((a, s) => a + s.score, 0) / recentScored.length : null;
  const prevAvg = prevScored.length ? prevScored.reduce((a, s) => a + s.score, 0) / prevScored.length : null;
  const improved5pct = recentAvg && prevAvg && recentAvg >= prevAvg * 1.05;

  check('first_session', totalSessions >= 1);
  check('first_swing', swingSessions.length >= 1);
  check('first_tracking', trackingSessions.length >= 1);
  check('sessions_5', totalSessions >= 5);
  check('sessions_20', totalSessions >= 20);
  check('sessions_50', totalSessions >= 50);
  check('shots_10', totalShots >= 10);
  check('shots_50', totalShots >= 50);
  check('shots_100', totalShots >= 100);
  check('perfect_10', hasPerfect10);
  check('session_60min', hasLong60);
  check('session_120min', hasLong120);
  check('score_improvement', improved5pct);
  check('first_challenge', entries.length >= 1);

  return newBadges;
}