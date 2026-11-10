import { motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import { CheckCircle, AlertTriangle, Target, TrendingUp } from 'lucide-react';

export default function AnalysisResult({ analysis, title }) {
  if (!analysis) return null;

  let parsed;
  try {
    parsed = typeof analysis === 'string' ? JSON.parse(analysis) : analysis;
  } catch {
    parsed = null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card rounded-2xl border border-border p-6 space-y-4"
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Target className="w-5 h-5 text-primary" />
        </div>
        <h3 className="font-heading text-lg font-semibold">{title || 'Análisis IA'}</h3>
      </div>

      {parsed ? (
        <div className="space-y-4">
          {parsed.overall_score && (
            <div className="flex items-center gap-3 p-4 rounded-xl bg-primary/5">
              <div className="text-3xl font-heading font-bold text-primary">{parsed.overall_score}/10</div>
              <div>
                <p className="font-medium">Puntuación General</p>
                <p className="text-sm text-muted-foreground">{parsed.summary}</p>
              </div>
            </div>
          )}

          {parsed.strengths && parsed.strengths.length > 0 && (
            <div className="space-y-2">
              <h4 className="font-medium flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-primary" /> Fortalezas
              </h4>
              <ul className="space-y-1">
                {parsed.strengths.map((s, i) => (
                  <li key={i} className="text-sm text-muted-foreground pl-6">• {s}</li>
                ))}
              </ul>
            </div>
          )}

          {parsed.improvements && parsed.improvements.length > 0 && (
            <div className="space-y-2">
              <h4 className="font-medium flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-accent" /> Áreas de Mejora
              </h4>
              <ul className="space-y-1">
                {parsed.improvements.map((s, i) => (
                  <li key={i} className="text-sm text-muted-foreground pl-6">• {s}</li>
                ))}
              </ul>
            </div>
          )}

          {parsed.drills && parsed.drills.length > 0 && (
            <div className="space-y-2">
              <h4 className="font-medium flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary" /> Ejercicios Recomendados
              </h4>
              <ul className="space-y-1">
                {parsed.drills.map((s, i) => (
                  <li key={i} className="text-sm text-muted-foreground pl-6">• {s}</li>
                ))}
              </ul>
            </div>
          )}

          {parsed.practice_layout && (
            <div className="space-y-2">
              <h4 className="font-medium">Configuración Sugerida</h4>
              <p className="text-sm text-muted-foreground">{parsed.practice_layout}</p>
            </div>
          )}

          {parsed.ball_data && (
            <div className="grid grid-cols-2 gap-3">
              {Object.entries(parsed.ball_data).map(([key, value]) => (
                <div key={key} className="p-3 rounded-xl bg-muted">
                  <p className="text-xs text-muted-foreground capitalize">{key.replace(/_/g, ' ')}</p>
                  <p className="font-semibold mt-1">{value}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="prose prose-sm max-w-none">
          <ReactMarkdown>{analysis}</ReactMarkdown>
        </div>
      )}
    </motion.div>
  );
}