import { useState } from 'react';
import { motion } from 'framer-motion';
import { Trophy, Calendar, DollarSign, Users, ArrowRight, Clock } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export default function Challenges() {
  const { data: challenges = [] } = useQuery({
    queryKey: ['challenges'],
    queryFn: () => base44.entities.Challenge.list('-created_date'),
  });

  const { data: myEntries = [] } = useQuery({
    queryKey: ['my-entries'],
    queryFn: async () => {
      const user = await base44.auth.me();
      return base44.entities.ChallengeEntry.filter({ user_email: user.email });
    },
  });

  const isRegistered = (challengeId) => myEntries.some(e => e.challenge_id === challengeId);

  return (
    <div className="space-y-6 pb-24 lg:pb-8">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-accent/20 flex items-center justify-center">
            <Trophy className="w-5 h-5 text-accent" />
          </div>
          <div>
            <h1 className="font-heading text-2xl font-bold">Desafíos</h1>
            <p className="text-sm text-muted-foreground">Compite y gana premios reales</p>
          </div>
        </div>
      </motion.div>

      {/* How it works */}
      <div className="bg-gradient-to-br from-accent/10 to-primary/5 rounded-2xl border border-border p-5 space-y-4">
        <h3 className="font-heading font-semibold text-lg">¿Cómo Funciona?</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-accent/20 flex items-center justify-center shrink-0 text-sm font-bold text-accent">1</div>
            <div>
              <p className="font-medium text-sm">Inscríbete</p>
              <p className="text-xs text-muted-foreground">Paga la inscripción antes de la fecha límite</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-accent/20 flex items-center justify-center shrink-0 text-sm font-bold text-accent">2</div>
            <div>
              <p className="font-medium text-sm">Sube Videos Diarios</p>
              <p className="text-xs text-muted-foreground">10 tiros = hasta 10 pts + bonos. No subir = -20 pts</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-accent/20 flex items-center justify-center shrink-0 text-sm font-bold text-accent">3</div>
            <div>
              <p className="font-medium text-sm">Gana Premios</p>
              <p className="text-xs text-muted-foreground">1°: 30% | 2°: 20% | 3°: 10% del pool</p>
            </div>
          </div>
        </div>

        {/* Missions preview */}
        <div className="border-t border-border pt-4">
          <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">Misiones Bonus Diarias</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { icon: '⭐', label: '10/10 tiros', bonus: '+10 pts' },
              { icon: '🔥', label: 'Racha de 5', bonus: '+5 pts' },
              { icon: '⚡', label: 'Racha de 3', bonus: '+3 pts' },
              { icon: '🎯', label: '5+ tiros', bonus: '+2 pts' },
            ].map(m => (
              <div key={m.label} className="flex items-center gap-2 p-2 rounded-lg bg-card border border-border">
                <span>{m.icon}</span>
                <div>
                  <p className="text-xs font-medium leading-tight">{m.label}</p>
                  <p className="text-xs text-accent font-bold">{m.bonus}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Challenge Cards */}
      {challenges.length === 0 ? (
        <div className="text-center py-12 bg-card rounded-2xl border border-border">
          <Trophy className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground">No hay desafíos disponibles aún</p>
          <p className="text-sm text-muted-foreground mt-1">¡Pronto habrá nuevos desafíos!</p>
        </div>
      ) : (
        <div className="space-y-4">
          {challenges.map(challenge => {
            const registered = isRegistered(challenge.id);
            return (
              <motion.div
                key={challenge.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <Link
                  to={`/challenges/${challenge.id}`}
                  className="block bg-card rounded-2xl border border-border p-5 hover:shadow-lg transition-all group"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-heading font-semibold text-lg">{challenge.title}</h3>
                        {registered && (
                          <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium">
                            Inscrito
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">{challenge.description}</p>
                    </div>
                    <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm">{challenge.month}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <DollarSign className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm">${challenge.entry_fee} inscripción</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Trophy className="w-4 h-4 text-accent" />
                      <span className="text-sm">${challenge.total_pool || 0} pool</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm">
                        {challenge.registration_deadline && 
                          `Hasta ${format(new Date(challenge.registration_deadline), 'd MMM', { locale: es })}`
                        }
                      </span>
                    </div>
                  </div>
                </Link>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}