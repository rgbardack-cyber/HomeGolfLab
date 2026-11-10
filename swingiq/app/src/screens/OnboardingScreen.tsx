/**
 * Onboarding Screen
 * -----------------
 * Shown once on first launch. Collects:
 *   Step 1 — Name
 *   Step 2 — Skill level
 *   Step 3 — Current handicap (optional)
 *
 * On completion, calls completeOnboarding() and routes to the main app.
 */

import React, { useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, Dimensions, ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useStore, SkillLevel } from '@/store';
import { PrimaryButton } from '@/components/ui';
import { Colors, Typography, Spacing, Radius } from '@/theme';

const { width } = Dimensions.get('window');
const TOTAL_STEPS = 3;

const SKILL_OPTIONS: { value: SkillLevel; label: string; description: string; emoji: string }[] = [
  { value: 'beginner',     label: 'Beginner',     description: 'Learning the basics, handicap 30+',   emoji: '🌱' },
  { value: 'intermediate', label: 'Intermediate',  description: 'Playing regularly, handicap 10–29',   emoji: '⛳' },
  { value: 'advanced',     label: 'Advanced',      description: 'Competitive player, handicap 0–9',    emoji: '🏆' },
];

export default function OnboardingScreen() {
  const completeOnboarding = useStore(s => s.completeOnboarding);
  const [step, setStep]           = useState(0);
  const [name, setName]           = useState('');
  const [skillLevel, setSkill]    = useState<SkillLevel>('intermediate');
  const [handicap, setHandicap]   = useState('');

  const canAdvance = () => {
    if (step === 0) return name.trim().length >= 2;
    if (step === 1) return !!skillLevel;
    return true; // handicap is optional
  };

  const advance = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (step < TOTAL_STEPS - 1) {
      setStep(s => s + 1);
    } else {
      const hcp = handicap.trim() ? parseFloat(handicap) : null;
      completeOnboarding(name.trim(), skillLevel, hcp);
      router.replace('/(tabs)/home');
    }
  };

  return (
    <LinearGradient colors={[Colors.dark, Colors.darkMid, '#1a3d24']} style={styles.container}>
      {/* Progress dots */}
      <View style={styles.progress}>
        {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
          <View key={i} style={[styles.dot, i <= step && styles.dotActive]} />
        ))}
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.content}>

        {/* ── Step 0: Name ── */}
        {step === 0 && (
          <View style={styles.step}>
            <Text style={styles.emoji}>👋</Text>
            <Text style={styles.heading}>Welcome to SwingIQ</Text>
            <Text style={styles.subheading}>
              AI-powered golf coaching from your phone. Let's set up your profile.
            </Text>
            <Text style={styles.inputLabel}>What's your name?</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Alex Rivera"
              placeholderTextColor={Colors.textMuted}
              value={name}
              onChangeText={setName}
              autoFocus
              returnKeyType="next"
              onSubmitEditing={() => canAdvance() && advance()}
            />
          </View>
        )}

        {/* ── Step 1: Skill level ── */}
        {step === 1 && (
          <View style={styles.step}>
            <Text style={styles.emoji}>🎯</Text>
            <Text style={styles.heading}>What's your level?</Text>
            <Text style={styles.subheading}>
              This helps the AI tailor its coaching language and drill difficulty.
            </Text>
            {SKILL_OPTIONS.map(opt => (
              <TouchableOpacity
                key={opt.value}
                onPress={() => { setSkill(opt.value); Haptics.selectionAsync(); }}
                style={[styles.skillCard, skillLevel === opt.value && styles.skillCardSelected]}
              >
                <Text style={styles.skillEmoji}>{opt.emoji}</Text>
                <View style={styles.skillTextBlock}>
                  <Text style={[styles.skillLabel, skillLevel === opt.value && styles.skillLabelSelected]}>
                    {opt.label}
                  </Text>
                  <Text style={styles.skillDesc}>{opt.description}</Text>
                </View>
                {skillLevel === opt.value && (
                  <View style={styles.skillCheck}>
                    <Text style={styles.skillCheckText}>✓</Text>
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* ── Step 2: Handicap ── */}
        {step === 2 && (
          <View style={styles.step}>
            <Text style={styles.emoji}>📊</Text>
            <Text style={styles.heading}>Current handicap?</Text>
            <Text style={styles.subheading}>
              Optional — helps track improvement over time. You can update this anytime in settings.
            </Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 14.2  (leave blank if unsure)"
              placeholderTextColor={Colors.textMuted}
              value={handicap}
              onChangeText={setHandicap}
              keyboardType="decimal-pad"
              autoFocus
              returnKeyType="done"
              onSubmitEditing={advance}
            />
            <Text style={styles.skipHint}>Not sure? Tap Continue to skip</Text>
          </View>
        )}

        <PrimaryButton
          label={step < TOTAL_STEPS - 1 ? 'Continue' : 'Start Improving →'}
          onPress={advance}
          disabled={!canAdvance()}
          style={styles.cta}
        />

        {step > 0 && (
          <TouchableOpacity onPress={() => setStep(s => s - 1)} style={styles.backBtn}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
        )}
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  progress: {
    flexDirection: 'row',
    gap: 6,
    paddingTop: 60,
    paddingHorizontal: Spacing.lg,
    justifyContent: 'center',
  },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.2)' },
  dotActive: { backgroundColor: Colors.greenGlow, width: 24 },

  content: { flex: 1, padding: Spacing.lg, justifyContent: 'center' },
  step: { marginBottom: Spacing.xl },

  emoji:     { fontSize: 52, marginBottom: Spacing.lg },
  heading:   { fontSize: Typography.xxl, fontWeight: Typography.bold, color: Colors.textOnDark, marginBottom: Spacing.sm },
  subheading:{ fontSize: Typography.base, color: Colors.textOnDarkDim, lineHeight: Typography.base * Typography.normal, marginBottom: Spacing.xl },
  inputLabel:{ fontSize: Typography.sm, color: Colors.textOnDarkDim, marginBottom: Spacing.sm, fontWeight: Typography.medium },

  input: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.15)',
    borderRadius: Radius.md,
    padding: Spacing.md,
    fontSize: Typography.md,
    color: Colors.textOnDark,
  },
  skipHint: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: Spacing.sm, textAlign: 'center' },

  skillCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  skillCardSelected: { borderColor: Colors.greenGlow, backgroundColor: 'rgba(109,207,142,0.12)' },
  skillEmoji: { fontSize: 28 },
  skillTextBlock: { flex: 1 },
  skillLabel: { fontSize: Typography.base, fontWeight: Typography.semibold, color: Colors.textOnDark },
  skillLabelSelected: { color: Colors.greenGlow },
  skillDesc: { fontSize: Typography.sm, color: Colors.textOnDarkDim, marginTop: 2 },
  skillCheck: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: Colors.greenGlow, alignItems: 'center', justifyContent: 'center',
  },
  skillCheckText: { fontSize: 12, fontWeight: Typography.bold, color: Colors.dark },

  cta: { width: '100%' },
  backBtn: { alignItems: 'center', paddingVertical: Spacing.md },
  backText: { fontSize: Typography.sm, color: Colors.textOnDarkDim },
});
