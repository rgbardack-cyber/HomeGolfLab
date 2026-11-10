import { motion } from 'framer-motion';
import { getLevelFromXp } from '@/lib/badges';
import { Zap } from 'lucide-react';
import { useLang } from '@/lib/i18n.jsx';

export default function LevelBanner({ xp = 0 }) {
  const { t } = useLang();
  const lvl = getLevelFromXp(xp);

  return (
    <div className="bg-card rounded-2xl border border-border p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-12 h-12 rounded-xl ${lvl.bg} flex items-center justify-center text-2xl font-heading font-black`}>
            {lvl.level}
          </div>
          <div>
            <p className={`font-heading font-bold text-lg ${lvl.color}`}>{lvl.label}</p>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Zap className="w-3 h-3 text-accent" />
              <span>{xp} {t('totalXp')}</span>
            </div>
          </div>
        </div>
        {lvl.next && (
          <div className="text-right">
            <p className="text-xs text-muted-foreground">{t('nextLevel')}</p>
            <p className="text-sm font-bold">{lvl.next.label}</p>
            <p className="text-xs text-muted-foreground">{lvl.next.minXp - xp} {t('xpRemaining')}</p>
          </div>
        )}
      </div>

      <div className="space-y-1">
        <div className="w-full h-3 bg-muted rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${lvl.progress}%` }}
            transition={{ duration: 1, ease: 'easeOut' }}
            className={`h-full rounded-full bg-gradient-to-r ${lvl.next ? 'from-primary to-accent' : 'from-amber-400 to-amber-600'}`}
          />
        </div>
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>{t('levelLabel')} {lvl.level}</span>
          {lvl.next ? <span>{t('levelLabel')} {lvl.next.level} — {lvl.next.minXp} XP</span> : <span>{t('maxLevel')}</span>}
        </div>
      </div>
    </div>
  );
}