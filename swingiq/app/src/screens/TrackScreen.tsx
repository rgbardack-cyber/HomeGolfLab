/**
 * SwingIQ — Ball Tracking Screen
 * ================================
 * Full replacement for the Track screen placeholder.
 *
 * LAYOUT (3 tabs)
 * ───────────────
 *  📷 Record  — Camera setup guide + record button → submit for analysis
 *  📊 Results — Latest shot: trajectory overlay + 4 launch metrics
 *  🎯 Dispersion — All shots plotted as a cluster with stats
 *
 * CAMERA PLACEMENT GUIDE
 * ───────────────────────
 * The user is prompted to place the phone:
 *   PUTT/CHIP  — side-on, ~4 ft away, ball at bottom centre
 *   FULL SWING — behind the ball, 8–10 ft back, slightly elevated
 *
 * The trajectory overlay is drawn on a Canvas-style SVG using the
 * normalised track_points returned by the backend.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, Alert, Dimensions,
} from 'react-native';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import Svg, { Circle, Path, Line, Text as SvgText, Ellipse, G } from 'react-native-svg';

import { analyseShot, getDispersion } from '../services/tracking.api';
import type { TrackingResult, DispersionData, TrackPoint } from '../services/tracking.api';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/theme';

const { width: SW } = Dimensions.get('window');
const OVERLAY_W = SW - Spacing.lg * 2;
const OVERLAY_H = OVERLAY_W * 0.56;  // 16:9-ish

type ActiveTab = 'record' | 'results' | 'dispersion';

const SHOT_TYPE_LABELS: Record<string, string> = {
  putt:       '🏌️ Putt',
  chip:       '⛳ Chip',
  full_swing: '💨 Full Swing',
};

const SHOT_TYPE_COLORS: Record<string, string> = {
  putt:       Colors.greenMid,
  chip:       Colors.gold,
  full_swing: '#4080d0',
};

// ── Main component ────────────────────────────────────────────────────────────

export default function TrackScreen() {
  const [tab,         setTab]         = useState<ActiveTab>('record');
  const [result,      setResult]      = useState<TrackingResult | null>(null);
  const [dispersion,  setDispersion]  = useState<DispersionData | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isAnalysing, setIsAnalysing] = useState(false);
  const [shotFilter,  setShotFilter]  = useState<string | undefined>(undefined);
  const [recSecs,     setRecSecs]     = useState(0);

  const cameraRef = useRef<CameraView>(null);
  const timerRef  = useRef<ReturnType<typeof setInterval>>();

  const [camPerm, requestCamPerm] = useCameraPermissions();
  const [micPerm, requestMicPerm] = useMicrophonePermissions();

  // Load dispersion on mount and when filter changes
  useEffect(() => {
    loadDispersion();
  }, [shotFilter]);

  const loadDispersion = async () => {
    try {
      const data = await getDispersion(shotFilter);
      setDispersion(data);
    } catch (e) {
      // Not fatal — dispersion map just won't show
    }
  };

  // ── Recording ─────────────────────────────────────────────────────────────

  const startRecording = async () => {
    if (!camPerm?.granted) {
      const { granted } = await requestCamPerm();
      if (!granted) { Alert.alert('Camera access needed'); return; }
    }
    if (!micPerm?.granted) await requestMicPerm();

    setIsRecording(true);
    setRecSecs(0);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    timerRef.current = setInterval(() => setRecSecs(s => s + 1), 1000);

    try {
      const video = await cameraRef.current?.recordAsync({ maxDuration: 15 });
      if (video?.uri) {
        submitVideo(video.uri);
      }
    } catch (e) {
      console.warn('Record error', e);
    } finally {
      clearInterval(timerRef.current);
      setIsRecording(false);
    }
  };

  const stopRecording = () => {
    cameraRef.current?.stopRecording();
    clearInterval(timerRef.current);
    setIsRecording(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const submitVideo = async (uri: string) => {
    setIsAnalysing(true);
    try {
      const res = await analyseShot(uri);
      setResult(res);
      await loadDispersion();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setTab('results');
    } catch (err: any) {
      Alert.alert('Tracking failed', err?.message ?? 'Could not analyse shot. Try again.');
    } finally {
      setIsAnalysing(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <LinearGradient colors={[Colors.dark, Colors.darkMid]} style={styles.header}>
        <Text style={styles.headerTitle}>Ball Tracking</Text>
        <Text style={styles.headerSub}>
          {result ? `Last: ${SHOT_TYPE_LABELS[result.metrics.shot_type] ?? result.metrics.shot_type}` : 'No shots yet'}
        </Text>
      </LinearGradient>

      {/* Tab bar */}
      <View style={styles.tabBar}>
        {(['record','results','dispersion'] as ActiveTab[]).map(t => (
          <TouchableOpacity
            key={t}
            style={[styles.tabPill, tab === t && styles.tabPillActive]}
            onPress={() => setTab(t)}
          >
            <Text style={[styles.tabPillText, tab === t && styles.tabPillTextActive]}>
              {t === 'record' ? '📷 Record' : t === 'results' ? '📊 Results' : '🎯 Dispersion'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── RECORD TAB ── */}
      {tab === 'record' && (
        <RecordTab
          cameraRef={cameraRef}
          isRecording={isRecording}
          isAnalysing={isAnalysing}
          recSecs={recSecs}
          onStart={startRecording}
          onStop={stopRecording}
          camPerm={camPerm}
          requestCamPerm={requestCamPerm}
        />
      )}

      {/* ── RESULTS TAB ── */}
      {tab === 'results' && (
        <ResultsTab result={result} />
      )}

      {/* ── DISPERSION TAB ── */}
      {tab === 'dispersion' && (
        <DispersionTab
          data={dispersion}
          filter={shotFilter}
          onFilterChange={setShotFilter}
        />
      )}
    </SafeAreaView>
  );
}

// ── Record Tab ────────────────────────────────────────────────────────────────

function RecordTab({ cameraRef, isRecording, isAnalysing, recSecs, onStart, onStop, camPerm, requestCamPerm }: any) {
  if (isAnalysing) {
    return (
      <LinearGradient colors={[Colors.dark, Colors.darkMid]} style={styles.analysingFill}>
        <ActivityIndicator color={Colors.greenGlow} size="large" />
        <Text style={styles.analysingTitle}>Tracking shot…</Text>
        <Text style={styles.analysingSteps}>
          {'→ Detecting ball position\n→ Building trajectory\n→ Computing launch metrics'}
        </Text>
      </LinearGradient>
    );
  }

  return (
    <ScrollView style={styles.fill}>
      {/* Setup guide */}
      {!isRecording && (
        <View style={styles.guideCard}>
          <Text style={styles.guideTitle}>📐 Camera Setup</Text>
          <View style={styles.guideRow}>
            <GuideItem shot="Putt" pos="Side-on, 3–5 ft away" icon="🏌️" />
            <GuideItem shot="Chip" pos="Side-on, 5–8 ft away" icon="⛳" />
            <GuideItem shot="Full" pos="Behind ball, 8–10 ft" icon="💨" />
          </View>
          <Text style={styles.guideTip}>
            💡 Place phone on a stable surface · Ball at bottom-centre of frame · Good lighting
          </Text>
        </View>
      )}

      {/* Camera view */}
      <View style={styles.cameraWrap}>
        {camPerm?.granted ? (
          <CameraView
            ref={cameraRef}
            style={styles.camera}
            facing="back"
            mode="video"
          >
            {/* Ball placement guide overlay */}
            {!isRecording && (
              <View style={styles.ballGuideOverlay}>
                <View style={styles.ballGuideCircle} />
                <Text style={styles.ballGuideLabel}>Place ball here</Text>
              </View>
            )}
            {/* Recording indicator */}
            {isRecording && (
              <View style={styles.recIndicator}>
                <View style={styles.recDot} />
                <Text style={styles.recTime}>
                  {String(Math.floor(recSecs / 60)).padStart(2,'0')}:{String(recSecs % 60).padStart(2,'0')}
                </Text>
              </View>
            )}
          </CameraView>
        ) : (
          <TouchableOpacity style={styles.cameraPlaceholder} onPress={requestCamPerm}>
            <Text style={styles.cameraPlaceholderIcon}>📷</Text>
            <Text style={styles.cameraPlaceholderText}>Tap to enable camera</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Record button */}
      <View style={styles.recordBtnWrap}>
        <TouchableOpacity
          style={[styles.recordBtn, isRecording && styles.recordBtnActive]}
          onPress={isRecording ? onStop : onStart}
          activeOpacity={0.85}
        >
          <View style={[styles.recordBtnInner, isRecording && styles.recordBtnInnerStop]} />
        </TouchableOpacity>
        <Text style={styles.recordBtnLabel}>
          {isRecording ? 'Tap to stop and analyse' : 'Tap to start recording (max 15s)'}
        </Text>
      </View>
    </ScrollView>
  );
}

function GuideItem({ shot, pos, icon }: { shot: string; pos: string; icon: string }) {
  return (
    <View style={styles.guideItem}>
      <Text style={styles.guideItemIcon}>{icon}</Text>
      <Text style={styles.guideItemShot}>{shot}</Text>
      <Text style={styles.guideItemPos}>{pos}</Text>
    </View>
  );
}

// ── Results Tab ───────────────────────────────────────────────────────────────

function ResultsTab({ result }: { result: TrackingResult | null }) {
  if (!result) {
    return (
      <View style={styles.emptyTab}>
        <Text style={styles.emptyIcon}>🎯</Text>
        <Text style={styles.emptyTitle}>No shot analysed yet</Text>
        <Text style={styles.emptySub}>Record a shot on the Record tab to see metrics here</Text>
      </View>
    );
  }

  const { metrics, track_points, frame_width, frame_height } = result;
  const color = SHOT_TYPE_COLORS[metrics.shot_type] ?? Colors.green;

  return (
    <ScrollView>
      {/* Shot type badge */}
      <View style={[styles.shotTypeBadge, { backgroundColor: color + '22', borderColor: color + '66' }]}>
        <Text style={[styles.shotTypeText, { color }]}>
          {SHOT_TYPE_LABELS[metrics.shot_type] ?? metrics.shot_type.replace('_', ' ')}
        </Text>
        <Text style={styles.confText}>{Math.round(metrics.confidence * 100)}% confidence</Text>
      </View>

      {/* Trajectory overlay */}
      <View style={styles.overlayWrap}>
        <LinearGradient colors={[Colors.dark, Colors.darkCard]} style={styles.overlayBg}>
          <TrajectoryOverlay
            points={track_points}
            frameW={frame_width}
            frameH={frame_height}
            width={OVERLAY_W}
            height={OVERLAY_H}
            color={color}
            apexFrame={metrics.apex_frame}
          />
        </LinearGradient>
      </View>

      {/* Metrics grid */}
      <View style={styles.metricsGrid}>
        <MetricBox label="Ball Speed" value={`${metrics.ball_speed_mph}`} unit="mph" color={color} />
        <MetricBox label="Launch Angle" value={`${metrics.launch_angle_deg}°`} unit="" color={color} />
        <MetricBox label="Direction" value={`${metrics.direction_deg > 0 ? '+' : ''}${metrics.direction_deg}°`} unit={metrics.direction_deg > 0 ? 'right' : 'left'} color={color} />
        <MetricBox label="Carry" value={`${metrics.carry_distance_yd}`} unit="yds" color={color} />
      </View>

      {/* Interpretation */}
      <View style={styles.interpretCard}>
        <Text style={styles.interpretTitle}>📋 Reading your numbers</Text>
        <Text style={styles.interpretText}>
          {interpretMetrics(metrics)}
        </Text>
      </View>

      <View style={{ height: Spacing.xxxl }} />
    </ScrollView>
  );
}

function MetricBox({ label, value, unit, color }: { label: string; value: string; unit: string; color: string }) {
  return (
    <View style={styles.metricBox}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, { color }]}>{value}</Text>
      {unit ? <Text style={styles.metricUnit}>{unit}</Text> : null}
    </View>
  );
}

