import { motion } from 'framer-motion';
import { BADGES } from '@/lib/badges';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export default function BadgeCard({ badgeId, earnedAt, locked = false, index = 0 }) {
  const def = BADGES.find(b => b.id === badgeId);
  if (!def) return null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: index * 0.04, type: 'spring', stiffness: 200 }}
      className={`relative flex flex-col items-center gap-2 p-3 rounded-2xl border-2 transition-all ${
        locked
          ? 'border-border bg-muted/40 opacity-40 grayscale'
          : 'border-primary/20 bg-card shadow-sm'
      }`}
    >
      {/* Glow effect for earned */}
      {!locked && (
        <div className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${def.color} opacity-5`} />
      )}

      {/* Badge emoji */}
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl ${locked ? 'bg-muted' : `bg-gradient-to-br ${def.color}`}`}>
        {locked ? '🔒' : def.emoji}
      </div>

      <div className="text-center relative">
        <p className="text-xs font-bold leading-tight">{def.label}</p>
        <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{def.description}</p>
        {!locked && earnedAt && (
          <p className="text-[9px] text-primary/70 mt-1 font-medium">
            {format(new Date(earnedAt), 'd MMM yyyy', { locale: es })}
          </p>
        )}
        {!locked && (
          <p className="text-[10px] font-bold text-accent mt-0.5">+{def.xp} XP</p>
        )}
      </div>
    </motion.div>
  );
}