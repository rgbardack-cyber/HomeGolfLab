/**
 * SwingIQ Shared Components
 *
 * All small reusable pieces used across screens.
 * Import individual components: import { ScoreRing, FeedbackCard } from '@/components/ui'
 */

import React from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, ViewStyle, TextStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle } from 'react-native-svg';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/theme';

// ── ScoreRing ────────────────────────────────────────────────────────────────
// Circular progress indicator used on the swing results screen.

interface ScoreRingProps {
  score: number;   // 0–100
  size?: number;
}

export function ScoreRing({ score, size = 110 }: ScoreRingProps) {
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = circumference - (score / 100) * circumference;

  const color =
    score >= 80 ? Colors.greenMid :
    score >= 60 ? Colors.gold :
    Colors.severityFix;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        {/* Track */}
        <Circle
          cx={size / 2} cy={size / 2} r={radius}
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* Progress */}
        <Circle
          cx={size / 2} cy={size / 2} r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={progress}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <Text style={{ fontSize: Typography.xl, fontWeight: Typography.bold, color: Colors.textOnDark }}>
        {score}
      </Text>
      <Text style={{ fontSize: Typography.xs, color: Colors.textOnDarkDim, marginTop: 2 }}>/100</Text>
    </View>
  );
}

// ── PrimaryButton ─────────────────────────────────────────────────────────────

interface ButtonProps {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'ghost';
  style?: ViewStyle;
}

export function PrimaryButton({ label, onPress, loading, disabled, variant = 'primary', style }: ButtonProps) {
  const isPrimary   = variant === 'primary';
  const isSecondary = variant === 'secondary';

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.8}
      style={[
        styles.button,
        isPrimary   && styles.buttonPrimary,
        isSecondary && styles.buttonSecondary,
        variant === 'ghost' && styles.buttonGhost,
        (disabled || loading) && styles.buttonDisabled,
        style,
      ]}
    >
      {loading
        ? <ActivityIndicator color={isPrimary ? '#fff' : Colors.green} size="small" />
        : <Text style={[styles.buttonText, !isPrimary && { color: Colors.green }]}>{label}</Text>
      }
    </TouchableOpacity>
  );
}

// ── SeverityBadge ─────────────────────────────────────────────────────────────

type Severity = 'fix' | 'improve' | 'good';

interface BadgeProps {
  severity: Severity;
}

const SEVERITY_CONFIG: Record<Severity, { label: string; color: string; bg: string }> = {
  fix:     { label: 'Fix',     color: Colors.severityFix,     bg: Colors.severityFixBg },
  improve: { label: 'Improve', color: Colors.severityImprove, bg: Colors.severityImproveBg },
  good:    { label: 'Good ✓',  color: Colors.severityGood,    bg: Colors.severityGoodBg },
};

export function SeverityBadge({ severity }: BadgeProps) {
  const cfg = SEVERITY_CONFIG[severity];
  return (
    <View style={[styles.badge, { backgroundColor: cfg.bg }]}>
      <Text style={[styles.badgeText, { color: cfg.color }]}>{cfg.label}</Text>
    </View>
  );
}

// ── FeedbackCard ──────────────────────────────────────────────────────────────

import { type FeedbackItem } from '@/store';

interface FeedbackCardProps {
  item: FeedbackItem;
  index: number;
}

