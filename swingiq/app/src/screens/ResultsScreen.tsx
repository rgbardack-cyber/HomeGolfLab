/**
 * Results Screen
 * --------------
 * Shown after a swing analysis completes (or when tapping a past session).
 * Displays: score ring, key metrics, AI feedback cards, next session focus.
 */

import React from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  TouchableOpacity, Share,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useStore } from '@/store';
import { ScoreRing, FeedbackCard, MetricPill, SectionHeader, PrimaryButton } from '@/components/ui';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/theme';

export default function ResultsScreen() {
  const { activeSession } = useStore();

  if (!activeSession) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.noSession}>
          <Text style={styles.noSessionText}>No session to display.</Text>
          <PrimaryButton label="Analyse a swing" onPress={() => router.push('/(tabs)/swing')} style={{ marginTop: Spacing.lg }} />
        </View>
      </SafeAreaView>
    );
  }

  const { overall_score, metrics, feedback, summary, next_session_focus, club_used } = activeSession;

  const onShare = async () => {
    await Share.share({
      message: `My SwingIQ score: ${overall_score}/100 (${club_used})\n${summary}\n\nTrain smarter with SwingIQ 🏌️`,
    });
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false}>

        {/* ── Hero: score + summary ── */}
        <LinearGradient colors={[Colors.dark, Colors.darkMid]} style={styles.hero}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backBtnText}>← Back</Text>
          </TouchableOpacity>

          <View style={styles.heroContent}>
            <View style={styles.heroLeft}>
              <Text style={styles.heroClub}>{club_used}</Text>
              <Text style={styles.heroTitle}>Swing Analysis</Text>
              <Text style={styles.heroSummary}>{summary}</Text>
            </View>
            <ScoreRing score={overall_score} />
          </View>
        </LinearGradient>

        {/* ── Key metrics ── */}
        <SectionHeader title="Key Metrics" />
        <View style={styles.metricsRow}>
          <MetricPill
            label="Club Path"
            value={`${metrics.club_path_degrees > 0 ? '+' : ''}${metrics.club_path_degrees}°`}
            ideal="0°"
          />
          <MetricPill
            label="Face Angle"
            value={`${metrics.face_angle_degrees > 0 ? '+' : ''}${metrics.face_angle_degrees}°`}
            ideal="0°"
          />
          <MetricPill
            label="Tempo"
            value={`${metrics.tempo_ratio}:1`}
            ideal="3:1"
          />
        </View>
        <View style={[styles.metricsRow, { marginTop: Spacing.sm }]}>
          <MetricPill
            label="Hip Turn"
            value={`${metrics.hip_turn_degrees}°`}
            ideal="45°"
          />
          <MetricPill
            label="Weight Xfer"
            value={`${metrics.weight_transfer_pct}%`}
            ideal="80%+"
          />
          <MetricPill
            label="Shoulder Turn"
            value={`${metrics.shoulder_turn_degrees}°`}
            ideal="90°"
          />
        </View>

        {/* ── AI feedback ── */}
        <SectionHeader
          title="AI Coach Feedback"
          subtitle="Tap each item to expand and see the drill"
        />
        <View style={styles.feedbackList}>
          {feedback.map((item, i) => (
            <FeedbackCard key={i} item={item} index={i} />
          ))}
        </View>

        {/* ── Next session ── */}
        <SectionHeader title="Next Session Focus" />
        <View style={styles.nextBox}>
          {next_session_focus.map((focus, i) => (
            <View key={i} style={styles.nextItem}>
              <View style={styles.nextNum}>
                <Text style={styles.nextNumText}>{i + 1}</Text>
              </View>
              <Text style={styles.nextText}>{focus}</Text>
            </View>
          ))}
        </View>

        {/* ── Actions ── */}
        <View style={styles.actions}>
          <PrimaryButton label="Record Another Swing" onPress={() => router.push('/(tabs)/swing')} />
          <TouchableOpacity onPress={onShare} style={styles.shareBtn}>
            <Text style={styles.shareBtnText}>Share Results ↗</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: Spacing.xxxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },

  noSession: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  noSessionText: { fontSize: Typography.md, color: Colors.textSecondary },

  hero:        { padding: Spacing.lg, paddingTop: Spacing.xl, paddingBottom: Spacing.xl },
  backBtn:     { marginBottom: Spacing.md },
  backBtnText: { color: Colors.textOnDarkDim, fontSize: Typography.sm },
  heroContent: { flexDirection: 'row', alignItems: 'center', gap: Spacing.lg },
  heroLeft:    { flex: 1 },
  heroClub:    { fontSize: Typography.xs, color: Colors.greenGlow, textTransform: 'uppercase', letterSpacing: 0.08, marginBottom: 4 },
  heroTitle:   { fontSize: Typography.xl, fontWeight: Typography.bold, color: Colors.textOnDark, marginBottom: Spacing.sm },
  heroSummary: { fontSize: Typography.sm, color: Colors.textOnDarkDim, lineHeight: Typography.sm * Typography.normal },

  metricsRow: { flexDirection: 'row', gap: Spacing.sm, paddingHorizontal: Spacing.lg },

  feedbackList: { paddingHorizontal: Spacing.lg },

  nextBox:    { marginHorizontal: Spacing.lg, backgroundColor: Colors.surface, borderRadius: Radius.md, padding: Spacing.md, borderWidth: 0.5, borderColor: Colors.border, gap: Spacing.sm, ...Shadow.sm },
  nextItem:   { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  nextNum:    { width: 22, height: 22, borderRadius: 11, backgroundColor: Colors.green, alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 },
  nextNumText:{ fontSize: Typography.xs, fontWeight: Typography.bold, color: '#fff' },
  nextText:   { flex: 1, fontSize: Typography.sm, color: Colors.textPrimary, lineHeight: Typography.sm * Typography.normal },

  actions:   { padding: Spacing.lg, gap: Spacing.md },
  shareBtn:  { alignItems: 'center', paddingVertical: Spacing.sm },
  shareBtnText: { fontSize: Typography.sm, color: Colors.green, fontWeight: Typography.semibold },
});
