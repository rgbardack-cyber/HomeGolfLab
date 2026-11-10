import { useState } from 'react';
import { motion } from 'framer-motion';
import { MapPin, Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { base44 } from '@/api/base44Client';
import PhotoUploader from '@/components/shared/PhotoUploader';
import AnalysisResult from '@/components/shared/AnalysisResult';
import { useLang } from '@/lib/i18n.jsx';

export default function HomePractice() {
  const { t, lang } = useLang();
  const [photoUrl, setPhotoUrl] = useState(null);
  const [notes, setNotes] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState(null);

  const analyzeSpace = async () => {
    setAnalyzing(true);
    const result = await base44.integrations.Core.InvokeLLM({
      prompt: `You are an expert in designing home golf practice spaces.
      Analyze this photo of the user's living space.
      
      ${notes ? `User notes: ${notes}` : ''}
      
      IMPORTANT: Always use BOTH METERS AND YARDS for all measurements (e.g. "4m / 4.4yds").
      Respond ENTIRELY in this language: ${lang}.
      
      Tasks:
      1. Estimate space dimensions in meters AND yards
      2. Identify obstacles and furniture
      3. Suggest a short game practice setup
      4. Include placement for a putting mat, chipping net, and safe practice zones
      5. Give affordable home equipment recommendations
      6. Suggest a 20-30 min daily short game routine
      7. For each practice distance indicate both meters and yards`,
      file_urls: photoUrl ? [photoUrl] : [],
      response_json_schema: {
        type: "object",
        properties: {
          overall_score: { type: "number" },
          summary: { type: "string" },
          dimensions_estimate: { type: "string" },
          practice_layout: { type: "string" },
          strengths: { type: "array", items: { type: "string" } },
          improvements: { type: "array", items: { type: "string" } },
          drills: { type: "array", items: { type: "string" } },
          equipment_needed: { type: "array", items: { type: "string" } },
        }
      }
    });

    setAnalysis(result);
    await base44.entities.PracticeSession.create({
      type: 'home_practice',
      date: new Date().toISOString().split('T')[0],
      photo_url: photoUrl,
      ai_analysis: JSON.stringify(result),
      notes,
      score: result.overall_score,
    });
    setAnalyzing(false);
  };

  return (
    <div className="space-y-6 pb-24 lg:pb-8">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-accent/20 flex items-center justify-center">
            <MapPin className="w-5 h-5 text-accent" />
          </div>
          <div>
            <h1 className="font-heading text-2xl font-bold">{t('homePageTitle')}</h1>
            <p className="text-sm text-muted-foreground">{t('homePageSubtitle')}</p>
          </div>
        </div>
      </motion.div>

      <div className="bg-card rounded-2xl border border-border p-5 space-y-5">
        <PhotoUploader onUpload={setPhotoUrl} label={t('homePhotoLabel')} />
        <Textarea
          placeholder={t('homeNotesPlaceholder')}
          value={notes}
          onChange={e => setNotes(e.target.value)}
          className="min-h-[80px]"
        />
        <Button onClick={analyzeSpace} disabled={!photoUrl || analyzing} className="w-full h-12 text-base font-medium">
          {analyzing ? (
            <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> {t('homeAnalyzingBtn')}</>
          ) : (
            <><Sparkles className="w-5 h-5 mr-2" /> {t('homeAnalyzeBtn')}</>
          )}
        </Button>
      </div>

      {analysis && <AnalysisResult analysis={analysis} title={t('homeResultTitle')} />}
    </div>
  );
}