function TrajectoryOverlay({
  points, frameW, frameH, width, height, color, apexFrame
}: {
  points: TrackPoint[];
  frameW: number; frameH: number;
  width: number; height: number;
  color: string; apexFrame: number;
}) {
  if (!points.length) return null;

  // Scale normalised coords to SVG size
  const sx = (x: number) => x * width;
  const sy = (y: number) => y * height;

  // Build SVG path from track points
  const pathD = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${sx(p.x).toFixed(1)} ${sy(p.y).toFixed(1)}`)
    .join(' ');

  const apexPoint = points.find(p => p.frame_idx === apexFrame) ?? points[Math.floor(points.length / 2)];
  const startPt   = points[0];
  const endPt     = points[points.length - 1];

  return (
    <Svg width={width} height={height}>
      {/* Grid lines */}
      {[0.25, 0.5, 0.75].map(frac => (
        <Line
          key={frac}
          x1={0} y1={sy(frac)} x2={width} y2={sy(frac)}
          stroke="rgba(255,255,255,0.06)" strokeWidth={0.5}
        />
      ))}
      {[0.25, 0.5, 0.75].map(frac => (
        <Line
          key={frac}
          x1={sx(frac)} y1={0} x2={sx(frac)} y2={height}
          stroke="rgba(255,255,255,0.06)" strokeWidth={0.5}
        />
      ))}

      {/* Glow / shadow path */}
      <Path d={pathD} fill="none" stroke={color} strokeWidth={6} strokeOpacity={0.15} strokeLinecap="round" strokeLinejoin="round" />
      {/* Main trajectory path */}
      <Path d={pathD} fill="none" stroke={color} strokeWidth={2.5} strokeOpacity={0.9} strokeLinecap="round" strokeLinejoin="round" />

      {/* Start point */}
      <Circle cx={sx(startPt.x)} cy={sy(startPt.y)} r={6} fill="rgba(255,255,255,0.9)" />
      <Circle cx={sx(startPt.x)} cy={sy(startPt.y)} r={3} fill={color} />

      {/* Apex marker */}
      {apexPoint && (
        <G>
          <Circle cx={sx(apexPoint.x)} cy={sy(apexPoint.y)} r={5} fill={color} opacity={0.8} />
          <SvgText
            x={sx(apexPoint.x) + 8} y={sy(apexPoint.y) - 4}
            fill="rgba(255,255,255,0.6)" fontSize={9} fontWeight="600"
          >
            APEX
          </SvgText>
        </G>
      )}

      {/* Landing point */}
      <Circle cx={sx(endPt.x)} cy={sy(endPt.y)} r={5} fill="rgba(255,255,255,0.5)" />

      {/* Labels */}
      <SvgText x={sx(startPt.x) + 10} y={sy(startPt.y) + 4} fill="rgba(255,255,255,0.4)" fontSize={9}>ADDRESS</SvgText>
      <SvgText x={4} y={14} fill="rgba(255,255,255,0.3)" fontSize={9}>TRAJECTORY</SvgText>
    </Svg>
  );
}

function interpretMetrics(m: ReturnType<typeof analyseShot> extends Promise<infer T> ? T : never extends { metrics: infer M } ? M : any): string {
  // This accepts the LaunchMetrics shape
  const parts: string[] = [];

  if (m.shot_type === 'putt') {
    if (m.ball_speed_mph < 3)   parts.push('Very soft stroke — good for short putts under 6 feet.');
    else if (m.ball_speed_mph < 7) parts.push('Medium pace — suited to 10–20 foot putts.');
    else parts.push('Firm stroke — check you\'re not over-hitting on shorter putts.');
  }

  if (m.shot_type === 'chip') {
    if (m.launch_angle_deg < 8)  parts.push('Low trajectory chip — will run out more after landing.');
    if (m.launch_angle_deg > 25) parts.push('High trajectory — good for landing soft near the pin.');
  }

  if (m.shot_type === 'full_swing') {
    if (m.launch_angle_deg < 8)   parts.push('Low launch — consider a higher-lofted club or tee it up slightly.');
    if (m.launch_angle_deg > 20)  parts.push('High launch — good for carry but watch for spin loft loss of distance.');
    if (m.ball_speed_mph < 60)    parts.push('Moderate speed — focus on a fuller shoulder turn for more distance.');
    if (m.ball_speed_mph > 120)   parts.push('Great ball speed — work on direction to tighten dispersion.');
  }

  if (Math.abs(m.direction_deg) > 5) {
    const side = m.direction_deg > 0 ? 'right' : 'left';
    parts.push(`Ball started ${Math.abs(m.direction_deg).toFixed(1)}° ${side} — check your alignment.`);
  }

  return parts.length ? parts.join(' ') : 'Shot tracked successfully. Keep practising to build a history of data.';
}

// ── Dispersion Tab ────────────────────────────────────────────────────────────

function DispersionTab({ data, filter, onFilterChange }: {
  data: DispersionData | null;
  filter: string | undefined;
  onFilterChange: (f: string | undefined) => void;
}) {
  const filters = [
    { label: 'All',        value: undefined     },
    { label: '🏌️ Putts',  value: 'putt'        },
    { label: '⛳ Chips',   value: 'chip'        },
    { label: '💨 Swings', value: 'full_swing'  },
  ];

  if (!data || data.stats.count === 0) {
    return (
      <View style={styles.emptyTab}>
        <Text style={styles.emptyIcon}>🎯</Text>
        <Text style={styles.emptyTitle}>No shots yet</Text>
        <Text style={styles.emptySub}>Record shots on the Record tab to build your dispersion map</Text>
      </View>
    );
  }

  const { stats, landing_points } = data;

  return (
    <ScrollView>
      {/* Filter pills */}
      <View style={styles.filterRow}>
        {filters.map(f => (
          <TouchableOpacity
            key={String(f.value)}
            style={[styles.filterPill, filter === f.value && styles.filterPillActive]}
            onPress={() => onFilterChange(f.value)}
          >
            <Text style={[styles.filterText, filter === f.value && styles.filterTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Dispersion map */}
      <View style={styles.dispMapWrap}>
        <LinearGradient colors={[Colors.dark, Colors.darkCard]} style={styles.dispMapBg}>
          <DispersionMap points={landing_points} width={OVERLAY_W} height={OVERLAY_H} />
        </LinearGradient>
      </View>

      {/* Stats cards */}
      <View style={styles.statsGrid}>
        <StatCard label="Shots" value={String(stats.count)} />
        <StatCard label="Avg Carry" value={`${stats.avg_carry_yd} yd`} />
        <StatCard label="Avg Speed" value={`${stats.avg_speed_mph} mph`} />
        <StatCard label="Consistency" value={`${stats.consistency_pct}%`}
          color={stats.consistency_pct >= 75 ? Colors.green : stats.consistency_pct >= 50 ? Colors.gold : Colors.severityFix}
        />
        <StatCard label="Lateral Spread" value={`±${stats.lateral_std_yd} yd`} />
        <StatCard label="Carry Range" value={`${stats.min_carry_yd}–${stats.max_carry_yd} yd`} />
      </View>

      <View style={{ height: Spacing.xxxl }} />
    </ScrollView>
  );
}

function DispersionMap({ points, width, height }: {
  points: DispersionData['landing_points'];
  width: number; height: number;
}) {
  // Map carry/lateral to SVG coords
  // Centre of map = (width/2, height*0.8) = where "target" is
  const cx = width / 2;
  const cy = height * 0.75;
  const scale = width / 60; // 60 yards = full width

  const sx = (lateral: number) => cx + lateral * scale;
  const sy = (carry: number)   => cy - carry  * scale;

  const colorFor = (type: string) => SHOT_TYPE_COLORS[type] ?? Colors.green;

  return (
    <Svg width={width} height={height}>
      {/* Target rings */}
      {[5, 10, 20].map(r => (
        <Ellipse
          key={r}
          cx={cx} cy={cy}
          rx={r * scale} ry={r * scale * 0.4}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={0.5}
        />
      ))}
      {/* Centre line */}
      <Line x1={cx} y1={10} x2={cx} y2={height - 10}
        stroke="rgba(255,255,255,0.1)" strokeWidth={0.5} strokeDasharray="4 4" />

      {/* Shot dots */}
      {points.map((pt, i) => {
        const px = sx(pt.lateral_yd);
        const py = sy(pt.carry_yd);
        if (px < 0 || px > width || py < 0 || py > height) return null;
        return (
          <Circle
            key={i}
            cx={px} cy={py} r={5}
            fill={colorFor(pt.shot_type)}
            opacity={0.75}
          />
        );
      })}

      {/* Target marker */}
      <Circle cx={cx} cy={cy} r={6} fill="rgba(255,255,255,0.1)" />
      <Circle cx={cx} cy={cy} r={3} fill="rgba(255,255,255,0.6)" />

      {/* Labels */}
      <SvgText x={cx + 4} y={cy - 8} fill="rgba(255,255,255,0.4)" fontSize={8}>TARGET</SvgText>
      <SvgText x={4} y={14} fill="rgba(255,255,255,0.3)" fontSize={9}>DISPERSION MAP</SvgText>

      {/* Lateral axis labels */}
      <SvgText x={8} y={cy + 4} fill="rgba(255,255,255,0.25)" fontSize={8}>←L</SvgText>
      <SvgText x={width - 18} y={cy + 4} fill="rgba(255,255,255,0.25)" fontSize={8}>R→</SvgText>
    </Svg>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, color ? { color } : undefined]}>{value}</Text>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe:         { flex: 1, backgroundColor: Colors.background },
  fill:         { flex: 1 },

  header:       { padding: Spacing.lg, paddingTop: Spacing.xl },
  headerTitle:  { fontSize: Typography.xxl, fontWeight: Typography.bold, color: Colors.textOnDark },
  headerSub:    { fontSize: Typography.xs, color: Colors.textOnDarkDim, marginTop: 2 },

  tabBar:       { flexDirection: 'row', padding: Spacing.sm, gap: 6, backgroundColor: Colors.surface, borderBottomWidth: 0.5, borderBottomColor: Colors.border },
  tabPill:      { flex: 1, paddingVertical: 7, borderRadius: Radius.full, alignItems: 'center', backgroundColor: Colors.background },
  tabPillActive:{ backgroundColor: Colors.green },
  tabPillText:  { fontSize: Typography.xs, fontWeight: Typography.medium, color: Colors.textSecondary },
  tabPillTextActive: { color: '#fff', fontWeight: Typography.bold },

  // Record tab
  guideCard:    { margin: Spacing.lg, backgroundColor: Colors.surface, borderRadius: Radius.md, padding: Spacing.md, borderWidth: 0.5, borderColor: Colors.border, ...Shadow.sm },
  guideTitle:   { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textPrimary, marginBottom: Spacing.sm },
  guideRow:     { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.sm },
  guideItem:    { flex: 1, alignItems: 'center', gap: 3 },
  guideItemIcon:{ fontSize: 22 },
  guideItemShot:{ fontSize: Typography.xs, fontWeight: Typography.semibold, color: Colors.textPrimary },
  guideItemPos: { fontSize: 10, color: Colors.textSecondary, textAlign: 'center' },
  guideTip:     { fontSize: Typography.xs, color: Colors.textSecondary, lineHeight: 16 },

  cameraWrap:   { marginHorizontal: Spacing.lg, borderRadius: Radius.lg, overflow: 'hidden', height: 220, backgroundColor: Colors.dark },
  camera:       { flex: 1 },
  cameraPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.sm },
  cameraPlaceholderIcon: { fontSize: 48 },
  cameraPlaceholderText: { fontSize: Typography.sm, color: Colors.textOnDarkDim },

  ballGuideOverlay: { position: 'absolute', bottom: 30, left: 0, right: 0, alignItems: 'center', gap: 4 },
  ballGuideCircle:  { width: 32, height: 32, borderRadius: 16, borderWidth: 2, borderColor: 'rgba(109,207,142,0.7)', borderStyle: 'dashed' },
  ballGuideLabel:   { fontSize: 10, color: 'rgba(109,207,142,0.8)', fontWeight: '600' },

  recIndicator: { position: 'absolute', top: 10, left: 10, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  recDot:       { width: 8, height: 8, borderRadius: 4, backgroundColor: '#ff4040' },
  recTime:      { fontSize: Typography.xs, color: '#fff', fontWeight: '600' },

  recordBtnWrap:  { alignItems: 'center', paddingVertical: Spacing.xl, gap: Spacing.sm },
  recordBtn:      { width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(255,80,80,0.15)', alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#ff4040' },
  recordBtnActive:{ borderColor: '#ff4040', backgroundColor: 'rgba(255,80,80,0.3)' },
  recordBtnInner: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#ff4040' },
  recordBtnInnerStop: { borderRadius: 6, width: 24, height: 24 },
  recordBtnLabel: { fontSize: Typography.xs, color: Colors.textSecondary },

  analysingFill:  { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.lg, padding: Spacing.xl },
  analysingTitle: { fontSize: Typography.xl, fontWeight: Typography.bold, color: Colors.textOnDark },
  analysingSteps: { fontSize: Typography.sm, color: Colors.textOnDarkDim, lineHeight: 24, fontVariant: ['tabular-nums'] },

  // Results tab
  shotTypeBadge: { margin: Spacing.lg, borderWidth: 0.5, borderRadius: Radius.md, padding: Spacing.md, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  shotTypeText:  { fontSize: Typography.md, fontWeight: Typography.bold },
  confText:      { fontSize: Typography.xs, color: Colors.textSecondary },

  overlayWrap:  { marginHorizontal: Spacing.lg, borderRadius: Radius.lg, overflow: 'hidden' },
  overlayBg:    { padding: 1, borderRadius: Radius.lg },

  metricsGrid:  { flexDirection: 'row', flexWrap: 'wrap', padding: Spacing.md, gap: Spacing.sm },
  metricBox:    { width: '47%', backgroundColor: Colors.surface, borderRadius: Radius.md, padding: Spacing.md, borderWidth: 0.5, borderColor: Colors.border, alignItems: 'center', ...Shadow.sm },
  metricLabel:  { fontSize: 10, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.05, marginBottom: 4 },
  metricValue:  { fontSize: Typography.xxl, fontWeight: Typography.bold },
  metricUnit:   { fontSize: Typography.xs, color: Colors.textSecondary, marginTop: 2 },

  interpretCard:  { margin: Spacing.lg, backgroundColor: Colors.greenLight, borderRadius: Radius.md, padding: Spacing.md, borderWidth: 0.5, borderColor: Colors.border },
  interpretTitle: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.green, marginBottom: Spacing.sm },
  interpretText:  { fontSize: Typography.sm, color: Colors.textSecondary, lineHeight: 20 },

  // Dispersion tab
  filterRow:      { flexDirection: 'row', gap: 6, padding: Spacing.lg, paddingBottom: Spacing.sm },
  filterPill:     { paddingHorizontal: 12, paddingVertical: 5, borderRadius: Radius.full, backgroundColor: Colors.surface, borderWidth: 0.5, borderColor: Colors.border },
  filterPillActive:{ backgroundColor: Colors.green, borderColor: Colors.green },
  filterText:     { fontSize: Typography.xs, color: Colors.textSecondary, fontWeight: Typography.medium },
  filterTextActive:{ color: '#fff' },

  dispMapWrap:    { marginHorizontal: Spacing.lg, borderRadius: Radius.lg, overflow: 'hidden' },
  dispMapBg:      { padding: 1, borderRadius: Radius.lg },

  statsGrid:    { flexDirection: 'row', flexWrap: 'wrap', padding: Spacing.md, gap: Spacing.sm },
  statCard:     { width: '30%', flexGrow: 1, backgroundColor: Colors.surface, borderRadius: Radius.sm, padding: Spacing.sm, borderWidth: 0.5, borderColor: Colors.border, alignItems: 'center', ...Shadow.sm },
  statLabel:    { fontSize: 9, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.04, marginBottom: 3 },
  statValue:    { fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.textPrimary },

  // Empty states
  emptyTab:   { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xxxl },
  emptyIcon:  { fontSize: 52, marginBottom: Spacing.md },
  emptyTitle: { fontSize: Typography.xl, fontWeight: Typography.bold, color: Colors.textPrimary, textAlign: 'center', marginBottom: Spacing.sm },
  emptySub:   { fontSize: Typography.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },
});
