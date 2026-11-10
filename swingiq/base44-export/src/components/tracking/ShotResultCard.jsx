import { motion } from 'framer-motion';

const trajectoryColor = {
  draw: 'text-green-600',
  fade: 'text-blue-500',
  straight: 'text-primary',
  hook: 'text-orange-500',
  slice: 'text-destructive',
  pull: 'text-orange-400',
  push: 'text-yellow-600',
};

export default function ShotResultCard({ shot, index }) {
  const color = trajectoryColor[shot.trajectory?.toLowerCase()] || 'text-foreground';

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.03 }}
      className="bg-card rounded-xl border border-border p-4 space-y-3"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-muted-foreground bg-muted px-2 py-0.5 rounded-full">#{shot.shot_number}</span>
          <span className="text-xs font-medium text-muted-foreground">{shot.club}</span>
        </div>
        <span className={`text-sm font-bold ${color}`}>{shot.trajectory}</span>
      </div>

      <div className="grid grid-cols-4 gap-2">
        <div className="text-center p-2 bg-muted rounded-lg">
          <p className="text-[10px] text-muted-foreground">Distancia</p>
          <p className="font-bold text-sm">{shot.distance_yards}y</p>
          <p className="text-[10px] text-muted-foreground">{shot.distance_meters}m</p>
        </div>
        <div className="text-center p-2 bg-muted rounded-lg">
          <p className="text-[10px] text-muted-foreground">Velocidad</p>
          <p className="font-bold text-sm">{shot.ball_speed_mph}mph</p>
          <p className="text-[10px] text-muted-foreground">{shot.ball_speed_kph}kph</p>
        </div>
        <div className="text-center p-2 bg-muted rounded-lg">
          <p className="text-[10px] text-muted-foreground">Altura</p>
          <p className="font-bold text-sm">{shot.max_height_meters}m</p>
          <p className="text-[10px] text-muted-foreground">{shot.max_height_feet}ft</p>
        </div>
        <div className="text-center p-2 bg-muted rounded-lg">
          <p className="text-[10px] text-muted-foreground">Calidad</p>
          <p className={`font-bold text-sm ${shot.quality_score >= 7 ? 'text-primary' : shot.quality_score >= 4 ? 'text-accent' : 'text-destructive'}`}>
            {shot.quality_score}/10
          </p>
        </div>
      </div>

      {shot.lateral_deviation_meters !== undefined && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Desviación lateral:</span>
          <span className={`font-medium ${shot.lateral_deviation_meters > 0 ? 'text-orange-500' : shot.lateral_deviation_meters < 0 ? 'text-blue-500' : 'text-primary'}`}>
            {shot.lateral_deviation_meters > 0 ? `+${shot.lateral_deviation_meters}m der` : shot.lateral_deviation_meters < 0 ? `${shot.lateral_deviation_meters}m izq` : 'Centro'}
          </span>
        </div>
      )}

      {shot.tip && <p className="text-xs text-muted-foreground italic">💡 {shot.tip}</p>}
    </motion.div>
  );
}