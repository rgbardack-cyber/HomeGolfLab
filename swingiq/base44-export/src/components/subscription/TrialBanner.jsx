import { Link } from 'react-router-dom';
import { Crown } from 'lucide-react';
import { useSubscription } from '@/lib/useSubscription';

export default function TrialBanner({ userEmail }) {
  const { isTrialActive, trialDaysLeft, isPremium, sub } = useSubscription(userEmail);

  if (!sub || isPremium && !isTrialActive) return null;

  if (isTrialActive) {
    return (
      <Link to="/subscription" className="block mx-0 mb-4">
        <div className="bg-accent/20 border border-accent/40 rounded-xl px-4 py-2.5 flex items-center justify-between text-sm">
          <span className="font-medium">🎁 Prueba gratis: <strong>{trialDaysLeft} día{trialDaysLeft !== 1 ? 's' : ''}</strong> restantes</span>
          <span className="text-primary font-semibold flex items-center gap-1">
            <Crown className="w-3.5 h-3.5" /> Ver planes
          </span>
        </div>
      </Link>
    );
  }

  if (!isPremium) {
    return (
      <Link to="/subscription" className="block mx-0 mb-4">
        <div className="bg-destructive/10 border border-destructive/30 rounded-xl px-4 py-2.5 flex items-center justify-between text-sm">
          <span className="font-medium text-destructive">⚠️ Modo gratuito — funciones limitadas</span>
          <span className="text-primary font-semibold flex items-center gap-1">
            <Crown className="w-3.5 h-3.5" /> Mejorar
          </span>
        </div>
      </Link>
    );
  }

  return null;
}