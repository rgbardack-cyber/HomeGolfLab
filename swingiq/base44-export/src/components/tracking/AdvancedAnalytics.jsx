import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { BarChart2, TrendingUp, Calendar, Crown, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { useLang } from '@/lib/i18n.jsx';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, ReferenceLine
} from 'recharts';
import { format, parseISO, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';

// Parse shots from a PracticeSession record
function parseShotsFromSession(session) {
  try {
    const data = JSON.parse(session.ai_analysis || '{}');
    // Single shot stored per session
    return [{ ...data, date: session.date, sessionId: session.id }];
  } catch {
    return [];
  }
}

// Group sessions by month and compute averages
function groupByMonth(sessions) {
  const groups = {};
  sessions.forEach(s => {
    const shots = parseShotsFromSession(s);
    shots.forEach(shot => {
      if (!shot.date) return;
      const key = format(parseISO(shot.date), 'yyyy-MM');
      if (!groups[key]) groups[key] = [];
      groups[key].push(shot);
    });
  });
  return Object.entries(groups)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, shots]) => ({
      month,
      label: format(parseISO(`${month}-01`), 'MMM yy'),
      avgDistance: avg(shots.map(s => s.distance_meters).filter(Boolean)),
      avgSpeed: avg(shots.map(s => s.ball_speed_kph).filter(Boolean)),
      avgScore: avg(shots.map(s => s.quality_score).filter(Boolean)),
      avgHeight: avg(shots.map(s => s.max_height_meters).filter(Boolean)),
      count: shots.length,
    }));
}

function avg(arr) {
  if (!arr.length) return null;
  return Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10;
}

// Extract sessions as comparison options
function buildSessionOptions(sessions) {
  return sessions.slice(0, 20).map((s, i) => ({
    value: s.id,
    label: `${format(parseISO(s.date), 'dd MMM yy')} · ${s.notes?.slice(0, 20) || `#${i + 1}`}`,
    shots: parseShotsFromSession(s),
    date: s.date,
  }));
}

const METRIC_OPTS = [
  { key: 'avgDistance', label: 'Distancia (m)', unit: 'm' },
  { key: 'avgSpeed', label: 'Velocidad (kph)', unit: 'kph' },
  { key: 'avgScore', label: 'Calidad (1-10)', unit: '' },
  { key: 'avgHeight', label: 'Altura máx (m)', unit: 'm' },
];

const CHART_COLORS = ['hsl(var(--primary))', 'hsl(var(--secondary))', 'hsl(var(--chart-3))'];

