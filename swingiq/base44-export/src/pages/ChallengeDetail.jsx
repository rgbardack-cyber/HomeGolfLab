import { useState } from 'react';
import { motion } from 'framer-motion';
import { Trophy, Calendar, DollarSign, ArrowLeft, Loader2, Upload, Medal, AlertCircle } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { format, eachDayOfInterval, parseISO, isToday } from 'date-fns';
import { es } from 'date-fns/locale';
import ChallengeLeaderboard from '@/components/challenges/ChallengeLeaderboard';
import DailySubmissionForm from '@/components/challenges/DailySubmissionForm';

export default function ChallengeDetail() {
  const urlParams = new URLSearchParams(window.location.search);
  const challengeId = window.location.pathname.split('/').pop();
  const queryClient = useQueryClient();
  const [showSubmission, setShowSubmission] = useState(false);

  const { data: challenge, isLoading } = useQuery({
    queryKey: ['challenge', challengeId],
    queryFn: async () => {
      const list = await base44.entities.Challenge.filter({ id: challengeId });
      return list[0];
    },
  });

  const { data: user } = useQuery({
    queryKey: ['me'],
    queryFn: () => base44.auth.me(),
  });

  const { data: myEntry } = useQuery({
    queryKey: ['my-entry', challengeId],
    queryFn: async () => {
      if (!user?.email) return null;
      const entries = await base44.entities.ChallengeEntry.filter({
        challenge_id: challengeId,
        user_email: user.email,
      });
      return entries[0] || null;
    },
    enabled: !!user?.email,
  });

  const { data: entries = [] } = useQuery({
    queryKey: ['entries', challengeId],
    queryFn: () => base44.entities.ChallengeEntry.filter({ challenge_id: challengeId }, '-total_points'),
  });

  const { data: mySubmissions = [] } = useQuery({
    queryKey: ['my-submissions', challengeId],
    queryFn: async () => {
      if (!user?.email) return [];
      return base44.entities.DailySubmission.filter({
        challenge_id: challengeId,
        user_email: user.email,
      });
    },
    enabled: !!user?.email,
  });

  const registerMutation = useMutation({
    mutationFn: async () => {
      const entry = await base44.entities.ChallengeEntry.create({
        challenge_id: challengeId,
        user_email: user.email,
        user_name: user.full_name || user.email,
        total_points: 0,
        paid: true,
      });
      // Update pool
      if (challenge) {
        await base44.entities.Challenge.update(challenge.id, {
          total_pool: (challenge.total_pool || 0) + (challenge.entry_fee || 0),
        });
      }
      return entry;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-entry', challengeId] });
      queryClient.invalidateQueries({ queryKey: ['entries', challengeId] });
      queryClient.invalidateQueries({ queryKey: ['challenge', challengeId] });
    },
  });

  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const hasSubmittedToday = mySubmissions.some(s => s.date === todayStr);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!challenge) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">Desafío no encontrado</p>
        <Link to="/challenges" className="text-primary text-sm mt-2 inline-block">Volver a desafíos</Link>
      </div>
    );
  }

  const prizePool = challenge.total_pool || 0;

  return (
    <div className="space-y-6 pb-24 lg:pb-8">
      <Link to="/challenges" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="w-4 h-4" /> Volver a desafíos
      </Link>

      {/* Challenge Header */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-br from-primary to-primary/80 rounded-2xl p-6 text-primary-foreground"
      >
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
            <Trophy className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <h1 className="font-heading text-2xl font-bold">{challenge.title}</h1>
            <p className="text-primary-foreground/80 mt-1">{challenge.description}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6">
          <div className="bg-white/10 rounded-xl p-3">
            <p className="text-xs text-primary-foreground/60">Pool Total</p>
            <p className="text-xl font-bold">${prizePool}</p>
          </div>
          <div className="bg-white/10 rounded-xl p-3">
            <p className="text-xs text-primary-foreground/60">1er Lugar (30%)</p>
            <p className="text-xl font-bold">${(prizePool * 0.3).toFixed(0)}</p>
          </div>
          <div className="bg-white/10 rounded-xl p-3">
            <p className="text-xs text-primary-foreground/60">2do Lugar (20%)</p>
            <p className="text-xl font-bold">${(prizePool * 0.2).toFixed(0)}</p>
          </div>
          <div className="bg-white/10 rounded-xl p-3">
            <p className="text-xs text-primary-foreground/60">3er Lugar (10%)</p>
            <p className="text-xl font-bold">${(prizePool * 0.1).toFixed(0)}</p>
          </div>
        </div>
      </motion.div>

      {/* Registration or Submission */}
      {!myEntry ? (
        <div className="bg-card rounded-2xl border border-border p-6 text-center space-y-4">
          <div className="w-14 h-14 rounded-full bg-accent/10 flex items-center justify-center mx-auto">
            <DollarSign className="w-7 h-7 text-accent" />
          </div>
          <h3 className="font-heading text-lg font-semibold">Inscríbete al Desafío</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Inscripción: <span className="font-bold text-foreground">${challenge.entry_fee}</span> · 
            Fecha límite: {challenge.registration_deadline && format(new Date(challenge.registration_deadline), 'd MMMM yyyy', { locale: es })}
          </p>
          <Button
            onClick={() => registerMutation.mutate()}
            disabled={registerMutation.isPending}
            size="lg"
            className="font-medium"
          >
            {registerMutation.isPending ? (
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
            ) : (
              <Trophy className="w-5 h-5 mr-2" />
            )}
            Inscribirme - ${challenge.entry_fee}
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* My Status */}
          <div className="bg-card rounded-2xl border border-border p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-heading font-semibold">Mi Progreso</h3>
              <span className="text-2xl font-heading font-bold text-primary">{myEntry.total_points} pts</span>
            </div>

            {hasSubmittedToday ? (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-primary/5 text-sm">
                <Medal className="w-5 h-5 text-primary" />
                <span>¡Ya subiste tu video de hoy! Vuelve mañana.</span>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 p-3 rounded-xl bg-destructive/5 text-sm mb-3">
                  <AlertCircle className="w-5 h-5 text-destructive" />
                  <span>¡No olvides subir tu video hoy! (-20 pts si no lo subes)</span>
                </div>
                <Button
                  onClick={() => setShowSubmission(true)}
                  className="w-full"
                >
                  <Upload className="w-5 h-5 mr-2" /> Subir Video de Hoy
                </Button>
              </>
            )}
          </div>

          {showSubmission && (
            <DailySubmissionForm
              challengeId={challengeId}
              entryId={myEntry.id}
              userEmail={user.email}
              currentPoints={myEntry.total_points}
              onClose={() => setShowSubmission(false)}
            />
          )}
        </div>
      )}

      {/* Leaderboard */}
      <ChallengeLeaderboard entries={entries} currentUserEmail={user?.email} />
    </div>
  );
}