import React from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/theme';

const LEADERBOARD = [
  { rank: 1, initials: 'MJ', name: 'Mike J.',  pts: 1840, streak: 20, isYou: false },
  { rank: 2, initials: 'SC', name: 'Sara C.',  pts: 1770, streak: 19, isYou: false },
  { rank: 3, initials: 'TR', name: 'Tom R.',   pts: 1690, streak: 18, isYou: false },
  { rank: 4, initials: 'AR', name: 'Alex R.',  pts: 1420, streak: 12, isYou: true  },
  { rank: 5, initials: 'KP', name: 'Kim P.',   pts: 1380, streak: 15, isYou: false },
];

const RANK_COLORS: Record<number, string> = { 1: '#e8c04a', 2: '#b0b8c4', 3: '#c87a40' };

export default function ChallengeScreen() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }} edges={['top']}>
      <ScrollView>
        <LinearGradient colors={[Colors.dark, '#1a4d2e']} style={styles.hero}>
          <Text style={styles.month}>JUNE 2025</Text>
          <Text style={styles.title}>Short Game{'\n'}Challenge</Text>
          <Text style={styles.sub}>Day 20 of 30 · 127 competitors</Text>
          <View style={styles.prizeBox}>
            <Text style={styles.prizeLabel}>TOTAL PRIZE POOL</Text>
            <Text style={styles.prizeAmount}>$2,340</Text>
            <Text style={styles.prizeSub}>$15 entry × 156 registered</Text>
          </View>
        </LinearGradient>

        {/* Payout breakdown */}
        <View style={styles.payoutRow}>
          {[['🥇 1st','30%','$702'],['🥈 2nd','20%','$468'],['🥉 3rd','10%','$234'],['Platform','40%','Ops']].map(([rank,pct,amt]) => (
            <View key={rank} style={styles.payoutBox}>
              <Text style={styles.payoutRank}>{rank}</Text>
              <Text style={styles.payoutPct}>{pct}</Text>
              <Text style={styles.payoutAmt}>{amt}</Text>
            </View>
          ))}
        </View>

        {/* Leaderboard */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>LEADERBOARD</Text>
        </View>
        {LEADERBOARD.map(p => (
          <View key={p.rank} style={[styles.lbRow, p.isYou && styles.lbRowYou]}>
            <View style={[styles.rankBadge, { backgroundColor: RANK_COLORS[p.rank] ?? Colors.background }]}>
              <Text style={[styles.rankText, { color: p.rank <= 3 ? Colors.dark : Colors.textSecondary }]}>{p.rank}</Text>
            </View>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{p.initials}</Text>
            </View>
            <View style={styles.lbInfo}>
              <Text style={styles.lbName}>{p.name}{p.isYou ? ' (You)' : ''}</Text>
              <Text style={styles.lbStreak}>{p.streak}-day streak{p.streak >= 15 ? ' 🔥' : ''}</Text>
            </View>
            <View>
              <Text style={styles.lbPts}>{p.pts.toLocaleString()}</Text>
              <Text style={styles.lbPtsLbl}>pts</Text>
            </View>
          </View>
        ))}

        {/* Scoring rules */}
        <View style={styles.rulesBox}>
          <Text style={styles.rulesTitle}>Scoring Rules</Text>
          <Text style={styles.rulesText}>
            {'✓  Each successful shot = 1 point\n⭐  10 consecutive shots = +10 bonus\n✕  Missed daily upload = -20 points'}
          </Text>
        </View>

        <TouchableOpacity style={styles.uploadBtn} activeOpacity={0.85}>
          <Text style={styles.uploadBtnText}>🎬  Upload Today's Video</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  hero:        { padding: Spacing.lg, paddingTop: Spacing.xl, paddingBottom: Spacing.xl },
  month:       { fontSize: 10, color: 'rgba(255,255,255,0.4)', letterSpacing: 0.08, textTransform: 'uppercase', marginBottom: 4 },
  title:       { fontSize: 32, fontWeight: '700', color: '#fff', marginBottom: 4 },
  sub:         { fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: Spacing.lg },
  prizeBox:    { backgroundColor: 'rgba(201,162,39,0.1)', borderWidth: 0.5, borderColor: 'rgba(201,162,39,0.3)', borderRadius: Radius.md, padding: Spacing.md },
  prizeLabel:  { fontSize: 10, color: 'rgba(201,162,39,0.7)', textTransform: 'uppercase', letterSpacing: 0.06 },
  prizeAmount: { fontSize: 34, fontWeight: '700', color: Colors.goldBright },
  prizeSub:    { fontSize: 12, color: 'rgba(255,255,255,0.4)' },

  payoutRow:  { flexDirection: 'row', gap: Spacing.sm, padding: Spacing.lg },
  payoutBox:  { flex: 1, backgroundColor: Colors.surface, borderRadius: Radius.sm, padding: Spacing.sm, alignItems: 'center', borderWidth: 0.5, borderColor: Colors.border },
  payoutRank: { fontSize: 10, color: Colors.textSecondary, marginBottom: 2 },
  payoutPct:  { fontSize: 18, fontWeight: '700', color: Colors.gold },
  payoutAmt:  { fontSize: 10, color: Colors.textSecondary },

  sectionHeader: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.sm },
  sectionTitle:  { fontSize: 10, fontWeight: '600', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.08 },

  lbRow:    { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: Colors.surface, marginHorizontal: Spacing.lg, marginBottom: Spacing.sm, borderRadius: Radius.md, padding: Spacing.md, borderWidth: 0.5, borderColor: Colors.border },
  lbRowYou: { backgroundColor: Colors.greenLight, borderColor: 'rgba(45,138,80,0.3)' },
  rankBadge:{ width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  rankText: { fontSize: 12, fontWeight: '700' },
  avatar:   { width: 34, height: 34, borderRadius: 17, backgroundColor: Colors.greenMid, alignItems: 'center', justifyContent: 'center' },
  avatarText:{ fontSize: 12, fontWeight: '600', color: '#fff' },
  lbInfo:   { flex: 1 },
  lbName:   { fontSize: 13, fontWeight: '600', color: Colors.textPrimary },
  lbStreak: { fontSize: 11, color: Colors.textSecondary },
  lbPts:    { fontSize: 17, fontWeight: '700', color: Colors.green, textAlign: 'right' },
  lbPtsLbl: { fontSize: 9, color: Colors.textMuted, textAlign: 'right' },

  rulesBox:  { margin: Spacing.lg, backgroundColor: Colors.greenLight, borderRadius: Radius.md, padding: Spacing.md, borderWidth: 0.5, borderColor: Colors.border },
  rulesTitle:{ fontSize: Typography.sm, fontWeight: '600', color: Colors.green, marginBottom: Spacing.sm },
  rulesText: { fontSize: Typography.sm, color: Colors.textSecondary, lineHeight: 22 },

  uploadBtn: { marginHorizontal: Spacing.lg, backgroundColor: Colors.green, borderRadius: Radius.md, padding: Spacing.lg, alignItems: 'center' },
  uploadBtnText: { fontSize: Typography.base, fontWeight: '700', color: '#fff' },
});
