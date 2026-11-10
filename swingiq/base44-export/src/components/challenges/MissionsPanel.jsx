import { motion } from 'framer-motion';
import { Star, Zap, Target, Flame, Trophy, CheckCircle2, Lock } from 'lucide-react';

// All daily bonus missions
export const MISSIONS = [
  {
    id: 'perfect_10',
    icon: Star,
    title: '¡Perfección! 10/10',
    description: 'Emboca los 10 tiros en un día',
    bonus: 10,
    color: 'text-accent',
    bg: 'bg-accent/10',
    border: 'border-accent/20',
    check: (shots) => shots >= 10,
  },
  {
    id: 'streak_3',
    icon: Flame,
    title: 'Racha de 3',
    description: '3 tiros consecutivos embocados',
    bonus: 3,
    color: 'text-orange-500',
    bg: 'bg-orange-500/10',
    border: 'border-orange-500/20',
    check: (shots, streaks) => streaks >= 3,
  },
  {
    id: 'streak_5',
    icon: Zap,
    title: 'Racha de 5',
    description: '5 tiros consecutivos embocados',
    bonus: 5,
    color: 'text-yellow-500',
    bg: 'bg-yellow-500/10',
    border: 'border-yellow-500/20',
    check: (shots, streaks) => streaks >= 5,
  },
  {
    id: 'half_way',
    icon: Target,
    title: 'Mitad del Camino',
    description: 'Emboca 5 o más de 10 tiros',
    bonus: 2,
    color: 'text-blue-500',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/20',
    check: (shots) => shots >= 5,
  },
  {
    id: 'consistency',
    icon: Trophy,
    title: 'Constancia',
    description: 'Sube video 7 días seguidos',
    bonus: 15,
    color: 'text-primary',
    bg: 'bg-primary/10',
    border: 'border-primary/20',
    check: () => false, // tracked server-side
    isStreakBased: true,
  },
];

export function calculateMissionBonuses(shotsMade, maxStreak) {
  let bonus = 0;
  const achieved = [];

  MISSIONS.forEach(mission => {
    if (mission.isStreakBased) return;
    if (mission.check(shotsMade, maxStreak)) {
      bonus += mission.bonus;
      achieved.push(mission.id);
    }
  });

  return { bonus, achieved };
}

export default function MissionsPanel({ shotsMade = 0, maxStreak = 0, achievedIds = [], compact = false }) {
  if (compact) {
    return (
      <div className="flex flex-wrap gap-2">
        {MISSIONS.filter(m => !m.isStreakBased).map(mission => {
          const achieved = achievedIds.includes(mission.id) || mission.check(shotsMade, maxStreak);
          return (
            <div
              key={mission.id}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border text-xs font-medium transition-all ${
                achieved
                  ? `${mission.bg} ${mission.border} ${mission.color}`
                  : 'bg-muted border-border text-muted-foreground'
              }`}
            >
              <mission.icon className="w-3.5 h-3.5" />
              +{mission.bonus}pts
              {achieved && <CheckCircle2 className="w-3 h-3" />}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h3 className="font-heading font-semibold flex items-center gap-2">
        <Star className="w-5 h-5 text-accent" /> Misiones del Día
      </h3>
      <div className="space-y-2">
        {MISSIONS.map((mission, i) => {
          const achieved = achievedIds.includes(mission.id) || (!mission.isStreakBased && mission.check(shotsMade, maxStreak));
          return (
            <motion.div
              key={mission.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                achieved
                  ? `${mission.bg} ${mission.border}`
                  : 'bg-card border-border opacity-60'
              }`}
            >
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${mission.bg}`}>
                <mission.icon className={`w-5 h-5 ${achieved ? mission.color : 'text-muted-foreground'}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className={`font-medium text-sm ${achieved ? mission.color : 'text-foreground'}`}>
                  {mission.title}
                </p>
                <p className="text-xs text-muted-foreground">{mission.description}</p>
              </div>
              <div className="text-right shrink-0">
                <p className={`font-heading font-bold text-sm ${achieved ? mission.color : 'text-muted-foreground'}`}>
                  +{mission.bonus} pts
                </p>
                {achieved && <CheckCircle2 className={`w-4 h-4 ${mission.color} ml-auto`} />}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}