import { TrendingUp, Clock } from 'lucide-react';
import { useLang } from '@/lib/i18n.jsx';

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export default function SessionSummary({ shots, sessionElapsed = 0 }) {
  const { t } = useLang();
  if (shots.length === 0) return null;

  const avgScore = (shots.reduce((a, s) => a + (s.quality_score || 0), 0) / shots.length).toFixed(1);
  const avgDist = Math.round(shots.reduce((a, s) => a + (s.distance_yards || 0), 0) / shots.length);
  const avgDistM = Math.round(shots.reduce((a, s) => a + (s.distance_meters || 0), 0) / shots.length);
  const avgSpeed = Math.round(shots.reduce((a, s) => a + (s.ball_speed_mph || 0), 0) / shots.length);
  const avgHeight = (shots.reduce((a, s) => a + (s.max_height_meters || 0), 0) / shots.length).toFixed(1);
  const best = shots.reduce((b, s) => (s.quality_score > (b?.quality_score || 0) ? s : b), null);

  return (
    <div className="bg-gradient-to-br from-primary/10 to-primary/5 rounded-2xl border border-primary/20 p-5">
      <h3 className="font-heading font-semibold mb-4 flex items-center gap-2">
        <TrendingUp className="w-5 h-5 text-primary" /> {t('sessionSummary')}
        {sessionElapsed > 0 && (
          <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground font-normal">
            <Clock className="w-3.5 h-3.5" /> {formatTime(sessionElapsed)}
          </span>
        )}
      </h3>
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        <div className="bg-card rounded-xl p-3 text-center col-span-1">
          <p className="text-[10px] text-muted-foreground">{t('shotsLabel')}</p>
          <p className="text-xl font-heading font-bold text-primary">{shots.length}</p>
        </div>
        <div className="bg-card rounded-xl p-3 text-center col-span-1">
          <p className="text-[10px] text-muted-foreground">{t('avgLabel')}</p>
          <p className="text-xl font-heading font-bold">{avgScore}/10</p>
        </div>
        <div className="bg-card rounded-xl p-3 text-center col-span-1">
          <p className="text-[10px] text-muted-foreground">{t('distAvg')}</p>
          <p className="text-lg font-heading font-bold">{avgDist}y</p>
          <p className="text-[10px] text-muted-foreground">{avgDistM}m</p>
        </div>
        <div className="bg-card rounded-xl p-3 text-center col-span-1">
          <p className="text-[10px] text-muted-foreground">{t('speedAvg')}</p>
          <p className="text-lg font-heading font-bold">{avgSpeed}</p>
          <p className="text-[10px] text-muted-foreground">mph</p>
        </div>
        <div className="bg-card rounded-xl p-3 text-center col-span-1">
          <p className="text-[10px] text-muted-foreground">{t('heightAvg')}</p>
          <p className="text-lg font-heading font-bold">{avgHeight}</p>
          <p className="text-[10px] text-muted-foreground">m</p>
        </div>
        <div className="bg-card rounded-xl p-3 text-center col-span-1">
          <p className="text-[10px] text-muted-foreground">{t('bestLabel')}</p>
          <p className="text-xl font-heading font-bold text-primary">{best?.quality_score}/10</p>
        </div>
      </div>
    </div>
  );
}