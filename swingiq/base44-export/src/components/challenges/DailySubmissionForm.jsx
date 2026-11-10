import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, Sparkles, X, Circle, CheckCircle2, XCircle, Star, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import VideoUploader from '@/components/shared/VideoUploader';
import MissionsPanel, { calculateMissionBonuses } from './MissionsPanel';
import { format } from 'date-fns';

// Compute max consecutive streak
function getMaxStreak(results) {
  let max = 0, cur = 0;
  for (const r of results) {
    if (r === true) { cur++; max = Math.max(max, cur); }
    else cur = 0;
  }
  return max;
}

export default function DailySubmissionForm({ challengeId, entryId, userEmail, currentPoints, onClose }) {
  const [videoUrl, setVideoUrl] = useState(null);
  const [shotResults, setShotResults] = useState(Array(10).fill(null)); // null=pending, true=made, false=missed
  const [submitting, setSubmitting] = useState(false);
  const queryClient = useQueryClient();

  const toggleShot = (idx) => {
    setShotResults(prev => {
      const next = [...prev];
      if (next[idx] === null) next[idx] = true;
      else if (next[idx] === true) next[idx] = false;
      else next[idx] = null;
      return next;
    });
  };

  const shotsMade = shotResults.filter(r => r === true).length;
  const allFilled = shotResults.every(r => r !== null);
  const maxStreak = getMaxStreak(shotResults.filter(r => r !== null));
  const { bonus, achieved } = calculateMissionBonuses(shotsMade, maxStreak);
  const basePoints = shotsMade;
  const totalPoints = basePoints + bonus;

  const handleSubmit = async () => {
    setSubmitting(true);

    let aiVerification = '';
    if (videoUrl) {
      const aiResult = await base44.integrations.Core.InvokeLLM({
        prompt: `Eres un verificador de desafíos de golf. Analiza este video de práctica de juego corto.
        El jugador reporta haber embocado ${shotsMade} de 10 tiros. 
        Verifica brevemente en español si el video muestra una sesión legítima de 10 tiros de juego corto.
        Menciona si el conteo parece consistente con lo reportado.`,
        file_urls: [videoUrl],
      });
      aiVerification = aiResult;
    }

    await base44.entities.DailySubmission.create({
      challenge_id: challengeId,
      entry_id: entryId,
      user_email: userEmail,
      date: format(new Date(), 'yyyy-MM-dd'),
      video_url: videoUrl,
      shots_made: shotsMade,
      points_earned: totalPoints,
      ai_verification: aiVerification,
    });

    await base44.entities.ChallengeEntry.update(entryId, {
      total_points: (currentPoints || 0) + totalPoints,
    });

    queryClient.invalidateQueries({ queryKey: ['my-entry', challengeId] });
    queryClient.invalidateQueries({ queryKey: ['my-submissions', challengeId] });
    queryClient.invalidateQueries({ queryKey: ['entries', challengeId] });

    setSubmitting(false);
    onClose();
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card rounded-2xl border border-border p-5 space-y-5"
    >
      <div className="flex items-center justify-between">
        <h3 className="font-heading font-semibold text-lg">Submisión Diaria</h3>
        <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Video */}
      <VideoUploader onUpload={setVideoUrl} label="Sube tu video de 10 tiros" />

      {/* Shot Tracker Grid */}
      <div>
        <p className="text-sm font-medium mb-2">Marca cada tiro (toca para cambiar)</p>
        <div className="grid grid-cols-5 gap-2">
          {shotResults.map((result, idx) => (
            <button
              key={idx}
              onClick={() => toggleShot(idx)}
              className={`relative h-14 rounded-xl border-2 flex flex-col items-center justify-center transition-all font-bold text-sm ${
                result === null
                  ? 'border-border bg-muted text-muted-foreground'
                  : result === true
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-destructive/40 bg-destructive/5 text-destructive'
              }`}
            >
              <span className="text-xs text-muted-foreground mb-0.5">{idx + 1}</span>
              {result === null && <Circle className="w-5 h-5" />}
              {result === true && <CheckCircle2 className="w-5 h-5 text-primary" />}
              {result === false && <XCircle className="w-5 h-5 text-destructive" />}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-2 text-center">
          ⬜ Pendiente · ✅ Embocado · ❌ Fallado
        </p>
      </div>

      {/* Points Preview */}
      <div className="rounded-xl bg-muted p-4 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Tiros embocados</span>
          <span className="font-medium">{shotsMade}/10 = {basePoints} pts</span>
        </div>
        {bonus > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground flex items-center gap-1">
              <Star className="w-3.5 h-3.5 text-accent" /> Bonos de misiones
            </span>
            <span className="font-medium text-accent">+{bonus} pts</span>
          </div>
        )}
        <div className="flex justify-between text-base font-heading font-bold border-t border-border pt-2 mt-2">
          <span>Total de hoy</span>
          <span className="text-primary">+{totalPoints} pts</span>
        </div>
      </div>

      {/* Missions */}
      <MissionsPanel shotsMade={shotsMade} maxStreak={maxStreak} achievedIds={achieved} />

      <Button
        onClick={handleSubmit}
        disabled={!videoUrl || !allFilled || submitting}
        className="w-full h-12"
      >
        {submitting ? (
          <>
            <Loader2 className="w-5 h-5 mr-2 animate-spin" /> Enviando y verificando...
          </>
        ) : (
          <>
            <Sparkles className="w-5 h-5 mr-2" /> Enviar — +{totalPoints} puntos
          </>
        )}
      </Button>
      {!allFilled && (
        <p className="text-center text-xs text-muted-foreground">Completa los 10 tiros antes de enviar</p>
      )}
    </motion.div>
  );
}