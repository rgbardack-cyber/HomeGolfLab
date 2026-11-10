import { useState } from 'react';
import { BADGES } from '@/lib/badges';
import BadgeCard from './BadgeCard';
import { Trophy } from 'lucide-react';
import { useLang } from '@/lib/i18n.jsx';

const CATEGORIES = ['todos', 'inicio', 'dedicación', 'tracking', 'calidad', 'resistencia', 'consistencia', 'mejora', 'challenges'];
const CATEGORY_KEYS = {
  todos: 'catAll', inicio: 'catStart', dedicación: 'catDedication', tracking: 'catTracking',
  calidad: 'catQuality', resistencia: 'catEndurance', consistencia: 'catConsistency',
  mejora: 'catImprovement', challenges: 'catChallenges',
};

export default function BadgesSection({ earnedBadges = [] }) {
  const { t } = useLang();
  const [activeCategory, setActiveCategory] = useState('todos');

  const earnedMap = Object.fromEntries(earnedBadges.map(b => [b.badge_id, b.earned_at]));
  const earnedIds = new Set(earnedBadges.map(b => b.badge_id));

  const filtered = activeCategory === 'todos'
    ? BADGES
    : BADGES.filter(b => b.category === activeCategory);

  const sorted = [...filtered].sort((a, b) => {
    const aE = earnedIds.has(a.id);
    const bE = earnedIds.has(b.id);
    if (aE && !bE) return -1;
    if (!aE && bE) return 1;
    return 0;
  });

  // Category labels with i18n fallback to Spanish names
  const catLabel = (cat) => {
    const key = CATEGORY_KEYS[cat];
    const translated = key ? t(key) : null;
    return (translated && translated !== key) ? translated : cat;
  };

  return (
    <div className="bg-card rounded-2xl border border-border overflow-hidden">
      <div className="p-5 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Trophy className="w-5 h-5 text-accent" />
          <h3 className="font-heading font-semibold">{t('badgesTitle')}</h3>
        </div>
        <span className="text-sm text-muted-foreground">{earnedIds.size} / {BADGES.length}</span>
      </div>

      <div className="px-4 py-3 border-b border-border overflow-x-auto">
        <div className="flex gap-2 min-w-max">
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-3 py-1 rounded-full text-xs font-medium capitalize transition-all ${
                activeCategory === cat
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {catLabel(cat)}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
        {sorted.map((badge, i) => (
          <BadgeCard
            key={badge.id}
            badgeId={badge.id}
            earnedAt={earnedMap[badge.id]}
            locked={!earnedIds.has(badge.id)}
            index={i}
          />
        ))}
      </div>
    </div>
  );
}