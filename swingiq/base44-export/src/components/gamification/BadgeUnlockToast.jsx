import { motion, AnimatePresence } from 'framer-motion';
import { BADGES } from '@/lib/badges';
import { useEffect, useState } from 'react';
import { useLang } from '@/lib/i18n.jsx';

export default function BadgeUnlockToast({ newBadgeIds = [], onDone }) {
  const { t } = useLang();
  const [queue, setQueue] = useState([...newBadgeIds]);
  const [current, setCurrent] = useState(null);

  useEffect(() => {
    if (newBadgeIds.length > 0) setQueue([...newBadgeIds]);
  }, [newBadgeIds.join(',')]);

  useEffect(() => {
    if (queue.length > 0 && !current) {
      const [next, ...rest] = queue;
      setCurrent(next);
      setQueue(rest);
      const timer = setTimeout(() => {
        setCurrent(null);
        if (rest.length === 0 && onDone) onDone();
      }, 3500);
      return () => clearTimeout(timer);
    }
  }, [queue, current]);

  const def = BADGES.find(b => b.id === current);

  return (
    <AnimatePresence>
      {current && def && (
        <motion.div
          key={current}
          initial={{ opacity: 0, y: 80, scale: 0.8 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 80, scale: 0.8 }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          className="fixed bottom-24 lg:bottom-8 left-1/2 -translate-x-1/2 z-50 w-72"
        >
          <div className={`bg-gradient-to-br ${def.color} rounded-2xl p-1 shadow-2xl`}>
            <div className="bg-card rounded-xl p-4 flex items-center gap-3">
              <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${def.color} flex items-center justify-center text-3xl shrink-0`}>
                {def.emoji}
              </div>
              <div>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">{t('newBadge')}</p>
                <p className="font-heading font-bold text-sm mt-0.5">{def.label}</p>
                <p className="text-xs text-muted-foreground leading-tight">{def.description}</p>
                <p className="text-xs font-bold text-accent mt-1">+{def.xp} XP</p>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}