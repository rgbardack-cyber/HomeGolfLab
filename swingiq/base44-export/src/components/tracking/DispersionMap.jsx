import { motion } from 'framer-motion';
import { Target } from 'lucide-react';
import { useLang } from '@/lib/i18n.jsx';

export default function DispersionMap({ shots }) {
  const { t } = useLang();
  if (shots.length < 3) return null;

  const validShots = shots.filter(s => s.distance_yards && s.lateral_deviation_meters !== undefined);
  if (validShots.length < 2) return null;

  const maxDist = Math.max(...validShots.map(s => s.distance_yards));
  const minDist = Math.min(...validShots.map(s => s.distance_yards));
  const maxLateral = Math.max(...validShots.map(s => Math.abs(s.lateral_deviation_meters || 0)), 10);

  const avgLateral = (validShots.reduce((a, s) => a + (s.lateral_deviation_meters || 0), 0) / validShots.length).toFixed(1);
  const stdDev = Math.sqrt(
    validShots.reduce((a, s) => a + Math.pow((s.lateral_deviation_meters || 0) - parseFloat(avgLateral), 2), 0) / validShots.length
  ).toFixed(1);
  const avgDist = Math.round(validShots.reduce((a, s) => a + s.distance_yards, 0) / validShots.length);
  const distSpread = maxDist - minDist;

  const MAP_W = 280;
  const MAP_H = 180;
  const toX = (lateral) => MAP_W / 2 + (lateral / (maxLateral * 1.4)) * (MAP_W / 2 - 20);
  const toY = (dist) => MAP_H - 20 - ((dist - minDist) / Math.max(maxDist - minDist, 1)) * (MAP_H - 40);

  const trajectoryColors = {
    draw: '#16a34a', fade: '#3b82f6', straight: '#2d6a4f',
    hook: '#f97316', slice: '#ef4444', pull: '#fb923c', push: '#ca8a04',
  };

  const consistencyMsg = parseFloat(stdDev) <= 5
    ? t('consistencyExcellent')
    : parseFloat(stdDev) <= 10
    ? t('consistencyGood')
    : t('consistencyHigh');

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card rounded-2xl border border-border p-5 space-y-4"
    >
      <div className="flex items-center gap-2">
        <Target className="w-5 h-5 text-primary" />
        <h3 className="font-heading font-semibold">{t('dispersionMap')}</h3>
        <span className="text-xs text-muted-foreground ml-auto">{validShots.length} {t('shots')}</span>
      </div>

      <div className="flex justify-center">
        <svg width={MAP_W} height={MAP_H} className="bg-gradient-to-b from-green-900/20 to-green-800/10 rounded-xl border border-border overflow-visible">
          <line x1={MAP_W / 2} y1={0} x2={MAP_W / 2} y2={MAP_H} stroke="rgba(255,255,255,0.15)" strokeDasharray="4,4" />
          <circle cx={MAP_W / 2} cy={MAP_H - 12} r={8} fill="none" stroke="hsl(43,65%,52%)" strokeWidth={2} />
          <circle cx={MAP_W / 2} cy={MAP_H - 12} r={3} fill="hsl(43,65%,52%)" />
          <text x={MAP_W / 2} y={MAP_H - 26} textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize="9">{t('teeLabel')}</text>
          <text x={8} y={14} fill="rgba(255,255,255,0.4)" fontSize="9">{t('leftLabel')}</text>
          <text x={MAP_W - 8} y={14} textAnchor="end" fill="rgba(255,255,255,0.4)" fontSize="9">{t('rightLabel')}</text>
          {validShots.map((shot, i) => {
            const x = toX(shot.lateral_deviation_meters || 0);
            const y = toY(shot.distance_yards);
            const color = trajectoryColors[shot.trajectory?.toLowerCase()] || '#4ade80';
            return (
              <g key={i}>
                <circle cx={x} cy={y} r={6} fill={color} fillOpacity={0.85} />
                <text x={x} y={y + 3} textAnchor="middle" fill="white" fontSize="7" fontWeight="bold">{shot.shot_number}</text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="grid grid-cols-4 gap-2 text-center">
        <div className="bg-muted rounded-xl p-3">
          <p className="text-[10px] text-muted-foreground">{t('lateralDispersion')}</p>
          <p className="font-bold text-sm">{stdDev}m</p>
        </div>
        <div className="bg-muted rounded-xl p-3">
          <p className="text-[10px] text-muted-foreground">{t('avgDeviation')}</p>
          <p className={`font-bold text-sm ${parseFloat(avgLateral) > 0 ? 'text-orange-500' : parseFloat(avgLateral) < 0 ? 'text-blue-500' : 'text-primary'}`}>
            {parseFloat(avgLateral) > 0 ? `+${avgLateral}m` : `${avgLateral}m`}
          </p>
        </div>
        <div className="bg-muted rounded-xl p-3">
          <p className="text-[10px] text-muted-foreground">{t('avgDistance')}</p>
          <p className="font-bold text-sm">{avgDist}y</p>
        </div>
        <div className="bg-muted rounded-xl p-3">
          <p className="text-[10px] text-muted-foreground">{t('distRange')}</p>
          <p className="font-bold text-sm">{distSpread}y</p>
        </div>
      </div>

      <p className="text-xs text-muted-foreground text-center">{consistencyMsg}</p>
    </motion.div>
  );
}