import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { evaluateNewBadges, getTotalXp, getLevelFromXp } from '@/lib/badges';
import { useState, useEffect } from 'react';

export function useBadges(userEmail, sessions = [], entries = []) {
  const qc = useQueryClient();
  const [newlyUnlocked, setNewlyUnlocked] = useState([]);

  const { data: earnedBadges = [] } = useQuery({
    queryKey: ['badges', userEmail],
    queryFn: () => base44.entities.Badge.filter({ user_email: userEmail }),
    enabled: !!userEmail,
  });

  const awardMutation = useMutation({
    mutationFn: (badgeId) =>
      base44.entities.Badge.create({
        user_email: userEmail,
        badge_id: badgeId,
        earned_at: new Date().toISOString().split('T')[0],
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['badges', userEmail] }),
  });

  // Evaluate and award new badges whenever sessions/entries change
  useEffect(() => {
    if (!userEmail || sessions.length === 0) return;

    const earnedIds = earnedBadges.map(b => b.badge_id);
    const toAward = evaluateNewBadges({ sessions, earnedBadgeIds: earnedIds, entries });

    if (toAward.length > 0) {
      setNewlyUnlocked(toAward);
      toAward.forEach(id => awardMutation.mutate(id));
    }
  }, [userEmail, sessions.length, entries.length, earnedBadges.length]);

  const earnedIds = earnedBadges.map(b => b.badge_id);
  const totalXp = getTotalXp(earnedIds);
  const levelInfo = getLevelFromXp(totalXp);

  return {
    earnedBadges,
    newlyUnlocked,
    clearNewlyUnlocked: () => setNewlyUnlocked([]),
    totalXp,
    levelInfo,
  };
}