import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { addDays, isAfter, isBefore, parseISO } from 'date-fns';

export const PLANS = {
  monthly:    { label: 'Mensual',    months: 1,  discount: 0,    price: 4.99,  productId: 'homegolflab_monthly' },
  quarterly:  { label: 'Trimestral', months: 3,  discount: 0.05, price: 14.22, productId: 'homegolflab_quarterly' },
  semiannual: { label: 'Semestral',  months: 6,  discount: 0.10, price: 26.95, productId: 'homegolflab_semiannual' },
  annual:     { label: 'Anual',      months: 12, discount: 0.20, price: 47.90, productId: 'homegolflab_annual' },
};

export function useSubscription(userEmail) {
  const queryClient = useQueryClient();

  const { data: sub, isLoading } = useQuery({
    queryKey: ['subscription', userEmail],
    queryFn: async () => {
      if (!userEmail) return null;
      const subs = await base44.entities.Subscription.filter({ user_email: userEmail });
      if (subs.length === 0) {
        // Create trial subscription on first login
        const today = new Date().toISOString().split('T')[0];
        const trialEnd = addDays(new Date(), 3).toISOString().split('T')[0];
        const newSub = await base44.entities.Subscription.create({
          user_email: userEmail,
          plan: 'free',
          status: 'trial',
          trial_start_date: today,
          trial_end_date: trialEnd,
        });
        return newSub;
      }
      return subs[0];
    },
    enabled: !!userEmail,
  });

  const isPremium = (() => {
    if (!sub) return false;
    if (sub.status === 'trial') {
      const trialEnd = parseISO(sub.trial_end_date);
      return isBefore(new Date(), trialEnd);
    }
    if (sub.status === 'active' && sub.subscription_end_date) {
      return isBefore(new Date(), parseISO(sub.subscription_end_date));
    }
    return false;
  })();

  const isTrialActive = sub?.status === 'trial' && isPremium;
  const trialDaysLeft = (() => {
    if (!sub?.trial_end_date) return 0;
    const trialEnd = parseISO(sub.trial_end_date);
    const diff = Math.ceil((trialEnd - new Date()) / (1000 * 60 * 60 * 24));
    return Math.max(0, diff);
  })();

  const activatePlan = useMutation({
    mutationFn: async ({ plan, transactionId, productId, platform }) => {
      const planData = PLANS[plan];
      const start = new Date().toISOString().split('T')[0];
      const endDate = new Date();
      endDate.setMonth(endDate.getMonth() + planData.months);
      const end = endDate.toISOString().split('T')[0];

      return base44.entities.Subscription.update(sub.id, {
        plan,
        status: 'active',
        subscription_start_date: start,
        subscription_end_date: end,
        platform: platform || 'web',
        store_transaction_id: transactionId || '',
        store_product_id: productId || planData.productId,
        price_paid: planData.price,
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['subscription', userEmail] }),
  });

  return { sub, isLoading, isPremium, isTrialActive, trialDaysLeft, activatePlan };
}

// Usage limits for free tier
export const FREE_LIMITS = {
  swingVideosPerDay: 1,          // 1 video per day (max 6 sec)
  swingVideosBeforeAd: 5,        // watch ad every 5 videos
  homePracticeScanDays: 14,      // 1 scan every 14 days
  ballTrackingAdEveryMinutes: 30, // ad every 30 min of ball tracking
  challengeAttemptsPerDay: 1,    // 1 attempt per day (premium: 2)
  friendsChallengeAds: true,     // ads in friend challenges
};

export const PREMIUM_LIMITS = {
  swingVideosPerDay: Infinity,
  swingVideosBeforeAd: Infinity,
  homePracticeScanDays: 0,
  ballTrackingAdEveryMinutes: Infinity,
  challengeAttemptsPerDay: 2,
  friendsChallengeAds: false,
};