export function FeedbackCard({ item }: FeedbackCardProps) {
  const [expanded, setExpanded] = React.useState(false);

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() => setExpanded(e => !e)}
      style={styles.feedbackCard}
    >
      <View style={styles.feedbackHeader}>
        <SeverityBadge severity={item.severity} />
        <Text style={styles.feedbackTitle} numberOfLines={expanded ? 0 : 1}>
          {item.title}
        </Text>
        <Text style={styles.feedbackChevron}>{expanded ? '▲' : '▼'}</Text>
      </View>
      {expanded && (
        <View style={styles.feedbackBody}>
          <Text style={styles.feedbackDetail}>{item.detail}</Text>
          {item.drill && (
            <View style={styles.drillBox}>
              <Text style={styles.drillLabel}>DRILL</Text>
              <Text style={styles.drillText}>{item.drill}</Text>
            </View>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
}

// ── MetricPill ────────────────────────────────────────────────────────────────

interface MetricPillProps {
  label: string;
  value: string;
  ideal?: string;
}

export function MetricPill({ label, value, ideal }: MetricPillProps) {
  return (
    <View style={styles.metricPill}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
      {ideal && <Text style={styles.metricIdeal}>ideal {ideal}</Text>}
    </View>
  );
}

// ── SectionHeader ─────────────────────────────────────────────────────────────

export function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {subtitle && <Text style={styles.sectionSubtitle}>{subtitle}</Text>}
    </View>
  );
}

// ── EmptyState ────────────────────────────────────────────────────────────────

export function EmptyState({ icon, title, subtitle }: { icon: string; title: string; subtitle: string }) {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyIcon}>{icon}</Text>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptySubtitle}>{subtitle}</Text>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  button: {
    height: 52,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
  },
  buttonPrimary:   { backgroundColor: Colors.green },
  buttonSecondary: { backgroundColor: Colors.greenLight, borderWidth: 1, borderColor: Colors.green },
  buttonGhost:     { backgroundColor: 'transparent' },
  buttonDisabled:  { opacity: 0.5 },
  buttonText:      { fontSize: Typography.base, fontWeight: Typography.semibold, color: '#fff' },

  badge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radius.full,
    alignSelf: 'flex-start',
  },
  badgeText: { fontSize: Typography.xs, fontWeight: Typography.semibold },

  feedbackCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 0.5,
    borderColor: Colors.border,
    marginBottom: Spacing.sm,
    overflow: 'hidden',
    ...Shadow.sm,
  },
  feedbackHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
  },
  feedbackTitle: {
    flex: 1,
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
    color: Colors.textPrimary,
  },
  feedbackChevron: { fontSize: 10, color: Colors.textMuted },
  feedbackBody: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
    borderTopWidth: 0.5,
    borderTopColor: Colors.border,
  },
  feedbackDetail: {
    fontSize: Typography.sm,
    color: Colors.textSecondary,
    lineHeight: Typography.sm * Typography.normal,
    marginTop: Spacing.sm,
  },
  drillBox: {
    marginTop: Spacing.sm,
    backgroundColor: Colors.greenLight,
    borderRadius: Radius.sm,
    padding: Spacing.sm,
  },
  drillLabel: {
    fontSize: 9,
    fontWeight: Typography.bold,
    color: Colors.green,
    letterSpacing: 0.08,
    marginBottom: 3,
  },
  drillText: {
    fontSize: Typography.sm,
    color: Colors.textPrimary,
    lineHeight: Typography.sm * Typography.normal,
  },

  metricPill: {
    flex: 1,
    backgroundColor: Colors.background,
    borderRadius: Radius.sm,
    padding: Spacing.sm,
    alignItems: 'center',
  },
  metricValue: { fontSize: Typography.lg, fontWeight: Typography.bold, color: Colors.green },
  metricLabel: { fontSize: 10, color: Colors.textSecondary, marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.04 },
  metricIdeal: { fontSize: 9, color: Colors.textMuted, marginTop: 1 },

  sectionHeader: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg, paddingBottom: Spacing.sm },
  sectionTitle: { fontSize: Typography.md, fontWeight: Typography.semibold, color: Colors.textPrimary },
  sectionSubtitle: { fontSize: Typography.sm, color: Colors.textSecondary, marginTop: 2 },

  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xxxl },
  emptyIcon: { fontSize: 52, marginBottom: Spacing.lg },
  emptyTitle: { fontSize: Typography.lg, fontWeight: Typography.semibold, color: Colors.textPrimary, textAlign: 'center', marginBottom: Spacing.sm },
  emptySubtitle: { fontSize: Typography.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: Typography.sm * Typography.normal },
});
