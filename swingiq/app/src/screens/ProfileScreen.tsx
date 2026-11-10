/**
 * Profile Screen
 * --------------
 * Lets the user view and edit their profile.
 * Shows: avatar, name, skill level, handicap, all-time stats, sign out.
 *
 * Accessible via Settings tab or from the home header.
 */

import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator, Modal, Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useAuthContext } from '../components/AuthProvider';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/theme';

const SKILL_OPTIONS = ['beginner','intermediate','advanced'] as const;
const AVATAR_COLORS = [
  '#1a6b3a','#2d5a9e','#8b3a9e','#9e3a3a',
  '#3a6b8b','#6b5a1a','#1a6b5a','#4a1a6b',
];

export default function ProfileScreen() {
  const { profile, user, updateProfile, signOut, loading } = useAuthContext();

  const [editing,   setEditing]   = useState(false);
  const [name,      setName]      = useState(profile?.display_name ?? '');
  const [handicap,  setHandicap]  = useState(profile?.handicap?.toString() ?? '');
  const [skill,     setSkill]     = useState(profile?.skill_level ?? 'intermediate');
  const [avatarClr, setAvatarClr] = useState(profile?.avatar_color ?? Colors.green);
  const [saving,    setSaving]    = useState(false);
  const [colorModal,setColorModal]= useState(false);

  // Initials for avatar
  const initials = (profile?.display_name ?? user?.email ?? 'U')
    .split(' ')
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const handleSave = async () => {
    setSaving(true);
    const err = await updateProfile({
      display_name: name.trim(),
      skill_level:  skill,
      handicap:     handicap ? parseFloat(handicap) : null,
      avatar_color: avatarClr,
    });
    setSaving(false);
    if (err) {
      Alert.alert('Could not save', err);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setEditing(false);
    }
  };

  const handleSignOut = () => {
    Alert.alert(
      'Sign out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            await signOut();
            router.replace('/auth/sign-in');
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.loadingCenter}>
          <ActivityIndicator color={Colors.green} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false}>

        {/* Header */}
        <LinearGradient colors={[Colors.dark, Colors.darkMid]} style={styles.hero}>
          <View style={styles.heroTop}>
            <Text style={styles.heroTitle}>Profile</Text>
            <TouchableOpacity onPress={() => setEditing(e => !e)}>
              <Text style={styles.editBtn}>{editing ? 'Cancel' : 'Edit'}</Text>
            </TouchableOpacity>
          </View>

          {/* Avatar */}
          <View style={styles.avatarRow}>
            <TouchableOpacity
              style={[styles.avatar, { backgroundColor: avatarClr }]}
              onPress={() => editing && setColorModal(true)}
              disabled={!editing}
            >
              <Text style={styles.avatarText}>{initials}</Text>
              {editing && <Text style={styles.avatarEditHint}>Tap to change</Text>}
            </TouchableOpacity>

            <View style={styles.avatarInfo}>
              {editing ? (
                <TextInput
                  style={styles.nameInput}
                  value={name}
                  onChangeText={setName}
                  placeholder="Your name"
                  placeholderTextColor={Colors.textMuted}
                  autoCapitalize="words"
                />
              ) : (
                <Text style={styles.displayName}>{profile?.display_name || 'Golfer'}</Text>
              )}
              <Text style={styles.emailText}>{user?.email}</Text>
            </View>
          </View>
        </LinearGradient>

        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statNum}>{profile?.total_sessions ?? 0}</Text>
            <Text style={styles.statLbl}>Sessions</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statNum}>{profile?.best_score ?? '—'}</Text>
            <Text style={styles.statLbl}>Best Score</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statNum}>{profile?.practice_streak ?? 0}</Text>
            <Text style={styles.statLbl}>Day Streak</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statNum}>
              {profile?.handicap != null ? profile.handicap : '—'}
            </Text>
            <Text style={styles.statLbl}>Handicap</Text>
          </View>
        </View>

        {/* Editable fields */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Golf Profile</Text>

          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>Handicap</Text>
            {editing ? (
              <TextInput
                style={styles.fieldInput}
                value={handicap}
                onChangeText={setHandicap}
                placeholder="e.g. 14.2"
                placeholderTextColor={Colors.textMuted}
                keyboardType="decimal-pad"
              />
            ) : (
              <Text style={styles.fieldValue}>
                {profile?.handicap != null ? profile.handicap : 'Not set'}
              </Text>
            )}
          </View>

          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>Skill Level</Text>
            {editing ? (
              <View style={styles.skillPicker}>
                {SKILL_OPTIONS.map(opt => (
                  <TouchableOpacity
                    key={opt}
                    style={[styles.skillChip, skill === opt && styles.skillChipActive]}
                    onPress={() => setSkill(opt)}
                  >
                    <Text style={[styles.skillChipText, skill === opt && styles.skillChipTextActive]}>
                      {opt.charAt(0).toUpperCase() + opt.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : (
              <Text style={styles.fieldValue}>
                {profile?.skill_level
                  ? profile.skill_level.charAt(0).toUpperCase() + profile.skill_level.slice(1)
                  : 'Not set'}
              </Text>
            )}
          </View>
        </View>

        {/* Save button */}
        {editing && (
          <View style={styles.saveWrap}>
            <TouchableOpacity
              style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
              onPress={handleSave}
              disabled={saving}
            >
              {saving
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.saveBtnText}>Save Changes</Text>
              }
            </TouchableOpacity>
          </View>
        )}

        {/* Account section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          <TouchableOpacity style={styles.menuRow} onPress={() => router.push('/auth/forgot-password')}>
            <Text style={styles.menuRowText}>Change Password</Text>
            <Text style={styles.menuRowArrow}>›</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.menuRow, styles.menuRowDanger]} onPress={handleSignOut}>
            <Text style={styles.menuRowDangerText}>Sign Out</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: Spacing.xxxl }} />
      </ScrollView>

      {/* Avatar colour picker modal */}
      <Modal visible={colorModal} transparent animationType="slide">
        <Pressable style={styles.modalOverlay} onPress={() => setColorModal(false)}>
          <View style={styles.colorSheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Choose Avatar Color</Text>
            <View style={styles.colorGrid}>
              {AVATAR_COLORS.map(c => (
                <TouchableOpacity
                  key={c}
                  style={[
                    styles.colorSwatch,
                    { backgroundColor: c },
                    avatarClr === c && styles.colorSwatchSelected,
                  ]}
                  onPress={() => { setAvatarClr(c); setColorModal(false); }}
                />
              ))}
            </View>
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:         { flex: 1, backgroundColor: Colors.background },
  loadingCenter:{ flex: 1, alignItems: 'center', justifyContent: 'center' },

  hero:       { padding: Spacing.lg, paddingTop: Spacing.xl, paddingBottom: Spacing.xl },
  heroTop:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.lg },
  heroTitle:  { fontSize: Typography.xxl, fontWeight: Typography.bold, color: Colors.textOnDark },
  editBtn:    { fontSize: Typography.sm, color: Colors.greenGlow, fontWeight: Typography.semibold },

  avatarRow:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.lg },
  avatar:      { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  avatarText:  { fontSize: 26, fontWeight: Typography.bold, color: '#fff' },
  avatarEditHint: { fontSize: 8, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  avatarInfo:  { flex: 1 },
  nameInput:   { fontSize: Typography.lg, fontWeight: Typography.bold, color: Colors.textOnDark, borderBottomWidth: 0.5, borderBottomColor: 'rgba(255,255,255,0.3)', paddingBottom: 4 },
  displayName: { fontSize: Typography.xl, fontWeight: Typography.bold, color: Colors.textOnDark },
  emailText:   { fontSize: Typography.xs, color: Colors.textOnDarkDim, marginTop: 4 },

  statsRow:   { flexDirection: 'row', gap: Spacing.sm, padding: Spacing.lg },
  statBox:    { flex: 1, backgroundColor: Colors.surface, borderRadius: Radius.md, padding: Spacing.sm, alignItems: 'center', borderWidth: 0.5, borderColor: Colors.border, ...Shadow.sm },
  statNum:    { fontSize: Typography.xl, fontWeight: Typography.bold, color: Colors.textPrimary },
  statLbl:    { fontSize: 9, color: Colors.textMuted, marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.04 },

  section:      { marginHorizontal: Spacing.lg, marginBottom: Spacing.lg, backgroundColor: Colors.surface, borderRadius: Radius.lg, overflow: 'hidden', borderWidth: 0.5, borderColor: Colors.border, ...Shadow.sm },
  sectionTitle: { fontSize: Typography.xs, fontWeight: Typography.semibold, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.08, padding: Spacing.md, borderBottomWidth: 0.5, borderBottomColor: Colors.border },

  fieldRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.md, borderBottomWidth: 0.5, borderBottomColor: Colors.border },
  fieldLabel:  { fontSize: Typography.sm, color: Colors.textSecondary },
  fieldValue:  { fontSize: Typography.sm, fontWeight: Typography.medium, color: Colors.textPrimary },
  fieldInput:  { fontSize: Typography.sm, color: Colors.textPrimary, textAlign: 'right', minWidth: 80, borderBottomWidth: 0.5, borderBottomColor: Colors.border, paddingBottom: 2 },

  skillPicker: { flexDirection: 'row', gap: 6 },
  skillChip:   { paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radius.full, borderWidth: 0.5, borderColor: Colors.border, backgroundColor: Colors.background },
  skillChipActive: { backgroundColor: Colors.green, borderColor: Colors.green },
  skillChipText:   { fontSize: Typography.xs, color: Colors.textSecondary, fontWeight: Typography.medium },
  skillChipTextActive: { color: '#fff' },

  saveWrap:       { marginHorizontal: Spacing.lg, marginBottom: Spacing.lg },
  saveBtn:        { backgroundColor: Colors.green, borderRadius: Radius.md, height: 50, alignItems: 'center', justifyContent: 'center' },
  saveBtnDisabled:{ opacity: 0.5 },
  saveBtnText:    { fontSize: Typography.base, fontWeight: Typography.bold, color: '#fff' },

  menuRow:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Spacing.md, borderBottomWidth: 0.5, borderBottomColor: Colors.border },
  menuRowText:     { fontSize: Typography.sm, color: Colors.textPrimary },
  menuRowArrow:    { fontSize: 18, color: Colors.textMuted },
  menuRowDanger:   { borderBottomWidth: 0 },
  menuRowDangerText:{ fontSize: Typography.sm, color: Colors.severityFix, fontWeight: Typography.medium },

  modalOverlay:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  colorSheet:     { backgroundColor: Colors.surface, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, padding: Spacing.lg },
  sheetHandle:    { width: 36, height: 4, backgroundColor: Colors.border, borderRadius: 2, alignSelf: 'center', marginBottom: Spacing.md },
  sheetTitle:     { fontSize: Typography.base, fontWeight: Typography.semibold, marginBottom: Spacing.lg },
  colorGrid:      { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md, justifyContent: 'center' },
  colorSwatch:    { width: 48, height: 48, borderRadius: 24 },
  colorSwatchSelected: { borderWidth: 3, borderColor: Colors.textPrimary },
});
