import { useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Star, Zap, Crown, Shield, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useSubscription, PLANS } from '@/lib/useSubscription';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

const PLAN_CARDS = [
  {
    key: 'monthly',
    icon: Zap,
    badge: null,
    color: 'border-border',
    headerBg: 'bg-muted',
  },
  {
    key: 'quarterly',
    icon: Star,
    badge: '5% OFF',
    color: 'border-primary',
    headerBg: 'bg-primary/10',
  },
  {
    key: 'semiannual',
    icon: Crown,
    badge: '10% OFF',
    color: 'border-accent',
    headerBg: 'bg-accent/10',
  },
  {
    key: 'annual',
    icon: Shield,
    badge: '20% OFF ⭐',
    color: 'border-primary',
    headerBg: 'bg-primary/20',
    popular: true,
  },
];

const FEATURES_FREE = [
  '1 video de swing/día (máx. 6 seg.)',
  'Anuncio de 1 min cada 5 videos',
  '1 scan de práctica cada 14 días',
  'Ball Tracker completo (anuncio c/30 min)',
  '1 intento de desafío/día',
  'Desafíos de amigos (con anuncios)',
];

const FEATURES_PREMIUM = [
  'Videos de swing ilimitados',
  'Sin anuncios en swing',
  'Scans de práctica ilimitados',
  'Ball Tracker sin límites ni anuncios',
  '2 intentos de desafío/día',
  'Desafíos de amigos sin anuncios',
  'Acceso prioritario a nuevas funciones',
];

export default function Subscription() {
  const [selectedPlan, setSelectedPlan] = useState('annual');
  const [loading, setLoading] = useState(false);

  const { data: user } = useQuery({
    queryKey: ['me'],
    queryFn: () => base44.auth.me(),
  });

  const { sub, isPremium, isTrialActive, trialDaysLeft, activatePlan } = useSubscription(user?.email);

  const handleSubscribe = async () => {
    setLoading(true);
    // In production: trigger Apple Pay / Google Pay via native bridge
    // For now we simulate activation with a mock transaction
    const platform = /iPhone|iPad|iPod/.test(navigator.userAgent) ? 'ios'
      : /Android/.test(navigator.userAgent) ? 'android' : 'web';

    // Trigger native payment — in a real app this calls the Capacitor/React Native IAP plugin
    // window.webkit.messageHandlers.iap.postMessage({ productId: PLANS[selectedPlan].productId })
    // For web demo, we activate directly:
    await activatePlan.mutateAsync({
      plan: selectedPlan,
      platform,
      productId: PLANS[selectedPlan].productId,
      transactionId: `demo_${Date.now()}`,
    });
    setLoading(false);
  };

  return (
    <div className="space-y-8 pb-24 lg:pb-8 max-w-2xl mx-auto">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center space-y-2"
      >
        <div className="inline-flex items-center gap-2 bg-accent/20 text-accent-foreground px-4 py-1.5 rounded-full text-sm font-medium">
          <Crown className="w-4 h-4" /> HomeGolf LAB Premium
        </div>
        <h1 className="font-heading text-3xl font-bold">Mejora tu experiencia</h1>
        <p className="text-muted-foreground">Sin límites. Sin anuncios. Golf ilimitado.</p>
      </motion.div>

      {/* Current status */}
      {sub && (
        <div className={`rounded-2xl p-4 border text-center ${
          isPremium ? 'bg-primary/10 border-primary/30' : 'bg-destructive/10 border-destructive/30'
        }`}>
          {isTrialActive ? (
            <p className="font-medium">🎉 Prueba gratuita activa — te quedan <strong>{trialDaysLeft} días</strong></p>
          ) : isPremium ? (
            <p className="font-medium text-primary">✅ Suscripción activa — {PLANS[sub.plan]?.label} hasta {sub.subscription_end_date ? format(parseISO(sub.subscription_end_date), 'd MMM yyyy', { locale: es }) : ''}</p>
          ) : (
            <p className="font-medium text-destructive">⚠️ Prueba expirada — ahora en modo gratuito con límites</p>
          )}
        </div>
      )}

      {/* Plan cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {PLAN_CARDS.map((card, i) => {
          const plan = PLANS[card.key];
          const Icon = card.icon;
          const isSelected = selectedPlan === card.key;
          return (
            <motion.button
              key={card.key}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
              onClick={() => setSelectedPlan(card.key)}
              className={`relative text-left p-5 rounded-2xl border-2 transition-all ${
                isSelected ? 'border-primary shadow-lg shadow-primary/20 scale-[1.02]' : card.color
              } bg-card`}
            >
              {card.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-xs px-3 py-1 rounded-full font-semibold">
                  MÁS POPULAR
                </div>
              )}
              {card.badge && (
                <span className="absolute top-3 right-3 text-xs bg-accent text-accent-foreground px-2 py-0.5 rounded-full font-bold">
                  {card.badge}
                </span>
              )}
              <div className={`w-10 h-10 rounded-xl ${card.headerBg} flex items-center justify-center mb-3`}>
                <Icon className="w-5 h-5 text-primary" />
              </div>
              <p className="font-heading font-bold text-lg">{plan.label}</p>
              <p className="text-2xl font-bold mt-1">
                ${plan.price.toFixed(2)}
                <span className="text-sm font-normal text-muted-foreground">
                  {plan.months === 1 ? '/mes' : `/${plan.months} meses`}
                </span>
              </p>
              {plan.discount > 0 && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  ≈ ${(plan.price / plan.months).toFixed(2)}/mes
                </p>
              )}
              {isSelected && (
                <div className="absolute bottom-3 right-3 w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                  <Check className="w-3.5 h-3.5 text-primary-foreground" />
                </div>
              )}
            </motion.button>
          );
        })}
      </div>

      {/* Subscribe button */}
      {!isPremium && (
        <Button
          onClick={handleSubscribe}
          disabled={loading || activatePlan.isPending}
          className="w-full h-14 text-base font-semibold rounded-2xl"
        >
          {loading || activatePlan.isPending
            ? 'Procesando...'
            : `Suscribirse — ${PLANS[selectedPlan].label} $${PLANS[selectedPlan].price.toFixed(2)}`}
        </Button>
      )}
      <p className="text-center text-xs text-muted-foreground">
        El pago se procesa mediante Apple Pay o Google Pay según tu dispositivo. Se renueva automáticamente. Puedes cancelar en cualquier momento desde tu tienda de apps.
      </p>

      {/* Feature comparison */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
          <h3 className="font-heading font-semibold text-center text-muted-foreground">Gratis</h3>
          {FEATURES_FREE.map((f, i) => (
            <div key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
              <X className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
              <span>{f}</span>
            </div>
          ))}
        </div>
        <div className="bg-primary/5 border border-primary/30 rounded-2xl p-4 space-y-3">
          <h3 className="font-heading font-semibold text-center text-primary">Premium</h3>
          {FEATURES_PREMIUM.map((f, i) => (
            <div key={i} className="flex items-start gap-2 text-sm">
              <Check className="w-4 h-4 text-primary shrink-0 mt-0.5" />
              <span>{f}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}