export default function AdvancedAnalytics({ userEmail }) {
  const { t } = useLang();
  const [mode, setMode] = useState('monthly'); // 'monthly' | 'compare'
  const [metric, setMetric] = useState('avgDistance');
  const [sessionA, setSessionA] = useState('');
  const [sessionB, setSessionB] = useState('');
  const [expanded, setExpanded] = useState(false);

  const { data: sessions = [] } = useQuery({
    queryKey: ['tracking_sessions', userEmail],
    queryFn: () => base44.entities.PracticeSession.filter(
      { type: 'ball_tracking' },
      '-date',
      100
    ),
    enabled: !!userEmail,
  });

  const monthlyData = useMemo(() => groupByMonth(sessions), [sessions]);
  const sessionOptions = useMemo(() => buildSessionOptions(sessions), [sessions]);

  const selectedMetric = METRIC_OPTS.find(m => m.key === metric) || METRIC_OPTS[0];

  // Build comparison data for two sessions
  const comparisonData = useMemo(() => {
    if (mode !== 'compare' || !sessionA || !sessionB) return [];
    const sA = sessionOptions.find(s => s.value === sessionA);
    const sB = sessionOptions.find(s => s.value === sessionB);
    if (!sA || !sB) return [];

    const metricsToCompare = [
      { key: 'distance_meters', label: 'Distancia (m)' },
      { key: 'ball_speed_kph', label: 'Vel. (kph)' },
      { key: 'quality_score', label: 'Calidad' },
      { key: 'max_height_meters', label: 'Altura (m)' },
    ];

    return metricsToCompare.map(m => {
      const valA = avg(sA.shots.map(s => s[m.key]).filter(v => v != null));
      const valB = avg(sB.shots.map(s => s[m.key]).filter(v => v != null));
      return {
        name: m.label,
        [sA.label.slice(0, 12)]: valA,
        [sB.label.slice(0, 12)]: valB,
      };
    });
  }, [mode, sessionA, sessionB, sessionOptions]);

  if (sessions.length < 2) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card rounded-2xl border border-border overflow-hidden"
    >
      {/* Header */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-3 p-4 hover:bg-muted/40 transition-colors"
      >
        <div className="w-9 h-9 rounded-xl bg-secondary/20 flex items-center justify-center shrink-0">
          <TrendingUp className="w-5 h-5 text-secondary" />
        </div>
        <div className="text-left flex-1">
          <div className="flex items-center gap-2">
            <p className="font-heading font-semibold text-sm">Análisis Comparativo</p>
            <span className="text-[10px] bg-secondary/20 text-secondary-foreground font-bold px-1.5 py-0.5 rounded-full flex items-center gap-1">
              <Crown className="w-2.5 h-2.5" /> Premium
            </span>
          </div>
          <p className="text-xs text-muted-foreground">Evolución de métricas · Comparar sesiones</p>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-4">
          {/* Mode toggle */}
          <div className="flex bg-muted rounded-xl p-1 gap-1">
            <button
              onClick={() => setMode('monthly')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-all ${mode === 'monthly' ? 'bg-card shadow text-foreground' : 'text-muted-foreground'}`}
            >
              <Calendar className="w-3.5 h-3.5" /> Promedios mensuales
            </button>
            <button
              onClick={() => setMode('compare')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-all ${mode === 'compare' ? 'bg-card shadow text-foreground' : 'text-muted-foreground'}`}
            >
              <BarChart2 className="w-3.5 h-3.5" /> Comparar sesiones
            </button>
          </div>

          {/* Monthly evolution */}
          {mode === 'monthly' && (
            <div className="space-y-3">
              <Select value={metric} onValueChange={setMetric}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {METRIC_OPTS.map(m => (
                    <SelectItem key={m.key} value={m.key} className="text-xs">{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {monthlyData.length >= 2 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={monthlyData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                    <Tooltip
                      contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 11 }}
                      formatter={(v) => v != null ? [`${v} ${selectedMetric.unit}`, selectedMetric.label] : ['—', selectedMetric.label]}
                    />
                    <Line
                      type="monotone"
                      dataKey={metric}
                      stroke={CHART_COLORS[0]}
                      strokeWidth={2}
                      dot={{ r: 4, fill: CHART_COLORS[0] }}
                      connectNulls
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-xs text-muted-foreground text-center py-6">
                  Necesitas sesiones en al menos 2 meses para ver la evolución.
                </p>
              )}

              {/* Summary stats */}
              {monthlyData.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: 'Sesiones', val: sessions.length },
                    { label: 'Dist. prom.', val: avg(monthlyData.map(m => m.avgDistance).filter(Boolean)) + ' m' },
                    { label: 'Vel. prom.', val: avg(monthlyData.map(m => m.avgSpeed).filter(Boolean)) + ' kph' },
                  ].map(item => (
                    <div key={item.label} className="bg-muted/50 rounded-xl p-2.5 text-center">
                      <p className="text-sm font-bold text-primary">{item.val}</p>
                      <p className="text-[10px] text-muted-foreground">{item.label}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Session comparison */}
          {mode === 'compare' && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-[10px] text-muted-foreground mb-1 font-medium">Sesión A</p>
                  <Select value={sessionA} onValueChange={setSessionA}>
                    <SelectTrigger className="h-8 text-[11px]">
                      <SelectValue placeholder="Elegir..." />
                    </SelectTrigger>
                    <SelectContent>
                      {sessionOptions.map(s => (
                        <SelectItem key={s.value} value={s.value} className="text-xs">{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground mb-1 font-medium">Sesión B</p>
                  <Select value={sessionB} onValueChange={setSessionB}>
                    <SelectTrigger className="h-8 text-[11px]">
                      <SelectValue placeholder="Elegir..." />
                    </SelectTrigger>
                    <SelectContent>
                      {sessionOptions.map(s => (
                        <SelectItem key={s.value} value={s.value} className="text-xs">{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {comparisonData.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={comparisonData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" tick={{ fontSize: 9 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                    <Tooltip
                      contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 11 }}
                    />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                    {Object.keys(comparisonData[0] || {}).filter(k => k !== 'name').map((key, i) => (
                      <Bar key={key} dataKey={key} fill={CHART_COLORS[i % CHART_COLORS.length]} radius={[4, 4, 0, 0]} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-xs text-muted-foreground text-center py-6">
                  Selecciona dos sesiones para comparar sus métricas.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}