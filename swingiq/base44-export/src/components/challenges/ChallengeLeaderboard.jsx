import { Trophy, Medal } from 'lucide-react';

const placeStyles = {
  0: 'bg-accent/20 text-accent border-accent/30',
  1: 'bg-muted text-muted-foreground border-border',
  2: 'bg-chart-1/10 text-chart-1 border-chart-1/20',
};

export default function ChallengeLeaderboard({ entries = [], currentUserEmail }) {
  const sorted = [...entries].sort((a, b) => (b.total_points || 0) - (a.total_points || 0));

  return (
    <div className="bg-card rounded-2xl border border-border overflow-hidden">
      <div className="p-5 border-b border-border flex items-center gap-3">
        <Trophy className="w-5 h-5 text-accent" />
        <h3 className="font-heading font-semibold text-lg">Tabla de Posiciones</h3>
        <span className="ml-auto text-sm text-muted-foreground">{sorted.length} participantes</span>
      </div>

      {sorted.length === 0 ? (
        <div className="p-8 text-center text-muted-foreground text-sm">
          Aún no hay participantes
        </div>
      ) : (
        <div className="divide-y divide-border">
          {sorted.map((entry, idx) => {
            const isMe = entry.user_email === currentUserEmail;
            return (
              <div
                key={entry.id}
                className={`flex items-center gap-4 px-5 py-3 ${isMe ? 'bg-primary/5' : ''}`}
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold border ${placeStyles[idx] || 'bg-muted text-muted-foreground border-border'}`}>
                  {idx < 3 ? <Medal className="w-4 h-4" /> : idx + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`font-medium text-sm truncate ${isMe ? 'text-primary' : ''}`}>
                    {entry.user_name || entry.user_email}
                    {isMe && <span className="text-xs ml-2 text-primary">(tú)</span>}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-heading font-bold">{entry.total_points || 0}</p>
                  <p className="text-xs text-muted-foreground">pts</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}