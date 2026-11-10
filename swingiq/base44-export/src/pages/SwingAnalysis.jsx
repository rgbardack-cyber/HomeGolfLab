import { useState } from 'react';
import { motion } from 'framer-motion';
import { Activity, Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { base44 } from '@/api/base44Client';
import VideoUploader from '@/components/shared/VideoUploader';
import AnalysisResult from '@/components/shared/AnalysisResult';
import { useLang } from '@/lib/i18n.jsx';

export default function SwingAnalysis() {
  const { t, lang } = useLang();
  const [videoUrl, setVideoUrl] = useState(null);
  const [notes, setNotes] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState(null);

  const analyzeSwing = async () => {
    setAnalyzing(true);
    const result = await base44.integrations.Core.InvokeLLM({
      prompt: `You are a PGA-certified professional golf coach. Analyze this golf swing video.
      
      ${notes ? `Player notes: ${notes}` : ''}
      
      Provide a detailed swing analysis. Respond ENTIRELY in this language: ${lang}.
      Include: setup & grip, backswing plane & shoulder rotation, downswing transition & sequence,
      impact zone (hands, clubface angle), follow-through & balance.
      Identify specific improvement areas and give practical drills.`,
      file_urls: videoUrl ? [videoUrl] : [],
      response_json_schema: {
        type: "object",
        properties: {
          overall_score: { type: "number", description: "Score from 1-10" },
          summary: { type: "string" },
          strengths: { type: "array", items: { type: "string" } },
          improvements: { type: "array", items: { type: "string" } },
          drills: { type: "array", items: { type: "string" } },
          impact_zone: { type: "string" },
          swing_plane: { type: "string" },
        }
      }
    });

    setAnalysis(result);
    await base44.entities.PracticeSession.create({
      type: 'swing_analysis',
      date: new Date().toISOString().split('T')[0],
      video_url: videoUrl,
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
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Activity className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="font-heading text-2xl font-bold">{t('swingPageTitle')}</h1>
            <p className="text-sm text-muted-foreground">{t('swingPageSubtitle')}</p>
          </div>
        </div>
      </motion.div>

      <div className="bg-card rounded-2xl border border-border p-5 space-y-5">
        <VideoUploader onUpload={setVideoUrl} label={t('swingVideoLabel')} />
        <Textarea
          placeholder={t('swingNotesPlaceholder')}
          value={notes}
          onChange={e => setNotes(e.target.value)}
          className="min-h-[80px]"
        />
        <Button onClick={analyzeSwing} disabled={!videoUrl || analyzing} className="w-full h-12 text-base font-medium">
          {analyzing ? (
            <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> {t('swingAnalyzingBtn')}</>
          ) : (
            <><Sparkles className="w-5 h-5 mr-2" /> {t('swingAnalyzeBtn')}</>
          )}
        </Button>
      </div>

      {analysis && <AnalysisResult analysis={analysis} title={t('swingResultTitle')} />}
    </div>
  );
}