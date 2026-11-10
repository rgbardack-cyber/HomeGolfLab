/**
 * Home Screen
 * -----------
 * The main dashboard. Shows:
 *   - Personalised greeting + handicap
 *   - Practice streak and total points
 *   - Quick-access feature tiles (Swing, Track, Space, Analytics)
 *   - Live challenge banner
 *   - Recent sessions list
 */

import React, { useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, RefreshControl,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useStore } from '@/store';
import { EmptyState } from '@/components/ui';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/theme';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

const FEATURE_TILES = [
  { id: 'swing',     emoji: '🎥', label: 'Swing Analysis', sub: 'AI video coaching',       route: '/(tabs)/swing'     },
  { id: 'track',     emoji: '🎯', label: 'Ball Tracking',  sub: 'Launch & dispersion',     route: '/(tabs)/track'     },
  { id: 'space',     emoji: '🏠', label: 'Space Mapping',  sub: 'Home setup optimizer',    route: '/(tabs)/space'     },
  { id: 'analytics', emoji: '📈', label: 'Analytics',      sub: 'Progress & trends',       route: '/(tabs)/analytics' },
];

export default function HomeScreen() {
  const { profile, sessions } = useStore();
  const [refreshing, setRefreshing] = React.useState(false);

  const streak = Math.min(sessions.length, 12); // In production, compute from actual dates
  const totalPts = sessions.reduce((acc, s) => acc + s.overall_score, 0);
  const recentSessions = sessions.slice(0, 3);

  const greetingHour = new Date().getHours();
  const greeting =
    greetingHour < 12 ? 'Good morning' :
    greetingHour < 18 ? 'Good afternoon' : 'Good evening';

  const onRefresh = async () => {
    setRefreshing(true);
    await new Promise(r => setTimeout(r, 800));
    setRefreshing(false);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.greenGlow} />}
      >
        {/* ── Hero ── */}
        <LinearGradient colors={[Colors.dark, Colors.darkMid]} style={styles.hero}>
          <Text style={styles.greeting}>{greeting}</Text>
          <Text style={styles.name}>
            {profile.name || 'Golfer'}{' '}
            <Text style={styles.nameAccent}>👋</Text>
          </Text>

          {profile.handicap !== null && (
            <View style={styles.hcpBadge}>
              <Text style={styles.hcpText}>Handicap </Text>
              <Text style={styles.hcpNum}>{profile.handicap}</Text>
            </View>
          )}

          {/* Stats row */}
          <View style={styles.statsRow}>
            <View style={styles.statChip}>
              <Text style={styles.statVal}>{streak}</Text>
              <Text style={styles.statLbl}>Day Streak 🔥</Text>
            </View>
            <View style={styles.statChip}>
              <Text style={styles.statVal}>{sessions.length}</Text>
              <Text style={styles.statLbl}>Sessions</Text>
            </View>
            <View style={styles.statChip}>
              <Text style={styles.statVal}>{totalPts}</Text>
              <Text style={styles.statLbl}>Total Pts</Text>
            </View>
          </View>
        </LinearGradient>

        {/* ── Feature tiles ── */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>AI FEATURES</Text>
        </View>
        <View style={styles.tileGrid}>
          {FEATURE_TILES.map(tile => (
            <TouchableOpacity
              key={tile.id}
              style={styles.tile}
              onPress={() => router.push(tile.route as any)}
              activeOpacity={0.75}
            >
              <Text style={styles.tileEmoji}>{tile.emoji}</Text>
              <Text style={styles.tileLabel}>{tile.label}</Text>
              <Text style={styles.tileSub}>{tile.sub}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Challenge banner ── */}
        <TouchableOpacity
          onPress={() => router.push('/(tabs)/challenge')}
          activeOpacity={0.85}
          style={styles.challengeBanner}
        >
          <LinearGradient
            colors={['#0f2d1a', '#1a4d2e']}
            style={styles.challengeInner}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          >
            <View style={styles.challengeTop}>
              <View style={styles.liveBadge}><Text style={styles.liveBadgeText}>🏆 LIVE</Text></View>
              <Text style={styles.prizeText}>Prize Pool: $2,340</Text>
            </View>
            <Text style={styles.challengeTitle}>June Short Game Challenge</Text>
            <Text style={styles.challengeSub}>4 days left to register · 127 competitors</Text>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: '67%' }]} />
            </View>
            <View style={styles.progressLabels}>
              <Text style={styles.progressLbl}>Day 20</Text>
              <Text style={styles.progressLbl}>Day 30</Text>
            </View>
          </LinearGradient>
        </TouchableOpacity>

        {/* ── Recent sessions ── */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>RECENT SESSIONS</Text>
        </View>

        {recentSessions.length === 0 ? (
          <EmptyState
            icon="🎬"
            title="No sessions yet"
            subtitle="Record or upload your first swing to get AI coaching feedback"
          />
        ) : (
          recentSessions.map(session => (
            <TouchableOpacity
              key={session.session_id}
              style={styles.sessionCard}
              onPress={() => {
                useStore.getState().setActiveSession(session);
                router.push('/swing/results');
              }}
            >
              <View style={styles.sessionScore}>
                <Text style={styles.sessionScoreNum}>{session.overall_score}</Text>
                <Text style={styles.sessionScoreLbl}>pts</Text>
              </View>
              <View style={styles.sessionInfo}>
                <Text style={styles.sessionClub}>{session.club_used}</Text>
                <Text style={styles.sessionDate}>{dayjs(session.recorded_at).fromNow()}</Text>
                <Text style={styles.sessionSummary} numberOfLines={1}>{session.summary}</Text>
              </View>
              <Text style={styles.sessionArrow}>›</Text>
            </TouchableOpacity>
          ))
        )}

        <View style={{ height: Spacing.xxxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:       { flex: 1, backgroundColor: Colors.background },
  hero:       { padding: Spacing.lg, paddingTop: Spacing.xl, paddingBottom: Spacing.xl },
  greeting:   { fontSize: Typography.xs, color: Colors.textOnDarkDim, textTransform: 'uppercase', letterSpacing: 0.08, marginBottom: 4 },
  name:       { fontSize: Typography.xxl, fontWeight: Typography.bold, color: Colors.textOnDark, marginBottom: Spacing.md },
  nameAccent: {},
  hcpBadge:   { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(109,207,142,0.12)', borderRadius: Radius.full, paddingHorizontal: Spacing.md, paddingVertical: 5, alignSelf: 'flex-start', borderWidth: 0.5, borderColor: 'rgba(109,207,142,0.3)', marginBottom: Spacing.md },
  hcpText:    { fontSize: Typography.sm, color: Colors.greenGlow },
  hcpNum:     { fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.greenGlow },
  statsRow:   { flexDirection: 'row', gap: Spacing.sm },
  statChip:   { flex: 1, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: Radius.sm, padding: Spacing.sm, alignItems: 'center', borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.08)' },
  statVal:    { fontSize: Typography.xl, fontWeight: Typography.bold, color: Colors.textOnDark },
  statLbl:    { fontSize: 9, color: Colors.textOnDarkDim, marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.05 },

  sectionHeader: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg, paddingBottom: Spacing.sm },
  sectionTitle:  { fontSize: Typography.xs, fontWeight: Typography.semibold, color: Colors.textMuted, letterSpacing: 0.08, textTransform: 'uppercase' },

  tileGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: Spacing.md, gap: Spacing.sm },
  tile: {
    width: '47%',
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 0.5,
    borderColor: Colors.border,
    ...Shadow.sm,
  },
  tileEmoji: { fontSize: 28, marginBottom: Spacing.sm },
  tileLabel: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textPrimary },
  tileSub:   { fontSize: Typography.xs, color: Colors.textSecondary, marginTop: 2 },

  challengeBanner: { marginHorizontal: Spacing.lg, marginTop: Spacing.sm, borderRadius: Radius.lg, overflow: 'hidden', ...Shadow.md },
  challengeInner:  { padding: Spacing.lg, borderWidth: 0.5, borderColor: 'rgba(109,207,142,0.2)', borderRadius: Radius.lg },
  challengeTop:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm },
  liveBadge:       { backgroundColor: 'rgba(201,162,39,0.2)', borderWidth: 0.5, borderColor: 'rgba(201,162,39,0.4)', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  liveBadgeText:   { fontSize: Typography.xs, color: Colors.goldBright, fontWeight: Typography.semibold },
  prizeText:       { fontSize: Typography.xs, color: Colors.textOnDarkDim },
  challengeTitle:  { fontSize: Typography.lg, fontWeight: Typography.bold, color: Colors.textOnDark, marginBottom: 2 },
  challengeSub:    { fontSize: Typography.xs, color: Colors.textOnDarkDim, marginBottom: Spacing.sm },
  progressBar:     { height: 4, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 2, overflow: 'hidden' },
  progressFill:    { height: '100%', backgroundColor: Colors.greenGlow, borderRadius: 2 },
  progressLabels:  { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  progressLbl:     { fontSize: 9, color: Colors.textOnDarkDim },

  sessionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 0.5,
    borderColor: Colors.border,
    gap: Spacing.md,
    ...Shadow.sm,
  },
  sessionScore:    { width: 48, height: 48, borderRadius: 12, backgroundColor: Colors.greenLight, alignItems: 'center', justifyContent: 'center' },
  sessionScoreNum: { fontSize: Typography.lg, fontWeight: Typography.bold, color: Colors.green },
  sessionScoreLbl: { fontSize: 9, color: Colors.green },
  sessionInfo:     { flex: 1 },
  sessionClub:     { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textPrimary },
  sessionDate:     { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 1 },
  sessionSummary:  { fontSize: Typography.xs, color: Colors.textSecondary, marginTop: 3 },
  sessionArrow:    { fontSize: 20, color: Colors.textMuted },
});
