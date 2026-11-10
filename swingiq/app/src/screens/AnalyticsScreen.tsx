/**
 * Analytics Screen
 * ----------------
 * Shows performance trends across all saved sessions:
 *   - Average score trend
 *   - Sessions this week (bar chart)
 *   - Per-skill progress bars (derived from feedback category frequency)
 *   - Full session history list
 */

import React, { useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useStore, SwingSession } from '@/store';
import { EmptyState, SectionHeader } from '@/components/ui';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/theme';
import dayjs from 'dayjs';

const DAYS = ['M','T','W','T','F','S','S'];

export default function AnalyticsScreen() {
  const { sessions, setActiveSession } = useStore();

  // ── Derived stats ─────────────────────────────────────────────────────────
  const avgScore = useMemo(() => {
    if (!sessions.length) return 0;
    return Math.round(sessions.reduce((a, s) => a + s.overall_score, 0) / sessions.length);
  }, [sessions]);

  const bestScore = useMemo(() => {
    if (!sessions.length) return 0;
    return Math.max(...sessions.map(s => s.overall_score));
  }, [sessions]);

  // Sessions per day of current week (Mon–Sun)
  const weeklyData = useMemo(() => {
    const now = dayjs();
    const startOfWeek = now.startOf('week');
    const counts = Array(7).fill(0);
    sessions.forEach(s => {
      const day = dayjs(s.recorded_at);
      const diff = day.diff(startOfWeek, 'day');
      if (diff >= 0 && diff < 7) counts[diff]++;
    });
    return counts;
  }, [sessions]);

  const maxWeeklyCount = Math.max(...weeklyData, 1);

  // Skill scores derived from feedback — count of non-"good" items per category
  const skillScores = useMemo(() => {
    const cats: Record<string, { issues: number; total: number }> = {
      posture:        { issues: 0, total: 0 },
      swing_path:     { issues: 0, total: 0 },
      tempo:          { issues: 0, total: 0 },
      weight_transfer:{ issues: 0, total: 0 },
      impact:         { issues: 0, total: 0 },
    };
    sessions.forEach(s => {
      s.feedback.forEach(f => {
        if (cats[f.category]) {
          cats[f.category].total++;
          if (f.severity !== 'good') cats[f.category].issues++;
        }
      });
    });
    return Object.entries(cats).map(([cat, { issues, total }]) => ({
      label: cat.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase()),
      pct: total === 0 ? 60 : Math.round(((total - issues) / total) * 100),
    }));
  }, [sessions]);

  if (sessions.length === 0) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Analytics</Text>
        </View>
        <EmptyState
          icon="📊"
          title="No data yet"
          subtitle="Complete your first swing analysis to see your performance trends here"
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Analytics</Text>
          <Text style={styles.headerSub}>{sessions.length} sessions total</Text>
        </View>

        {/* ── Stat cards ── */}
        <View style={styles.statGrid}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>AVG SCORE</Text>
            <Text style={styles.statVal}>{avgScore}</Text>
            <Text style={styles.statSub}>out of 100</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>BEST SCORE</Text>
            <Text style={[styles.statVal, { color: Colors.gold }]}>{bestScore}</Text>
            <Text style={styles.statSub}>personal best</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>SESSIONS</Text>
            <Text style={styles.statVal}>{sessions.length}</Text>
            <Text style={styles.statSub}>all time</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>THIS WEEK</Text>
            <Text style={styles.statVal}>{weeklyData.reduce((a, b) => a + b, 0)}</Text>
            <Text style={styles.statSub}>sessions</Text>
          </View>
        </View>

        {/* ── Weekly bar chart ── */}
        <SectionHeader title="Sessions This Week" />
        <View style={styles.chartCard}>
          <View style={styles.barChart}>
            {weeklyData.map((count, i) => {
              const isToday = dayjs().day() === (i + 1) % 7;
              const heightPct = (count / maxWeeklyCount) * 100;
              return (
                <View key={i} style={styles.barWrap}>
                  <View style={styles.barOuter}>
                    <View style={[
                      styles.barFill,
                      { height: `${Math.max(heightPct, 4)}%` },
                      isToday && styles.barFillToday,
                    ]} />
                  </View>
                  <Text style={[styles.barLabel, isToday && styles.barLabelToday]}>
                    {DAYS[i]}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* ── Skill progress ── */}
        <SectionHeader title="Skill Breakdown" subtitle="Based on AI coaching feedback" />
        <View style={styles.skillCard}>
          {skillScores.map(({ label, pct }) => (
            <View key={label} style={styles.skillItem}>
              <View style={styles.skillHeader}>
                <Text style={styles.skillLabel}>{label}</Text>
                <Text style={[
                  styles.skillPct,
                  { color: pct >= 75 ? Colors.green : pct >= 50 ? Colors.gold : Colors.severityFix }
                ]}>{pct}%</Text>
              </View>
              <View style={styles.skillTrack}>
                <View style={[
                  styles.skillFill,
                  { width: `${pct}%` },
                  { backgroundColor: pct >= 75 ? Colors.greenMid : pct >= 50 ? Colors.gold : Colors.severityFix },
                ]} />
              </View>
            </View>
          ))}
        </View>

        {/* ── Session history ── */}
        <SectionHeader title="Session History" />
        {sessions.map(session => (
          <TouchableOpacity
            key={session.session_id}
            style={styles.historyCard}
            onPress={() => { setActiveSession(session); router.push('/swing/results'); }}
            activeOpacity={0.8}
          >
            <View style={[styles.scoreCircle, { backgroundColor: scoreColor(session.overall_score) + '22' }]}>
              <Text style={[styles.scoreNum, { color: scoreColor(session.overall_score) }]}>
                {session.overall_score}
              </Text>
            </View>
            <View style={styles.historyInfo}>
              <Text style={styles.historyClub}>{session.club_used}</Text>
              <Text style={styles.historyDate}>{dayjs(session.recorded_at).format('MMM D, YYYY · h:mm A')}</Text>
              <Text style={styles.historyFocus} numberOfLines={1}>
                Focus: {session.next_session_focus[0]}
              </Text>
            </View>
            <Text style={styles.historyArrow}>›</Text>
          </TouchableOpacity>
        ))}

        <View style={{ height: Spacing.xxxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function scoreColor(score: number) {
  if (score >= 80) return Colors.green;
  if (score >= 60) return Colors.gold;
  return Colors.severityFix;
}

const styles = StyleSheet.create({
  safe:         { flex: 1, backgroundColor: Colors.background },
  header:       { padding: Spacing.lg, paddingTop: Spacing.xl },
  headerTitle:  { fontSize: Typography.xxl, fontWeight: Typography.bold, color: Colors.textPrimary },
  headerSub:    { fontSize: Typography.sm, color: Colors.textSecondary, marginTop: 2 },

  statGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: Spacing.md, gap: Spacing.sm },
  statCard: { width: '47%', backgroundColor: Colors.surface, borderRadius: Radius.md, padding: Spacing.md, borderWidth: 0.5, borderColor: Colors.border, ...Shadow.sm },
  statLabel:{ fontSize: 10, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.06, marginBottom: 4 },
  statVal:  { fontSize: Typography.hero, fontWeight: Typography.bold, color: Colors.textPrimary },
  statSub:  { fontSize: Typography.xs, color: Colors.textSecondary, marginTop: 2 },

  chartCard: { marginHorizontal: Spacing.lg, backgroundColor: Colors.surface, borderRadius: Radius.md, padding: Spacing.md, borderWidth: 0.5, borderColor: Colors.border, ...Shadow.sm },
  barChart:  { flexDirection: 'row', alignItems: 'flex-end', height: 80, gap: 4 },
  barWrap:   { flex: 1, alignItems: 'center', gap: 4, height: '100%' },
  barOuter:  { flex: 1, width: '100%', justifyContent: 'flex-end' },
  barFill:   { backgroundColor: Colors.greenMid, borderRadius: 3, opacity: 0.6 },
  barFillToday: { opacity: 1, backgroundColor: Colors.green },
  barLabel:  { fontSize: 9, color: Colors.textMuted },
  barLabelToday: { color: Colors.green, fontWeight: Typography.semibold },

  skillCard: { marginHorizontal: Spacing.lg, backgroundColor: Colors.surface, borderRadius: Radius.md, padding: Spacing.md, borderWidth: 0.5, borderColor: Colors.border, gap: Spacing.md, ...Shadow.sm },
  skillItem: {},
  skillHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  skillLabel:  { fontSize: Typography.sm, color: Colors.textPrimary },
  skillPct:    { fontSize: Typography.sm, fontWeight: Typography.semibold },
  skillTrack:  { height: 6, backgroundColor: Colors.background, borderRadius: 3, overflow: 'hidden' },
  skillFill:   { height: '100%', borderRadius: 3 },

  historyCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, marginHorizontal: Spacing.lg, marginBottom: Spacing.sm, borderRadius: Radius.md, padding: Spacing.md, borderWidth: 0.5, borderColor: Colors.border, gap: Spacing.md, ...Shadow.sm },
  scoreCircle: { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  scoreNum:    { fontSize: Typography.lg, fontWeight: Typography.bold },
  historyInfo: { flex: 1 },
  historyClub: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textPrimary },
  historyDate: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 1 },
  historyFocus:{ fontSize: Typography.xs, color: Colors.textSecondary, marginTop: 3 },
  historyArrow:{ fontSize: 20, color: Colors.textMuted },
});
